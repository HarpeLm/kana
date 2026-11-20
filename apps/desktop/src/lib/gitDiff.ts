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
const SAMPLE: DiffReport = {
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

/** Les changements du dépôt où l'app a été lancée. */
export function loadDiff(): Promise<DiffReport> {
  return inTauri ? invoke("git_diff", { path: null }) : Promise.resolve(SAMPLE);
}
