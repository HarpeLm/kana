import { useEffect } from "react";

/**
 * Retire le menu contextuel du navigateur (« Reload », « Inspect Element »), qui n'a rien à faire dans
 * une app. Il reste dans les champs de saisie et sur du texte sélectionné, pour copier et coller.
 */
export function useNativeContextMenu() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea")) return;
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);
}
