import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { inTauri } from "./env";

/** Ouvre le sélecteur du système (fichiers, ou dossiers) et renvoie les chemins choisis. */
export async function pickFiles(directory = false): Promise<string[]> {
  if (!inTauri) return [];
  const picked = await open({ multiple: !directory, directory });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export const fileName = (path: string) => path.split("/").pop() || path;

/** Ajoute la liste des fichiers joints au message : l'agent les lit à partir de leur chemin. */
export function withAttachments(text: string, paths: string[]): string {
  if (paths.length === 0) return text;
  return `${text}\n\nFichiers joints :\n${paths.map((p) => `- ${p}`).join("\n")}`;
}

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;
export const isImage = (path: string) => IMAGE.test(path);

/** L'image en adresse `data:` pour l'afficher, ou `null` (pas une image, trop lourde, illisible). */
export async function imagePreview(path: string): Promise<string | null> {
  if (!inTauri || !isImage(path)) return null;
  try {
    return await invoke<string | null>("image_preview", { path });
  } catch {
    return null;
  }
}

/** Les images citées dans la liste « Fichiers joints » d'un message : elles partent comme de vraies images. */
export function imagePathsIn(text: string): string[] {
  const at = text.lastIndexOf("\n\nFichiers joints :\n");
  if (at < 0) return [];
  return text
    .slice(at)
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(isImage);
}
