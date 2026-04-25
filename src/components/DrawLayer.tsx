import { useRef } from "react";
import { useStore, uid } from "../store";
import type { Point, Stroke } from "../types";
import { pathFromPoints } from "../lib/geometry";

export function DrawLayer({ width, height }: { width: number; height: number }) {
  const strokes = useStore((s) => s.strokes);
  const addStroke = useStore((s) => s.addStroke);
  const current = useRef<Point[]>([]);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const tempPath = useRef<SVGPathElement>(null);

  const toLocal = (e: React.PointerEvent): Point => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent) => {
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    current.current = [toLocal(e)];
    if (tempPath.current) tempPath.current.setAttribute("d", pathFromPoints(current.current, false));
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = toLocal(e);
    const last = current.current[current.current.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1.2) {
      current.current.push(p);
      if (tempPath.current) tempPath.current.setAttribute("d", pathFromPoints(current.current, true));
    }
  };
  const onUp = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    drawing.current = false;
    (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    if (current.current.length >= 2) {
      const stroke: Stroke = { id: uid("stk"), points: current.current.slice() };
      addStroke(stroke);
    }
    current.current = [];
    if (tempPath.current) tempPath.current.setAttribute("d", "");
  };

  return (
    <svg
      ref={svgRef}
      className="canvas-surface"
      width={width}
      height={height}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ touchAction: "none", background: "#fdfdfd" }}
    >
      <defs>
        <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#eee" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width={width} height={height} fill="url(#grid)" />
      {strokes.map((s) => (
        <path
          key={s.id}
          d={pathFromPoints(s.points, true)}
          fill="none"
          stroke="#2b6cb0"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.9}
        />
      ))}
      <path
        ref={tempPath}
        fill="none"
        stroke="#2b6cb0"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.9}
      />
    </svg>
  );
}
