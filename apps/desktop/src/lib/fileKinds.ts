export type Language =
  | "typescript"
  | "javascript"
  | "json"
  | "markdown"
  | "rust"
  | "css"
  | "html"
  | "python"
  | "toml"
  | "yaml"
  | "shell"
  | "go"
  | "c"
  | "cpp"
  | "java"
  | "csharp"
  | "kotlin"
  | "ruby"
  | "swift"
  | "lua"
  | "sql"
  | "xml"
  | "dockerfile"
  | "properties"
  | "diff"
  | "plain";

const BY_EXTENSION: Record<string, Language> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "json",
  md: "markdown",
  markdown: "markdown",
  rs: "rust",
  css: "css",
  html: "html",
  htm: "html",
  py: "python",
  toml: "toml",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
  zsh: "shell",
  bash: "shell",
  go: "go",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  java: "java",
  cs: "csharp",
  kt: "kotlin",
  kts: "kotlin",
  rb: "ruby",
  swift: "swift",
  lua: "lua",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  plist: "xml",
  ini: "properties",
  cfg: "properties",
  conf: "properties",
  env: "properties",
  properties: "properties",
  diff: "diff",
  patch: "diff",
};

/** Fichiers reconnus par leur nom, quand l'extension ne suffit pas (`Cargo.lock` est du TOML). */
const BY_NAME: Record<string, Language> = {
  "cargo.lock": "toml",
  dockerfile: "dockerfile",
  makefile: "shell",
  ".gitignore": "shell",
  ".gitattributes": "shell",
  ".dockerignore": "shell",
  ".zshrc": "shell",
  ".bashrc": "shell",
  ".profile": "shell",
};

export const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** Langage d'un fichier d'après son nom ou son extension (`plain` quand on ne le connaît pas). */
export function languageOf(path: string): Language {
  const name = baseName(path).toLowerCase();
  if (BY_NAME[name]) return BY_NAME[name];
  if (name.startsWith(".env")) return "properties";
  const dot = name.lastIndexOf(".");
  return dot > 0 ? (BY_EXTENSION[name.slice(dot + 1)] ?? "plain") : "plain";
}

export const isMarkdown = (path: string) => languageOf(path) === "markdown";

export const isHtml = (path: string) => /\.html?$/i.test(path);
/** Un fichier qui s'affiche mis en forme (et qu'on peut aussi voir en texte source) : markdown ou page HTML. */
export const hasRenderedView = (path: string) => isMarkdown(path) || isHtml(path);

/** Un artéfact : un fichier que l'agent produit dans le dossier `artefacts/`. Les pages HTML qui y sont s'ouvrent en mode visuel. */
export const isArtifactPath = (path: string) => /(^|\/)artefacts\//.test(path);

/**
 * Le fichier s'affiche-t-il mis en forme ? `toggled` : l'utilisateur a basculé l'affichage. Le markdown s'ouvre mis en forme ;
 * une page HTML s'ouvre en mode visuel seulement dans `artefacts/` (ailleurs c'est du code d'un projet, où les scripts
 * comptent : on montre le source), et le bouton passe de l'un à l'autre.
 */
export function showsRendered(path: string, toggled: boolean): boolean {
  if (isMarkdown(path)) return !toggled;
  if (isHtml(path)) return isArtifactPath(path) ? !toggled : toggled;
  return false;
}
