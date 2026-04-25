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
  VertexShape,
  VertexFill,
  Point,
} from "./types";

let idCounter = 1;
export const uid = (prefix = "o") => `${prefix}_${Date.now().toString(36)}_${(idCounter++).toString(36)}`;

const SETTINGS_KEY = "feynsketch:settings";
const HISTORY_LIMIT = 100;

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

interface Snapshot {
  objects: DiagramObject[];
  strokes: Stroke[];
}

interface HistoryState {
  past: Snapshot[];
  future: Snapshot[];
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

  /** Push the current (objects, strokes) onto the undo stack. Call BEFORE
   *  performing an undoable change (or before starting a drag). */
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

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

const initialHistory: HistoryState = { past: [], future: [] };

function snapshot(s: { objects: DiagramObject[]; strokes: Stroke[] }): Snapshot {
  return {
    objects: s.objects.map((o) => structuredClone(o)),
    strokes: s.strokes.map((st) => ({ id: st.id, points: st.points.map((p) => ({ ...p })) })),
  };
}

export const useStore = create<DiagramState & HistoryState & Actions>((set, get) => ({
  ...initial,
  ...initialHistory,

  setMode: (mode) => set({ mode }),
  setTool: (tool) => set({ tool }),
  setPendingShape: (pendingShape) => set({ pendingShape }),

  addStroke: (stroke) => {
    get().pushHistory();
    set((s) => ({ strokes: [...s.strokes, stroke] }));
  },
  clearStrokes: () => {
    get().pushHistory();
    set({ strokes: [] });
  },

  setObjects: (objects) => {
    get().pushHistory();
    set({ objects });
  },
  addObject: (obj) => {
    get().pushHistory();
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] }));
  },
  // updateObject and updateMany are intentionally NOT auto-history; drag
  // handlers call pushHistory() once at the start of the drag.
  updateObject: (id, patch) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as DiagramObject) : o)),
    })),
  updateMany: (ids, patcher) =>
    set((s) => {
      const idSet = new Set(ids);
      return {
        objects: s.objects.map((o) =>
          idSet.has(o.id) ? ({ ...o, ...patcher(o) } as DiagramObject) : o
        ),
      };
    }),
  removeObject: (id) => {
    get().pushHistory();
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    }));
  },
  removeMany: (ids) => {
    get().pushHistory();
    set((s) => {
      const remove = new Set(ids);
      return {
        objects: s.objects.filter((o) => !remove.has(o.id)),
        selectedIds: s.selectedIds.filter((sid) => !remove.has(sid)),
      };
    });
  },

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
    get().pushHistory();
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
    get().pushHistory();
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
    get().pushHistory();
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
    get().pushHistory();
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

  setColor: (id, color) => {
    get().pushHistory();
    set((s) => ({
      objects: s.objects.map((o) => {
        if (o.id !== id) return o;
        if (o.kind === "line" || o.kind === "vertex" || o.kind === "label") return { ...o, color };
        if (o.kind === "shape") return { ...o, stroke: color };
        return o;
      }),
    }));
  },
  setVertexShape: (id, shape) => {
    get().pushHistory();
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id && o.kind === "vertex" ? { ...o, shape } : o)),
    }));
  },
  setVertexFill: (id, fill) => {
    get().pushHistory();
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id && o.kind === "vertex" ? { ...o, fill } : o)),
    }));
  },

  setSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    persistSettings(next);
    set({ settings: next });
  },

  pushHistory: () => {
    const s = get();
    const snap = snapshot({ objects: s.objects, strokes: s.strokes });
    const past = [...s.past, snap];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ past, future: [] });
  },
  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    const newPast = s.past.slice(0, -1);
    const current = snapshot({ objects: s.objects, strokes: s.strokes });
    set({
      past: newPast,
      future: [current, ...s.future],
      objects: previous.objects,
      strokes: previous.strokes,
      selectedIds: [],
    });
  },
  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    const newFuture = s.future.slice(1);
    const current = snapshot({ objects: s.objects, strokes: s.strokes });
    set({
      past: [...s.past, current],
      future: newFuture,
      objects: next.objects,
      strokes: next.strokes,
      selectedIds: [],
    });
  },
  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  loadState: (s) =>
    set(() => ({
      ...initial,
      ...s,
      objects: s.objects ?? [],
      strokes: s.strokes ?? [],
      selectedIds: [],
      settings: get().settings,
      past: [],
      future: [],
    })),

  reset: () => set({ ...initial, settings: get().settings, past: [], future: [] }),
}));
