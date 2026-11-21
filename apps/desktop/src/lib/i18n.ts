import { useSyncExternalStore } from "react";
import { persistSharedSetting } from "./store";

export type Locale = "fr" | "en";

const LOCALE_KEY = "kana-locale";
const listeners = new Set<() => void>();

function readStoredLocale(): Locale {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return "fr";
  try {
    return localStorage.getItem(LOCALE_KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

let currentLocale: Locale = readStoredLocale();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  const next: Locale = locale === "en" ? "en" : "fr";
  currentLocale = next;
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    persistSharedSetting(LOCALE_KEY, next);
  }
  if (typeof document !== "undefined" && document.documentElement) {
    document.documentElement.lang = next;
  }
  listeners.forEach((notify) => notify());
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => currentLocale,
  );
}

/** Retourne le libellé correspondant à la langue active (`"fr"` par défaut). */
export function tr(fr: string, en: string, locale: Locale = currentLocale): string {
  return locale === "en" ? en : fr;
}

const RUST_ERROR_RULES: Array<[RegExp, string | ((...args: string[]) => string)]> = [
  // kana-acp
  [/connexion requise : ouvre les Réglages pour te connecter/g, "authentication required: open Settings to sign in"],
  [/connexion requise : ouvre les Réglages/g, "authentication required: open Settings"],
  [/connexion requise/g, "authentication required"],
  [/impossible de lancer l'agent : /g, "failed to start agent: "],
  [/erreur d'entrée\/sortie : /g, "I/O error: "],
  [/l'agent a répondu avec une erreur \(([^)]+)\) : /g, (_m, code) => `agent returned an error (${code}): `],
  [/l'agent s'est arrêté/g, "agent stopped"],
  [/réponse inattendue de l'agent : /g, "unexpected agent response: "],

  // kana-db
  [/impossible de créer le dossier de la base : /g, "unable to create database directory: "],
  [/base de données : /g, "database error: "],
  [/données illisibles : /g, "unreadable data: "],
  [/la base est verrouillée/g, "database is locked"],

  // kana-git (run, files, forge)
  [/impossible de lancer git : /g, "failed to launch git: "],
  [/aucun dépôt git dans /g, "not a git repository: "],
  [/git a échoué : /g, "git failed: "],
  [/chemin refusé : /g, "invalid path: "],
  [/lecture impossible : /g, "unable to read: "],
  [/écriture impossible : /g, "unable to write: "],
  [/fichier modifié ailleurs depuis son ouverture : /g, "file modified externally since opened: "],
  [/([^\s]+) n'est pas un fichier/g, (_m, path) => `${path} is not a file`],
  [/fichier trop volumineux \(max (\d+) Mo\)/g, (_m, mb) => `file too large (max ${mb} MB)`],
  [/branche principale introuvable/g, "main branch not found"],
  [
    /le projet est sur la branche « ([^»]+) » et non sur « ([^»]+) » : revenir sur « ([^»]+) » avant de fusionner/g,
    (_m, cur, base) => `project is on branch "${cur}" instead of "${base}": switch back to "${base}" before merging`,
  ],
  [
    /le projet a des changements non enregistrés : les enregistrer ou les mettre de côté avant de fusionner/g,
    "project has uncommitted changes: commit or stash them before merging",
  ],
  [
    /la fusion a des conflits avec « ([^»]+) » : elle est annulée, rien n'a changé \(([^)]+)\)/g,
    (_m, base, detail) => `merge conflicts with "${base}": merge aborted, nothing changed (${detail})`,
  ],
  [/bloc introuvable dans /g, "hunk not found in "],
  [/bloc introuvable : /g, "hunk not found: "],
  [/identifiant de checkpoint invalide/g, "invalid checkpoint id"],
  [/checkpoint introuvable : /g, "checkpoint not found: "],

  // agent_commands / settings_commands / worktree_commands / project_commands / git_commands
  [/l'agent de ce fil n'est pas démarré/g, "the agent for this thread is not started"],
  [/l'agent met trop de temps à répondre/g, "agent timed out"],
  [/la clé est vide/g, "API key is empty"],
  [/dossier de départ introuvable/g, "starting directory not found"],
  [/ce dossier n'est pas un dossier de travail de Kana/g, "this folder is not a Kana worktree"],
  [/ce n'est pas une branche de Kana/g, "this is not a Kana branch"],
  [/le dossier de travail contient du travail non enregistré/g, "the worktree contains uncommitted work"],
  [
    /la branche a des commits qui ne sont pas dans la branche principale/g,
    "the branch has commits not in the main branch",
  ],
  [/le nom du projet est vide/g, "project name is empty"],
  [/(.+?) existe déjà/g, (_m, p) => `${p} already exists`],
  [/commande de hook vide/g, "empty hook command"],
  [/dossier du hook introuvable : /g, "hook directory not found: "],
  [/hook expiré après (\d+) s/g, (_m, secs) => `hook timed out after ${secs}s`],
  [/impossible de lancer le hook : /g, "failed to start hook: "],
  [/hook terminé avec le code (-?\d+) : /g, (_m, code) => `hook exited with code ${code}: `],
  [/hook terminé avec le code (-?\d+)/g, (_m, code) => `hook exited with code ${code}`],
  [/impossible d'envoyer la notification : /g, "failed to send notification: "],
  [/terminal : /g, "terminal: "],
];

/** Traduit les messages d'erreur émis en français par les crates Rust / commandes Tauri lorsque la langue est `"en"`. */
export function translateRustError(err: unknown, locale: Locale = currentLocale): string {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  if (locale !== "en" || !raw) return raw;
  let translated = raw;
  for (const [pattern, replacement] of RUST_ERROR_RULES) {
    if (typeof replacement === "string") {
      translated = translated.replace(pattern, replacement);
    } else {
      translated = translated.replace(pattern, replacement);
    }
  }
  return translated;
}
