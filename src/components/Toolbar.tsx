import { useState } from "react";
import { useStore } from "../store";
import { classifyStroke, mergeEndpointsToVertices } from "../lib/strokeAnalysis";
import type { DiagramObject, ShapeKind, VertexObject, LineObject, Point } from "../types";
import { uid } from "../store";
import { downloadPdf, downloadPng, downloadSvg } from "../lib/exporters";
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
}: {
  onShowLabel: () => void;
  getSvg: () => SVGSVGElement | null;
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

  const [projectName, setProjectName] = useState("My diagram");
  const [showExport, setShowExport] = useState(false);
  const [showSavedList, setShowSavedList] = useState(false);
  const [showShapes, setShowShapes] = useState(false);

  const convert = () => {
    if (strokes.length === 0) {
      setMode("edit");
      return;
    }
    // Classify each stroke into a line
    const lines: LineObject[] = strokes.map((s) => {
      const c = classifyStroke(s);
      return {
        id: uid("ln"),
        kind: "line",
        points: c.controlPoints,
        style: c.style,
        arrow: "none",
        color: "#111111",
        strokeWidth: 2,
        amplitude: c.amplitude,
        wavelength: c.wavelength,
      };
    });
    // Merge close endpoints into shared vertices
    const { vertices: vpts, map } = mergeEndpointsToVertices(
      lines.map((l) => ({ id: l.id, points: l.points })),
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
    // Snap line endpoints to the merged vertex positions and record connections
    const snapped: LineObject[] = lines.map((l) => {
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

    const newObjects: DiagramObject[] = [...objects, ...snapped, ...vertexObjs];
    setObjects(newObjects);
    clearStrokes();
    setMode("edit");
  };

  const handleExport = async (kind: "svg" | "png" | "pdf" | "json") => {
    const svg = getSvg();
    if (kind === "json") {
      exportProjectFile(projectName || "diagram", { objects, strokes });
      return;
    }
    if (!svg) return;
    if (kind === "svg") downloadSvg(svg, `${projectName || "diagram"}.svg`);
    if (kind === "png") await downloadPng(svg, `${projectName || "diagram"}.png`, 2);
    if (kind === "pdf") await downloadPdf(svg, `${projectName || "diagram"}.pdf`, 2);
    setShowExport(false);
  };

  const handleSave = () => {
    saveProject(projectName || "Untitled", { objects, strokes });
  };

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

      <div className="dropdown">
        <button className="btn primary" onClick={() => setShowExport((v) => !v)}>
          Export ▾
        </button>
        {showExport && (
          <div className="dropdown-menu">
            <button className="dropdown-item" onClick={() => handleExport("svg")}>
              SVG (vector)
            </button>
            <button className="dropdown-item" onClick={() => handleExport("png")}>
              PNG (raster)
            </button>
            <button className="dropdown-item" onClick={() => handleExport("pdf")}>
              PDF
            </button>
            <button className="dropdown-item" onClick={() => handleExport("json")}>
              Project JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
