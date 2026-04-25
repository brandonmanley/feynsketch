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
  const removeMany = useStore((s) => s.removeMany);
  const selectedIds = useStore((s) => s.selectedIds);
  const settings = useStore((s) => s.settings);

  const [projectName, setProjectName] = useState("My diagram");
  const [labelOpen, setLabelOpen] = useState(false);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const surfaceRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const last = lastProject();
    if (last && (last.objects.length > 0 || last.strokes.length > 0)) {
      loadState({ objects: last.objects, strokes: last.strokes, mode: "edit" });
      setProjectName(last.name);
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

  // Backspace / Delete deletes the selected objects, with optional confirmation.
  // Cmd/Ctrl-Z = undo, Shift+Cmd/Ctrl-Z (or Cmd/Ctrl-Y) = redo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTextInput =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          (target as HTMLElement).isContentEditable);

      const meta = e.metaKey || e.ctrlKey;
      if (meta && (e.key === "z" || e.key === "Z")) {
        if (isTextInput) return;
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if (meta && (e.key === "y" || e.key === "Y")) {
        if (isTextInput) return;
        e.preventDefault();
        useStore.getState().redo();
        return;
      }

      if (e.key !== "Backspace" && e.key !== "Delete") return;
      if (isTextInput) return;
      if (selectedIds.length === 0) return;
      e.preventDefault();
      const proceed = settings.confirmDelete
        ? window.confirm(
            selectedIds.length === 1
              ? "Delete this object?"
              : `Delete ${selectedIds.length} objects?`
          )
        : true;
      if (proceed) removeMany(selectedIds);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, removeMany, settings.confirmDelete]);

  const onLabelSubmit = useCallback(
    (latex: string) => {
      addLabel(latex, size.w / 2 - 40, size.h / 2 - 20);
      setLabelOpen(false);
    },
    [addLabel, size.w, size.h]
  );

  return (
    <div className="app">
      <Toolbar
        onShowLabel={() => setLabelOpen(true)}
        getSvg={() => svgRef.current}
        projectName={projectName}
        setProjectName={setProjectName}
      />
      <div className="workspace">
        <div className="canvas-wrap" ref={surfaceRef}>
          {mode === "draw" ? (
            <DrawLayer width={size.w} height={size.h} />
          ) : (
            <EditCanvas ref={svgRef} width={size.w} height={size.h} />
          )}
          <div className="mode-hint">
            {mode === "draw"
              ? "Drawing mode — already-converted objects stay visible. Sketch more, then press Convert → editable."
              : "Editing mode — click to select, drag from empty space to box-select, double-click a selected line to add anchors."}
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
