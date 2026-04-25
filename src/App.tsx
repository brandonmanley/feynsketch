import { useCallback, useEffect, useRef, useState } from "react";
import { DrawLayer } from "./components/DrawLayer";
import { EditCanvas } from "./components/EditCanvas";
import { LabelDialog } from "./components/LabelDialog";
import { PropertyPanel } from "./components/PropertyPanel";
import { Toolbar } from "./components/Toolbar";
import { useStore } from "./store";
import { lastProject } from "./lib/storage";

export default function App() {
  const mode = useStore((s) => s.mode);
  const addLabel = useStore((s) => s.addLabel);
  const loadState = useStore((s) => s.loadState);
  const [labelOpen, setLabelOpen] = useState(false);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const surfaceRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    // auto-restore the last project on load (non-destructive; shows in edit mode)
    const last = lastProject();
    if (last && (last.objects.length > 0 || last.strokes.length > 0)) {
      loadState({ objects: last.objects, strokes: last.strokes, mode: "edit" });
    }
  }, [loadState]);

  useEffect(() => {
    const el = surfaceRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const rect = e.contentRect;
        setSize({ w: Math.max(300, rect.width), h: Math.max(300, rect.height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onLabelSubmit = useCallback(
    (latex: string) => {
      addLabel(latex, size.w / 2 - 40, size.h / 2 - 20);
      setLabelOpen(false);
    },
    [addLabel, size.w, size.h]
  );

  return (
    <div className="app">
      <Toolbar onShowLabel={() => setLabelOpen(true)} getSvg={() => svgRef.current} />
      <div className="workspace">
        <div className="canvas-wrap" ref={surfaceRef}>
          {mode === "draw" ? (
            <DrawLayer width={size.w} height={size.h} />
          ) : (
            <EditCanvas ref={svgRef} width={size.w} height={size.h} />
          )}
          <div className="mode-hint">
            {mode === "draw"
              ? "Drawing mode — sketch your diagram, then press Convert → editable."
              : "Editing mode — click to select, drag to move, double-click a selected line to add anchors."}
          </div>
        </div>
        <aside className="sidebar">
          <PropertyPanel />
        </aside>
      </div>
      <LabelDialog open={labelOpen} onClose={() => setLabelOpen(false)} onSubmit={onLabelSubmit} />
    </div>
  );
}
