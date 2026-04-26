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

/* ----------------------------------------------------------- *
 * Centripetal Catmull-Rom -> cubic Bezier conversion.         *
 * Produces a smooth curve passing through every input point   *
 * with no overshoot or self-loops, even when control points   *
 * are unevenly spaced or nearly collinear.                    *
 * ----------------------------------------------------------- */
export interface Bezier {
  p0: Point;
  c1: Point;
  c2: Point;
  p1: Point;
}

export function catmullRomBeziers(points: Point[], alpha = 0.5): Bezier[] {
  const n = points.length;
  if (n < 2) return [];
  // Build phantom endpoints by reflecting the second/penultimate points to keep
  // the curve well-defined at the boundaries.
  const phantomStart: Point = {
    x: 2 * points[0].x - points[1].x,
    y: 2 * points[0].y - points[1].y,
  };
  const phantomEnd: Point = {
    x: 2 * points[n - 1].x - points[n - 2].x,
    y: 2 * points[n - 1].y - points[n - 2].y,
  };
  const all: Point[] = [phantomStart, ...points, phantomEnd];

  const segs: Bezier[] = [];
  for (let i = 1; i < all.length - 2; i++) {
    const p0 = all[i - 1];
    const p1 = all[i];
    const p2 = all[i + 1];
    const p3 = all[i + 2];

    const d01 = Math.pow(dist(p0, p1), alpha);
    const d12 = Math.pow(dist(p1, p2), alpha);
    const d23 = Math.pow(dist(p2, p3), alpha);

    let c1x = p1.x;
    let c1y = p1.y;
    let c2x = p2.x;
    let c2y = p2.y;

    if (d12 > 1e-9) {
      // Tangent at p1
      if (d01 > 1e-9) {
        const t1x = (p1.x - p0.x) / d01 - (p2.x - p0.x) / (d01 + d12) + (p2.x - p1.x) / d12;
        const t1y = (p1.y - p0.y) / d01 - (p2.y - p0.y) / (d01 + d12) + (p2.y - p1.y) / d12;
        c1x = p1.x + (t1x * d12) / 3;
        c1y = p1.y + (t1y * d12) / 3;
      } else {
        c1x = p1.x + (p2.x - p1.x) / 3;
        c1y = p1.y + (p2.y - p1.y) / 3;
      }
      // Tangent at p2
      if (d23 > 1e-9) {
        const t2x = (p2.x - p1.x) / d12 - (p3.x - p1.x) / (d12 + d23) + (p3.x - p2.x) / d23;
        const t2y = (p2.y - p1.y) / d12 - (p3.y - p1.y) / (d12 + d23) + (p3.y - p2.y) / d23;
        c2x = p2.x - (t2x * d12) / 3;
        c2y = p2.y - (t2y * d12) / 3;
      } else {
        c2x = p2.x - (p2.x - p1.x) / 3;
        c2y = p2.y - (p2.y - p1.y) / 3;
      }
    }
    segs.push({ p0: p1, c1: { x: c1x, y: c1y }, c2: { x: c2x, y: c2y }, p1: p2 });
  }
  return segs;
}

export function bezierAt(b: Bezier, t: number): { p: Point; tan: Point } {
  const u = 1 - t;
  const x =
    u * u * u * b.p0.x +
    3 * u * u * t * b.c1.x +
    3 * u * t * t * b.c2.x +
    t * t * t * b.p1.x;
  const y =
    u * u * u * b.p0.y +
    3 * u * u * t * b.c1.y +
    3 * u * t * t * b.c2.y +
    t * t * t * b.p1.y;
  // Derivative
  const dx =
    3 * u * u * (b.c1.x - b.p0.x) +
    6 * u * t * (b.c2.x - b.c1.x) +
    3 * t * t * (b.p1.x - b.c2.x);
  const dy =
    3 * u * u * (b.c1.y - b.p0.y) +
    6 * u * t * (b.c2.y - b.c1.y) +
    3 * t * t * (b.p1.y - b.c2.y);
  const tan = normalize({ x: dx, y: dy });
  return { p: { x, y }, tan };
}

/** Build an SVG `d` attribute for a smooth curve passing through every point. */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  const segs = catmullRomBeziers(points);
  const d: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (const s of segs) {
    d.push(`C ${s.c1.x} ${s.c1.y}, ${s.c2.x} ${s.c2.y}, ${s.p1.x} ${s.p1.y}`);
  }
  return d.join(" ");
}

/** Path-from-points: smooth (centripetal Catmull-Rom) by default, otherwise a polyline. */
export function pathFromPoints(points: Point[], smooth = true): string {
  if (!smooth || points.length < 3) {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    return (
      `M ${points[0].x} ${points[0].y} ` +
      points
        .slice(1)
        .map((p) => `L ${p.x} ${p.y}`)
        .join(" ")
    );
  }
  return smoothPath(points);
}

/** Sample a polyline at uniform arc length along its straight segments. */
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

/** Sample a smooth (centripetal Catmull-Rom) curve at approximately uniform arc length. */
export function sampleSmoothCurve(
  points: Point[],
  step: number
): { p: Point; t: Point; n: Point; s: number }[] {
  if (points.length < 2) return [];
  if (points.length === 2) return sampleByArcLength(points, step);

  const segs = catmullRomBeziers(points);
  // Pre-discretize each segment finely to estimate arc length.
  const subSteps = 24;
  type Sub = { s: number; p: Point; tan: Point };
  const subs: Sub[] = [];
  let acc = 0;
  let prev: Point | null = null;
  for (let i = 0; i < segs.length; i++) {
    for (let k = 0; k <= subSteps; k++) {
      // Skip first sample of subsequent segs (it equals prev's last)
      if (i > 0 && k === 0) continue;
      const t = k / subSteps;
      const { p, tan } = bezierAt(segs[i], t);
      if (prev) acc += dist(prev, p);
      subs.push({ s: acc, p, tan });
      prev = p;
    }
  }

  const out: { p: Point; t: Point; n: Point; s: number }[] = [];
  const totalS = subs[subs.length - 1].s;
  let cursor = 0;
  for (let s = 0; s <= totalS + 1e-6; s += step) {
    while (cursor < subs.length - 1 && subs[cursor + 1].s < s) cursor++;
    const a = subs[cursor];
    const b = subs[Math.min(cursor + 1, subs.length - 1)];
    const span = Math.max(1e-9, b.s - a.s);
    const u = Math.min(1, Math.max(0, (s - a.s) / span));
    const p = { x: a.p.x + (b.p.x - a.p.x) * u, y: a.p.y + (b.p.y - a.p.y) * u };
    const tan = normalize({
      x: a.tan.x + (b.tan.x - a.tan.x) * u,
      y: a.tan.y + (b.tan.y - a.tan.y) * u,
    });
    out.push({ p, t: tan, n: perp(tan), s });
  }
  return out;
}

/** Find the (point, tangent) on the smooth curve at arc-length fraction t in [0, 1]. */
export function smoothCurvePointAtFraction(
  points: Point[],
  t: number
): { p: Point; tan: Point } | null {
  if (points.length < 2) return null;
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    return {
      p: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
      tan: normalize({ x: b.x - a.x, y: b.y - a.y }),
    };
  }
  const samples = sampleSmoothCurve(points, 1.5);
  if (samples.length === 0) return null;
  const target = t * samples[samples.length - 1].s;
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.s - target) < Math.abs(best.s - target)) best = s;
  return { p: best.p, tan: best.t };
}

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
