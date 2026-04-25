import type { VertexObject } from "../types";

export function VertexRenderer({
  vertex,
  selected,
  onPointerDown,
}: {
  vertex: VertexObject;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const { x, y, shape, fill, color, size } = vertex;
  const filled = fill === "filled";
  const none = fill === "none";
  const bodyStyle = {
    fill: none ? "transparent" : filled ? color : "#ffffff",
    stroke: color,
    strokeWidth: 2,
  };
  return (
    <g onPointerDown={onPointerDown} style={{ cursor: "move" }}>
      {shape === "circle" ? (
        <circle cx={x} cy={y} r={size} {...bodyStyle} />
      ) : (
        <rect x={x - size} y={y - size} width={size * 2} height={size * 2} {...bodyStyle} />
      )}
      {selected && (
        <circle
          data-editor-only
          cx={x}
          cy={y}
          r={size + 5}
          fill="none"
          stroke="#2b6cb0"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
    </g>
  );
}
