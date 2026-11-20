import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Position et taille d'une vue native, en pixels logiques dans la fenêtre. */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const openBrowser = (id: string, url: string, bounds: Bounds) =>
  invoke<void>("browser_open", { id, url, bounds });
export const setBrowserBounds = (id: string, bounds: Bounds) =>
  invoke<void>("browser_set_bounds", { id, bounds });
export const setBrowserVisible = (id: string, visible: boolean) =>
  invoke<void>("browser_set_visible", { id, visible });
export const navigateBrowser = (id: string, url: string) =>
  invoke<void>("browser_navigate", { id, url });
export const backBrowser = (id: string) => invoke<void>("browser_back", { id });
export const forwardBrowser = (id: string) => invoke<void>("browser_forward", { id });
export const reloadBrowser = (id: string) => invoke<void>("browser_reload", { id });
export const closeBrowser = (id: string) => invoke<void>("browser_close", { id });

export interface BrowserHandlers {
  onNavigated: (id: string, url: string) => void;
  onTitle: (id: string, title: string) => void;
  onLoading: (id: string, loading: boolean) => void;
  /** Un lien voulait ouvrir une nouvelle fenêtre : Kana en fait un onglet. */
  onNewTab: (url: string) => void;
}

/** Écoute ce que font les pages (adresse, titre, chargement, nouvelle fenêtre). */
export async function listenBrowser(handlers: BrowserHandlers): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen<{ id: string; url: string }>("browser-navigated", (e) =>
      handlers.onNavigated(e.payload.id, e.payload.url),
    ),
    listen<{ id: string; title: string }>("browser-title", (e) =>
      handlers.onTitle(e.payload.id, e.payload.title),
    ),
    listen<{ id: string; loading: boolean }>("browser-loading", (e) =>
      handlers.onLoading(e.payload.id, e.payload.loading),
    ),
    listen<{ id: string; url: string }>("browser-new-tab", (e) => handlers.onNewTab(e.payload.url)),
  ]);
  return () => unlisteners.forEach((off) => off());
}
