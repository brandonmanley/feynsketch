import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import { download } from "./storage";

export type ExportFormat = "svg" | "png" | "pdf" | "json";

export interface ExportOptions {
  filename: string;
  format: ExportFormat;
  /** target DPI for raster outputs (PNG only). 96 = 1x. PDF is vector and ignores this. */
  dpi: number;
  /** transparent background (PNG/SVG only). PDF always opaque. */
  transparent?: boolean;
  /** for the JSON export, payload is provided by the caller */
  jsonPayload?: string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Build an export-ready clone of the live SVG. Replaces every <foreignObject>
 * (KaTeX labels) with a flattened group of native <text>/<line> elements driven
 * by the live DOM measurements, and embeds the KaTeX font binaries as base64
 * data URIs so the output renders identically to the editor without needing
 * network access or system font fallbacks.
 */
export async function getSvgSource(svgEl: SVGSVGElement, transparent = false): Promise<string> {
  const liveForeignObjects = Array.from(svgEl.querySelectorAll("foreignObject"));
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-editor-only]").forEach((n) => n.remove());

  // Make sure the SVG has explicit width/height for rasterization stability.
  const rect = svgEl.getBoundingClientRect();
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  clone.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  if (!clone.hasAttribute("xmlns")) clone.setAttribute("xmlns", SVG_NS);
  if (!clone.hasAttribute("xmlns:xlink"))
    clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Background rect (matches the canvas background) unless caller wants transparency.
  if (!transparent) {
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(rect.width));
    bg.setAttribute("height", String(rect.height));
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
  }

  // Replace each foreignObject in the clone with a flattened SVG group built
  // from the live DOM. Iteration order in the clone matches the live order.
  const cloneForeignObjects = Array.from(clone.querySelectorAll("foreignObject"));
  for (let i = 0; i < cloneForeignObjects.length; i++) {
    const liveFo = liveForeignObjects[i];
    const cloneFo = cloneForeignObjects[i];
    if (!liveFo || !cloneFo) continue;
    const flat = flattenLatexForeignObject(liveFo);
    if (flat && cloneFo.parentNode) {
      cloneFo.parentNode.replaceChild(flat, cloneFo);
    }
  }

  const css = await getEmbeddedKatexCss();
  if (css) {
    const style = document.createElementNS(SVG_NS, "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

/** Walk the rendered KaTeX HTML inside a live foreignObject and emit a
 *  positioned SVG <g> of <text> + <line> elements that mirrors the layout. */
function flattenLatexForeignObject(liveFo: SVGForeignObjectElement): SVGGElement | null {
  try {
    const foRect = liveFo.getBoundingClientRect();
    const g = document.createElementNS(SVG_NS, "g");

    // Preserve the foreignObject's own (x, y) offset so the flattened group
    // ends up in the same spot inside its parent.
    const fox = parseFloat(liveFo.getAttribute("x") || "0") || 0;
    const foy = parseFloat(liveFo.getAttribute("y") || "0") || 0;
    if (fox !== 0 || foy !== 0) {
      g.setAttribute("transform", `translate(${fox},${foy})`);
    }

    // Visible borders (e.g. KaTeX fraction bars, sqrt rules).
    liveFo.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const cs = window.getComputedStyle(el);
      // Skip the hidden MathML branch entirely.
      if (el.closest(".katex-mathml")) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const sides: Array<["Top" | "Bottom" | "Left" | "Right", number, number, number, number]> = [
        ["Top", r.left, r.top, r.right, r.top],
        ["Bottom", r.left, r.bottom, r.right, r.bottom],
        ["Left", r.left, r.top, r.left, r.bottom],
        ["Right", r.right, r.top, r.right, r.bottom],
      ];
      for (const [side, x1, y1, x2, y2] of sides) {
        const w = parseFloat(cs.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0;
        const style = cs.getPropertyValue(`border-${side.toLowerCase()}-style`);
        if (w < 0.05 || style === "none" || style === "hidden") continue;
        const color = cs.getPropertyValue(`border-${side.toLowerCase()}-color`) || "#000";
        const line = document.createElementNS(SVG_NS, "line");
        // Center the line on the border (browsers render the border centered on the box edge).
        const ox = side === "Left" ? w / 2 : side === "Right" ? -w / 2 : 0;
        const oy = side === "Top" ? w / 2 : side === "Bottom" ? -w / 2 : 0;
        line.setAttribute("x1", String(x1 - foRect.left + ox));
        line.setAttribute("y1", String(y1 - foRect.top + oy));
        line.setAttribute("x2", String(x2 - foRect.left + ox));
        line.setAttribute("y2", String(y2 - foRect.top + oy));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", String(w));
        line.setAttribute("stroke-linecap", "butt");
        g.appendChild(line);
      }
    });

    // Visible text nodes (everything outside the hidden MathML branch).
    const walker = document.createTreeWalker(liveFo, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.replace(/\s+/g, "")) {
          return NodeFilter.FILTER_REJECT;
        }
        const parent = (node as Text).parentElement;
        if (parent && parent.closest(".katex-mathml")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node as Text).data;
      const parent = (node as Text).parentElement;
      if (!parent) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const r = range.getBoundingClientRect();
      if (r.width <= 0 && r.height <= 0) continue;
      const cs = window.getComputedStyle(parent);
      const fontSize = parseFloat(cs.fontSize) || 12;
      // SVG <text> y is the alphabetic baseline; for HTML inline text the
      // baseline sits at top + ~0.78 * font-size for typical math fonts.
      const baselineY = r.top - foRect.top + fontSize * 0.78;
      const textX = r.left - foRect.left;

      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(textX));
      t.setAttribute("y", String(baselineY));
      t.setAttribute("font-family", cs.fontFamily);
      t.setAttribute("font-size", `${fontSize}`);
      if (cs.fontStyle && cs.fontStyle !== "normal") t.setAttribute("font-style", cs.fontStyle);
      if (cs.fontWeight && cs.fontWeight !== "400" && cs.fontWeight !== "normal") {
        t.setAttribute("font-weight", cs.fontWeight);
      }
      t.setAttribute("fill", cs.color || "#000");
      t.setAttribute("xml:space", "preserve");
      t.textContent = text;
      g.appendChild(t);
    }

    return g;
  } catch {
    return null;
  }
}

/* ---- KaTeX CSS with fonts inlined as data URIs ---- */

let embeddedKatexCssCache: Promise<string> | null = null;

function getEmbeddedKatexCss(): Promise<string> {
  if (!embeddedKatexCssCache) embeddedKatexCssCache = buildEmbeddedKatexCss();
  return embeddedKatexCssCache;
}

async function buildEmbeddedKatexCss(): Promise<string> {
  const sheets = Array.from(document.styleSheets);
  const fontFaces: string[] = [];
  const others: string[] = [];
  for (const sheet of sheets) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // CORS — ignore
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const txt = rule.cssText;
      if (txt.startsWith("@font-face") && txt.includes("KaTeX")) fontFaces.push(txt);
      else if (txt.includes(".katex")) others.push(txt);
    }
  }

  const inlinedFontFaces = await Promise.all(fontFaces.map(inlineFontFaceUrls));
  return [...inlinedFontFaces, ...others].join("\n");
}

const fontDataUriCache = new Map<string, Promise<string>>();

async function inlineFontFaceUrls(rule: string): Promise<string> {
  // Match url(...) tokens, prefer woff2/woff sources (the `src:` list usually
  // has multiple formats). We rewrite each url() to a data: URI.
  const urlPattern = /url\(\s*(['"]?)([^)'"]+)\1\s*\)(\s*format\(\s*['"]?([^)'"]+)['"]?\s*\))?/g;
  const found: { full: string; url: string; format: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = urlPattern.exec(rule))) {
    found.push({ full: m[0], url: m[2], format: (m[4] || "").toLowerCase() });
  }
  if (found.length === 0) return rule;
  // Prefer woff2 → woff → ttf for a single inlined source.
  const ranked = [...found].sort((a, b) => formatRank(a.format) - formatRank(b.format));
  const chosen = ranked[0];
  try {
    const dataUri = await fetchAsDataUri(chosen.url);
    const fmt = chosen.format || formatFromUrl(chosen.url);
    const newSrc = `src: url(${dataUri})${fmt ? ` format("${fmt}")` : ""}`;
    return rule.replace(/src\s*:\s*[^;]+;?/, newSrc + ";");
  } catch {
    return rule;
  }
}

function formatRank(fmt: string): number {
  if (fmt === "woff2") return 0;
  if (fmt === "woff") return 1;
  if (fmt === "truetype" || fmt === "ttf") return 2;
  return 3;
}

function formatFromUrl(url: string): string {
  if (/\.woff2(\?|$)/i.test(url)) return "woff2";
  if (/\.woff(\?|$)/i.test(url)) return "woff";
  if (/\.ttf(\?|$)/i.test(url)) return "truetype";
  return "";
}

function fetchAsDataUri(url: string): Promise<string> {
  let cached = fontDataUriCache.get(url);
  if (cached) return cached;
  cached = (async () => {
    const abs = new URL(url, document.baseURI).href;
    const res = await fetch(abs, { credentials: "omit", mode: "cors" });
    if (!res.ok) throw new Error(`Font fetch failed: ${abs}`);
    const buf = await res.arrayBuffer();
    const b64 = arrayBufferToBase64(buf);
    const mime =
      /\.woff2(\?|$)/i.test(url)
        ? "font/woff2"
        : /\.woff(\?|$)/i.test(url)
          ? "font/woff"
          : "font/ttf";
    return `data:${mime};base64,${b64}`;
  })();
  fontDataUriCache.set(url, cached);
  return cached;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
  }
  return btoa(s);
}

/* ---- KaTeX fonts registered with jsPDF for vector text rendering ---- */

interface KatexFontEntry {
  family: string;
  style: "normal" | "italic" | "bold" | "bolditalic";
  ttfUrl: string;
}

let katexPdfFontsCache: Promise<KatexFontEntry[]> | null = null;

function discoverKatexPdfFonts(): Promise<KatexFontEntry[]> {
  if (!katexPdfFontsCache) katexPdfFontsCache = doDiscoverKatexPdfFonts();
  return katexPdfFontsCache;
}

async function doDiscoverKatexPdfFonts(): Promise<KatexFontEntry[]> {
  const entries: KatexFontEntry[] = [];
  const seen = new Set<string>();
  const sheets = Array.from(document.styleSheets);
  for (const sheet of sheets) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      const r = rule as CSSFontFaceRule;
      if (r.type !== CSSRule.FONT_FACE_RULE) continue;
      const txt = r.cssText;
      if (!txt.includes("KaTeX")) continue;
      const family = (r.style.getPropertyValue("font-family") || "").replace(/['"]/g, "").trim();
      const cssStyle = (r.style.getPropertyValue("font-style") || "normal").trim();
      const cssWeight = (r.style.getPropertyValue("font-weight") || "400").trim();
      const isBold = cssWeight === "bold" || parseInt(cssWeight, 10) >= 600;
      const isItalic = cssStyle === "italic" || cssStyle === "oblique";
      const style: KatexFontEntry["style"] = isBold && isItalic
        ? "bolditalic"
        : isBold
          ? "bold"
          : isItalic
            ? "italic"
            : "normal";
      const ttfMatch = /url\(\s*(['"]?)([^)'"]+\.ttf[^)'"]*)\1\s*\)\s*format\(\s*['"]?(?:truetype|ttf)['"]?\s*\)/i.exec(
        txt
      );
      if (!ttfMatch) continue;
      const key = `${family}|${style}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ family, style, ttfUrl: ttfMatch[2] });
    }
  }
  return entries;
}

async function registerKatexFontsInPdf(pdf: jsPDF): Promise<void> {
  const fonts = await discoverKatexPdfFonts();
  await Promise.all(
    fonts.map(async (f) => {
      try {
        const abs = new URL(f.ttfUrl, document.baseURI).href;
        const res = await fetch(abs, { credentials: "omit", mode: "cors" });
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        const vfsName = `${f.family}-${f.style}.ttf`;
        pdf.addFileToVFS(vfsName, b64);
        pdf.addFont(vfsName, f.family, f.style);
      } catch {
        /* font registration is best-effort; svg2pdf falls back to a default */
      }
    })
  );
}

/**
 * Save a Blob using the File System Access API when available so the user
 * can pick a filename and location, otherwise fall back to a synthetic <a download>.
 */
export async function saveBlob(blob: Blob, filename: string, mime: string) {
  const w = window as any;
  if (typeof w.showSaveFilePicker === "function") {
    try {
      const pickerOpts = {
        suggestedName: filename,
        types: [
          {
            description: prettyDesc(mime, filename),
            accept: { [mime]: [extensionOf(filename)] },
          },
        ],
      };
      const handle = await w.showSaveFilePicker(pickerOpts);
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err: any) {
      if (err?.name === "AbortError") return; // user cancelled
      // fall through to <a download> on any other error
    }
  }
  download(blob, filename);
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i) : "";
}
function prettyDesc(mime: string, filename: string) {
  const ext = extensionOf(filename).slice(1).toUpperCase();
  return `${ext || mime} file`;
}

export async function performExport(svgEl: SVGSVGElement | null, opts: ExportOptions) {
  const filename = ensureExtension(opts.filename, opts.format);

  if (opts.format === "json") {
    const blob = new Blob([opts.jsonPayload ?? ""], { type: "application/json" });
    await saveBlob(blob, filename, "application/json");
    return;
  }

  if (!svgEl) throw new Error("No SVG canvas available for export");

  if (opts.format === "svg") {
    const src = await getSvgSource(svgEl, !!opts.transparent);
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    await saveBlob(blob, filename, "image/svg+xml");
    return;
  }

  if (opts.format === "png") {
    const scale = Math.max(0.5, opts.dpi / 96);
    const { dataUrl } = await rasterize(svgEl, scale, !!opts.transparent);
    const blob = await (await fetch(dataUrl)).blob();
    await saveBlob(blob, filename, "image/png");
    return;
  }

  if (opts.format === "pdf") {
    const src = await getSvgSource(svgEl, false);
    const tmpHost = document.createElement("div");
    tmpHost.style.position = "absolute";
    tmpHost.style.left = "-99999px";
    tmpHost.style.top = "0";
    tmpHost.innerHTML = src;
    document.body.appendChild(tmpHost);
    try {
      const svgForPdf = tmpHost.querySelector("svg") as SVGSVGElement | null;
      if (!svgForPdf) throw new Error("Failed to materialize SVG for PDF export");

      const rect = svgEl.getBoundingClientRect();
      // SVG units are CSS pixels; PDF unit "pt" is 1/72". Convert via 96 dpi.
      const ptW = (rect.width * 72) / 96;
      const ptH = (rect.height * 72) / 96;
      const pdf = new jsPDF({
        orientation: ptW >= ptH ? "landscape" : "portrait",
        unit: "pt",
        format: [ptW, ptH],
        compress: true,
      });
      await registerKatexFontsInPdf(pdf);
      await svg2pdf(svgForPdf, pdf, { x: 0, y: 0, width: ptW, height: ptH });
      const blob = pdf.output("blob") as Blob;
      await saveBlob(blob, filename, "application/pdf");
    } finally {
      document.body.removeChild(tmpHost);
    }
    return;
  }
}

function ensureExtension(name: string, fmt: ExportFormat): string {
  const expected = "." + (fmt === "json" ? "json" : fmt);
  if (name.toLowerCase().endsWith(expected)) return name;
  // strip any existing extension and add the right one
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base + expected;
}

async function rasterize(
  svgEl: SVGSVGElement,
  scale: number,
  transparent: boolean
): Promise<{ dataUrl: string; width: number; height: number }> {
  const src = await getSvgSource(svgEl, transparent);
  const svgBlob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = url;
    });
    const bbox = svgEl.getBoundingClientRect();
    const width = Math.ceil(bbox.width * scale);
    const height = Math.ceil(bbox.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    if (!transparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
