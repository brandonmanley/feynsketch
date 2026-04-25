export type Point = { x: number; y: number };

export type LineStyle =
  | "solid"
  | "dashed"
  | "double"
  | "wiggly" // photon
  | "curly"  // gluon
  | "ghost"; // dotted

export type ArrowPosition = "none" | "start" | "middle" | "end";

export type VertexShape = "circle" | "square";
export type VertexFill = "filled" | "open" | "none";

export interface LineObject {
  id: string;
  kind: "line";
  // control points along the line; first and last are endpoints, middle are anchors
  // rendering uses a cardinal spline (catmull-rom) when there are 3+ points
  points: Point[];
  style: LineStyle;
  arrow: ArrowPosition;
  color: string;
  strokeWidth: number;
  // for wiggly (photon): amplitude and wavelength
  amplitude: number;
  wavelength: number;
  // connected vertex ids (optional)
  startVertexId?: string;
  endVertexId?: string;
}

export type ShapeKind = "circle" | "square" | "triangle" | "ellipse" | "rect" | "diamond";

export interface ShapeObject {
  id: string;
  kind: "shape";
  shape: ShapeKind;
  // bounding box center + size
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
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
}

export type DiagramObject = LineObject | ShapeObject | VertexObject | LabelObject;

export type Tool = "select" | "draw" | "line" | "shape" | "vertex" | "label";

export type Mode = "draw" | "edit";

export interface Stroke {
  id: string;
  points: Point[];
}

export interface Settings {
  snap: boolean;
  gridSize: number;
  confirmDelete: boolean;
}

export interface DiagramState {
  mode: Mode;
  objects: DiagramObject[];
  strokes: Stroke[];
  selectedIds: string[];
  tool: Tool;
  pendingShape: ShapeKind | null;
  settings: Settings;
}
