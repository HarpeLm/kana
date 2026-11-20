import { useCallback, useEffect, useRef, useState } from "react";
import { loadFilePreview, writeFile } from "../lib/files";

export interface OpenDoc {
  status: "loading" | "ready" | "error";
  error: string;
  /** Texte dans l'éditeur. */
  text: string;
  /** Texte tel qu'enregistré sur le disque. */
  saved: string;
  /** Date de modification vue à l'ouverture ou au dernier enregistrement. */
  modified: number;
  size: number;
  binary: boolean;
  truncated: boolean;
  saving: boolean;
  saveError: string;
  /** Le fichier a changé sur le disque depuis son ouverture : l'enregistrement a été refusé. */
  conflict: boolean;
}

export interface OpenTab {
  path: string;
  /** Onglet d'aperçu : remplacé par le prochain fichier ouvert, tant qu'on n'y a rien modifié. */
  preview: boolean;
}

const EMPTY: OpenDoc = {
  status: "loading",
  error: "",
  text: "",
  saved: "",
  modified: 0,
  size: 0,
  binary: false,
  truncated: false,
  saving: false,
  saveError: "",
  conflict: false,
};

export const isDocDirty = (doc: OpenDoc | undefined) => !!doc && doc.text !== doc.saved;

/** Les fichiers ouverts dans le volet : onglets, contenu, modifications et enregistrement. */
export function useOpenFiles(root?: string) {
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, OpenDoc>>({});

  // Les fonctions ci-dessous lisent l'état courant sans être recréées à chaque frappe.
  const tabsRef = useRef(tabs);
  const docsRef = useRef(docs);
  useEffect(() => {
    tabsRef.current = tabs;
    docsRef.current = docs;
  });

  const patchDoc = useCallback((path: string, change: (doc: OpenDoc) => OpenDoc) => {
    setDocs((all) => (all[path] ? { ...all, [path]: change(all[path]) } : all));
  }, []);

  const load = useCallback(async (path: string) => {
    setDocs((all) => ({ ...all, [path]: { ...EMPTY } }));
    try {
      const file = await loadFilePreview(path, root);
      setDocs((all) => ({
        ...all,
        [path]: {
          ...EMPTY,
          status: "ready",
          text: file.text,
          saved: file.text,
          modified: file.modified,
          size: file.size,
          binary: file.binary,
          truncated: file.truncated,
        },
      }));
    } catch (e) {
      setDocs((all) => ({ ...all, [path]: { ...EMPTY, status: "error", error: String(e) } }));
    }
  }, [root]);

  /** Ouvre un fichier ; `pin` le garde en onglet fixe au lieu d'un onglet d'aperçu. */
  const open = useCallback(
    (path: string, pin = false) => {
      setActivePath(path);
      const existing = tabsRef.current.find((t) => t.path === path);
      if (existing) {
        if (pin && existing.preview) {
          setTabs((all) => all.map((t) => (t.path === path ? { ...t, preview: false } : t)));
        }
        return;
      }
      const dirty = (p: string) => isDocDirty(docsRef.current[p]);
      setTabs((all) => [...all.filter((t) => !t.preview || dirty(t.path)), { path, preview: !pin }]);
      void load(path);
    },
    [load],
  );

  const setText = useCallback(
    (path: string, text: string) => {
      patchDoc(path, (doc) => (doc.text === text ? doc : { ...doc, text }));
      // Modifier un fichier le garde ouvert : l'onglet d'aperçu devient fixe.
      setTabs((all) => all.map((t) => (t.path === path && t.preview ? { ...t, preview: false } : t)));
    },
    [patchDoc, root],
  );

  /** Enregistre le fichier ; `force` écrase une version modifiée ailleurs. Renvoie le succès. */
  const save = useCallback(
    async (path: string, force = false): Promise<boolean> => {
      const doc = docsRef.current[path];
      if (!doc || doc.saving || doc.status !== "ready" || doc.truncated) return false;
      const text = doc.text;
      patchDoc(path, (d) => ({ ...d, saving: true, saveError: "", conflict: false }));
      try {
        const modified = await writeFile(path, text, force ? null : doc.modified, root);
        patchDoc(path, (d) => ({ ...d, saving: false, saved: text, modified }));
        return true;
      } catch (e) {
        const message = String(e);
        const conflict = message.includes("modifié ailleurs");
        patchDoc(path, (d) => ({
          ...d,
          saving: false,
          conflict,
          saveError: conflict ? "" : message,
        }));
        return false;
      }
    },
    [patchDoc],
  );

  const close = useCallback((path: string) => {
    const current = tabsRef.current;
    const index = current.findIndex((t) => t.path === path);
    const remaining = current.filter((t) => t.path !== path);
    const next = remaining[Math.min(index, remaining.length - 1)]?.path ?? null;
    setTabs(remaining);
    setActivePath((active) => (active === path ? next : active));
    setDocs((all) => {
      const { [path]: _removed, ...rest } = all;
      return rest;
    });
  }, []);

  return {
    tabs,
    activePath,
    docs,
    open,
    close,
    setText,
    save,
    reload: load,
    select: setActivePath,
    isDirty: (path: string) => isDocDirty(docs[path]),
  };
}
