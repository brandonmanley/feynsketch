import { forwardRef, useRef, useState } from "react";
import { useStore } from "../store";
import type { DiagramObject, Point } from "../types";
import { LineRenderer } from "./LineRenderer";
import { ShapeRenderer } from "./ShapeRenderer";
import { VertexRenderer } from "./VertexRenderer";
import { LatexLabel } from "./LatexLabel";

type Drag =
  | { kind: "object"; ids: string[]; start: Point; originals: Map<string, DiagramObject> }
  | { kind: "anchor"; id: string; index: number }
  | { kind: "shape-resize"; id: string; handle: "nw" | "ne" | "sw" | "se"; origW: number; origH: number }
  | { kind: "new-line"; points: Point[] }
  | { kind: "marquee"; start: Point; end: Point; additive: boolean }
  | null;

function snapPt(p: Point, snap: boolean, grid: number): Point {
  if (!snap) return p;
  return { x: Math.round(p.x / grid) * grid, y: Math.round(p.y / grid) * grid };
}

function snapDelta(dx: number, dy: number, snap: boolean, grid: number): { dx: number; dy: number } {
  if (!snap) return { dx, dy };
  return { dx: Math.round(dx / grid) * grid, dy: Math.round(dy / grid) * grid };
}

function referencePoint(o: DiagramObject): Point | null {
  if (o.kind === "line") return o.points[0] ?? null;
  if (o.kind === "shape" || o.kind === "vertex" || o.kind === "label") return { x: o.x, y: o.y };
  return null;
}

function objectBox(o: DiagramObject): { minX: number; minY: number; maxX: number; maxY: number } {
  if (o.kind === "line") {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of o.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }
  if (o.kind === "shape") {
    return { minX: o.x - o.width / 2, minY: o.y - o.height / 2, maxX: o.x + o.width / 2, maxY: o.y + o.height / 2 };
  }
  if (o.kind === "vertex") {
    return { minX: o.x - o.size, minY: o.y - o.size, maxX: o.x + o.size, maxY: o.y + o.size };
  }
  // label
  return { minX: o.x, minY: o.y, maxX: o.x + 60, maxY: o.y + 24 };
}

function rectsOverlap(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number }
) {
  return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

export const EditCanvas = forwardRef<SVGSVGElement, { width: number; height: number }>(function EditCanvas(
  { width, height },
  ref
) {
  const objects = useStore((s) => s.objects);
  const selectedIds = useStore((s) => s.selectedIds);
  const select = useStore((s) => s.select);
  const setSelection = useStore((s) => s.setSelection);
  const toggleSelection = useStore((s) => s.toggleSelection);
  const updateObject = useStore((s) => s.updateObject);
  const tool = useStore((s) => s.tool);
  const addLine = useStore((s) => s.addLine);
  const addVertex = useStore((s) => s.addVertex);
  const addShape = useStore((s) => s.addShape);
  const pendingShape = useStore((s) => s.pendingShape);
  const setTool = useStore((s) => s.setTool);
  const setPendingShape = useStore((s) => s.setPendingShape);
  const settings = useStore((s) => s.settings);
  const pushHistory = useStore((s) => s.pushHistory);
  const removeAnchor = useStore((s) => s.removeAnchor);

  const [drag, setDrag] = useState<Drag>(null);
  const tempPath = useRef<SVGPathElement>(null);

  const selectedSet = new Set(selectedIds);

  const toLocal = (e: React.PointerEvent, svg: SVGSVGElement): Point => {
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const rootSvg = (): SVGSVGElement | null =>
    typeof ref === "object" && ref ? (ref as React.RefObject<SVGSVGElement>).current : null;

  const startObjectDrag = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const svg = rootSvg();
    if (!svg) return;

    let ids: string[];
    if (e.shiftKey) {
      if (selectedSet.has(id)) {
        // Shift-click on already-selected: just deselect, don't drag.
        toggleSelection(id);
        return;
      }
      // Shift-click on unselected: add to selection and start dragging the whole group.
      ids = [...selectedIds, id];
      toggleSelection(id);
    } else if (selectedSet.has(id)) {
      ids = selectedIds.slice();
    } else {
      ids = [id];
      select(id);
    }
    if (ids.length === 0) return;
    const originals = new Map<string, DiagramObject>();
    for (const o of objects) if (ids.includes(o.id)) originals.set(o.id, o);
    svg.setPointerCapture(e.pointerId);
    pushHistory();
    setDrag({ kind: "object", ids, start: toLocal(e, svg), originals });
  };

  const startAnchorDrag = (id: string, index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    const svg = rootSvg();
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    pushHistory();
    setDrag({ kind: "anchor", id, index });
  };

  const startShapeResize = (
    id: string,
    handle: "nw" | "ne" | "sw" | "se",
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    const obj = objects.find((o) => o.id === id);
    if (!obj || obj.kind !== "shape") return;
    const svg = rootSvg();
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    pushHistory();
    setDrag({ kind: "shape-resize", id, handle, origW: obj.width, origH: obj.height });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const p = toLocal(e, svg);
    const sp = snapPt(p, settings.snap, settings.gridSize);

    if (tool === "vertex") {
      addVertex(sp.x, sp.y);
      setTool("select");
      return;
    }
    if (tool === "shape" && pendingShape) {
      addShape(pendingShape, sp.x, sp.y);
      setTool("select");
      setPendingShape(null);
      return;
    }
    if (tool === "line") {
      svg.setPointerCapture(e.pointerId);
      setDrag({ kind: "new-line", points: [sp] });
      return;
    }
    // Empty area click in select tool: start marquee
    svg.setPointerCapture(e.pointerId);
    setDrag({ kind: "marquee", start: p, end: p, additive: e.shiftKey });
    if (!e.shiftKey) select(null);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const svg = e.currentTarget;
    const p = toLocal(e, svg);

    if (drag.kind === "object") {
      let dx = p.x - drag.start.x;
      let dy = p.y - drag.start.y;
      if (settings.snap) {
        // Snap so the first object's reference point lands on a grid intersection,
        // then apply the same delta to the rest so relative positions are preserved.
        const ref = drag.originals.get(drag.ids[0]);
        const refPt = ref ? referencePoint(ref) : null;
        if (refPt) {
          const target = snapPt({ x: refPt.x + dx, y: refPt.y + dy }, true, settings.gridSize);
          dx = target.x - refPt.x;
          dy = target.y - refPt.y;
        } else {
          const snapped = snapDelta(dx, dy, true, settings.gridSize);
          dx = snapped.dx;
          dy = snapped.dy;
        }
      }
      for (const id of drag.ids) {
        const obj = drag.originals.get(id);
        if (!obj) continue;
        if (obj.kind === "line") {
          updateObject(obj.id, { points: obj.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
        } else if (obj.kind === "shape" || obj.kind === "vertex" || obj.kind === "label") {
          updateObject(obj.id, { x: obj.x + dx, y: obj.y + dy });
        }
      }
    } else if (drag.kind === "anchor") {
      const obj = objects.find((o) => o.id === drag.id);
      if (!obj || obj.kind !== "line") return;
      const pts = obj.points.slice();
      pts[drag.index] = snapPt(p, settings.snap, settings.gridSize);
      updateObject(obj.id, { points: pts });
    } else if (drag.kind === "shape-resize") {
      const obj = objects.find((o) => o.id === drag.id);
      if (!obj || obj.kind !== "shape") return;
      const sp = snapPt(p, settings.snap, settings.gridSize);
      const dx = sp.x - obj.x;
      const dy = sp.y - obj.y;
      const w = Math.max(10, Math.abs(dx) * 2);
      const h = Math.max(10, Math.abs(dy) * 2);
      updateObject(drag.id, { width: w, height: h });
    } else if (drag.kind === "new-line") {
      const sp = snapPt(p, settings.snap, settings.gridSize);
      const last = drag.points[drag.points.length - 1];
      if (!last || Math.hypot(sp.x - last.x, sp.y - last.y) > 2) {
        const next = [...drag.points, sp];
        setDrag({ kind: "new-line", points: next });
        if (tempPath.current) {
          const d =
            `M ${next[0].x} ${next[0].y} ` +
            next
              .slice(1)
              .map((pt) => `L ${pt.x} ${pt.y}`)
              .join(" ");
          tempPath.current.setAttribute("d", d);
        }
      }
    } else if (drag.kind === "marquee") {
      setDrag({ ...drag, end: p });
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.kind === "new-line") {
      if (drag.points.length >= 2) {
        addLine(drag.points, "solid");
        setTool("select");
      }
      if (tempPath.current) tempPath.current.setAttribute("d", "");
    } else if (drag.kind === "marquee") {
      const r = {
        minX: Math.min(drag.start.x, drag.end.x),
        minY: Math.min(drag.start.y, drag.end.y),
        maxX: Math.max(drag.start.x, drag.end.x),
        maxY: Math.max(drag.start.y, drag.end.y),
      };
      const dragged = Math.hypot(drag.end.x - drag.start.x, drag.end.y - drag.start.y) > 4;
      if (dragged) {
        const hits = objects.filter((o) => rectsOverlap(objectBox(o), r)).map((o) => o.id);
        if (drag.additive) {
          const merged = Array.from(new Set([...selectedIds, ...hits]));
          setSelection(merged);
        } else {
          setSelection(hits);
        }
      }
    }
    setDrag(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (selectedIds.length !== 1) return;
    const selected = objects.find((o) => o.id === selectedIds[0]);
    if (!selected || selected.kind !== "line") return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const pts = selected.points;
    let bestSeg = 0;
    let bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const px = a.x + t * dx;
      const py = a.y + t * dy;
      const d = Math.hypot(p.x - px, p.y - py);
      if (d < bestD) {
        bestD = d;
        bestSeg = i;
      }
    }
    const next = [...pts.slice(0, bestSeg + 1), p, ...pts.slice(bestSeg + 1)];
    updateObject(selected.id, { points: next });
  };

  const marquee =
    drag?.kind === "marquee"
      ? {
          x: Math.min(drag.start.x, drag.end.x),
          y: Math.min(drag.start.y, drag.end.y),
          w: Math.abs(drag.end.x - drag.start.x),
          h: Math.abs(drag.end.y - drag.start.y),
        }
      : null;

  return (
    <svg
      ref={ref}
      width={width}
      height={height}
      className="canvas-surface"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      style={{ touchAction: "none", background: "#ffffff" }}
    >
      <defs>
        <pattern id="edit-grid" width={settings.gridSize} height={settings.gridSize} patternUnits="userSpaceOnUse">
          <path d={`M ${settings.gridSize} 0 L 0 0 0 ${settings.gridSize}`} fill="none" stroke="#f1f1f1" strokeWidth="1" />
        </pattern>
        {settings.snap && (
          <pattern id="edit-grid-dots" width={settings.gridSize} height={settings.gridSize} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={1.2} fill="#cfd6e2" />
          </pattern>
        )}
      </defs>
      <rect data-editor-only width={width} height={height} fill={settings.snap ? "url(#edit-grid-dots)" : "url(#edit-grid)"} />

      {objects.map((obj) => {
        const selected = selectedSet.has(obj.id);
        const onDown = (e: React.PointerEvent) => startObjectDrag(obj.id, e);
        if (obj.kind === "line")
          return (
            <LineRenderer
              key={obj.id}
              line={obj}
              selected={selected}
              onPointerDown={onDown}
              onAnchorPointerDown={(i, e) => startAnchorDrag(obj.id, i, e)}
              onAnchorAltClick={(i) => removeAnchor(obj.id, i)}
            />
          );
        if (obj.kind === "shape")
          return (
            <ShapeRenderer
              key={obj.id}
              shape={obj}
              selected={selected}
              onPointerDown={onDown}
              onHandlePointerDown={(h, e) => startShapeResize(obj.id, h, e)}
            />
          );
        if (obj.kind === "vertex")
          return <VertexRenderer key={obj.id} vertex={obj} selected={selected} onPointerDown={onDown} />;
        if (obj.kind === "label")
          return <LatexLabel key={obj.id} label={obj} selected={selected} onPointerDown={onDown} />;
        return null;
      })}

      {drag?.kind === "new-line" && (
        <path
          ref={tempPath}
          fill="none"
          stroke="#2b6cb0"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="4 4"
        />
      )}

      {marquee && (
        <rect
          data-editor-only
          x={marquee.x}
          y={marquee.y}
          width={marquee.w}
          height={marquee.h}
          fill="rgba(43, 108, 176, 0.08)"
          stroke="#2b6cb0"
          strokeDasharray="4 3"
          strokeWidth={1}
        />
      )}
    </svg>
  );
});
