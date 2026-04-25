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
  rotation: number; // degrees
}

export type ClassifiedStroke = ClassifiedLine | ClassifiedShape;

/* ------------------------------------------------------------------ *
 * Classify a single stroke as either a closed shape or an open line. *
 * ------------------------------------------------------------------ */
export function classifyStroke(stroke: Stroke): ClassifiedStroke {
  const pts = stroke.points;
  if (pts.length < 3) {
    return makeFallbackLine(pts);
  }

  const L = totalLength(pts);
  if (L < 4) return makeFallbackLine(pts);

  const box = bbox(pts);
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY);
  const endGap = dist(pts[0], pts[pts.length - 1]);
  // Closed if endpoints meet AND the path traces out enough perimeter relative to
  // its bounding box (a true shape's perimeter >> bbox diagonal).
  const isClosed = diag > 24 && endGap < Math.min(diag * 0.3, 60) && L > diag * 1.6;

  if (isClosed) {
    const shape = classifyShape(pts, box);
    if (shape) return shape;
  }

  return classifyAsLine(pts, L);
}

function makeFallbackLine(pts: Point[]): ClassifiedLine {
  const a = pts[0] ?? { x: 0, y: 0 };
  const b = pts[pts.length - 1] ?? a;
  return {
    kind: "line",
    style: "solid",
    controlPoints: [a, b],
    amplitude: 8,
    wavelength: 18,
  };
}

/* ----------------------------- *
 * Open stroke -> line classifier *
 * ----------------------------- */
function classifyAsLine(pts: Point[], L: number): ClassifiedLine {
  const guide = smoothByArcLength(pts, Math.max(6, L * 0.15));
  const guideLen = totalLength(guide);
  const lengthRatio = L / Math.max(1e-6, guideLen);

  const { zeroCrossings, meanAbs, peakPeriod } = residualStats(pts, guide);
  const amplitude = meanAbs * 1.4;

  const isCurly = lengthRatio > 1.8 && zeroCrossings >= 4;
  const isWiggly = !isCurly && zeroCrossings >= 4 && meanAbs > 2 && lengthRatio > 1.1;

  let style: LineStyle = "solid";
  if (isCurly) style = "curly";
  else if (isWiggly) style = "wiggly";

  let control: Point[];
  if (style === "solid") {
    const a = guide[0];
    const b = guide[guide.length - 1];
    const chord = dist(a, b);
    const dev = chord > 0 ? maxPerpDeviation(guide, a, b) : 0;
    const totalTurn = totalCurvature(guide);
    const ratio = chord > 0 ? dev / chord : 0;
    const mostlyStraight = ratio < 0.045 && totalTurn < 0.45;

    if (mostlyStraight) {
      control = [a, b];
    } else {
      control = simplifyRDP(guide, 2.2);
      if (control.length < 2) control = [a, b];
    }
  } else {
    control = simplifyRDP(guide, 3.5);
    if (control.length < 2) control = [guide[0], guide[guide.length - 1]];
  }

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

/* ------------------------------ *
 * Closed stroke -> shape classifier *
 * ------------------------------ */

/**
 * Try to identify a closed stroke as one of the supported shapes.
 *
 * Strategy:
 *  1. Resample the stroke uniformly along its arc length.
 *  2. RDP-simplify with progressively coarser epsilons; the first epsilon
 *     that yields a stable polygon (3..6 vertices) with a small fit error
 *     wins.
 *  3. Compare the polygon fit error to an ellipse fit error and pick the
 *     better explanation.
 */
function classifyShape(pts: Point[], box: ReturnType<typeof bbox>): ClassifiedShape | null {
  const w = box.maxX - box.minX;
  const h = box.maxY - box.minY;
  if (w < 8 || h < 8) return null;

  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const diag = Math.hypot(w, h);

  // Close the polyline and sample uniformly for analysis.
  const closed = pts.slice();
  if (dist(pts[0], pts[pts.length - 1]) > 2) closed.push(pts[0]);
  const L = totalLength(closed);
  if (L < 16) return null;
  const step = Math.max(1.5, L / 96);
  const samples = sampleByArcLength(closed, step).map((s) => s.p);
  if (samples.length < 8) return null;

  // Try polygon fits at progressively coarser epsilons. We're looking for the
  // simplest shape (smallest vertex count) whose polygonal residual is small.
  const epsilons = [0.04, 0.06, 0.08, 0.1, 0.13, 0.17].map((r) => r * diag);
  type PolyFit = { vertices: Point[]; residual: number };
  let bestPoly: PolyFit | null = null;
  for (const eps of epsilons) {
    const simplified = simplifyRDP(samples, eps);
    // simplifyRDP returns a polyline; for a closed shape the first and last samples
    // are the same point, so unique vertices = simplified.length - 1.
    const v = simplified.slice(0, -1);
    if (v.length < 3 || v.length > 6) continue;
    const residual = polyResidual(samples, simplified);
    if (residual / diag < 0.08) {
      bestPoly = { vertices: v, residual: residual / diag };
      break;
    }
    if (!bestPoly || residual / diag < bestPoly.residual) {
      bestPoly = { vertices: v, residual: residual / diag };
    }
  }

  // Ellipse fit (axis-aligned bbox).
  const ellipseError = ellipseFitError(samples, cx, cy, w, h);

  // Decision: prefer the polygon if it explains the shape well, else fall back to ellipse.
  if (bestPoly && bestPoly.residual < 0.07 && bestPoly.vertices.length <= 5) {
    return polygonToShape(bestPoly.vertices, cx, cy, w, h);
  }
  if (ellipseError < 0.18) {
    const aspect = w / h;
    if (aspect > 0.85 && aspect < 1.15) {
      const r = Math.max(w, h);
      return { kind: "shape", shape: "circle", cx, cy, width: r, height: r, rotation: 0 };
    }
    return { kind: "shape", shape: "ellipse", cx, cy, width: w, height: h, rotation: 0 };
  }
  // Last resort: best polygon, even if residual was a bit high.
  if (bestPoly && bestPoly.vertices.length <= 6) {
    return polygonToShape(bestPoly.vertices, cx, cy, w, h);
  }
  return null;
}

function polyResidual(samples: Point[], polyline: Point[]): number {
  if (polyline.length < 2) return Infinity;
  let total = 0;
  for (const p of samples) {
    let best = Infinity;
    for (let i = 0; i < polyline.length - 1; i++) {
      const a = polyline[i];
      const b = polyline[i + 1];
      const d = pointSegDistance(p, a, b);
      if (d < best) best = d;
    }
    total += best;
  }
  return total / samples.length;
}

function pointSegDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

function ellipseFitError(samples: Point[], cx: number, cy: number, w: number, h: number): number {
  if (w < 6 || h < 6) return Infinity;
  const a = w / 2;
  const b = h / 2;
  let sum = 0;
  for (const p of samples) {
    const dx = (p.x - cx) / a;
    const dy = (p.y - cy) / b;
    const r = Math.sqrt(dx * dx + dy * dy);
    sum += Math.abs(r - 1);
  }
  return sum / samples.length;
}

function polygonToShape(
  verts: Point[],
  cx: number,
  cy: number,
  w: number,
  h: number
): ClassifiedShape {
  const n = verts.length;
  if (n === 3) {
    return { kind: "shape", shape: "triangle", cx, cy, width: w, height: h, rotation: 0 };
  }
  if (n === 4) {
    return classifyQuad(verts, cx, cy, w, h);
  }
  // 5+ corners: not directly representable, approximate with ellipse-ish bbox.
  const aspect = w / h;
  if (aspect > 0.85 && aspect < 1.15) {
    const r = Math.max(w, h);
    return { kind: "shape", shape: "circle", cx, cy, width: r, height: r, rotation: 0 };
  }
  return { kind: "shape", shape: "ellipse", cx, cy, width: w, height: h, rotation: 0 };
}

function classifyQuad(verts: Point[], cx: number, cy: number, w: number, h: number): ClassifiedShape {
  // Compute the four side lengths and the average orientation of opposite sides.
  const sides: { len: number; angle: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % 4];
    const len = dist(a, b);
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    sides.push({ len, angle });
  }
  const avgLen = (sides[0].len + sides[1].len + sides[2].len + sides[3].len) / 4;
  const sideVar =
    sides.reduce((acc, s) => acc + Math.abs(s.len - avgLen), 0) / (4 * Math.max(1e-6, avgLen));

  // Detect "diamond" (corners aligned with bbox edge midpoints): if no vertex is near
  // a bbox corner, we treat it as a diamond.
  const corners: Point[] = [
    { x: cx - w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy - h / 2 },
    { x: cx + w / 2, y: cy + h / 2 },
    { x: cx - w / 2, y: cy + h / 2 },
  ];
  const diag = Math.hypot(w, h);
  const cornerHits = verts.filter((v) =>
    corners.some((c) => Math.hypot(v.x - c.x, v.y - c.y) < diag * 0.18)
  ).length;
  const isDiamondLike = cornerHits === 0;

  if (isDiamondLike) {
    return { kind: "shape", shape: "diamond", cx, cy, width: w, height: h, rotation: 0 };
  }
  // square vs rect: similar sides and bbox aspect ~1
  const aspect = w / h;
  if (sideVar < 0.18 && aspect > 0.82 && aspect < 1.22) {
    const s = Math.max(w, h);
    return { kind: "shape", shape: "square", cx, cy, width: s, height: s, rotation: 0 };
  }
  return { kind: "shape", shape: "rect", cx, cy, width: w, height: h, rotation: 0 };
}

/* ------------------------------------------------------------------- *
 * Multi-stroke pass: merge runs of short collinear strokes into       *
 * single dashed lines.                                                *
 * ------------------------------------------------------------------- */

interface DashCandidate {
  index: number;
  midpoint: Point;
  direction: Point; // unit vector
  length: number;
}

/**
 * Find clusters of short, collinear strokes (≥3 each) and merge each cluster
 * into a single virtual stroke. Returns the merged virtual strokes plus the
 * indices of strokes that were consumed (so the caller can skip them in the
 * normal classification pass).
 *
 * The algorithm:
 *   1. Mark strokes as dash candidates if they're short and almost straight.
 *   2. For each candidate, find other candidates within a generous radius
 *      that are nearly parallel to it AND lie on (approximately) the same line.
 *   3. Greedily build clusters of 3+ such strokes.
 */
export interface DashGroup {
  strokeIndices: number[];
  start: Point;
  end: Point;
}

export function detectDashGroups(strokes: Stroke[]): DashGroup[] {
  // Build candidates.
  const cands: DashCandidate[] = [];
  for (let i = 0; i < strokes.length; i++) {
    const pts = strokes[i].points;
    if (pts.length < 2) continue;
    const a = pts[0];
    const b = pts[pts.length - 1];
    const len = dist(a, b);
    if (len < 4 || len > 90) continue; // dashes are short
    const totalLen = totalLength(pts);
    // Must be near-straight: total length close to chord length
    if (totalLen > len * 1.4) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dirLen = Math.hypot(dx, dy) || 1;
    cands.push({
      index: i,
      midpoint: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      direction: { x: dx / dirLen, y: dy / dirLen },
      length: len,
    });
  }
  if (cands.length < 3) return [];

  const used = new Set<number>();
  const groups: DashGroup[] = [];

  for (let i = 0; i < cands.length; i++) {
    if (used.has(cands[i].index)) continue;
    const cluster = [cands[i]];
    const dirRef = cands[i].direction;
    const midRef = cands[i].midpoint;
    for (let j = 0; j < cands.length; j++) {
      if (i === j) continue;
      if (used.has(cands[j].index)) continue;
      // Direction parallel? (allow either orientation: |dot| close to 1)
      const c = cands[j];
      const dot = Math.abs(dirRef.x * c.direction.x + dirRef.y * c.direction.y);
      if (dot < 0.94) continue;
      // Perpendicular distance from c.midpoint to line through midRef in dirRef
      const dx = c.midpoint.x - midRef.x;
      const dy = c.midpoint.y - midRef.y;
      const perp = Math.abs(-dirRef.y * dx + dirRef.x * dy);
      if (perp > 8) continue; // close to the same line
      cluster.push(c);
    }
    if (cluster.length < 3) continue;

    // Sort cluster by projection along dirRef
    cluster.sort((a, b) => {
      const da = (a.midpoint.x - midRef.x) * dirRef.x + (a.midpoint.y - midRef.y) * dirRef.y;
      const db = (b.midpoint.x - midRef.x) * dirRef.x + (b.midpoint.y - midRef.y) * dirRef.y;
      return da - db;
    });
    // Spacing check: gap between successive midpoints should be roughly
    // similar (stddev / mean < 0.6) and at least similar to dash length.
    const gaps: number[] = [];
    for (let k = 1; k < cluster.length; k++) {
      gaps.push(dist(cluster[k - 1].midpoint, cluster[k].midpoint));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const gapVar = gaps.reduce((a, b) => a + Math.abs(b - avgGap), 0) / gaps.length / Math.max(1, avgGap);
    const avgLen = cluster.reduce((a, c) => a + c.length, 0) / cluster.length;
    if (gapVar > 0.7) continue;
    if (avgGap > avgLen * 4) continue; // strokes are too far apart to be a dash pattern

    // Build the merged line: from the start of the first dash to the end of the last.
    const firstStroke = strokes[cluster[0].index].points;
    const lastStroke = strokes[cluster[cluster.length - 1].index].points;
    // Pick the endpoint of each that is farthest along dirRef from the cluster center
    const center = { x: midRef.x, y: midRef.y };
    const choosePoint = (a: Point, b: Point, sign: number) => {
      const da = (a.x - center.x) * dirRef.x + (a.y - center.y) * dirRef.y;
      const db = (b.x - center.x) * dirRef.x + (b.y - center.y) * dirRef.y;
      // sign = -1 -> want most-negative projection, sign = +1 -> most-positive
      if (sign < 0) return da < db ? a : b;
      return da > db ? a : b;
    };
    const start = choosePoint(firstStroke[0], firstStroke[firstStroke.length - 1], -1);
    const end = choosePoint(lastStroke[0], lastStroke[lastStroke.length - 1], +1);

    for (const c of cluster) used.add(c.index);
    groups.push({ strokeIndices: cluster.map((c) => c.index), start, end });
  }
  return groups;
}

// Endpoint cluster: still useful for snapping line endpoints together so
// connected lines visually meet, even when we no longer create a vertex object.
export function snapEndpointsTogether(
  lines: { id: string; points: Point[] }[],
  threshold = 14
): { id: string; points: Point[] }[] {
  const reps: { x: number; y: number; count: number }[] = [];
  const findOrAdd = (p: Point): { x: number; y: number } => {
    for (const r of reps) {
      if (Math.hypot(r.x - p.x, r.y - p.y) <= threshold) {
        // Update running average
        r.x = (r.x * r.count + p.x) / (r.count + 1);
        r.y = (r.y * r.count + p.y) / (r.count + 1);
        r.count += 1;
        return { x: r.x, y: r.y };
      }
    }
    reps.push({ x: p.x, y: p.y, count: 1 });
    return { x: p.x, y: p.y };
  };
  // Two passes: first establish representatives, then snap.
  for (const l of lines) {
    if (l.points.length < 2) continue;
    findOrAdd(l.points[0]);
    findOrAdd(l.points[l.points.length - 1]);
  }
  return lines.map((l) => {
    if (l.points.length < 2) return l;
    const start = nearestRep(l.points[0], reps, threshold);
    const end = nearestRep(l.points[l.points.length - 1], reps, threshold);
    const pts = l.points.slice();
    if (start) pts[0] = start;
    if (end) pts[pts.length - 1] = end;
    return { id: l.id, points: pts };
  });
}
function nearestRep(p: Point, reps: { x: number; y: number }[], threshold: number): Point | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const r of reps) {
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < bestD && d <= threshold) {
      bestD = d;
      best = r;
    }
  }
  return best ? { x: best.x, y: best.y } : null;
}
