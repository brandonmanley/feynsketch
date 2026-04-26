export type Point = { x: number; y: number };

export type LineStyle =
  | "solid"
  | "dashed"
  | "double"
  | "wiggly" // photon
  | "curly"  // gluon
  | "ghost"; // dotted

export type ArrowPosition = "none" | "start" | "middle" | "end";

export type ArrowDirection = "forward" | "backward";

export type VertexShape = "circle" | "square";
export type VertexFill = "filled" | "open" | "none";

export interface LineObject {
  id: string;
  kind: "line";
  // Control points along the line; first and last are endpoints, middle are anchors.
  // Rendering uses a cubic spline that passes through every point.
  points: Point[];
  style: LineStyle;
  arrow: ArrowPosition;
  arrowDirection: ArrowDirection; // direction the middle / end arrow points
  color: string;
  strokeWidth: number;
  // For wiggly (photon) and curly (gluon) lines.
  amplitude: number;
  wavelength: number;
  // For double lines: distance between the two parallel strands.
  doubleSpacing: number;
  // Optional grouping id; objects with the same groupId move/copy together.
  groupId?: string;
  // Connected vertex ids (optional, set explicitly by the user)
  startVertexId?: string;
  endVertexId?: string;
}

export type ShapeKind =
  | "circle"
  | "square"
  | "triangle"
  | "ellipse"
  | "rect"
  | "diamond"
  | "cross";

export interface ShapeObject {
  id: string;
  kind: "shape";
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  groupId?: string;
}

export interface VertexObject {
  id: string;
  kind: "vertex";
  x: number;
  y: number;
  shape: VertexShape;
  fill: VertexFill;
  color: string;
  size: number;
  groupId?: string;
}

export interface LabelObject {
  id: string;
  kind: "label";
  x: number;
  y: number;
  latex: string;
  color: string;
  fontSize: number;
  fontFamily: string;
  groupId?: string;
}

export type DiagramObject = LineObject | ShapeObject | VertexObject | LabelObject;

export type Tool = "select" | "line" | "shape" | "vertex" | "label";

export interface Settings {
  snap: boolean;
  gridSize: number;
  confirmDelete: boolean;
}

export interface DiagramState {
  objects: DiagramObject[];
  selectedIds: string[];
  tool: Tool;
  pendingShape: ShapeKind | null;
  settings: Settings;
}
