import { useSyncExternalStore } from "react";
import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";
import { persistSharedSetting } from "./store";

/** Un projet : un dossier de l'ordinateur où les agents travaillent. */
export interface Project {
  name: string;
  path: string;
  /** Dernière utilisation (ms), pour classer les récents. */
  lastUsed?: number;
}

/** Valeur de `projectPath` d'une conversation sans projet. */
export const NO_PROJECT = "none";
/** Nom de la section des conversations sans projet. */
export const NO_PROJECT_NAME = "Conversations";

const LOCAL_KEY = "kana-projects";

export async function loadProjects(): Promise<Project[]> {
  if (!inTauri) {
    try {
      const parsed = JSON.parse(localStorage.getItem(LOCAL_KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const rows = await invoke<Array<{ name: string; path: string; lastUsed: number | null }>>("db_load_projects");
  return rows.map((r) => ({ name: r.name, path: r.path, lastUsed: r.lastUsed ?? undefined }));
}

export async function saveProjects(items: Project[]): Promise<void> {
  if (!inTauri) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
    } catch {
      // stockage indisponible : la liste ne sera pas conservée
    }
    return;
  }
  await invoke("db_save_projects", { items: items.map((p) => ({ ...p, lastUsed: p.lastUsed ?? null })) });
}

/** Le projet dans lequel Kana a été lancé, s'il y en a un. */
export async function launchProject(): Promise<Project | null> {
  return inTauri ? invoke<Project | null>("launch_project") : null;
}

/** Crée un projet neuf (dossier + dépôt git). */
export async function createProject(name: string): Promise<Project> {
  if (!inTauri) return { name: name.trim(), path: `/exemple/${name.trim()}` };
  return invoke<Project>("create_project", { name });
}

/** Le nom et le chemin d'un dossier choisi dans le sélecteur du système. */
export async function describeFolder(path: string): Promise<Project> {
  return inTauri ? invoke<Project>("describe_folder", { path }) : { name: path.split("/").pop() || path, path };
}

export async function scratchDir(): Promise<string | undefined> {
  return inTauri ? invoke<string>("scratch_dir") : undefined;
}

/** La branche git actuelle de chaque dossier, par chemin (absente : pas un dépôt). */
export async function loadBranches(paths: string[]): Promise<Record<string, string>> {
  if (!inTauri || paths.length === 0) return {};
  try {
    const branches = await invoke<Array<string | null>>("git_current_branches", { paths });
    const found: Record<string, string> = {};
    paths.forEach((path, i) => {
      const branch = branches[i];
      if (branch) found[path] = branch;
    });
    return found;
  } catch {
    return {};
  }
}

export const PROJECT_MEMORY_KEY = "kana-project-memory";

let memoryMapFallback: Record<string, string[]> = {};
let memoryVersion = 0;
const memoryListeners = new Set<() => void>();

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readMemoryMap(): Record<string, string[]> {
  if (!hasBrowserStorage()) return memoryMapFallback;
  try {
    const parsed = JSON.parse(localStorage.getItem(PROJECT_MEMORY_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const clean: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        clean[key] = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
      }
    }
    return clean;
  } catch {
    return {};
  }
}

function writeMemoryMap(next: Record<string, string[]>): void {
  if (!hasBrowserStorage()) {
    memoryMapFallback = next;
  } else {
    persistSharedSetting(PROJECT_MEMORY_KEY, JSON.stringify(next));
  }
  memoryVersion += 1;
  memoryListeners.forEach((notify) => notify());
}

/** Retourne les notes persistantes partagées pour ce projet entre sessions et fournisseurs. */
export function getProjectMemory(projectPath: string): string[] {
  const path = projectPath.trim();
  if (!path || path === NO_PROJECT) return [];
  return [...(readMemoryMap()[path] ?? [])];
}

/** Ajoute une note persistante à la mémoire du projet et retourne la liste à jour. */
export function addProjectMemory(projectPath: string, note: string): string[] {
  const path = projectPath.trim();
  const cleanNote = note.trim();
  if (!path || path === NO_PROJECT) return [];
  const current = readMemoryMap();
  const list = current[path] ?? [];
  if (!cleanNote || list.includes(cleanNote)) return [...list];
  const updated = [...list, cleanNote];
  writeMemoryMap({ ...current, [path]: updated });
  return updated;
}

/** Supprime une note persistante du projet par son index et retourne la liste à jour. */
export function removeProjectMemory(projectPath: string, index: number): string[] {
  const path = projectPath.trim();
  if (!path || path === NO_PROJECT) return [];
  const current = readMemoryMap();
  const list = current[path] ?? [];
  if (index < 0 || index >= list.length) return [...list];
  const updated = list.filter((_, i) => i !== index);
  const nextMap = { ...current };
  if (updated.length === 0) delete nextMap[path];
  else nextMap[path] = updated;
  writeMemoryMap(nextMap);
  return updated;
}

/** Construit le préambule de mémoire projet injecté à chaque nouvel agent ou relais. */
export function buildProjectMemoryPreface(projectPath?: string): string {
  if (!projectPath || projectPath === NO_PROJECT) return "";
  const notes = getProjectMemory(projectPath);
  if (notes.length === 0) return "";
  return `Mémoire partagée du projet (notes persistantes entre sessions et fournisseurs) :\n${notes.map((n) => `- ${n}`).join("\n")}\n\n`;
}

export function useProjectMemoryVersion(): number {
  return useSyncExternalStore(
    (notify) => {
      memoryListeners.add(notify);
      return () => memoryListeners.delete(notify);
    },
    () => memoryVersion,
  );
}
