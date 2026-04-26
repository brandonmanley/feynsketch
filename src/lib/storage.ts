import type { DiagramObject } from "../types";

const KEY = "feynsketch:save";
const LIST_KEY = "feynsketch:saves";

export interface SavedProject {
  name: string;
  savedAt: number;
  objects: DiagramObject[];
  /** Older project files may include a `strokes` array — kept optional for
   *  backwards compatibility. The app no longer reads or writes strokes. */
  strokes?: unknown[];
}

export function saveProject(name: string, data: { objects: DiagramObject[] }) {
  const payload: SavedProject = { name, savedAt: Date.now(), objects: data.objects };
  try {
    const all = listProjects();
    const existing = all.findIndex((p) => p.name === name);
    if (existing >= 0) all[existing] = payload;
    else all.push(payload);
    localStorage.setItem(LIST_KEY, JSON.stringify(all));
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch (e) {
    console.error("Failed to save", e);
  }
}

export function listProjects(): SavedProject[] {
  try {
    const raw = localStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadProject(name: string): SavedProject | null {
  const all = listProjects();
  return all.find((p) => p.name === name) ?? null;
}

export function deleteProject(name: string) {
  const all = listProjects().filter((p) => p.name !== name);
  localStorage.setItem(LIST_KEY, JSON.stringify(all));
}

export function lastProject(): SavedProject | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedProject) : null;
  } catch {
    return null;
  }
}

export function exportProjectFile(name: string, data: { objects: DiagramObject[] }) {
  const payload: SavedProject = { name, savedAt: Date.now(), objects: data.objects };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  download(blob, `${sanitize(name)}.feyn.json`);
}

export async function importProjectFile(file: File): Promise<SavedProject> {
  const txt = await file.text();
  const parsed = JSON.parse(txt) as SavedProject;
  if (!Array.isArray(parsed.objects)) throw new Error("Invalid project file");
  return parsed;
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sanitize(s: string) {
  return s.replace(/[^a-z0-9-_]+/gi, "_");
}
