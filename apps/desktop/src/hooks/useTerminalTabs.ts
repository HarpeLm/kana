import { useCallback, useState } from "react";

export interface TerminalTab {
  /** Identifiant du shell côté Rust. */
  id: string;
  title: string;
}

const makeTab = (n: number): TerminalTab => ({
  id: `terminal-${n}`,
  title: n === 1 ? "Terminal" : `Terminal ${n}`,
});

/** Onglets du volet Terminal : un shell par onglet. */
export function useTerminalTabs() {
  const [state, setState] = useState({ tabs: [makeTab(1)], activeId: "terminal-1", next: 2 });

  const add = useCallback(() => {
    setState((s) => {
      const tab = makeTab(s.next);
      return { tabs: [...s.tabs, tab], activeId: tab.id, next: s.next + 1 };
    });
  }, []);

  const select = useCallback((id: string) => setState((s) => ({ ...s, activeId: id })), []);

  /** Ferme un onglet (le dernier reste) et active son voisin. */
  const close = useCallback((id: string) => {
    setState((s) => {
      if (s.tabs.length <= 1) return s;
      const index = s.tabs.findIndex((t) => t.id === id);
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeId = s.activeId === id ? tabs[Math.max(0, index - 1)].id : s.activeId;
      return { ...s, tabs, activeId };
    });
  }, []);

  return { tabs: state.tabs, activeId: state.activeId, add, select, close };
}
