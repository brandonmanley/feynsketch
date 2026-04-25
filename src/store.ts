import { create } from "zustand";
import type {
  DiagramObject,
  DiagramState,
  LineObject,
  Mode,
  ShapeKind,
  ShapeObject,
  Stroke,
  Tool,
  VertexObject,
  LabelObject,
  LineStyle,
  ArrowPosition,
  VertexShape,
  VertexFill,
  Point,
} from "./types";

let idCounter = 1;
export const uid = (prefix = "o") => `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

interface Actions {
  setMode: (mode: Mode) => void;
  setTool: (tool: Tool) => void;
  setPendingShape: (s: ShapeKind | null) => void;

  addStroke: (stroke: Stroke) => void;
  clearStrokes: () => void;

  setObjects: (objs: DiagramObject[]) => void;
  addObject: (obj: DiagramObject) => void;
  updateObject: (id: string, patch: Partial<DiagramObject>) => void;
  removeObject: (id: string) => void;
  select: (id: string | null) => void;

  addLabel: (latex: string, x: number, y: number) => LabelObject;
  addShape: (shape: ShapeKind, x: number, y: number) => ShapeObject;
  addVertex: (x: number, y: number) => VertexObject;
  addLine: (points: Point[], style?: LineStyle) => LineObject;

  setLineStyle: (id: string, style: LineStyle) => void;
  setArrow: (id: string, arrow: ArrowPosition) => void;
  setColor: (id: string, color: string) => void;
  setVertexShape: (id: string, shape: VertexShape) => void;
  setVertexFill: (id: string, fill: VertexFill) => void;

  loadState: (s: Partial<DiagramState>) => void;
  reset: () => void;
}

const initial: DiagramState = {
  mode: "draw",
  objects: [],
  strokes: [],
  selectedId: null,
  tool: "draw",
  pendingShape: null,
};

export const useStore = create<DiagramState & Actions>((set) => ({
  ...initial,

  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setPendingShape: (pendingShape) => set({ pendingShape }),

  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),
  clearStrokes: () => set({ strokes: [] }),

  setObjects: (objects) => set({ objects }),
  addObject: (obj) => set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id })),
  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as DiagramObject) : o)),
    })),
  removeObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    })),
  select: (selectedId) => set({ selectedId }),

  addLabel: (latex, x, y) => {
    const obj: LabelObject = {
      id: uid("lbl"),
      kind: "label",
      x,
      y,
      latex,
      color: "#111111",
      fontSize: 18,
      fontFamily: "KaTeX_Main, serif",
    };
    set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id }));
    return obj;
  },

  addShape: (shape, x, y) => {
    const obj: ShapeObject = {
      id: uid("shp"),
      kind: "shape",
      shape,
      x,
      y,
      width: 80,
      height: 80,
      rotation: 0,
      fill: "#ffffff",
      stroke: "#111111",
      strokeWidth: 2,
    };
    set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id }));
    return obj;
  },

  addVertex: (x, y) => {
    const obj: VertexObject = {
      id: uid("vtx"),
      kind: "vertex",
      x,
      y,
      shape: "circle",
      fill: "filled",
      color: "#111111",
      size: 8,
    };
    set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id }));
    return obj;
  },

  addLine: (points, style = "solid") => {
    const obj: LineObject = {
      id: uid("ln"),
      kind: "line",
      points,
      style,
      arrow: "none",
      color: "#111111",
      strokeWidth: 2,
      amplitude: 8,
      wavelength: 16,
    };
    set((s) => ({ objects: [...s.objects, obj], selectedId: obj.id }));
    return obj;
  },

  setLineStyle: (id, style) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id && o.kind === "line" ? { ...o, style } : o)),
    })),
  setArrow: (id, arrow) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id && o.kind === "line" ? { ...o, arrow } : o)),
    })),
  setColor: (id, color) =>
    set((s) => ({
      objects: s.objects.map((o) => {
        if (o.id !== id) return o;
        if (o.kind === "line" || o.kind === "vertex" || o.kind === "label") return { ...o, color };
        if (o.kind === "shape") return { ...o, stroke: color };
        return o;
      }),
    })),
  setVertexShape: (id, shape) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id && o.kind === "vertex" ? { ...o, shape } : o)),
    })),
  setVertexFill: (id, fill) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id && o.kind === "vertex" ? { ...o, fill } : o)),
    })),

  loadState: (s) =>
    set(() => ({
      ...initial,
      ...s,
      objects: s.objects ?? [],
      strokes: s.strokes ?? [],
    })),

  reset: () => set({ ...initial }),
}));
