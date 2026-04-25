import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { classifyStroke, detectDashGroups, snapEndpointsTogether } from "../lib/strokeAnalysis";
import type { DiagramObject, ShapeKind, ShapeObject, LineObject } from "../types";
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
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const past = useStore((s) => s.past);
  const future = useStore((s) => s.future);

  const [openMenu, setOpenMenu] = useState<null | "file" | "edit" | "insert" | "settings" | "shapes">(null);
  const [showExport, setShowExport] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

  // Close any open dropdown on outside click or Escape. Any element marked
  // [data-menu-region] (the trigger, the dropdown panel, or its contents) is
  // considered "inside" so clicks on items can still fire their handlers.
  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest && t.closest("[data-menu-region]")) return;
      setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

  const convert = () => {
    if (strokes.length === 0) {
      setMode("edit");
      return;
    }

    const dashGroups = detectDashGroups(strokes);
    const consumed = new Set<number>();
    const dashLines: LineObject[] = [];
    for (const g of dashGroups) {
      for (const i of g.strokeIndices) consumed.add(i);
      dashLines.push({
        id: uid("ln"),
        kind: "line",
        points: [g.start, g.end],
        style: "dashed",
        arrow: "none",
        color: "#111111",
        strokeWidth: 2,
        amplitude: 8,
        wavelength: 16,
      });
    }

    const newLines: LineObject[] = [];
    const newShapes: ShapeObject[] = [];
    for (let i = 0; i < strokes.length; i++) {
      if (consumed.has(i)) continue;
      const c = classifyStroke(strokes[i]);
      if (c.kind === "shape") {
        newShapes.push({
          id: uid("shp"),
          kind: "shape",
          shape: c.shape,
          x: c.cx,
          y: c.cy,
          width: c.width,
          height: c.height,
          rotation: c.rotation,
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

    const allLines = [...dashLines, ...newLines];
    const snapped = snapEndpointsTogether(
      allLines.map((l) => ({ id: l.id, points: l.points })),
      18
    );
    const snapMap = new Map(snapped.map((s) => [s.id, s.points]));
    const finalLines: LineObject[] = allLines.map((l) => ({
      ...l,
      points: snapMap.get(l.id) ?? l.points,
    }));

    const newObjects: DiagramObject[] = [...objects, ...newShapes, ...finalLines];
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
    setOpenMenu(null);
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
    setOpenMenu(null);
  };

  const saved = listProjects();
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;

  const setOrToggle = (id: typeof openMenu) => {
    setOpenMenu((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <div className="menubar" ref={menuBarRef}>
        <div className="brand">
          <span className="brand-mark">∫</span>
          <span>FeynSketch</span>
        </div>

        <div className="menubar-menus">
          <Menu
            label="File"
            open={openMenu === "file"}
            onToggle={() => setOrToggle("file")}
          >
            <MenuItem
              onClick={() => {
                if (objects.length > 0 || strokes.length > 0) {
                  if (!window.confirm("Discard the current diagram and start a new one?")) return;
                }
                reset();
                setProjectName("Untitled");
                setOpenMenu(null);
              }}
            >
              New <Kbd>blank</Kbd>
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleSave();
                setOpenMenu(null);
              }}
            >
              Save project
            </MenuItem>
            <MenuItem
              onClick={() => {
                setShowExport(true);
                setOpenMenu(null);
              }}
            >
              Export…
            </MenuItem>
            <MenuDivider />
            <MenuLabel>Saved projects</MenuLabel>
            {saved.length === 0 && <MenuEmpty>No saved projects yet</MenuEmpty>}
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
                    setOpenMenu(null);
                  }}
                  title="Delete this saved project"
                >
                  ✕
                </button>
              </div>
            ))}
            <MenuDivider />
            <label className="dropdown-item">
              Import project file…
              <input type="file" accept="application/json,.json" onChange={handleImport} hidden />
            </label>
          </Menu>

          <Menu
            label="Edit"
            open={openMenu === "edit"}
            onToggle={() => setOrToggle("edit")}
          >
            <MenuItem
              disabled={!canUndo}
              onClick={() => {
                undo();
                setOpenMenu(null);
              }}
            >
              Undo <Kbd>⌘Z</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!canRedo}
              onClick={() => {
                redo();
                setOpenMenu(null);
              }}
            >
              Redo <Kbd>⇧⌘Z</Kbd>
            </MenuItem>
            <MenuDivider />
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
          </Menu>

          {mode === "edit" && (
            <Menu
              label="Insert"
              open={openMenu === "insert"}
              onToggle={() => setOrToggle("insert")}
            >
              <MenuItem
                onClick={() => {
                  setTool("line");
                  setOpenMenu(null);
                }}
              >
                Line
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setTool("vertex");
                  setOpenMenu(null);
                }}
              >
                Vertex
              </MenuItem>
              <MenuLabel>Shapes</MenuLabel>
              <div className="shape-grid">
                {(["circle", "ellipse", "square", "rect", "triangle", "diamond"] as ShapeKind[]).map((s) => (
                  <button
                    key={s}
                    className="chip"
                    onClick={() => {
                      setPendingShape(s);
                      setTool("shape");
                      setOpenMenu(null);
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  onShowLabel();
                  setOpenMenu(null);
                }}
              >
                LaTeX label
              </MenuItem>
            </Menu>
          )}
        </div>

        <input
          className="text project-name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          aria-label="Project name"
        />

        <div className="spacer" />

        <div className="iconbar">
          <button
            className="icon-btn"
            disabled={!canUndo}
            onClick={undo}
            title="Undo (⌘Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          <button
            className="icon-btn"
            disabled={!canRedo}
            onClick={redo}
            title="Redo (⇧⌘Z)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <button
          className={`btn ${settings.snap ? "active" : ""}`}
          title="Snap new objects and dragging to the background grid"
          onClick={() => setSettings({ snap: !settings.snap })}
        >
          Snap {settings.snap ? "on" : "off"}
        </button>

        <button className="btn" onClick={handleSave} title="Save project to your browser">
          Save
        </button>
        <button className="btn primary" onClick={() => setShowExport(true)}>
          Export…
        </button>
      </div>

      <div className="toolstrip">
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
            <span className="hint">
              Sketch your diagram freely — straight bits become straight, photons become wiggly,
              gluons become curly, and runs of dashes are detected automatically.
            </span>
          </>
        )}

        {mode === "edit" && (
          <>
            <button
              className={`btn ${tool === "select" ? "active" : ""}`}
              onClick={() => setTool("select")}
            >
              Select
            </button>
            <button
              className={`btn ${tool === "line" ? "active" : ""}`}
              onClick={() => setTool(tool === "line" ? "select" : "line")}
            >
              Line
            </button>
            <button
              className={`btn ${tool === "vertex" ? "active" : ""}`}
              onClick={() => setTool(tool === "vertex" ? "select" : "vertex")}
            >
              Vertex
            </button>
            <div className="dropdown" data-menu-region>
              <button
                className={`btn ${tool === "shape" ? "active" : ""}`}
                onClick={() => setOrToggle("shapes")}
              >
                Shape ▾
              </button>
              {openMenu === "shapes" && (
                <div className="dropdown-menu" data-menu-region>
                  {(["circle", "ellipse", "square", "rect", "triangle", "diamond"] as ShapeKind[]).map((s) => (
                    <button
                      key={s}
                      className="dropdown-item"
                      onClick={() => {
                        setPendingShape(s);
                        setTool("shape");
                        setOpenMenu(null);
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
      </div>

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
    </>
  );
}

function Menu({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="dropdown menu-slot" data-menu-region>
      <button
        className={`menu-trigger ${open ? "open" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        {label}
      </button>
      {open && (
        <div className="dropdown-menu wide" data-menu-region>
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`dropdown-item${disabled ? " disabled" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="dropdown-header">{children}</div>;
}

function MenuEmpty({ children }: { children: React.ReactNode }) {
  return <div className="dropdown-empty">{children}</div>;
}

function MenuDivider() {
  return <div className="dropdown-divider" />;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="kbd">{children}</span>;
}
