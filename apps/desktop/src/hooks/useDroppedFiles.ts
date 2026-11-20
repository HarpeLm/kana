import { useEffect, useRef, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { inTauri } from "../lib/env";

/**
 * Fichiers déposés sur la fenêtre depuis le Finder. `dragging` est vrai tant qu'un fichier
 * survole la fenêtre, pour que l'interface montre où il va atterrir.
 */
export function useDroppedFiles(onFiles: (paths: string[]) => void) {
  const [dragging, setDragging] = useState(false);
  const handler = useRef(onFiles);
  useEffect(() => {
    handler.current = onFiles;
  });

  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const { type } = event.payload;
        if (type === "enter" || type === "over") setDragging(true);
        else setDragging(false);
        if (type === "drop" && event.payload.paths.length > 0) handler.current(event.payload.paths);
      })
      .then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  return dragging;
}
