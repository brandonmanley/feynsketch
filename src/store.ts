import { create } from "zustand";
import type {
  DiagramObject,
  DiagramState,
  LineObject,
  Mode,
  Settings,
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

const SETTINGS_KEY = "feynsketch:settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        snap: !!parsed.snap,
        gridSize: typeof parsed.gridSize === "number" ? parsed.gridSize : 20,
        confirmDelete: parsed.confirmDelete ?? true,
      };
    }
  } catch {
    /* ignore */
  }
  return { snap: false, gridSize: 20, confirmDelete: true };
}

function persistSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

interface Actions {
  setMode: (mode: Mode) => void;
  setTool: (tool: Tool) => void;
  setPendingShape: (s: ShapeKind | null) => void;

  addStroke: (stroke: Stroke) => void;
  clearStrokes: () => void;

  setObjects: (objs: DiagramObject[]) => void;
  addObject: (obj: DiagramObject) => void;
  updateObject: (id: string, patch: Partial<DiagramObject>) => void;
  updateMany: (ids: string[], patcher: (obj: DiagramObject) => Partial<DiagramObject>) => void;
  removeObject: (id: string) => void;
  removeMany: (ids: string[]) => void;
  select: (id: string | null) => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;

  addLabel: (latex: string, x: number, y: number) => LabelObject;
  addShape: (shape: ShapeKind, x: number, y: number) => ShapeObject;
  addVertex: (x: number, y: number) => VertexObject;
  addLine: (points: Point[], style?: LineStyle) => LineObject;

  setColor: (id: string, color: string) => void;
  setVertexShape: (id: string, shape: VertexShape) => void;
  setVertexFill: (id: string, fill: VertexFill) => void;

  setSettings: (patch: Partial<Settings>) => void;

  loadState: (s: Partial<DiagramState>) => void;
  reset: () => void;
}

const initial: DiagramState = {
  mode: "draw",
  objects: [],
  strokes: [],
  selectedIds: [],
  tool: "draw",
  pendingShape: null,
  settings: loadSettings(),
};

export const useStore = create<DiagramState & Actions>((set, get) => ({
  ...initial,

  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setPendingShape: (pendingShape) => set({ pendingShape }),

  addStroke: (stroke) => set((s) => ({ strokes: [...s.strokes, stroke] })),
  clearStrokes: () => set({ strokes: [] }),

  setObjects: (objects) => set({ objects }),
  addObject: (obj) => set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] })),
  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as DiagramObject) : o)),
    })),
  updateMany: (ids, patcher) =>
    set((s) => {
      const set = new Set(ids);
      return {
        objects: s.objects.map((o) =>
          set.has(o.id) ? ({ ...o, ...patcher(o) } as DiagramObject) : o
        ),
      };
    }),
  removeObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),
  removeMany: (ids) =>
    set((s) => {
      const remove = new Set(ids);
      return {
        objects: s.objects.filter((o) => !remove.has(o.id)),
        selectedIds: s.selectedIds.filter((sid) => !remove.has(sid)),
      };
    }),

  select: (id) => set({ selectedIds: id ? [id] : [] }),
  setSelection: (ids) => set({ selectedIds: ids }),
  toggleSelection: (id) =>
    set((s) => {
      if (s.selectedIds.includes(id)) {
        return { selectedIds: s.selectedIds.filter((x) => x !== id) };
      }
      return { selectedIds: [...s.selectedIds, id] };
    }),

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
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] }));
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
      fill: "transparent",
      stroke: "#111111",
      strokeWidth: 2,
    };
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] }));
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
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] }));
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
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] }));
    return obj;
  },

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

  setSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    persistSettings(next);
    set({ settings: next });
  },

  loadState: (s) =>
    set(() => ({
      ...initial,
      ...s,
      objects: s.objects ?? [],
      strokes: s.strokes ?? [],
      selectedIds: [],
      settings: get().settings, // keep current settings
    })),

  reset: () => set({ ...initial, settings: get().settings }),
}));
