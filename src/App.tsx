import { useCallback, useEffect, useRef, useState } from "react";
import { EditCanvas } from "./components/EditCanvas";
import { LabelDialog } from "./components/LabelDialog";
import { PropertyPanel } from "./components/PropertyPanel";
import { Toolbar } from "./components/Toolbar";
import { useStore } from "./store";
import { lastProject } from "./lib/storage";

export default function App() {
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
    if (last && Array.isArray(last.objects) && last.objects.length > 0) {
      loadState({ objects: last.objects });
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

  // Global keyboard shortcuts: undo/redo, delete, copy/cut/paste, group/ungroup,
  // and layer ordering. Anything typed inside an input/textarea is left alone.
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

      // Undo / Redo
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

      // Copy / Cut / Paste
      if (meta && (e.key === "c" || e.key === "C")) {
        if (isTextInput) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        useStore.getState().copy(selectedIds);
        return;
      }
      if (meta && (e.key === "x" || e.key === "X")) {
        if (isTextInput) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        useStore.getState().cut(selectedIds);
        return;
      }
      if (meta && (e.key === "v" || e.key === "V")) {
        if (isTextInput) return;
        e.preventDefault();
        useStore.getState().paste();
        return;
      }

      // Duplicate (Cmd/Ctrl-D)
      if (meta && (e.key === "d" || e.key === "D")) {
        if (isTextInput) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        useStore.getState().copy(selectedIds);
        useStore.getState().paste();
        return;
      }

      // Group / Ungroup
      if (meta && (e.key === "g" || e.key === "G")) {
        if (isTextInput) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        if (e.shiftKey) useStore.getState().ungroupSelection(selectedIds);
        else useStore.getState().groupSelection(selectedIds);
        return;
      }

      // Layer ordering (Cmd/Ctrl-]/[)
      if (meta && e.key === "]") {
        if (isTextInput) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        if (e.shiftKey) useStore.getState().bringToFront(selectedIds);
        else useStore.getState().bringForward(selectedIds);
        return;
      }
      if (meta && e.key === "[") {
        if (isTextInput) return;
        if (selectedIds.length === 0) return;
        e.preventDefault();
        if (e.shiftKey) useStore.getState().sendToBack(selectedIds);
        else useStore.getState().sendBackward(selectedIds);
        return;
      }

      // Select all
      if (meta && (e.key === "a" || e.key === "A")) {
        if (isTextInput) return;
        e.preventDefault();
        useStore.getState().setSelection(useStore.getState().objects.map((o) => o.id));
        return;
      }

      // Delete
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
          <EditCanvas ref={svgRef} width={size.w} height={size.h} />
          <div className="mode-hint">
            Click an object to select. Drag to move. Hold Shift to multi-select. Double-click a
            selected line to add an anchor; Alt-click an anchor to remove it.
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
