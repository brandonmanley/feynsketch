import { useEffect, useMemo, useRef, useState } from "react";
import katex from "katex";
import type { LabelObject } from "../types";

/**
 * Renders a LaTeX label using KaTeX into an SVG foreignObject.
 * Automatically measures its size so consumers can position it correctly.
 */
export function LatexLabel({
  label,
  selected,
  onPointerDown,
}: {
  label: LabelObject;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(label.latex || "\\,", {
        throwOnError: false,
        displayMode: false,
        output: "html",
      });
    } catch {
      return label.latex;
    }
  }, [label.latex]);

  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 80, h: 30 });

  useEffect(() => {
    if (!hostRef.current) return;
    const rect = hostRef.current.getBoundingClientRect();
    setSize({ w: Math.max(20, rect.width + 4), h: Math.max(16, rect.height + 4) });
  }, [html, label.fontSize, label.fontFamily]);

  return (
    <g
      transform={`translate(${label.x},${label.y})`}
      onPointerDown={onPointerDown}
      style={{ cursor: "move" }}
    >
      {selected && (
        <rect
          data-editor-only
          x={-4}
          y={-4}
          width={size.w + 8}
          height={size.h + 8}
          fill="none"
          stroke="#2b6cb0"
          strokeDasharray="4 3"
          strokeWidth={1}
        />
      )}
      <foreignObject x={0} y={0} width={size.w + 20} height={size.h + 20}>
        <div
          ref={hostRef}
          {...({ xmlns: "http://www.w3.org/1999/xhtml" } as any)}
          style={{
            display: "inline-block",
            color: label.color,
            fontSize: `${label.fontSize}px`,
            fontFamily: label.fontFamily,
            lineHeight: 1.1,
            whiteSpace: "nowrap",
          }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </foreignObject>
    </g>
  );
}
