import type { Point } from "../types";

export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });
export const length = (a: Point) => Math.hypot(a.x, a.y);
export const normalize = (a: Point): Point => {
  const l = length(a);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
};
export const perp = (a: Point): Point => ({ x: -a.y, y: a.x });

// Cumulative arc length samples along a polyline
export function arcLengths(points: Point[]): number[] {
  const out = [0];
  for (let i = 1; i < points.length; i++) {
    out.push(out[i - 1] + dist(points[i - 1], points[i]));
  }
  return out;
}

export function totalLength(points: Point[]): number {
  const a = arcLengths(points);
  return a[a.length - 1] ?? 0;
}

// Sample a polyline at uniformly spaced arc-length positions.
// Returns samples with position, tangent, and normal.
export function sampleByArcLength(
  points: Point[],
  step: number
): { p: Point; t: Point; n: Point; s: number }[] {
  const L = totalLength(points);
  if (L <= 0 || points.length < 2) return [];
  const out: { p: Point; t: Point; n: Point; s: number }[] = [];
  const arcs = arcLengths(points);

  let segIdx = 0;
  for (let s = 0; s <= L + 1e-6; s += step) {
    while (segIdx < arcs.length - 1 && arcs[segIdx + 1] < s) segIdx++;
    const segStart = arcs[segIdx];
    const segEnd = arcs[segIdx + 1] ?? segStart;
    const segLen = Math.max(1e-9, segEnd - segStart);
    const t = Math.min(1, Math.max(0, (s - segStart) / segLen));
    const a = points[segIdx];
    const b = points[segIdx + 1] ?? a;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const dir = normalize({ x: b.x - a.x, y: b.y - a.y });
    const n = perp(dir);
    out.push({ p, t: dir, n, s });
  }
  return out;
}

// Ramer-Douglas-Peucker simplification
export function simplifyRDP(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  const sq = (p: Point, a: Point, b: Point) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    return (p.x - px) ** 2 + (p.y - py) ** 2;
  };
  const eps2 = epsilon * epsilon;
  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    let maxD = -1;
    let maxI = -1;
    for (let k = i + 1; k < j; k++) {
      const d = sq(points[k], points[i], points[j]);
      if (d > maxD) {
        maxD = d;
        maxI = k;
      }
    }
    if (maxD > eps2 && maxI > -1) {
      keep[maxI] = true;
      stack.push([i, maxI], [maxI, j]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// Build an SVG path "d" attribute from a polyline, optionally smoothed with a Catmull-Rom spline.
export function pathFromPoints(points: Point[], smooth = true): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (!smooth || points.length < 3) {
    return (
      `M ${points[0].x} ${points[0].y} ` +
      points
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ")
    );
  }
  // Catmull-Rom to Bezier conversion
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

// Bounding box of a set of points
export function bbox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}
