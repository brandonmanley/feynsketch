import { create } from "zustand";
import type {
  DiagramObject,
  DiagramState,
  LineObject,
  Settings,
  ShapeKind,
  ShapeObject,
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
}

interface HistoryState {
  past: Snapshot[];
  future: Snapshot[];
}

interface ClipboardState {
  clipboard: DiagramObject[];
}

interface Actions {
  setTool: (tool: Tool) => void;
  setPendingShape: (s: ShapeKind | null) => void;

  setObjects: (objs: DiagramObject[]) => void;
  addObject: (obj: DiagramObject) => void;
  updateObject: (id: string, patch: Partial<DiagramObject>) => void;
  updateMany: (ids: string[], patcher: (obj: DiagramObject) => Partial<DiagramObject>) => void;
  removeObject: (id: string) => void;
  removeMany: (ids: string[]) => void;
  removeAnchor: (lineId: string, index: number) => void;

  select: (id: string | null) => void;
  setSelection: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  /** Expand a selection to include all sibling members of any group it touches. */
  expandSelectionToGroups: (ids: string[]) => string[];

  /** Layer ordering. */
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;

  /** Grouping. */
  groupSelection: (ids: string[]) => void;
  ungroupSelection: (ids: string[]) => void;

  /** Clipboard. */
  copy: (ids: string[]) => void;
  cut: (ids: string[]) => void;
  paste: (offsetX?: number, offsetY?: number) => string[];

  addLabel: (latex: string, x: number, y: number) => LabelObject;
  addShape: (shape: ShapeKind, x: number, y: number) => ShapeObject;
  addVertex: (x: number, y: number) => VertexObject;
  addLine: (points: Point[], style?: LineStyle) => LineObject;

  setColor: (id: string, color: string) => void;
  setVertexShape: (id: string, shape: VertexShape) => void;
  setVertexFill: (id: string, fill: VertexFill) => void;

  setSettings: (patch: Partial<Settings>) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  loadState: (s: Partial<DiagramState>) => void;
  reset: () => void;
}

const initial: DiagramState = {
  objects: [],
  selectedIds: [],
  tool: "select",
  pendingShape: null,
  settings: loadSettings(),
};

const initialHistory: HistoryState = { past: [], future: [] };
const initialClipboard: ClipboardState = { clipboard: [] };

function snapshot(s: { objects: DiagramObject[] }): Snapshot {
  return { objects: s.objects.map((o) => structuredClone(o)) };
}

/** Default visual values for each line style — chosen so wiggly photons
 *  and curly gluons look like publication QCD diagrams. */
function defaultsFor(style: LineStyle): { amplitude: number; wavelength: number; doubleSpacing: number } {
  switch (style) {
    case "wiggly":
      return { amplitude: 5, wavelength: 11, doubleSpacing: 4 };
    case "curly":
      return { amplitude: 6, wavelength: 11, doubleSpacing: 4 };
    case "double":
      return { amplitude: 5, wavelength: 11, doubleSpacing: 5 };
    default:
      return { amplitude: 5, wavelength: 11, doubleSpacing: 4 };
  }
}

export const useStore = create<DiagramState & HistoryState & ClipboardState & Actions>((set, get) => ({
  ...initial,
  ...initialHistory,
  ...initialClipboard,

  setTool: (tool) => set({ tool }),
  setPendingShape: (pendingShape) => set({ pendingShape }),

  setObjects: (objects) => {
    get().pushHistory();
    set({ objects });
  },
  addObject: (obj) => {
    get().pushHistory();
    set((s) => ({ objects: [...s.objects, obj], selectedIds: [obj.id] }));
  },
  // updateObject / updateMany do NOT auto-history; drag handlers and slider
  // pointer-downs call pushHistory() once at the start of the interaction.
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
    if (ids.length === 0) return;
    get().pushHistory();
    set((s) => {
      const remove = new Set(ids);
      return {
        objects: s.objects.filter((o) => !remove.has(o.id)),
        selectedIds: s.selectedIds.filter((sid) => !remove.has(sid)),
      };
    });
  },
  removeAnchor: (lineId, index) => {
    const obj = get().objects.find((o) => o.id === lineId);
    if (!obj || obj.kind !== "line") return;
    if (obj.points.length <= 2) return;
    if (index <= 0 || index >= obj.points.length - 1) return; // never delete the endpoints
    get().pushHistory();
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === lineId && o.kind === "line"
          ? { ...o, points: o.points.filter((_, i) => i !== index) }
          : o
      ),
    }));
  },

  select: (id) => set({ selectedIds: id ? get().expandSelectionToGroups([id]) : [] }),
  setSelection: (ids) => set({ selectedIds: get().expandSelectionToGroups(ids) }),
  toggleSelection: (id) =>
    set((s) => {
      const inSel = s.selectedIds.includes(id);
      if (inSel) {
        // Remove this id (and any siblings if it's part of a group)
        const obj = s.objects.find((o) => o.id === id);
        const removeIds = new Set<string>();
        removeIds.add(id);
        if (obj?.groupId) {
          for (const o of s.objects) if (o.groupId === obj.groupId) removeIds.add(o.id);
        }
        return { selectedIds: s.selectedIds.filter((sid) => !removeIds.has(sid)) };
      }
      const additions = get().expandSelectionToGroups([id]);
      const merged = Array.from(new Set([...s.selectedIds, ...additions]));
      return { selectedIds: merged };
    }),
  expandSelectionToGroups: (ids) => {
    const all = get().objects;
    const idSet = new Set(ids);
    const groups = new Set<string>();
    for (const o of all) {
      if (idSet.has(o.id) && o.groupId) groups.add(o.groupId);
    }
    if (groups.size === 0) return ids.slice();
    const out = new Set(ids);
    for (const o of all) {
      if (o.groupId && groups.has(o.groupId)) out.add(o.id);
    }
    return Array.from(out);
  },

  bringForward: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    set((s) => {
      const arr = s.objects.slice();
      const sel = new Set(ids);
      // walk from end-1 to 0; if obj at i is selected and obj at i+1 is not, swap.
      for (let i = arr.length - 2; i >= 0; i--) {
        if (sel.has(arr[i].id) && !sel.has(arr[i + 1].id)) {
          [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
        }
      }
      return { objects: arr };
    });
  },
  sendBackward: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    set((s) => {
      const arr = s.objects.slice();
      const sel = new Set(ids);
      for (let i = 1; i < arr.length; i++) {
        if (sel.has(arr[i].id) && !sel.has(arr[i - 1].id)) {
          [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
        }
      }
      return { objects: arr };
    });
  },
  bringToFront: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    set((s) => {
      const sel = new Set(ids);
      const stay = s.objects.filter((o) => !sel.has(o.id));
      const moved = s.objects.filter((o) => sel.has(o.id));
      return { objects: [...stay, ...moved] };
    });
  },
  sendToBack: (ids) => {
    if (ids.length === 0) return;
    get().pushHistory();
    set((s) => {
      const sel = new Set(ids);
      const stay = s.objects.filter((o) => !sel.has(o.id));
      const moved = s.objects.filter((o) => sel.has(o.id));
      return { objects: [...moved, ...stay] };
    });
  },

  groupSelection: (ids) => {
    if (ids.length < 2) return;
    get().pushHistory();
    const gid = uid("grp");
    set((s) => {
      const sel = new Set(ids);
      return {
        objects: s.objects.map((o) =>
          sel.has(o.id) ? ({ ...o, groupId: gid } as DiagramObject) : o
        ),
      };
    });
  },
  ungroupSelection: (ids) => {
    const objs = get().objects;
    const sel = new Set(ids);
    const groupsTouched = new Set<string>();
    for (const o of objs) if (sel.has(o.id) && o.groupId) groupsTouched.add(o.groupId);
    if (groupsTouched.size === 0) return;
    get().pushHistory();
    set((s) => ({
      objects: s.objects.map((o) => {
        if (o.groupId && groupsTouched.has(o.groupId)) {
          const next = { ...o } as DiagramObject;
          delete (next as any).groupId;
          return next;
        }
        return o;
      }),
    }));
  },

  copy: (ids) => {
    const sel = new Set(ids);
    const objs = get().objects.filter((o) => sel.has(o.id));
    set({ clipboard: objs.map((o) => structuredClone(o)) });
  },
  cut: (ids) => {
    if (ids.length === 0) return;
    get().copy(ids);
    get().removeMany(ids);
  },
  paste: (offsetX = 24, offsetY = 24) => {
    const cb = get().clipboard;
    if (cb.length === 0) return [];
    get().pushHistory();
    // Re-id everything; preserve group structure by remapping group ids consistently.
    const groupMap = new Map<string, string>();
    const newIds: string[] = [];
    const cloned = cb.map((o) => {
      const next = structuredClone(o);
      if (next.groupId) {
        if (!groupMap.has(next.groupId)) groupMap.set(next.groupId, uid("grp"));
        next.groupId = groupMap.get(next.groupId)!;
      }
      next.id = uid(prefixFor(next.kind));
      if (next.kind === "line") {
        next.points = next.points.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }));
        // Drop endpoint vertex links — those refer to old vertices.
        delete next.startVertexId;
        delete next.endVertexId;
      } else {
        next.x += offsetX;
        next.y += offsetY;
      }
      newIds.push(next.id);
      return next;
    });
    set((s) => ({ objects: [...s.objects, ...cloned], selectedIds: newIds }));
    return newIds;
  },

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
    const d = defaultsFor(style);
    const obj: LineObject = {
      id: uid("ln"),
      kind: "line",
      points,
      style,
      arrow: "none",
      arrowDirection: "forward",
      color: "#111111",
      strokeWidth: 2,
      amplitude: d.amplitude,
      wavelength: d.wavelength,
      doubleSpacing: d.doubleSpacing,
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
    const snap = snapshot({ objects: s.objects });
    const past = [...s.past, snap];
    if (past.length > HISTORY_LIMIT) past.shift();
    set({ past, future: [] });
  },
  undo: () => {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    const newPast = s.past.slice(0, -1);
    const current = snapshot({ objects: s.objects });
    set({
      past: newPast,
      future: [current, ...s.future],
      objects: previous.objects,
      selectedIds: [],
    });
  },
  redo: () => {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    const newFuture = s.future.slice(1);
    const current = snapshot({ objects: s.objects });
    set({
      past: [...s.past, current],
      future: newFuture,
      objects: next.objects,
      selectedIds: [],
    });
  },

  loadState: (s) =>
    set(() => ({
      ...initial,
      ...s,
      objects: s.objects ?? [],
      selectedIds: [],
      settings: get().settings,
      past: [],
      future: [],
      clipboard: get().clipboard,
    })),

  reset: () =>
    set({
      ...initial,
      settings: get().settings,
      past: [],
      future: [],
      clipboard: get().clipboard,
    }),
}));

function prefixFor(kind: DiagramObject["kind"]): string {
  switch (kind) {
    case "line":
      return "ln";
    case "shape":
      return "shp";
    case "vertex":
      return "vtx";
    case "label":
      return "lbl";
  }
}
