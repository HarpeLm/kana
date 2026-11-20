import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import {
  ACTION_NEW,
  SEARCH_TABS,
  buildSections,
  type SearchItem,
  type SearchTab,
} from "../lib/searchItems";
import SearchFooter from "./SearchFooter";
import SearchResultRow from "./SearchResultRow";
import SearchTabs from "./SearchTabs";

interface SearchPaletteProps {
  conversations: Conversation[];
  onOpenConversation: (id: string) => void;
  onCreate: () => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

/** Fenêtre de recherche : conversations, projets et actions, avec navigation au clavier. */
export default function SearchPalette({
  conversations,
  onOpenConversation,
  onCreate,
  onOpenSettings,
  onClose,
}: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [index, setIndex] = useState(0);

  const sections = useMemo(() => buildSections(conversations, query, tab), [conversations, query, tab]);
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => setIndex(0), [query, tab]);

  const choose = (item: SearchItem) => {
    onClose();
    if (item.kind === "conversation") {
      onOpenConversation(item.id.slice("conversation:".length));
    } else if (item.kind === "project") {
      const name = item.id.slice("project:".length);
      const latest = conversations
        .filter((c) => c.project === name)
        .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))[0];
      if (latest) onOpenConversation(latest.id);
    } else if (item.id === ACTION_NEW) {
      onCreate();
    } else {
      onOpenSettings();
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const move = (delta: number) => {
        event.preventDefault();
        if (items.length > 0) setIndex((i) => (i + delta + items.length) % items.length);
      };
      switch (event.key) {
        case "Escape":
          return onClose();
        case "ArrowDown":
          return move(1);
        case "ArrowUp":
          return move(-1);
        case "Enter":
          if (items[index]) {
            event.preventDefault();
            choose(items[index]);
          }
          return;
        case "ArrowLeft":
        case "ArrowRight": {
          // Dans le champ vide seulement : sinon les flèches déplacent le curseur de saisie.
          if (query !== "") return;
          event.preventDefault();
          const at = SEARCH_TABS.findIndex((t) => t.id === tab);
          const next = (at + (event.key === "ArrowRight" ? 1 : -1) + SEARCH_TABS.length) % SEARCH_TABS.length;
          setTab(SEARCH_TABS[next].id);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  let position = -1;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 p-4 pt-[18vh]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rechercher"
        className="flex max-h-[70vh] w-full max-w-[670px] flex-col overflow-hidden rounded-2xl border border-[#3a3a37] bg-[#2b2b29] shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="space-y-3 border-b border-[#343430] px-6 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              aria-label="Rechercher"
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[#f0efe9] placeholder-[#8a8982] outline-none select-text"
            />
            <button
              onClick={onClose}
              title="Fermer"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#c4c3bc] transition hover:bg-[#383835] hover:text-[#f0efe9]"
            >
              <X className="h-[18px] w-[18px]" strokeWidth={1.6} />
            </button>
          </div>
          <SearchTabs value={tab} onChange={setTab} />
        </div>

        <div role="listbox" className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {items.length === 0 && (
            <p className="px-4 py-8 text-center text-[14px] text-[#8a8982]">
              {tab === "artifacts" || tab === "scheduled"
                ? "Rien à afficher pour l'instant."
                : "Aucun résultat."}
            </p>
          )}
          {sections.map((section) => (
            <section key={section.name} className="pb-2">
              <h3 className="px-4 pb-1 pt-2 text-[13px] text-[#8a8982]">{section.name}</h3>
              {section.items.map((item) => {
                position += 1;
                const at = position;
                return (
                  <SearchResultRow
                    key={item.id}
                    item={item}
                    active={at === index}
                    onHover={() => setIndex(at)}
                    onChoose={() => choose(item)}
                  />
                );
              })}
            </section>
          ))}
        </div>

        <SearchFooter />
      </div>
    </div>
  );
}
