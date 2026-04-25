import { useEffect, useMemo, useState } from "react";
import katex from "katex";

const EXAMPLES = ["e^-", "e^+", "\\gamma", "\\nu_\\mu", "q", "\\bar{q}", "g", "W^+", "Z^0"];

export function LabelDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (latex: string) => void;
}) {
  const [text, setText] = useState("e^-");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        onSubmit(text);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, text, onClose, onSubmit]);

  const html = useMemo(() => {
    try {
      return katex.renderToString(text || "\\,", { throwOnError: false });
    } catch (e: any) {
      return `<span style="color:#c53030">${e?.message ?? "Error"}</span>`;
    }
  }, [text]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add LaTeX label</div>
        <div className="modal-hint">
          Enter LaTeX. The label will be placed in the middle of the canvas — you can drag it afterwards.
        </div>
        <textarea
          autoFocus
          className="textarea"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="preview">
          <div className="preview-label">Preview:</div>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
        <div className="preset-row">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            onClick={() => {
              if (text.trim()) onSubmit(text);
            }}
          >
            Insert
          </button>
        </div>
      </div>
    </div>
  );
}
