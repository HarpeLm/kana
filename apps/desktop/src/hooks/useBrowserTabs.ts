import { useCallback, useState } from "react";
import { hostOf } from "../lib/address";

export interface BrowserTab {
  id: string;
  /** Titre de la page, ou son domaine tant qu'elle n'en a pas. */
  title: string;
  url: string;
  loading: boolean;
}

export const HOME_URL = "https://duckduckgo.com";

const makeTab = (n: number, url: string): BrowserTab => ({
  id: `b${n}`,
  title: hostOf(url),
  url,
  loading: false,
});

/** Onglets du Globe : adresse, titre et chargement de chacun. */
export function useBrowserTabs() {
  const [state, setState] = useState({ tabs: [makeTab(1, HOME_URL)], activeId: "b1", next: 2 });

  const patch = useCallback((id: string, change: Partial<BrowserTab>) => {
    setState((s) => ({ ...s, tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...change } : t)) }));
  }, []);

  const add = useCallback((url: string = HOME_URL) => {
    setState((s) => {
      const tab = makeTab(s.next, url);
      return { tabs: [...s.tabs, tab], activeId: tab.id, next: s.next + 1 };
    });
  }, []);

  const select = useCallback((id: string) => setState((s) => ({ ...s, activeId: id })), []);

  /**
   * Ferme un onglet et active son voisin. Fermer le dernier le remplace par un onglet neuf :
   * le volet en a toujours un quand on le rouvre.
   */
  const close = useCallback((id: string) => {
    setState((s) => {
      if (s.tabs.length <= 1) {
        const tab = makeTab(s.next, HOME_URL);
        return { tabs: [tab], activeId: tab.id, next: s.next + 1 };
      }
      const index = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeId = s.activeId === id ? tabs[Math.max(0, index - 1)].id : s.activeId;
      return { ...s, tabs, activeId };
    });
  }, []);

  const setUrl = useCallback((id: string, url: string) => patch(id, { url }), [patch]);
  const setTitle = useCallback((id: string, title: string) => patch(id, { title }), [patch]);
  const setLoading = useCallback((id: string, loading: boolean) => patch(id, { loading }), [patch]);

  return { tabs: state.tabs, activeId: state.activeId, add, select, close, setUrl, setTitle, setLoading };
}
