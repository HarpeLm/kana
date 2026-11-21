import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed";

export interface ChangedFile {
  path: string;
  status: ChangeStatus;
}

export interface RepoSymbol {
  name: string;
  kind: string;
  path: string;
  line: number;
}

export interface FileList {
  root: string;
  files: string[];
  truncated: boolean;
  changes: ChangedFile[];
  symbols?: RepoSymbol[];
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

export interface CodeDiagnostic {
  file: string;
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  code?: string | null;
  message: string;
  source: string;
}

const SAMPLE_DIAGNOSTICS: CodeDiagnostic[] = [
  {
    file: "crates/kana-acp/src/client.rs",
    line: 54,
    column: 12,
    severity: "error",
    code: "E0308",
    message: "mismatched types: expected `Result<SessionId, AcpError>`, found `Option<String>`",
    source: "rustc",
  },
  {
    file: "apps/desktop/src/App.tsx",
    line: 60,
    column: 9,
    severity: "error",
    code: "TS2322",
    message: "Type 'string | undefined' is not assignable to type 'string'.",
    source: "tsc",
  },
  {
    file: "crates/kana-git/src/lib.rs",
    line: 18,
    column: 5,
    severity: "warning",
    code: "unused_imports",
    message: "unused import: `std::collections::BTreeMap`",
    source: "rustc",
  },
];

/** Charge les diagnostics compilateur et LSP (`rustc`, `cargo`, `tsc`) du dépôt. */
export function loadDiagnostics(root?: string): Promise<CodeDiagnostic[]> {
  if (inTauri) return invoke("git_diagnostics", { path: root ?? null });
  return Promise.resolve(SAMPLE_DIAGNOSTICS);
}

/**
 * Analyse statique en temps réel du tampon ouvert dans `FilesDock` :
 * marqueurs de conflit Git, JSON invalide et délimiteurs non équilibrés.
 */
export function analyzeBufferDiagnostics(file: string, content: string): CodeDiagnostic[] {
  const results: CodeDiagnostic[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("<<<<<<<") || line.startsWith("=======") || line.startsWith(">>>>>>>")) {
      results.push({
        file,
        line: i + 1,
        column: 1,
        severity: "error",
        code: "GIT_CONFLICT",
        message: "Marqueur de conflit de fusion Git non résolu",
        source: "lsp-live",
      });
    }
  }

  if (file.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (err) {
      results.push({
        file,
        line: 1,
        column: 1,
        severity: "error",
        code: "JSON_PARSE",
        message: err instanceof Error ? err.message : "Syntaxe JSON invalide",
        source: "lsp-live",
      });
    }
  } else if (/\.(rs|ts|tsx|js|jsx)$/i.test(file)) {
    let braces = 0;
    let lastOpenLine = 1;
    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].replace(/\/\/.*$/, "");
      for (const ch of stripped) {
        if (ch === "{") {
          if (braces === 0) lastOpenLine = i + 1;
          braces++;
        } else if (ch === "}") {
          braces--;
        }
      }
    }
    if (braces !== 0) {
      results.push({
        file,
        line: braces > 0 ? lastOpenLine : lines.length,
        column: 1,
        severity: "error",
        code: "SYNTAX_BRACE",
        message:
          braces > 0
            ? `Accolade ouvrante '{' non refermée (${braces} manquante${braces > 1 ? "s" : ""})`
            : "Accolade fermante '}' en trop",
        source: "lsp-live",
      });
    }
  }

  return results;
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
const SAMPLE_SYMBOLS: RepoSymbol[] = [
  { name: "AcpClient", kind: "struct", path: "crates/kana-acp/src/client.rs", line: 54 },
  { name: "list_files", kind: "fn", path: "crates/kana-git/src/lib.rs", line: 50 },
  { name: "App", kind: "fn", path: "apps/desktop/src/App.tsx", line: 60 },
  { name: "Sidebar", kind: "fn", path: "apps/desktop/src/components/Sidebar.tsx", line: 20 },
];
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
    symbols: SAMPLE_SYMBOLS,
  });
}

export type MentionKind = "file" | "folder" | "symbol" | "artifact";

export interface MentionItem {
  id: string;
  kind: MentionKind;
  label: string;
  detail: string;
  insert: string;
}

const ARTIFACT_FILE = /(^|\/)artefacts\/[^/]+$/i;
const MENTION_PREFIX: Array<[RegExp, MentionKind]> = [
  [/^(?:fichier|file):(.*)$/i, "file"],
  [/^(?:dossier|folder):(.*)$/i, "folder"],
  [/^(?:symbole|symbol):(.*)$/i, "symbol"],
  [/^(?:art[eé]fact|artifact):(.*)$/i, "artifact"],
];

function artifactLabel(path: string): string {
  const name = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : path;
}

/** Construit les suggestions d'autocomplétion `@fichier`, `@dossier`, `@symbole` et `@artéfact`. */
export function buildMentionItems(
  list: FileList | null,
  query: string,
  filterKind: MentionKind | "all" = "all",
): MentionItem[] {
  if (!list) return [];
  let activeFilter = filterKind;
  let search = query.trim();
  for (const [pattern, kind] of MENTION_PREFIX) {
    const match = search.match(pattern);
    if (match) {
      activeFilter = kind;
      search = match[1].trim();
      break;
    }
  }
  const needle = search.toLowerCase();

  const artifacts: MentionItem[] = list.files
    .filter((f) => ARTIFACT_FILE.test(f))
    .map((path) => ({
      id: `artifact:${path}`,
      kind: "artifact",
      label: artifactLabel(path),
      detail: path,
      insert: path,
    }));

  const files: MentionItem[] = list.files
    .filter((f) => !ARTIFACT_FILE.test(f))
    .map((path) => ({
      id: `file:${path}`,
      kind: "file",
      label: path.split("/").pop() ?? path,
      detail: path,
      insert: path,
    }));

  const dirSet = new Set<string>();
  for (const path of list.files) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) {
      dirSet.add(`${parts.slice(0, i).join("/")}/`);
    }
  }
  const folders: MentionItem[] = [...dirSet].sort().map((dir) => {
    const trimmed = dir.slice(0, -1);
    const name = `${trimmed.split("/").pop() ?? trimmed}/`;
    return {
      id: `folder:${dir}`,
      kind: "folder",
      label: name,
      detail: dir,
      insert: dir,
    };
  });

  const symbols: MentionItem[] = (list.symbols ?? []).map((s) => ({
    id: `symbol:${s.path}:${s.line}:${s.name}`,
    kind: "symbol",
    label: s.name,
    detail: `${s.kind} · ${s.path}:${s.line}`,
    insert: `${s.name} (${s.path}:${s.line})`,
  }));

  if (!needle && activeFilter === "all") {
    return [
      ...artifacts.slice(0, 2),
      ...files.slice(0, 4),
      ...folders.slice(0, 2),
      ...symbols.slice(0, 2),
    ];
  }

  const pool =
    activeFilter === "artifact"
      ? artifacts
      : activeFilter === "file"
        ? files
        : activeFilter === "folder"
          ? folders
          : activeFilter === "symbol"
            ? symbols
            : [...artifacts, ...symbols, ...folders, ...files];

  if (!needle) return pool.slice(0, 10);

  const score = (item: MentionItem) => {
    const label = item.label.toLowerCase();
    if (label.startsWith(needle)) return 0;
    if (label.includes(needle)) return 1;
    if (item.detail.toLowerCase().includes(needle)) return 2;
    return 99;
  };
  return pool
    .map((item) => ({ item, rank: score(item) }))
    .filter((x) => x.rank < 99)
    .sort((a, b) => a.rank - b.rank || a.item.label.length - b.item.label.length)
    .slice(0, 10)
    .map((x) => x.item);
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

/** Met un fichier à la corbeille. */
export async function trashFile(file: string, root?: string): Promise<void> {
  if (!inTauri) return;
  await invoke("delete_repo_file", { path: root ?? null, file });
}
