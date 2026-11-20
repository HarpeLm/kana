import { useResizableWidth } from "./useResizableWidth";

/** Largeur de la barre latérale, réglable en tirant son bord droit. */
export function useSidebarWidth() {
  return useResizableWidth({
    storageKey: "kana-sidebar-width",
    min: 200,
    max: 480,
    fallback: 260,
    from: "left",
  });
}
