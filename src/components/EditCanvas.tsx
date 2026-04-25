import { forwardRef, useRef, useState } from "react";
import { useStore } from "../store";
import type { DiagramObject, Point } from "../types";
import { LineRenderer } from "./LineRenderer";
import { ShapeRenderer } from "./ShapeRenderer";
import { VertexRenderer } from "./VertexRenderer";
import { LatexLabel } from "./LatexLabel";

type Drag =
  | { kind: "object"; id: string; start: Point; original: DiagramObject }
  | { kind: "anchor"; id: string; index: number }
  | { kind: "shape-resize"; id: string; handle: "nw" | "ne" | "sw" | "se"; origW: number; origH: number }
  | { kind: "new-line"; points: Point[] }
  | null;

export const EditCanvas = forwardRef<SVGSVGElement, { width: number; height: number }>(function EditCanvas(
  { width, height },
  ref
) {
  const objects = useStore((s) => s.objects);
  const selectedId = useStore((s) => s.selectedId);
  const select = useStore((s) => s.select);
  const updateObject = useStore((s) => s.updateObject);
  const tool = useStore((s) => s.tool);
  const addLine = useStore((s) => s.addLine);
  const addVertex = useStore((s) => s.addVertex);
  const addShape = useStore((s) => s.addShape);
  const pendingShape = useStore((s) => s.pendingShape);
  const setTool = useStore((s) => s.setTool);
  const setPendingShape = useStore((s) => s.setPendingShape);

  const [drag, setDrag] = useState<Drag>(null);
  const tempPath = useRef<SVGPathElement>(null);

  const toLocal = (e: React.PointerEvent, svg: SVGSVGElement): Point => {
    const rect = svg.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const rootSvg = (): SVGSVGElement | null =>
    typeof ref === "object" && ref ? (ref as React.RefObject<SVGSVGElement>).current : null;

  const startObjectDrag = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    const obj = objects.find((o) => o.id === id);
    if (!obj) return;
    select(id);
    const svg = rootSvg();
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
    setDrag({ kind: "object", id, start: toLocal(e, svg), original: obj });
  };

  const startAnchorDrag = (id: string, index: number, e: React.PointerEvent) => {
    e.stopPropagation();
    const svg = rootSvg();
    if (!svg) return;
    svg.setPointerCapture(e.pointerId);
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
    setDrag({ kind: "shape-resize", id, handle, origW: obj.width, origH: obj.height });
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const p = toLocal(e, svg);
    if (tool === "vertex") {
      addVertex(p.x, p.y);
      setTool("select");
      return;
    }
    if (tool === "shape" && pendingShape) {
      addShape(pendingShape, p.x, p.y);
      setTool("select");
      setPendingShape(null);
      return;
    }
    if (tool === "line") {
      svg.setPointerCapture(e.pointerId);
      setDrag({ kind: "new-line", points: [p] });
      return;
    }
    // click on empty area -> clear selection
    select(null);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const svg = e.currentTarget;
    const p = toLocal(e, svg);

    if (drag.kind === "object") {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      const obj = drag.original;
      if (obj.kind === "line") {
        updateObject(obj.id, { points: obj.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy })) });
      } else if (obj.kind === "shape" || obj.kind === "vertex" || obj.kind === "label") {
        updateObject(obj.id, { x: obj.x + dx, y: obj.y + dy });
      }
    } else if (drag.kind === "anchor") {
      const obj = objects.find((o) => o.id === drag.id);
      if (!obj || obj.kind !== "line") return;
      const pts = obj.points.slice();
      pts[drag.index] = p;
      updateObject(obj.id, { points: pts });
    } else if (drag.kind === "shape-resize") {
      const obj = objects.find((o) => o.id === drag.id);
      if (!obj || obj.kind !== "shape") return;
      const dx = p.x - obj.x;
      const dy = p.y - obj.y;
      const w = Math.max(10, Math.abs(dx) * 2);
      const h = Math.max(10, Math.abs(dy) * 2);
      updateObject(drag.id, { width: w, height: h });
    } else if (drag.kind === "new-line") {
      const last = drag.points[drag.points.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 2) {
        const next = [...drag.points, p];
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
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.kind === "new-line" && drag.points.length >= 2) {
      addLine(drag.points, "solid");
      setTool("select");
      if (tempPath.current) tempPath.current.setAttribute("d", "");
    }
    setDrag(null);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!selectedId) return;
    const selected = objects.find((o) => o.id === selectedId);
    if (!selected || selected.kind !== "line") return;
    // add anchor at click position, inserted at nearest segment
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
        <pattern id="edit-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f1f1f1" strokeWidth="1" />
        </pattern>
      </defs>
      <rect data-editor-only width={width} height={height} fill="url(#edit-grid)" />

      {objects.map((obj) => {
        const selected = selectedId === obj.id;
        const onDown = (e: React.PointerEvent) => startObjectDrag(obj.id, e);
        if (obj.kind === "line")
          return (
            <LineRenderer
              key={obj.id}
              line={obj}
              selected={selected}
              onPointerDown={onDown}
              onAnchorPointerDown={(i, e) => startAnchorDrag(obj.id, i, e)}
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
    </svg>
  );
});
