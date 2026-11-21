import { createContext } from "react";

const EXT =
  "tsx?|jsx?|mjs|cjs|json|jsonc|md|mdx|rs|toml|ya?ml|css|scss|html?|py|go|java|kt|swift|rb|php|vue|svelte|sh|zsh|sql|txt|lock|ini|cfg|xml|c|h|cpp|hpp|cs|gradle|plist";
/** Un chemin entre accents graves (nom seul accepté) ou un chemin à barres dans le texte, avec une ligne éventuelle (`:42`). */
const TICKED = new RegExp("`((?:~|\\.{0,2})?/?(?:[\\w@.+-]+/)*[\\w@.+-]+\\.(?:" + EXT + "))(?::(\\d+)(?::\\d+)?)?`", "gi");
const PLAIN = new RegExp("(?<![\\w/#(.@:-])((?:~|\\.{0,2})?/?(?:[\\w@.+-]+/)+[\\w@.+-]+\\.(?:" + EXT + "))(?::(\\d+))?(?![\\w/-])", "gi");

const name = (path: string) => path.split("/").pop() ?? path;

/** « src/App.tsx », ligne 42 → `[App.tsx:42](#file/…)`. */
function link(path: string, line?: string): string {
  const label = line ? `${name(path)}:${line}` : name(path);
  return `[${label}](#file/${encodeURI(path)}${line ? `?line=${line}` : ""})`;
}

/**
 * Remplace les chemins de fichiers d'un message par des liens `#file/…` (cliquables, avec une icône de fichier).
 * Les blocs de code, les liens existants et les adresses web sont laissés tels quels ; les artéfacts ont déjà leur propre lien.
 */
export function linkifyFiles(source: string): string {
  return source
    .split(/(```[\s\S]*?```|\[[^\]]*\]\([^)]*\)|https?:\/\/\S+)/g)
    .map((part, i) => {
      if (i % 2 === 1) return part; // un bloc de code, un lien ou une adresse
      const skip = (path: string) => /(^|\/)artefacts\//.test(path);
      return part
        .replace(TICKED, (all, path: string, line?: string) => (skip(path) ? all : link(path, line)))
        .replace(PLAIN, (all, path: string, line?: string) => (skip(path) ? all : link(path, line)));
    })
    .join("");
}

/** Ouvre un fichier du dossier de travail dans le volet Fichiers ; fourni par l'application. */
export const OpenFileContext = createContext<(path: string, line?: number) => void>(() => {});
