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
  | "plain";

const BY_EXTENSION: Record<string, Language> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
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
};

const extensionOf = (path: string) => path.slice(path.lastIndexOf(".") + 1).toLowerCase();

/** Langage d'un fichier d'après son extension (`plain` quand on ne le connaît pas). */
export function languageOf(path: string): Language {
  return path.includes(".") ? (BY_EXTENSION[extensionOf(path)] ?? "plain") : "plain";
}

export const isMarkdown = (path: string) => languageOf(path) === "markdown";

export const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;
