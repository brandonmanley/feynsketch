import type { Point } from "../types";
import { pathFromPoints, sampleSmoothCurve, smoothCurvePointAtFraction } from "./geometry";

/**
 * Build a sine-wave (photon) path that follows the smooth curve through the
 * given control points. The wavelength is rounded so the wave completes whole
 * cycles along the curve, guaranteeing the curve starts and ends exactly at
 * the endpoints.
 */
export function wigglyPath(points: Point[], wavelength = 11, amplitude = 5): string {
  if (points.length < 2) return "";
  const samples = sampleSmoothCurve(points, Math.min(2, Math.max(0.6, wavelength / 16)));
  if (samples.length < 2) return "";
  const L = samples[samples.length - 1].s;
  if (L <= 0) return "";
  const cycles = Math.max(1, Math.round(L / wavelength));
  const effWavelength = L / cycles;
  const twoPi = Math.PI * 2;
  const pts: Point[] = samples.map(({ p, n, s }) => {
    const a = amplitude * Math.sin((s / effWavelength) * twoPi);
    return { x: p.x + n.x * a, y: p.y + n.y * a };
  });
  pts[0] = { ...samples[0].p };
  pts[pts.length - 1] = { ...samples[samples.length - 1].p };
  return pathFromPoints(pts, true);
}

/**
 * Build a "gluon" curly path: a series of clearly visible, evenly-spaced
 * circular loops along the smooth curve.
 *
 * The loop is parametrised so that each cycle traces a near-circle on one
 * side of the path, similar to publication-quality QCD diagrams (e.g.
 * TikZ-Feynman). The wavelength is auto-tuned so the loops complete whole
 * cycles, so the curve starts and ends exactly at the path endpoints.
 */
export function curlyPath(points: Point[], wavelength = 11, amplitude = 6): string {
  if (points.length < 2) return "";
  const samples = sampleSmoothCurve(points, Math.min(0.9, Math.max(0.35, wavelength / 24)));
  if (samples.length < 2) return "";
  const L = samples[samples.length - 1].s;
  if (L <= 0) return "";
  const cycles = Math.max(1, Math.round(L / wavelength));
  const effWavelength = L / cycles;
  const twoPi = Math.PI * 2;

  // Tighter loops: a near-circular cycloid that progresses slowly along the
  // path (so loops are clearly visible) but doesn't bunch up.
  // along: -amplitude * sin(theta)   (oscillates ±amplitude in the path direction)
  // across: amplitude * (1 - cos(theta)) (rises smoothly to 2*amplitude perpendicular)
  // Together these trace a circle of radius `amplitude` on one side of the path.
  const pts: Point[] = samples.map(({ p, t, n, s }) => {
    const theta = (s / effWavelength) * twoPi;
    const along = -amplitude * Math.sin(theta);
    const across = amplitude * (1 - Math.cos(theta));
    return {
      x: p.x + t.x * along + n.x * across,
      y: p.y + t.y * along + n.y * across,
    };
  });
  pts[0] = { ...samples[0].p };
  pts[pts.length - 1] = { ...samples[samples.length - 1].p };
  return pathFromPoints(pts, true);
}

/** Two parallel lines offset by `offset/2` to either side of the smooth curve. */
export function doublePath(points: Point[], offset = 5): { a: string; b: string } {
  if (points.length < 2) return { a: "", b: "" };
  const samples = sampleSmoothCurve(points, 1.5);
  if (samples.length < 2) return { a: "", b: "" };
  const half = offset / 2;
  const aPts = samples.map(({ p, n }) => ({ x: p.x + n.x * half, y: p.y + n.y * half }));
  const bPts = samples.map(({ p, n }) => ({ x: p.x - n.x * half, y: p.y - n.y * half }));
  return { a: pathFromPoints(aPts, true), b: pathFromPoints(bPts, true) };
}

/** Arrowhead triangle SVG path centered at p, pointing in tangent direction tan. */
export function arrowMarkerPath(p: Point, tan: Point, size = 10): string {
  const nx = -tan.y;
  const ny = tan.x;
  const tip = { x: p.x + tan.x * size * 0.5, y: p.y + tan.y * size * 0.5 };
  const back = { x: p.x - tan.x * size * 0.5, y: p.y - tan.y * size * 0.5 };
  const l = { x: back.x + nx * size * 0.35, y: back.y + ny * size * 0.35 };
  const r = { x: back.x - nx * size * 0.35, y: back.y - ny * size * 0.35 };
  return `M ${tip.x} ${tip.y} L ${l.x} ${l.y} L ${r.x} ${r.y} Z`;
}

/** Find a point and tangent on the smooth curve at arc-length fraction t. */
export function pointAtFraction(points: Point[], t: number): { p: Point; tan: Point } | null {
  return smoothCurvePointAtFraction(points, t);
}
