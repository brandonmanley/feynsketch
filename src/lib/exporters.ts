import { jsPDF } from "jspdf";
import { download } from "./storage";

export type ExportFormat = "svg" | "png" | "pdf" | "json";

export interface ExportOptions {
  filename: string;
  format: ExportFormat;
  /** target DPI for raster outputs (PNG and PDF embedded image). 96 = 1x. */
  dpi: number;
  /** transparent background (PNG/SVG only). PDF always opaque. */
  transparent?: boolean;
  /** for the JSON export, payload is provided by the caller */
  jsonPayload?: string;
}

export function getSvgSource(svgEl: SVGSVGElement, transparent = false): string {
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll("[data-editor-only]").forEach((n) => n.remove());

  // Make sure the SVG has explicit width/height for rasterization stability.
  const rect = svgEl.getBoundingClientRect();
  clone.setAttribute("width", String(rect.width));
  clone.setAttribute("height", String(rect.height));
  clone.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  if (!clone.hasAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.hasAttribute("xmlns:xlink")) clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

  // Background rect (matches the canvas background) unless caller wants transparency.
  if (!transparent) {
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(rect.width));
    bg.setAttribute("height", String(rect.height));
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
  }

  const css = collectKatexStyles();
  if (css) {
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  return new XMLSerializer().serializeToString(clone);
}

function collectKatexStyles(): string {
  const sheets = Array.from(document.styleSheets);
  const parts: string[] = [];
  for (const sheet of sheets) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        const txt = rule.cssText;
        if (txt.startsWith("@font-face") || txt.includes(".katex")) parts.push(txt);
      }
    } catch {
      /* CORS — ignore */
    }
  }
  return parts.join("\n");
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
    const src = getSvgSource(svgEl, !!opts.transparent);
    const blob = new Blob([src], { type: "image/svg+xml;charset=utf-8" });
    await saveBlob(blob, filename, "image/svg+xml");
    return;
  }

  // PNG and PDF both rely on rasterization at the requested DPI.
  const scale = Math.max(0.5, opts.dpi / 96);
  const { dataUrl, width, height } = await rasterize(svgEl, scale, opts.format === "png" ? !!opts.transparent : false);

  if (opts.format === "png") {
    const blob = await (await fetch(dataUrl)).blob();
    await saveBlob(blob, filename, "image/png");
    return;
  }

  if (opts.format === "pdf") {
    // Page in points (1 pt = 1/72"). The on-screen size is in CSS pixels (96/in).
    const ptW = (width / scale) * (72 / 96);
    const ptH = (height / scale) * (72 / 96);
    const orientation = ptW >= ptH ? "landscape" : "portrait";
    const pdf = new jsPDF({
      orientation,
      unit: "pt",
      format: [ptW, ptH],
      compress: true,
    });
    pdf.addImage(dataUrl, "PNG", 0, 0, ptW, ptH, undefined, "FAST");
    const blob = pdf.output("blob") as Blob;
    await saveBlob(blob, filename, "application/pdf");
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
  const src = getSvgSource(svgEl, transparent);
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
