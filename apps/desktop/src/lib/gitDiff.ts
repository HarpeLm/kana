import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export type LineKind = "context" | "add" | "del";
export type FileStatus = "modified" | "added" | "deleted" | "renamed";

export interface DiffLine {
  kind: LineKind;
  old_no: number | null;
  new_no: number | null;
  text: string;
}

export interface Hunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  old_path: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: Hunk[];
}

export interface DiffReport {
  root: string;
  files: FileDiff[];
}

// Exemple affiché dans un navigateur sans Tauri, pour voir la mise en page.
const INITIAL_SAMPLE: DiffReport = {
  root: "exemple (navigateur)",
  files: [
    {
      path: "src/main.rs",
      old_path: null,
      status: "modified",
      additions: 2,
      deletions: 1,
      binary: false,
      hunks: [
        {
          header: "@@ -1,4 +1,5 @@ fn main() {",
          lines: [
            { kind: "context", old_no: 1, new_no: 1, text: "fn main() {" },
            { kind: "del", old_no: 2, new_no: null, text: '    println!("salut");' },
            { kind: "add", old_no: null, new_no: 2, text: '    println!("bonjour");' },
            { kind: "add", old_no: null, new_no: 3, text: '    println!("monde");' },
            { kind: "context", old_no: 3, new_no: 4, text: "}" },
          ],
        },
      ],
    },
    {
      path: "notes.md",
      old_path: null,
      status: "added",
      additions: 1,
      deletions: 0,
      binary: false,
      hunks: [
        {
          header: "@@ -0,0 +1 @@",
          lines: [{ kind: "add", old_no: null, new_no: 1, text: "Premières notes" }],
        },
      ],
    },
  ],
};

let browserSample: DiffReport = structuredClone(INITIAL_SAMPLE);
const browserCheckpoints = new Map<string, DiffReport>();
let checkpointSeq = 0;

/** Les changements du dépôt où l'app a été lancée, ou de celui de `path` (un dossier de travail). */
export function loadDiff(path?: string): Promise<DiffReport> {
  return inTauri ? invoke("git_diff", { path: path ?? null }) : Promise.resolve(structuredClone(browserSample));
}

/** Annule toutes les modifications d'un fichier dans le dépôt (ou dans l'exemple en mode navigateur). */
export async function revertDiffFile(file: string, path?: string): Promise<void> {
  if (inTauri) {
    await invoke("git_revert_file", { path: path ?? null, file });
    return;
  }
  browserSample = {
    ...browserSample,
    files: browserSample.files.filter((f) => f.path !== file),
  };
}

/** Annule un seul bloc (`hunkHeader`) d'un fichier dans le dépôt (ou dans l'exemple en mode navigateur). */
export async function revertDiffHunk(file: string, hunkHeader: string, path?: string): Promise<void> {
  if (inTauri) {
    await invoke("git_revert_hunk", { path: path ?? null, file, hunkHeader });
    return;
  }
  browserSample = {
    ...browserSample,
    files: browserSample.files
      .map((f) => {
        if (f.path !== file) return f;
        const hunks = f.hunks.filter((h) => h.header !== hunkHeader);
        const additions = hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === "add").length, 0);
        const deletions = hunks.reduce((s, h) => s + h.lines.filter((l) => l.kind === "del").length, 0);
        return { ...f, hunks, additions, deletions };
      })
      .filter((f) => f.hunks.length > 0),
  };
}

/** Crée un checkpoint Git de l'état courant du dossier de travail. */
export async function createCheckpoint(label: string, path?: string): Promise<string | null> {
  if (inTauri) {
    if (!path || path === "none") return null;
    try {
      return await invoke<string>("git_create_checkpoint", { path, label });
    } catch {
      return null;
    }
  }
  const id = `browser-cp-${Date.now().toString(36)}-${++checkpointSeq}`;
  browserCheckpoints.set(id, structuredClone(browserSample));
  return id;
}

/** Restaure le dossier de travail à un checkpoint précédent. */
export async function restoreCheckpoint(target: string, path?: string): Promise<void> {
  if (inTauri) {
    if (!path || path === "none") return;
    await invoke("git_restore_checkpoint", { path, target });
    return;
  }
  const snap = browserCheckpoints.get(target);
  if (snap) {
    browserSample = structuredClone(snap);
  }
}
