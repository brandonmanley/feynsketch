import { jsPDF } from "jspdf";
import { download } from "./storage";

export type ExportFormat = "svg" | "png" | "pdf";

export function getSvgSource(svgEl: SVGSVGElement): string {
  // Clone so we don't affect DOM
  const clone = svgEl.cloneNode(true) as SVGSVGElement;
  // Strip editor-only markings (handles, hover outlines)
  clone.querySelectorAll("[data-editor-only]").forEach((n) => n.remove());
  // Inline the stylesheet for labels (KaTeX uses CSS classes)
  const css = collectKatexStyles();
  if (css) {
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = css;
    clone.insertBefore(style, clone.firstChild);
  }
  if (!clone.hasAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  if (!clone.hasAttribute("xmlns:xlink")) clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  return new XMLSerializer().serializeToString(clone);
}

function collectKatexStyles(): string {
  // pull only @font-face and common .katex rules we need. Full copy would be huge.
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
      // CORS blocks remote stylesheet access; that's ok — browser fallback fonts will be used
    }
  }
  return parts.join("\n");
}

export function downloadSvg(svgEl: SVGSVGElement, filename = "diagram.svg") {
  const src = getSvgSource(svgEl);
  download(new Blob([src], { type: "image/svg+xml;charset=utf-8" }), filename);
}

export async function downloadPng(svgEl: SVGSVGElement, filename = "diagram.png", scale = 2) {
  const { dataUrl, width, height } = await rasterize(svgEl, scale);
  // Convert dataURL to blob for download
  const blob = await (await fetch(dataUrl)).blob();
  download(blob, filename);
  return { width, height };
}

export async function downloadPdf(svgEl: SVGSVGElement, filename = "diagram.pdf", scale = 2) {
  const { dataUrl, width, height } = await rasterize(svgEl, scale);
  const orientation = width >= height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "pt", format: [width / scale, height / scale] });
  pdf.addImage(dataUrl, "PNG", 0, 0, width / scale, height / scale);
  pdf.save(filename);
}

async function rasterize(
  svgEl: SVGSVGElement,
  scale: number
): Promise<{ dataUrl: string; width: number; height: number }> {
  const src = getSvgSource(svgEl);
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
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL("image/png"), width, height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
