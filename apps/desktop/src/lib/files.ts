import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
}

export interface FileList {
  root: string;
  files: string[];
  truncated: boolean;
  changes: ChangedFile[];
}

export interface FilePreview {
  path: string;
  size: number;
  binary: boolean;
  /** Le texte est coupé : le fichier n'est pas modifiable. */
  truncated: boolean;
  /** Date de dernière modification (ms) : sert à repérer une modification ailleurs. */
  modified: number;
  text: string;
}

// Dans un navigateur sans Tauri : quelques fichiers d'exemple, modifiables en mémoire.
const SAMPLE_FILES = [
  "README.md",
  "Cargo.toml",
  "Cargo.lock",
  ".gitignore",
  "crates/kana-acp/src/lib.rs",
  "crates/kana-acp/src/client.rs",
  "crates/kana-git/src/lib.rs",
  "apps/desktop/src/App.tsx",
  "apps/desktop/src/components/Sidebar.tsx",
  "apps/desktop/package.json",
];
const sampleTexts = new Map<string, { text: string; modified: number }>();

function sampleOf(path: string) {
  if (!sampleTexts.has(path)) {
    const text = path.endsWith(".md")
      ? `# Exemple\n\nAperçu de **${path}**.\n\n- un\n- deux\n\n\`\`\`rust\nfn main() {}\n\`\`\`\n`
      : path.endsWith(".toml") || path.endsWith(".lock")
        ? `# Exemple\nversion = 4\n\n[[package]]\nname = "kana"\nversion = "0.1.0"\ndependencies = [\n "serde",\n]\nactive = true\n`
        : `// Aperçu d'exemple de ${path}\nfn main() {\n    println!("bonjour");\n}\n`;
    sampleTexts.set(path, { text, modified: Date.now() });
  }
  return sampleTexts.get(path)!;
}

/** Les fichiers du dépôt où l'app a été lancée. */
export function loadFileList(): Promise<FileList> {
  if (inTauri) return invoke("repo_files", { path: null });
  return Promise.resolve({
    root: "exemple (navigateur)",
    files: SAMPLE_FILES,
    truncated: false,
    changes: [{ path: "README.md", status: "modified" }],
  });
}

/** Le début d'un fichier du dépôt. */
export function loadFilePreview(file: string): Promise<FilePreview> {
  if (inTauri) return invoke("read_repo_file", { path: null, file });
  const sample = sampleOf(file);
  return Promise.resolve({
    path: file,
    size: sample.text.length,
    binary: false,
    truncated: false,
    modified: sample.modified,
    text: sample.text,
  });
}

/**
 * Enregistre un fichier existant. `expectedModified` est la date vue à l'ouverture : si le fichier
 * a changé depuis, l'écriture est refusée (passer `null` pour écraser volontairement).
 * Renvoie la nouvelle date de modification.
 */
export function writeFile(
  file: string,
  content: string,
  expectedModified: number | null,
): Promise<number> {
  if (inTauri) return invoke("write_repo_file", { path: null, file, content, expectedModified });
  const modified = Date.now();
  sampleTexts.set(file, { text: content, modified });
  return Promise.resolve(modified);
}
