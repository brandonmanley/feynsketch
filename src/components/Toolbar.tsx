import { useState } from "react";
import { useStore } from "../store";
import { classifyStroke, mergeEndpointsToVertices } from "../lib/strokeAnalysis";
import type { DiagramObject, ShapeKind, ShapeObject, VertexObject, LineObject, Point } from "../types";
import { uid } from "../store";
import { performExport } from "../lib/exporters";
import { ExportDialog } from "./ExportDialog";
import {
  deleteProject,
  exportProjectFile,
  importProjectFile,
  listProjects,
  loadProject,
  saveProject,
} from "../lib/storage";

export function Toolbar({
  onShowLabel,
  getSvg,
  projectName,
  setProjectName,
}: {
  onShowLabel: () => void;
  getSvg: () => SVGSVGElement | null;
  projectName: string;
  setProjectName: (n: string) => void;
}) {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const strokes = useStore((s) => s.strokes);
  const clearStrokes = useStore((s) => s.clearStrokes);
  const setObjects = useStore((s) => s.setObjects);
  const objects = useStore((s) => s.objects);
  const tool = useStore((s) => s.tool);
  const setTool = useStore((s) => s.setTool);
  const setPendingShape = useStore((s) => s.setPendingShape);
  const loadState = useStore((s) => s.loadState);
  const reset = useStore((s) => s.reset);
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);

  const [showExport, setShowExport] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const convert = () => {
    if (strokes.length === 0) {
      setMode("edit");
      return;
    }
    const newLines: LineObject[] = [];
    const newShapes: ShapeObject[] = [];
    for (const s of strokes) {
      const c = classifyStroke(s);
      if (c.kind === "shape") {
        newShapes.push({
          id: uid("shp"),
          kind: "shape",
          shape: c.shape,
          x: c.cx,
          y: c.cy,
          width: c.width,
          height: c.height,
          rotation: 0,
          fill: "transparent",
          stroke: "#111111",
          strokeWidth: 2,
        });
      } else {
        newLines.push({
          id: uid("ln"),
          kind: "line",
          points: c.controlPoints,
          style: c.style,
          arrow: "none",
          color: "#111111",
          strokeWidth: 2,
          amplitude: c.amplitude,
          wavelength: c.wavelength,
        });
      }
    }
    // Merge near-by line endpoints into shared vertices.
    const { vertices: vpts, map } = mergeEndpointsToVertices(
      newLines.map((l) => ({ id: l.id, points: l.points })),
      18
    );
    const vertexObjs: VertexObject[] = vpts.map((p) => ({
      id: uid("vtx"),
      kind: "vertex",
      x: p.x,
      y: p.y,
      shape: "circle",
      fill: "filled",
      color: "#111111",
      size: 5,
    }));
    const snapped: LineObject[] = newLines.map((l) => {
      const m = map[l.id];
      let pts = l.points.slice();
      let startVertexId: string | undefined;
      let endVertexId: string | undefined;
      if (m?.start !== undefined) {
        const v = vertexObjs[m.start];
        pts = [{ x: v.x, y: v.y } as Point, ...pts.slice(1)];
        startVertexId = v.id;
      }
      if (m?.end !== undefined) {
        const v = vertexObjs[m.end];
        pts = [...pts.slice(0, pts.length - 1), { x: v.x, y: v.y } as Point];
        endVertexId = v.id;
      }
      return { ...l, points: pts, startVertexId, endVertexId };
    });

    const newObjects: DiagramObject[] = [...objects, ...newShapes, ...snapped, ...vertexObjs];
    setObjects(newObjects);
    clearStrokes();
    setMode("edit");
  };

  const handleSave = () => saveProject(projectName || "Untitled", { objects, strokes });

  const handleLoad = (name: string) => {
    const p = loadProject(name);
    if (p) {
      loadState({ objects: p.objects, strokes: p.strokes, mode: "edit" });
      setProjectName(p.name);
    }
    setShowSavedList(false);
  };

  const handleImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const p = await importProjectFile(file);
      loadState({ objects: p.objects, strokes: p.strokes, mode: "edit" });
      setProjectName(p.name);
    } catch (e) {
      alert("Could not import file: " + String(e));
    }
    ev.target.value = "";
  };

  const saved = listProjects();

  return (
    <div className="toolbar">
      <div className="brand">
        <span className="brand-mark">∫</span>
        <span>FeynSketch</span>
      </div>

      <input
        className="text project-name"
        value={projectName}
        onChange={(e) => setProjectName(e.target.value)}
      />

      <div className="divider" />

      <div className="seg">
        <button
          className={`seg-btn ${mode === "draw" ? "active" : ""}`}
          onClick={() => setMode("draw")}
        >
          Draw
        </button>
        <button
          className={`seg-btn ${mode === "edit" ? "active" : ""}`}
          onClick={() => setMode("edit")}
        >
          Edit
        </button>
      </div>

      <button
        className={`btn ${settings.snap ? "active" : ""}`}
        title="Snap new objects and dragging to the background grid"
        onClick={() => setSettings({ snap: !settings.snap })}
      >
        {settings.snap ? "Snap: on" : "Snap: off"}
      </button>

      {mode === "draw" && (
        <>
          <button className="btn primary" onClick={convert}>
            Convert → editable
          </button>
          <button className="btn" onClick={clearStrokes}>
            Clear strokes
          </button>
        </>
      )}

      {mode === "edit" && (
        <>
          <button
            className={`btn ${tool === "line" ? "active" : ""}`}
            onClick={() => setTool(tool === "line" ? "select" : "line")}
          >
            Draw line
          </button>
          <button
            className={`btn ${tool === "vertex" ? "active" : ""}`}
            onClick={() => setTool(tool === "vertex" ? "select" : "vertex")}
          >
            Vertex
          </button>
          <div className="dropdown">
            <button
              className={`btn ${tool === "shape" ? "active" : ""}`}
              onClick={() => setShowShapes((v) => !v)}
            >
              Shape ▾
            </button>
            {showShapes && (
              <div className="dropdown-menu">
                {(["circle", "ellipse", "square", "rect", "triangle", "diamond"] as ShapeKind[]).map((s) => (
                  <button
                    key={s}
                    className="dropdown-item"
                    onClick={() => {
                      setPendingShape(s);
                      setTool("shape");
                      setShowShapes(false);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn" onClick={onShowLabel}>
            LaTeX label
          </button>
        </>
      )}

      <div className="spacer" />

      <div className="dropdown">
        <button className="btn" onClick={() => setShowSettings((v) => !v)}>
          Settings ▾
        </button>
        {showSettings && (
          <div className="dropdown-menu wide">
            <div className="dropdown-header">Settings</div>
            <label className="dropdown-item check-item">
              <input
                type="checkbox"
                checked={settings.snap}
                onChange={(e) => setSettings({ snap: e.target.checked })}
              />
              Snap to grid
            </label>
            <label className="dropdown-item check-item">
              <input
                type="checkbox"
                checked={settings.confirmDelete}
                onChange={(e) => setSettings({ confirmDelete: e.target.checked })}
              />
              Confirm before delete
            </label>
            <div className="dropdown-item slider-item">
              <span>Grid size</span>
              <input
                type="range"
                min={8}
                max={60}
                step={1}
                value={settings.gridSize}
                onChange={(e) => setSettings({ gridSize: Number(e.target.value) })}
              />
              <span className="dim">{settings.gridSize}px</span>
            </div>
          </div>
        )}
      </div>

      <div className="dropdown">
        <button className="btn" onClick={() => setShowSavedList((v) => !v)}>
          Projects ▾
        </button>
        {showSavedList && (
          <div className="dropdown-menu wide">
            <div className="dropdown-header">Saved projects</div>
            {saved.length === 0 && <div className="dropdown-empty">No saved projects yet</div>}
            {saved.map((p) => (
              <div key={p.name} className="dropdown-row">
                <button className="dropdown-item grow" onClick={() => handleLoad(p.name)}>
                  {p.name}
                  <span className="dim"> · {new Date(p.savedAt).toLocaleString()}</span>
                </button>
                <button
                  className="dropdown-item mini danger"
                  onClick={() => {
                    deleteProject(p.name);
                    setShowSavedList(false);
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="dropdown-divider" />
            <label className="dropdown-item">
              Import project file…
              <input type="file" accept="application/json,.json" onChange={handleImport} hidden />
            </label>
            <button className="dropdown-item" onClick={() => { reset(); setShowSavedList(false); }}>
              New blank project
            </button>
          </div>
        )}
      </div>

      <button className="btn" onClick={handleSave}>
        Save
      </button>

      <button className="btn primary" onClick={() => setShowExport(true)}>
        Export…
      </button>

      <ExportDialog
        open={showExport}
        defaultName={projectName || "diagram"}
        onClose={() => setShowExport(false)}
        onSubmit={async (v) => {
          try {
            if (v.format === "json") {
              exportProjectFile(v.filename, { objects, strokes });
            } else {
              await performExport(getSvg(), {
                filename: v.filename,
                format: v.format,
                dpi: v.dpi,
                transparent: v.transparent,
              });
            }
          } catch (e) {
            alert("Export failed: " + String(e));
          }
          setShowExport(false);
        }}
      />
    </div>
  );
}
