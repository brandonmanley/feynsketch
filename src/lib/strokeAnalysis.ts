import type { LineStyle, Point, ShapeKind, Stroke } from "../types";
import { arcLengths, bbox, dist, sampleByArcLength, simplifyRDP, totalLength } from "./geometry";

export interface ClassifiedLine {
  kind: "line";
  style: LineStyle;
  controlPoints: Point[];
  amplitude: number;
  wavelength: number;
}

export interface ClassifiedShape {
  kind: "shape";
  shape: ShapeKind;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export type ClassifiedStroke = ClassifiedLine | ClassifiedShape;

/**
 * Classify a hand-drawn stroke as either a shape (closed polyline that
 * resembles a known shape) or a line (open polyline that's straight, curved,
 * wiggly, or curly).
 */
export function classifyStroke(stroke: Stroke): ClassifiedStroke {
  const pts = stroke.points;
  if (pts.length < 3) {
    return {
      kind: "line",
      style: "solid",
      controlPoints: pts.length === 2 ? pts.slice() : [pts[0] ?? { x: 0, y: 0 }, pts[0] ?? { x: 0, y: 0 }],
      amplitude: 8,
      wavelength: 18,
    };
  }

  const L = totalLength(pts);
  if (L < 4) {
    return {
      kind: "line",
      style: "solid",
      controlPoints: [pts[0], pts[pts.length - 1]],
      amplitude: 8,
      wavelength: 18,
    };
  }

  // Detect closed shape: endpoints close together relative to the bounding box diagonal,
  // and the bounding box is non-degenerate.
  const box = bbox(pts);
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const endGap = dist(pts[0], pts[pts.length - 1]);
  const isClosed = diag > 30 && endGap < Math.min(diag * 0.25, 50) && L > diag * 1.4;

  if (isClosed) {
    const shape = classifyShape(pts);
    if (shape) return shape;
    // If closed but unknown shape, fall through to line treatment.
  }

  // Smoothing for guide reconstruction
  const guide = smoothByArcLength(pts, Math.max(6, L * 0.15));
  const guideLen = totalLength(guide);
  const lengthRatio = L / Math.max(1e-6, guideLen);

  // Residual (perpendicular oscillation) statistics
  const { zeroCrossings, meanAbs, peakPeriod } = residualStats(pts, guide);
  const amplitude = meanAbs * 1.4;

  const isCurly = lengthRatio > 1.8 && zeroCrossings >= 4;
  const isWiggly = !isCurly && zeroCrossings >= 4 && meanAbs > 2 && lengthRatio > 1.1;

  let style: LineStyle = "solid";
  if (isCurly) style = "curly";
  else if (isWiggly) style = "wiggly";

  let control: Point[];
  if (style === "solid") {
    // Straightness check: max perpendicular deviation from chord (start->end) and total turn.
    const a = guide[0];
    const b = guide[guide.length - 1];
    const chord = dist(a, b);
    const dev = chord > 0 ? maxPerpDeviation(guide, a, b) : 0;
    const totalTurn = totalCurvature(guide);

    // "Mostly straight": small deviation relative to length AND minimal cumulative bend.
    const ratio = chord > 0 ? dev / chord : 0;
    const mostlyStraight = ratio < 0.045 && totalTurn < 0.45;

    if (mostlyStraight) {
      control = [a, b];
    } else {
      // Curved solid line: keep a few key control points.
      control = simplifyRDP(guide, 2.2);
      if (control.length < 2) control = [a, b];
    }
  } else {
    // Wiggly / curly: keep a coarse backbone the wave/coil follows.
    control = simplifyRDP(guide, 3.5);
    if (control.length < 2) control = [guide[0], guide[guide.length - 1]];
  }

  // Snap endpoints to original stroke start/end so connections stay accurate
  control = control.slice();
  control[0] = pts[0];
  control[control.length - 1] = pts[pts.length - 1];

  return {
    kind: "line",
    style,
    controlPoints: control,
    amplitude: clamp(amplitude || 8, 4, 22),
    wavelength:
      style === "curly"
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
): { zeroCrossings: number; meanAbs: number; peakPeriod: number } {
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
    if (bestD === Infinity) residuals.push(0);
    else residuals.push(bestSigned);
  }
  let zeroCrossings = 0;
  let lastSign = 0;
  let sumAbs = 0;
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
    peakPeriod = median * 2 * 2;
  }
  return { zeroCrossings, meanAbs, peakPeriod };
}

function maxPerpDeviation(points: Point[], a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let max = 0;
  for (const p of points) {
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const d = Math.hypot(p.x - px, p.y - py);
    if (d > max) max = d;
  }
  return max;
}

function totalCurvature(points: Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    const v1x = b.x - a.x,
      v1y = b.y - a.y;
    const v2x = c.x - b.x,
      v2y = c.y - b.y;
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    total += Math.abs(Math.atan2(cross, dot));
  }
  return total;
}

/**
 * Try to identify a closed stroke as a triangle / square / rect / circle / ellipse / diamond.
 */
function classifyShape(pts: Point[]): ClassifiedShape | null {
  const box = bbox(pts);
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w < 8 || h < 8) return null;
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;

  // Resample stroke to uniform spacing for corner detection.
  const samples = sampleByArcLength(pts, Math.max(2, totalLength(pts) / 80)).map((s) => s.p);
  if (samples.length < 8) return null;

  const corners = detectCorners(samples);

  // Decide shape based on corner count and bbox aspect ratio.
  const aspect = w / h;
  const aspectIsh = aspect > 0.78 && aspect < 1.22;

  if (corners.length === 3) {
    return { kind: "shape", shape: "triangle", cx, cy, width: w, height: h };
  }
  if (corners.length === 4) {
    // Distinguish diamond (corners on midpoints) vs square/rect (corners at bbox corners).
    const isDiamond = looksLikeDiamond(corners, box);
    if (isDiamond) {
      return { kind: "shape", shape: "diamond", cx, cy, width: w, height: h };
    }
    if (aspectIsh) return { kind: "shape", shape: "square", cx, cy, width: w, height: w };
    return { kind: "shape", shape: "rect", cx, cy, width: w, height: h };
  }
  // 0, 1, 2, or 5+ corners — treat as smooth curve. Decide circle vs ellipse.
  if (corners.length <= 2 || corners.length >= 5) {
    if (looksLikeEllipse(samples, cx, cy, w, h)) {
      if (aspectIsh) return { kind: "shape", shape: "circle", cx, cy, width: w, height: w };
      return { kind: "shape", shape: "ellipse", cx, cy, width: w, height: h };
    }
  }
  return null;
}

function detectCorners(samples: Point[]): number[] {
  // Compute turning angle at each interior point using a fixed-window neighbor.
  const window = Math.max(2, Math.round(samples.length / 14));
  const angles: number[] = new Array(samples.length).fill(0);
  for (let i = window; i < samples.length - window; i++) {
    const a = samples[i - window];
    const b = samples[i];
    const c = samples[i + window];
    const v1x = b.x - a.x,
      v1y = b.y - a.y;
    const v2x = c.x - b.x,
      v2y = c.y - b.y;
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    angles[i] = Math.abs(Math.atan2(cross, dot));
  }
  const threshold = 0.9; // ~52 degrees; sharper than typical hand-drawn arc curvature
  const peaks: number[] = [];
  const minSeparation = Math.max(2, Math.round(samples.length / 10));
  for (let i = 1; i < angles.length - 1; i++) {
    if (
      angles[i] > threshold &&
      angles[i] >= angles[i - 1] &&
      angles[i] >= angles[i + 1] &&
      (peaks.length === 0 || i - peaks[peaks.length - 1] > minSeparation)
    ) {
      peaks.push(i);
    }
  }
  return peaks;
}

function looksLikeDiamond(cornerIdxs: number[], box: ReturnType<typeof bbox>): boolean {
  // We don't have direct access to the corner positions here, but we can look at where
  // the bbox corners are: a diamond's stroke passes through the midpoints of bbox edges,
  // not the corners. We approximate by checking if the average of detected corner y's
  // is close to cy and avg x close to cx (diamond corners are on axes through center).
  // Simpler: bbox diagonal heuristic - skip and treat 4-corner closed strokes as rect/square
  // unless the user explicitly drew a 45° rotated square.
  return false; // conservative: prefer square/rect detection for 4-corner shapes
}

function looksLikeEllipse(samples: Point[], cx: number, cy: number, w: number, h: number): boolean {
  if (w < 10 || h < 10) return false;
  const a = w / 2;
  const b = h / 2;
  let maxResid = 0;
  let avgResid = 0;
  for (const p of samples) {
    const dx = (p.x - cx) / a;
    const dy = (p.y - cy) / b;
    const r = Math.sqrt(dx * dx + dy * dy);
    const e = Math.abs(r - 1);
    if (e > maxResid) maxResid = e;
    avgResid += e;
  }
  avgResid /= samples.length;
  // Allow up to ~25% deviation on average, ~50% peak — hand drawing is sloppy.
  return avgResid < 0.25 && maxResid < 0.6;
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
