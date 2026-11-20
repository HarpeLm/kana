import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface FileList {
  root: string;
  files: string[];
  truncated: boolean;
}

export interface FilePreview {
  path: string;
  size: number;
  binary: boolean;
  truncated: boolean;
  text: string;
}

// Exemple affiché dans un navigateur sans Tauri, pour voir la mise en page.
const SAMPLE_LIST: FileList = {
  root: "exemple (navigateur)",
  truncated: false,
  files: [
    "README.md",
    "Cargo.toml",
    "crates/kana-acp/src/lib.rs",
    "crates/kana-acp/src/client.rs",
    "crates/kana-git/src/lib.rs",
    "apps/desktop/src/App.tsx",
    "apps/desktop/src/components/Sidebar.tsx",
    "apps/desktop/src/components/TerminalDock.tsx",
    "apps/desktop/package.json",
  ],
};

function samplePreview(path: string): FilePreview {
  const text = `// Aperçu d'exemple de ${path}\nfn main() {\n    println!("bonjour");\n}\n`;
  return { path, size: text.length, binary: false, truncated: false, text };
}

/** Les fichiers du dépôt où l'app a été lancée. */
export function loadFileList(): Promise<FileList> {
  return inTauri ? invoke("repo_files", { path: null }) : Promise.resolve(SAMPLE_LIST);
}

/** Le début d'un fichier du dépôt. */
export function loadFilePreview(file: string): Promise<FilePreview> {
  return inTauri
    ? invoke("read_repo_file", { path: null, file })
    : Promise.resolve(samplePreview(file));
}
