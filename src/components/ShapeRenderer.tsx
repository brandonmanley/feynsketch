import type { ShapeObject } from "../types";

export function ShapeRenderer({
  shape,
  selected,
  onPointerDown,
  onHandlePointerDown,
}: {
  shape: ShapeObject;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onHandlePointerDown?: (handle: "nw" | "ne" | "sw" | "se", e: React.PointerEvent) => void;
}) {
  const { x, y, width: w, height: h, rotation } = shape;
  const t = `translate(${x},${y}) rotate(${rotation})`;

  const body = () => {
    const common = {
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
    };
    switch (shape.shape) {
      case "circle":
        return <ellipse cx={0} cy={0} rx={w / 2} ry={w / 2} {...common} />;
      case "ellipse":
        return <ellipse cx={0} cy={0} rx={w / 2} ry={h / 2} {...common} />;
      case "square":
        return <rect x={-w / 2} y={-w / 2} width={w} height={w} {...common} />;
      case "rect":
        return <rect x={-w / 2} y={-h / 2} width={w} height={h} {...common} />;
      case "triangle":
        return (
          <polygon
            points={`0,${-h / 2} ${w / 2},${h / 2} ${-w / 2},${h / 2}`}
            {...common}
          />
        );
      case "diamond":
        return (
          <polygon
            points={`0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`}
            {...common}
          />
        );
    }
  };

  return (
    <g transform={t} onPointerDown={onPointerDown} style={{ cursor: "move" }}>
      {body()}
      {selected && (
        <g data-editor-only>
          <rect
            x={-w / 2 - 4}
            y={-h / 2 - 4}
            width={w + 8}
            height={h + 8}
            fill="none"
            stroke="#2b6cb0"
            strokeDasharray="4 3"
            strokeWidth={1}
          />
          {(
            [
              ["nw", -w / 2 - 4, -h / 2 - 4],
              ["ne", w / 2 + 4, -h / 2 - 4],
              ["sw", -w / 2 - 4, h / 2 + 4],
              ["se", w / 2 + 4, h / 2 + 4],
            ] as const
          ).map(([k, hx, hy]) => (
            <rect
              key={k}
              x={hx - 4}
              y={hy - 4}
              width={8}
              height={8}
              fill="#ffffff"
              stroke="#2b6cb0"
              strokeWidth={1.2}
              onPointerDown={(e) => {
                e.stopPropagation();
                onHandlePointerDown?.(k, e);
              }}
              style={{ cursor: "nwse-resize" }}
            />
          ))}
        </g>
      )}
    </g>
  );
}
