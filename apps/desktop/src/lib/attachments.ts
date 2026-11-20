import { open } from "@tauri-apps/plugin-dialog";
import { inTauri } from "./env";

/** Ouvre le sélecteur de fichiers du système et renvoie les chemins choisis. */
export async function pickFiles(): Promise<string[]> {
  if (!inTauri) return [];
  const picked = await open({ multiple: true, directory: false });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export const fileName = (path: string) => path.split("/").pop() || path;

/** Ajoute la liste des fichiers joints au message : l'agent les lit à partir de leur chemin. */
export function withAttachments(text: string, paths: string[]): string {
  if (paths.length === 0) return text;
  return `${text}\n\nFichiers joints :\n${paths.map((p) => `- ${p}`).join("\n")}`;
}
