import { jsPDF } from "jspdf";
import { svg2pdf } from "svg2pdf.js";
import opentype, { Font } from "opentype.js";
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
 * Build an export-ready clone of the live SVG. Each KaTeX <foreignObject> is
 * replaced with a group of SVG <path> elements obtained by tracing each glyph
 * through opentype.js, so the output renders identically everywhere without
 * depending on font availability at render time.
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

  if (!transparent) {
    const bg = document.createElementNS(SVG_NS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(rect.width));
    bg.setAttribute("height", String(rect.height));
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
  }

  // Strip the editor's view transform so the export reflects the diagram at
  // its true coordinates regardless of current zoom/pan.
  clone.querySelectorAll("[data-view-root]").forEach((el) => {
    el.removeAttribute("transform");
  });

  // Replace each foreignObject with a vectorized group built from the live DOM.
  const cloneForeignObjects = Array.from(clone.querySelectorAll("foreignObject"));
  for (let i = 0; i < cloneForeignObjects.length; i++) {
    const liveFo = liveForeignObjects[i];
    const cloneFo = cloneForeignObjects[i];
    if (!liveFo || !cloneFo) continue;
    const flat = await vectorizeLatexForeignObject(liveFo);
    if (flat && cloneFo.parentNode) {
      cloneFo.parentNode.replaceChild(flat, cloneFo);
    }
  }

  return new XMLSerializer().serializeToString(clone);
}

/* ---- KaTeX text → SVG path vectorization ----------------------------- */

interface KatexFontDescriptor {
  family: string;
  style: "normal" | "italic";
  weight: number;
  ttfUrl: string;
}

let katexFontDescriptorsCache: Promise<KatexFontDescriptor[]> | null = null;
const fontFileCache = new Map<string, Promise<Font | null>>();

function discoverKatexFontDescriptors(): Promise<KatexFontDescriptor[]> {
  if (!katexFontDescriptorsCache) katexFontDescriptorsCache = doDiscoverKatexFonts();
  return katexFontDescriptorsCache;
}

async function doDiscoverKatexFonts(): Promise<KatexFontDescriptor[]> {
  const out: KatexFontDescriptor[] = [];
  const sheets = Array.from(document.styleSheets);
  for (const sheet of sheets) {
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }
    if (!rules) continue;
    const sheetBase = sheet.href || document.baseURI;
    for (const rule of Array.from(rules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const r = rule as CSSFontFaceRule;
      const txt = r.cssText;
      if (!txt.includes("KaTeX")) continue;
      const family = (r.style.getPropertyValue("font-family") || "").replace(/['"]/g, "").trim();
      const cssStyle = (r.style.getPropertyValue("font-style") || "normal").trim();
      const cssWeight = (r.style.getPropertyValue("font-weight") || "400").trim();
      const isItalic = cssStyle === "italic" || cssStyle === "oblique";
      const weight = parseInt(cssWeight, 10) || (cssWeight === "bold" ? 700 : 400);
      const ttfMatch = /url\(\s*(['"]?)([^)'"]+\.ttf[^)'"]*)\1\s*\)\s*format\(\s*['"]?(?:truetype|ttf)['"]?\s*\)/i.exec(
        txt
      );
      if (!ttfMatch) continue;
      const abs = new URL(ttfMatch[2], sheetBase).href;
      out.push({
        family,
        style: isItalic ? "italic" : "normal",
        weight,
        ttfUrl: abs,
      });
    }
  }
  return out;
}

async function loadFont(url: string): Promise<Font | null> {
  let cached = fontFileCache.get(url);
  if (cached) return cached;
  cached = (async () => {
    try {
      const res = await fetch(url, { credentials: "omit", mode: "cors" });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return opentype.parse(buf);
    } catch {
      return null;
    }
  })();
  fontFileCache.set(url, cached);
  return cached;
}

async function resolveKatexFont(
  familyList: string,
  style: string,
  weight: number
): Promise<Font | null> {
  const descriptors = await discoverKatexFontDescriptors();
  const families = familyList.split(",").map((s) => s.trim().replace(/['"]/g, ""));
  const wantItalic = style === "italic" || style === "oblique";
  const wantBold = weight >= 600;

  for (const fam of families) {
    if (!fam.startsWith("KaTeX")) continue;
    const candidates = descriptors.filter((d) => d.family === fam);
    if (candidates.length === 0) continue;
    const exact = candidates.find(
      (d) => d.style === (wantItalic ? "italic" : "normal") && d.weight >= 600 === wantBold
    );
    const chosen = exact || candidates[0];
    const f = await loadFont(chosen.ttfUrl);
    if (f) return f;
  }
  return null;
}

async function vectorizeLatexForeignObject(
  liveFo: SVGForeignObjectElement
): Promise<SVGGElement | null> {
  try {
    const foRect = liveFo.getBoundingClientRect();
    // The foreignObject sits inside the editor's view transform (zoom + pan).
    // getBoundingClientRect reports screen pixels; divide by the CTM scale to
    // recover foreignObject-local SVG units.
    const ctm = liveFo.getScreenCTM();
    const scale = ctm ? Math.hypot(ctm.a, ctm.b) || 1 : 1;
    const localX = (sx: number) => (sx - foRect.left) / scale;
    const localY = (sy: number) => (sy - foRect.top) / scale;
    const g = document.createElementNS(SVG_NS, "g");

    const fox = parseFloat(liveFo.getAttribute("x") || "0") || 0;
    const foy = parseFloat(liveFo.getAttribute("y") || "0") || 0;
    if (fox !== 0 || foy !== 0) g.setAttribute("transform", `translate(${fox},${foy})`);

    // Visible borders (KaTeX fraction bars, sqrt rules) — render as <line>.
    liveFo.querySelectorAll<HTMLElement>("*").forEach((el) => {
      if (el.closest(".katex-mathml")) return;
      const cs = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const sides: Array<["top" | "bottom" | "left" | "right", number, number, number, number]> = [
        ["top", r.left, r.top, r.right, r.top],
        ["bottom", r.left, r.bottom, r.right, r.bottom],
        ["left", r.left, r.top, r.left, r.bottom],
        ["right", r.right, r.top, r.right, r.bottom],
      ];
      for (const [side, x1, y1, x2, y2] of sides) {
        const w = parseFloat(cs.getPropertyValue(`border-${side}-width`)) || 0;
        const sty = cs.getPropertyValue(`border-${side}-style`);
        if (w < 0.05 || sty === "none" || sty === "hidden") continue;
        const color = cs.getPropertyValue(`border-${side}-color`) || "#000";
        const ox = side === "left" ? w / 2 : side === "right" ? -w / 2 : 0;
        const oy = side === "top" ? w / 2 : side === "bottom" ? -w / 2 : 0;
        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(localX(x1) + ox));
        line.setAttribute("y1", String(localY(y1) + oy));
        line.setAttribute("x2", String(localX(x2) + ox));
        line.setAttribute("y2", String(localY(y2) + oy));
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", String(w));
        line.setAttribute("stroke-linecap", "butt");
        g.appendChild(line);
      }
    });

    // Walk visible text nodes; vectorize each via opentype.js.
    const walker = document.createTreeWalker(liveFo, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.replace(/\s+/g, "")) return NodeFilter.FILTER_REJECT;
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
      const weight = parseInt(cs.fontWeight, 10) || (cs.fontWeight === "bold" ? 700 : 400);
      const font = await resolveKatexFont(cs.fontFamily, cs.fontStyle, weight);
      const fill = cs.color || "#000";
      const xLeft = localX(r.left);

      if (font) {
        const ascender = font.ascender / font.unitsPerEm;
        const baselineY = localY(r.top) + ascender * fontSize;
        const path = font.getPath(text, xLeft, baselineY, fontSize);
        const d = path.toPathData(3);
        if (d) {
          const el = document.createElementNS(SVG_NS, "path");
          el.setAttribute("d", d);
          el.setAttribute("fill", fill);
          g.appendChild(el);
          continue;
        }
      }

      const baselineY = localY(r.top) + fontSize * 0.78;
      const t = document.createElementNS(SVG_NS, "text");
      t.setAttribute("x", String(xLeft));
      t.setAttribute("y", String(baselineY));
      t.setAttribute("font-family", cs.fontFamily);
      t.setAttribute("font-size", `${fontSize}`);
      if (cs.fontStyle && cs.fontStyle !== "normal") t.setAttribute("font-style", cs.fontStyle);
      if (cs.fontWeight && cs.fontWeight !== "400" && cs.fontWeight !== "normal")
        t.setAttribute("font-weight", cs.fontWeight);
      t.setAttribute("fill", fill);
      t.setAttribute("xml:space", "preserve");
      t.textContent = text;
      g.appendChild(t);
    }

    return g;
  } catch {
    return null;
  }
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
      const ptW = (rect.width * 72) / 96;
      const ptH = (rect.height * 72) / 96;
      const pdf = new jsPDF({
        orientation: ptW >= ptH ? "landscape" : "portrait",
        unit: "pt",
        format: [ptW, ptH],
        compress: true,
      });
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
