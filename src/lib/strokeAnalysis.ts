import type { LineStyle, Point, Stroke } from "../types";
import { arcLengths, dist, sampleByArcLength, simplifyRDP, totalLength } from "./geometry";

export interface Classified {
  style: LineStyle;
  // A clean "guide" path (list of control anchors) representing the underlying line
  controlPoints: Point[];
  amplitude: number;
  wavelength: number;
}

/**
 * Classify a hand-drawn stroke as one of: solid straight, solid curved, wiggly, curly.
 *
 * Heuristic:
 *  1. Fit a smoothed guide line by low-pass averaging the stroke points by arc length.
 *  2. Compute the residual signal between the raw stroke and the guide (signed perpendicular distance).
 *  3. Count zero-crossings and look at the ratio of stroke length to guide length:
 *     - Very low residual amplitude + length ratio ~1 -> straight / smooth curve
 *     - High residual amplitude with many zero-crossings -> wiggly (photon)
 *     - Very high length ratio (>> 2) with loops -> curly (gluon)
 */
export function classifyStroke(stroke: Stroke): Classified {
  const pts = stroke.points;
  if (pts.length < 3) {
    return {
      style: "solid",
      controlPoints: pts.length === 2 ? pts.slice() : [pts[0] ?? { x: 0, y: 0 }, pts[0] ?? { x: 0, y: 0 }],
      amplitude: 8,
      wavelength: 18,
    };
  }

  const L = totalLength(pts);
  if (L < 4) {
    return { style: "solid", controlPoints: [pts[0], pts[pts.length - 1]], amplitude: 8, wavelength: 18 };
  }

  // Guide line: strong smoothing (moving average over ~20% of arc length, minimum 4 samples)
  const guide = smoothByArcLength(pts, Math.max(6, L * 0.15));
  const guideLen = totalLength(guide);
  const lengthRatio = L / Math.max(1e-6, guideLen);

  // Compute residuals: signed perpendicular offset of each stroke sample to the guide
  const { residuals, zeroCrossings, meanAbs, peakPeriod } = residualStats(pts, guide);
  const amplitude = meanAbs * 1.4;

  // Decision thresholds
  const isCurly = lengthRatio > 1.8 && zeroCrossings >= 4;
  const isWiggly = !isCurly && zeroCrossings >= 4 && meanAbs > 2 && lengthRatio > 1.1;
  const isCurved = !isWiggly && !isCurly && guideHasCurvature(guide);

  let style: LineStyle = "solid";
  if (isCurly) style = "curly";
  else if (isWiggly) style = "wiggly";
  else style = "solid";

  // Control points: simplify the guide for straight/curved; for wiggly/curly we keep the guide anchors as well.
  const eps = isCurved ? 1.5 : 3.0;
  let control = simplifyRDP(guide, eps);
  // Ensure at least endpoints
  if (control.length < 2) control = [guide[0], guide[guide.length - 1]];

  // Snap endpoints to original stroke start/end so connections stay accurate
  control[0] = pts[0];
  control[control.length - 1] = pts[pts.length - 1];

  return {
    style,
    controlPoints: control,
    amplitude: clamp(amplitude || 8, 4, 22),
    wavelength: style === "curly"
      ? clamp(peakPeriod || 22, 14, 40)
      : style === "wiggly"
      ? clamp(peakPeriod || 18, 10, 40)
      : 18,
  };
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function smoothByArcLength(points: Point[], windowLen: number): Point[] {
  const arcs = arcLengths(points);
  const L = arcs[arcs.length - 1];
  const step = Math.max(2, L / 60);
  const samples = sampleByArcLength(points, step).map((s) => ({ p: s.p, s: s.s }));
  const out: Point[] = [];
  for (const smp of samples) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const other of samples) {
      if (Math.abs(other.s - smp.s) <= windowLen / 2) {
        sx += other.p.x;
        sy += other.p.y;
        count++;
      }
    }
    if (count > 0) out.push({ x: sx / count, y: sy / count });
  }
  if (out.length === 0) return points.slice();
  return out;
}

function residualStats(
  stroke: Point[],
  guide: Point[]
): { residuals: number[]; zeroCrossings: number; meanAbs: number; peakPeriod: number } {
  // Resample stroke along its arc length, and compute perpendicular offset against the nearest guide segment.
  const strokeSamples = sampleByArcLength(stroke, 2);
  const guideSegs: { a: Point; b: Point; n: { x: number; y: number }; t: { x: number; y: number } }[] = [];
  for (let i = 0; i < guide.length - 1; i++) {
    const a = guide[i];
    const b = guide[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const t = { x: dx / len, y: dy / len };
    const n = { x: -t.y, y: t.x };
    guideSegs.push({ a, b, t, n });
  }
  const residuals: number[] = [];
  for (const s of strokeSamples) {
    let bestD = Infinity;
    let bestSigned = 0;
    for (const g of guideSegs) {
      const ax = s.p.x - g.a.x;
      const ay = s.p.y - g.a.y;
      const tProj = ax * g.t.x + ay * g.t.y;
      const segLen = dist(g.a, g.b);
      if (tProj < 0 || tProj > segLen) continue;
      const signed = ax * g.n.x + ay * g.n.y;
      const d = Math.abs(signed);
      if (d < bestD) {
        bestD = d;
        bestSigned = signed;
      }
    }
    if (bestD === Infinity) {
      residuals.push(0);
    } else {
      residuals.push(bestSigned);
    }
  }
  let zeroCrossings = 0;
  let lastSign = 0;
  let sumAbs = 0;
  // Estimate dominant period via distance between sign changes
  const crossingsAt: number[] = [];
  for (let i = 0; i < residuals.length; i++) {
    sumAbs += Math.abs(residuals[i]);
    const sign = Math.sign(residuals[i]);
    if (sign !== 0 && sign !== lastSign) {
      if (lastSign !== 0) {
        zeroCrossings++;
        crossingsAt.push(i);
      }
      lastSign = sign;
    }
  }
  const meanAbs = residuals.length ? sumAbs / residuals.length : 0;
  let peakPeriod = 0;
  if (crossingsAt.length >= 2) {
    const diffs: number[] = [];
    for (let i = 1; i < crossingsAt.length; i++) diffs.push(crossingsAt[i] - crossingsAt[i - 1]);
    diffs.sort((a, b) => a - b);
    const median = diffs[Math.floor(diffs.length / 2)];
    // Sample step was 2, so period = 2 * (sampleCount per half wave) * 2
    peakPeriod = median * 2 * 2;
  }
  return { residuals, zeroCrossings, meanAbs, peakPeriod };
}

function guideHasCurvature(guide: Point[]): boolean {
  if (guide.length < 3) return false;
  // Angle sum between successive edges
  let totalTurn = 0;
  for (let i = 1; i < guide.length - 1; i++) {
    const a = guide[i - 1];
    const b = guide[i];
    const c = guide[i + 1];
    const v1x = b.x - a.x,
      v1y = b.y - a.y;
    const v2x = c.x - b.x,
      v2y = c.y - b.y;
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    totalTurn += Math.abs(Math.atan2(cross, dot));
  }
  return totalTurn > 0.4; // ~23 degrees total
}

// Endpoint cluster: merge near-by line endpoints into shared vertices
export function mergeEndpointsToVertices(
  lines: { id: string; points: Point[] }[],
  threshold = 14
): { vertices: Point[]; map: Record<string, { start?: number; end?: number }> } {
  const vertices: Point[] = [];
  const map: Record<string, { start?: number; end?: number }> = {};
  const addOrFind = (p: Point): number => {
    for (let i = 0; i < vertices.length; i++) {
      if (dist(vertices[i], p) <= threshold) return i;
    }
    vertices.push({ ...p });
    return vertices.length - 1;
  };
  for (const line of lines) {
    if (line.points.length < 2) continue;
    const s = line.points[0];
    const e = line.points[line.points.length - 1];
    map[line.id] = { start: addOrFind(s), end: addOrFind(e) };
  }
  return { vertices, map };
}
