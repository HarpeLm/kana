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

const pastedPreviews = new Map<string, string>();
let pastedSeq = 0;

/** L'image en adresse `data:` pour l'afficher, ou `null` (pas une image, trop lourde, illisible). */
export async function imagePreview(path: string): Promise<string | null> {
  if (pastedPreviews.has(path)) return pastedPreviews.get(path)!;
  if (!inTauri || !isImage(path)) return null;
  try {
    return await invoke<string | null>("image_preview", { path });
  } catch {
    return null;
  }
}

const CLIPBOARD_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** Enregistre une image encodée en base64 issue du presse-papiers et renvoie son chemin. */
export async function saveClipboardImage(mime: string, dataBase64: string): Promise<string | null> {
  const ext = CLIPBOARD_EXT[mime.toLowerCase()];
  if (!ext || !dataBase64) return null;
  if (inTauri) {
    try {
      return await invoke<string>("save_clipboard_image", { mime, data: dataBase64 });
    } catch {
      return null;
    }
  }
  const path = `/tmp/kana-clipboard/collage-${Date.now()}-${++pastedSeq}.${ext}`;
  pastedPreviews.set(path, `data:${mime};base64,${dataBase64}`);
  return path;
}

function blobToBase64(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : null);
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/** Extrait et enregistre les images d'un événement de collage (`Cmd+V`). */
export async function readClipboardImages(clipboard: DataTransfer | null): Promise<string[]> {
  if (!clipboard) return [];
  const blobs: { mime: string; blob: Blob }[] = [];
  for (const item of Array.from(clipboard.items ?? [])) {
    if (item.kind === "file" && CLIPBOARD_EXT[item.type.toLowerCase()]) {
      const file = item.getAsFile();
      if (file) blobs.push({ mime: item.type, blob: file });
    }
  }
  if (blobs.length === 0) {
    for (const file of Array.from(clipboard.files ?? [])) {
      if (CLIPBOARD_EXT[file.type.toLowerCase()]) {
        blobs.push({ mime: file.type, blob: file });
      }
    }
  }
  const saved: string[] = [];
  for (const { mime, blob } of blobs) {
    const base64 = await blobToBase64(blob);
    if (!base64) continue;
    const path = await saveClipboardImage(mime, base64);
    if (path) saved.push(path);
  }
  return saved;
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
