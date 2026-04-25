import type { Point } from "../types";
import { pathFromPoints, sampleByArcLength, totalLength } from "./geometry";

// Build a sine-wave "photon" path that follows an arbitrary polyline.
// amplitude and wavelength control shape. The wave is drawn perpendicular to the local tangent.
// The effective wavelength is rounded so the wave completes whole cycles along the path,
// guaranteeing the curve starts and ends exactly on the polyline endpoints.
export function wigglyPath(points: Point[], wavelength = 18, amplitude = 8): string {
  if (points.length < 2) return "";
  const L = totalLength(points);
  if (L <= 0) return "";
  const cycles = Math.max(1, Math.round(L / wavelength));
  const effWavelength = L / cycles;
  const step = Math.min(2, Math.max(0.75, effWavelength / 16));
  const samples = sampleByArcLength(points, step);
  if (samples.length < 2) return "";
  const twoPi = Math.PI * 2;
  const pts: Point[] = samples.map(({ p, n, s }) => {
    const a = amplitude * Math.sin((s / effWavelength) * twoPi);
    return { x: p.x + n.x * a, y: p.y + n.y * a };
  });
  // Force the first/last sample to land exactly on the path endpoints.
  pts[0] = { ...samples[0].p };
  pts[pts.length - 1] = { ...samples[samples.length - 1].p };
  return pathFromPoints(pts, true);
}

// Build a "gluon" curly path - a series of loops/coils along the path.
// We use a parametric cycloid-like curve: x = s - r*sin(theta), y = r*cos(theta)
// Transformed into tangent/normal frame.
// As with wigglyPath, the wavelength is adjusted so the curve completes whole
// loops along the path and lands exactly on the endpoints.
export function curlyPath(points: Point[], wavelength = 22, amplitude = 10): string {
  if (points.length < 2) return "";
  const L = totalLength(points);
  if (L <= 0) return "";
  const cycles = Math.max(1, Math.round(L / wavelength));
  const effWavelength = L / cycles;
  const step = Math.min(1.2, Math.max(0.4, effWavelength / 30));
  const samples = sampleByArcLength(points, step);
  if (samples.length < 2) return "";
  const twoPi = Math.PI * 2;
  const pts: Point[] = samples.map(({ p, t, n, s }) => {
    const theta = (s / effWavelength) * twoPi;
    const along = -amplitude * 0.55 * Math.sin(theta);
    const across = amplitude * Math.cos(theta) - amplitude;
    return {
      x: p.x + t.x * along + n.x * across,
      y: p.y + t.y * along + n.y * across,
    };
  });
  pts[0] = { ...samples[0].p };
  pts[pts.length - 1] = { ...samples[samples.length - 1].p };
  return pathFromPoints(pts, true);
}

// Double-line path: produce two parallel offset paths.
export function doublePath(points: Point[], offset = 3): { a: string; b: string } {
  if (points.length < 2) return { a: "", b: "" };
  const samples = sampleByArcLength(points, 2);
  const aPts = samples.map(({ p, n }) => ({ x: p.x + n.x * offset, y: p.y + n.y * offset }));
  const bPts = samples.map(({ p, n }) => ({ x: p.x - n.x * offset, y: p.y - n.y * offset }));
  return { a: pathFromPoints(aPts, true), b: pathFromPoints(bPts, true) };
}

// Return point and tangent at arc-length fraction t in [0,1]
export function pointAtFraction(points: Point[], t: number): { p: Point; tan: Point } | null {
  if (points.length < 2) return null;
  const L = totalLength(points);
  const target = Math.min(Math.max(t, 0), 1) * L;
  const samples = sampleByArcLength(points, Math.max(1, L / 200));
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.s - target) < Math.abs(best.s - target)) best = s;
  return { p: best.p, tan: best.t };
}

// Arrowhead triangle SVG path centered at p, pointing in tangent direction tan.
export function arrowMarkerPath(p: Point, tan: Point, size = 10): string {
  const nx = -tan.y;
  const ny = tan.x;
  const tip = { x: p.x + tan.x * size * 0.5, y: p.y + tan.y * size * 0.5 };
  const back = { x: p.x - tan.x * size * 0.5, y: p.y - tan.y * size * 0.5 };
  const l = { x: back.x + nx * size * 0.35, y: back.y + ny * size * 0.35 };
  const r = { x: back.x - nx * size * 0.35, y: back.y - ny * size * 0.35 };
  return `M ${tip.x} ${tip.y} L ${l.x} ${l.y} L ${r.x} ${r.y} Z`;
}
