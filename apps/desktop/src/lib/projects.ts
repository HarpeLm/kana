import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

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
