import type { LineObject } from "../types";
import { pathFromPoints } from "../lib/geometry";
import { arrowMarkerPath, curlyPath, doublePath, pointAtFraction, wigglyPath } from "../lib/svgBuilders";

export function LineRenderer({
  line,
  selected,
  onPointerDown,
  onAnchorPointerDown,
}: {
  line: LineObject;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
  onAnchorPointerDown?: (index: number, e: React.PointerEvent) => void;
}) {
  const stroke = line.color;
  const sw = line.strokeWidth;

  let body: React.ReactNode = null;
  if (line.style === "wiggly") {
    body = (
      <path
        d={wigglyPath(line.points, line.wavelength, line.amplitude)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  } else if (line.style === "curly") {
    body = (
      <path
        d={curlyPath(line.points, line.wavelength, line.amplitude)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  } else if (line.style === "double") {
    const { a, b } = doublePath(line.points, 2.5);
    body = (
      <g>
        <path d={a} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
        <path d={b} fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  } else if (line.style === "dashed") {
    body = (
      <path
        d={pathFromPoints(line.points, true)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="8 5"
      />
    );
  } else if (line.style === "ghost") {
    body = (
      <path
        d={pathFromPoints(line.points, true)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 5"
      />
    );
  } else {
    body = (
      <path
        d={pathFromPoints(line.points, true)}
        fill="none"
        stroke={stroke}
        strokeWidth={sw}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    );
  }

  const arrows: React.ReactNode[] = [];
  const makeArrow = (t: number, key: string) => {
    const at = pointAtFraction(line.points, t);
    if (!at) return null;
    return <path key={key} d={arrowMarkerPath(at.p, at.tan, Math.max(10, sw * 4))} fill={stroke} stroke={stroke} />;
  };
  if (line.arrow === "start") arrows.push(makeArrow(0.02, "as"));
  if (line.arrow === "middle") arrows.push(makeArrow(0.5, "am"));
  if (line.arrow === "end") arrows.push(makeArrow(0.98, "ae"));

  // invisible thicker hit target to make selection easy
  const hitPath = pathFromPoints(line.points, true);

  return (
    <g onPointerDown={onPointerDown} style={{ cursor: "move" }}>
      <path d={hitPath} fill="none" stroke="transparent" strokeWidth={Math.max(14, sw * 6)} />
      {body}
      {arrows}
      {selected && (
        <g data-editor-only>
          {line.points.map((p, i) => {
            const isEndpoint = i === 0 || i === line.points.length - 1;
            return (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={isEndpoint ? 5 : 4}
                fill={isEndpoint ? "#2b6cb0" : "#ffffff"}
                stroke="#2b6cb0"
                strokeWidth={1.5}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onAnchorPointerDown?.(i, e);
                }}
                style={{ cursor: "grab" }}
              />
            );
          })}
        </g>
      )}
    </g>
  );
}
