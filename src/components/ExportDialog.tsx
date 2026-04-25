import { useEffect, useState } from "react";
import type { ExportFormat } from "../lib/exporters";

const PRESETS: { dpi: number; label: string }[] = [
  { dpi: 96, label: "Screen (96)" },
  { dpi: 150, label: "Web HD (150)" },
  { dpi: 300, label: "Print (300)" },
  { dpi: 450, label: "High print (450)" },
  { dpi: 600, label: "Ultra (600)" },
];

export interface ExportDialogValues {
  filename: string;
  format: ExportFormat;
  dpi: number;
  transparent: boolean;
}

export function ExportDialog({
  open,
  defaultName,
  onClose,
  onSubmit,
}: {
  open: boolean;
  defaultName: string;
  onClose: () => void;
  onSubmit: (v: ExportDialogValues) => void;
}) {
  const [filename, setFilename] = useState(defaultName);
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [dpi, setDpi] = useState(300);
  const [transparent, setTransparent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFilename(defaultName);
  }, [open, defaultName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isRaster = format === "png" || format === "pdf";
  const supportsTransparent = format === "png" || format === "svg";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Export diagram</div>
        <div className="modal-hint">
          Choose a filename, format, and quality. Your browser will then prompt for the location.
        </div>

        <div className="form-row">
          <label className="form-label">Filename</label>
          <input
            className="text full"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="diagram"
          />
        </div>

        <div className="form-row">
          <label className="form-label">Format</label>
          <div className="grid four">
            {(["pdf", "png", "svg", "json"] as ExportFormat[]).map((f) => (
              <button
                key={f}
                className={`chip ${format === f ? "active" : ""}`}
                onClick={() => setFormat(f)}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {isRaster && (
          <div className="form-row">
            <label className="form-label">Quality</label>
            <div className="grid five">
              {PRESETS.map((p) => (
                <button
                  key={p.dpi}
                  className={`chip ${dpi === p.dpi ? "active" : ""}`}
                  onClick={() => setDpi(p.dpi)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="slider-row" style={{ marginTop: 6 }}>
              <input
                type="range"
                min={72}
                max={1200}
                step={6}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              />
              <input
                className="num"
                type="number"
                min={72}
                max={1200}
                step={6}
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
              />
              <span className="dim">DPI</span>
            </div>
          </div>
        )}

        {supportsTransparent && (
          <div className="form-row">
            <label className="check-row">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              Transparent background
            </label>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => onSubmit({ filename: filename || "diagram", format, dpi, transparent })}
          >
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
