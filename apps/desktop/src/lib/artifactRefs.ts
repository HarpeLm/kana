import { createContext } from "react";

/** Un fichier de `artefacts/` cité dans un texte (chemin relatif ou absolu, entre accents graves ou non). */
const REF = /`?((?:[\w.~-]*\/)*)(artefacts\/[\w.-]+\.(?:html?|svg|md|pdf|png|jpe?g|gif|webp))`?/gi;

/** « artefacts/plan-lancement.html » → « Plan lancement » : le titre seul, avec une majuscule. */
export function artifactTitle(path: string): string {
  const name = (path.split("/").pop() ?? path).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Les artéfacts cités dans un message, sans doublon, en chemins relatifs au dossier de travail. */
export function findArtifacts(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(REF)) found.add(match[2]);
  return [...found];
}

/** Remplace chaque chemin d'artéfact par un lien `#artifact/…` qui n'affiche que le titre. */
export function linkifyArtifacts(source: string): string {
  return source.replace(REF, (_all, _dir, path: string) => `[${artifactTitle(path)}](#artifact/${encodeURI(path)})`);
}

/** Ouvre un artéfact dans son volet ; fourni par l'application. */
export const OpenArtifactContext = createContext<(path: string) => void>(() => {});
