import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { ShapeKind } from "../types";
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
  const selectedIds = useStore((s) => s.selectedIds);
  const copy = useStore((s) => s.copy);
  const cut = useStore((s) => s.cut);
  const paste = useStore((s) => s.paste);
  const groupSelection = useStore((s) => s.groupSelection);
  const ungroupSelection = useStore((s) => s.ungroupSelection);
  const bringForward = useStore((s) => s.bringForward);
  const sendBackward = useStore((s) => s.sendBackward);
  const bringToFront = useStore((s) => s.bringToFront);
  const sendToBack = useStore((s) => s.sendToBack);
  const removeMany = useStore((s) => s.removeMany);
  const zoom = useStore((s) => s.zoom);
  const zoomIn = useStore((s) => s.zoomIn);
  const zoomOut = useStore((s) => s.zoomOut);
  const resetView = useStore((s) => s.resetView);

  const [openMenu, setOpenMenu] = useState<null | "file" | "edit" | "insert" | "shapes">(null);
  const [showExport, setShowExport] = useState(false);
  const menuBarRef = useRef<HTMLDivElement>(null);

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

  const handleSave = () => saveProject(projectName || "Untitled", { objects });

  const handleLoad = (name: string) => {
    const p = loadProject(name);
    if (p) {
      loadState({ objects: p.objects });
      setProjectName(p.name);
    }
    setOpenMenu(null);
  };

  const handleImport = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      const p = await importProjectFile(file);
      loadState({ objects: p.objects });
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
  const hasSelection = selectedIds.length > 0;

  const setOrToggle = (id: typeof openMenu) => {
    setOpenMenu((prev) => (prev === id ? null : id));
  };

  const close = () => setOpenMenu(null);

  return (
    <>
      <div className="menubar" ref={menuBarRef}>
        <div className="brand">
          <span className="brand-mark">∫</span>
          <span>FeynSketch</span>
        </div>

        <div className="menubar-menus">
          <Menu label="File" open={openMenu === "file"} onToggle={() => setOrToggle("file")}>
            <MenuItem
              onClick={() => {
                if (objects.length > 0) {
                  if (!window.confirm("Discard the current diagram and start a new one?")) return;
                }
                reset();
                setProjectName("Untitled");
                close();
              }}
            >
              New
            </MenuItem>
            <MenuItem
              onClick={() => {
                handleSave();
                close();
              }}
            >
              Save project
            </MenuItem>
            <MenuItem
              onClick={() => {
                setShowExport(true);
                close();
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
                    close();
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

          <Menu label="Edit" open={openMenu === "edit"} onToggle={() => setOrToggle("edit")}>
            <MenuItem disabled={!canUndo} onClick={() => { undo(); close(); }}>
              Undo <Kbd>⌘Z</Kbd>
            </MenuItem>
            <MenuItem disabled={!canRedo} onClick={() => { redo(); close(); }}>
              Redo <Kbd>⇧⌘Z</Kbd>
            </MenuItem>
            <MenuDivider />
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { cut(selectedIds); close(); }}
            >
              Cut <Kbd>⌘X</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { copy(selectedIds); close(); }}
            >
              Copy <Kbd>⌘C</Kbd>
            </MenuItem>
            <MenuItem onClick={() => { paste(); close(); }}>
              Paste <Kbd>⌘V</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { copy(selectedIds); paste(); close(); }}
            >
              Duplicate <Kbd>⌘D</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => {
                if (settings.confirmDelete &&
                  !window.confirm(
                    selectedIds.length === 1
                      ? "Delete this object?"
                      : `Delete ${selectedIds.length} objects?`
                  )
                ) {
                  close();
                  return;
                }
                removeMany(selectedIds);
                close();
              }}
            >
              Delete <Kbd>Del</Kbd>
            </MenuItem>
            <MenuDivider />
            <MenuItem
              disabled={selectedIds.length < 2}
              onClick={() => { groupSelection(selectedIds); close(); }}
            >
              Group <Kbd>⌘G</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { ungroupSelection(selectedIds); close(); }}
            >
              Ungroup <Kbd>⇧⌘G</Kbd>
            </MenuItem>
            <MenuDivider />
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { bringForward(selectedIds); close(); }}
            >
              Bring forward <Kbd>⌘]</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { sendBackward(selectedIds); close(); }}
            >
              Send backward <Kbd>⌘[</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { bringToFront(selectedIds); close(); }}
            >
              Bring to front <Kbd>⇧⌘]</Kbd>
            </MenuItem>
            <MenuItem
              disabled={!hasSelection}
              onClick={() => { sendToBack(selectedIds); close(); }}
            >
              Send to back <Kbd>⇧⌘[</Kbd>
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

          <Menu label="Insert" open={openMenu === "insert"} onToggle={() => setOrToggle("insert")}>
            <MenuItem onClick={() => { setTool("line"); close(); }}>Line</MenuItem>
            <MenuItem onClick={() => { setTool("vertex"); close(); }}>Vertex</MenuItem>
            <MenuLabel>Shapes</MenuLabel>
            <div className="shape-grid">
              {(["circle", "ellipse", "square", "rect", "triangle", "diamond", "cross"] as ShapeKind[]).map((s) => (
                <button
                  key={s}
                  className="chip"
                  onClick={() => {
                    setPendingShape(s);
                    setTool("shape");
                    close();
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <MenuDivider />
            <MenuItem onClick={() => { onShowLabel(); close(); }}>LaTeX label</MenuItem>
          </Menu>
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

        <div className="iconbar zoombar">
          <button
            className="icon-btn"
            onClick={() => zoomOut()}
            title="Zoom out"
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            className="icon-btn zoom-readout"
            onClick={resetView}
            title="Reset zoom (100%)"
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="icon-btn"
            onClick={() => zoomIn()}
            title="Zoom in"
            aria-label="Zoom in"
          >
            +
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
              {(["circle", "ellipse", "square", "rect", "triangle", "diamond", "cross"] as ShapeKind[]).map((s) => (
                <button
                  key={s}
                  className="dropdown-item"
                  onClick={() => {
                    setPendingShape(s);
                    setTool("shape");
                    close();
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
        <span className="hint">
          Drag with the marquee to box-select. Cmd/Ctrl-G groups; Cmd/Ctrl-]/[ change layer order.
        </span>
      </div>

      <ExportDialog
        open={showExport}
        defaultName={projectName || "diagram"}
        onClose={() => setShowExport(false)}
        onSubmit={async (v) => {
          try {
            if (v.format === "json") {
              exportProjectFile(v.filename, { objects });
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
