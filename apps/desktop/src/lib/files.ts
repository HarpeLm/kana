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
  "artefacts/plan.html",
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
const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><title>Plan</title>
<style>body{font-family:Georgia,serif;max-width:620px;margin:40px auto;color:#222;line-height:1.6}h1{font-size:28px}li{margin:6px 0}.note{background:#f4efe4;padding:10px 14px;border-radius:8px}</style></head>
<body><h1>Plan de la refonte</h1>
<p>Ce document décrit les étapes pour <b>refondre</b> la page d'accueil avant la fin du mois.</p>
<ul><li>Auditer la page actuelle et lister les problèmes</li><li>Dessiner trois maquettes différentes</li><li>Choisir une maquette avec l'équipe</li><li>Livrer la version finale</li></ul>
<p class="note">Une note à relire avant de commencer.</p>
<script>document.body.insertAdjacentHTML('beforeend','<p>Ajouté par un script</p>')</script>
</body></html>
`;
const sampleTexts = new Map<string, { text: string; modified: number }>();

function sampleOf(path: string) {
  if (!sampleTexts.has(path)) {
    const text = path.endsWith(".html")
      ? SAMPLE_HTML
      : path.endsWith(".md")
      ? `# Exemple\n\nAperçu de **${path}**.\n\n- un\n- deux\n\n\`\`\`rust\nfn main() {}\n\`\`\`\n`
      : path.endsWith(".toml") || path.endsWith(".lock")
        ? `# Exemple\nversion = 4\n\n[[package]]\nname = "kana"\nversion = "0.1.0"\ndependencies = [\n "serde",\n]\nactive = true\n`
        : `// Aperçu d'exemple de ${path}\nfn main() {\n    println!("bonjour");\n}\n`;
    sampleTexts.set(path, { text, modified: Date.now() });
  }
  return sampleTexts.get(path)!;
}

/** Les fichiers du dépôt de `root` (le dossier de travail d'une conversation), sinon du dépôt de lancement. */
export function loadFileList(root?: string): Promise<FileList> {
  if (inTauri) return invoke("repo_files", { path: root ?? null });
  return Promise.resolve({
    root: "exemple (navigateur)",
    files: SAMPLE_FILES,
    truncated: false,
    changes: [{ path: "README.md", status: "modified" }],
  });
}

/** Le début d'un fichier du dépôt. */
export function loadFilePreview(file: string, root?: string): Promise<FilePreview> {
  if (inTauri) return invoke("read_repo_file", { path: root ?? null, file });
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
  root?: string,
): Promise<number> {
  if (inTauri) return invoke("write_repo_file", { path: root ?? null, file, content, expectedModified });
  const modified = Date.now();
  sampleTexts.set(file, { text: content, modified });
  return Promise.resolve(modified);
}
