import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import type { ArtifactEntry } from "../lib/artifactIndex";
import { tr, useLocale } from "../lib/i18n";
import { relativeTime } from "../lib/relativeTime";
import { loadScheduledTasks } from "../lib/schedule";
import { searchStoredMessages, type StoredMessageHit } from "../lib/store";
import ArtifactThumb from "./ArtifactThumb";
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
  artifacts: ArtifactEntry[];
  onOpenArtifact: (item: ArtifactEntry) => void;
  onArtifactMenu: (item: ArtifactEntry, x: number, y: number) => void;
  onOpenScheduled?: () => void;
  onAction?: (actionId: string) => void;
  onCreate?: () => void;
  onOpenSettings?: () => void;
  onClose: () => void;
}

/** Fenêtre de recherche : conversations, projets et actions, avec navigation au clavier. */
export default function SearchPalette({
  conversations,
  artifacts,
  onOpenArtifact,
  onArtifactMenu,
  onOpenConversation,
  onOpenScheduled,
  onAction,
  onCreate,
  onOpenSettings,
  onClose,
}: SearchPaletteProps) {
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<SearchTab>("all");
  const [index, setIndex] = useState(0);
  const [messageHits, setMessageHits] = useState<StoredMessageHit[]>([]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setMessageHits([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      void searchStoredMessages(trimmed, 15)
        .then((hits) => {
          if (active) setMessageHits(hits);
        })
        .catch(() => {
          if (active) setMessageHits([]);
        });
    }, 60);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const scheduledTasks = useMemo(() => loadScheduledTasks(), []);
  const sections = useMemo(
    () => buildSections(conversations, query, tab, artifacts, scheduledTasks, messageHits),
    [conversations, query, tab, artifacts, scheduledTasks, messageHits],
  );
  const items = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  useEffect(() => setIndex(0), [query, tab]);

  const choose = (item: SearchItem) => {
    onClose();
    if (item.kind === "artifact" && item.artifact) {
      onOpenArtifact(item.artifact);
    } else if (item.kind === "scheduled") {
      onOpenScheduled?.();
    } else if (item.kind === "message" && item.conversationId) {
      onOpenConversation(item.conversationId);
    } else if (item.kind === "conversation") {
      onOpenConversation(item.id.slice("conversation:".length));
    } else if (item.kind === "project") {
      const name = item.id.slice("project:".length);
      const latest = conversations
        .filter((c) => c.project === name)
        .sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0))[0];
      if (latest) onOpenConversation(latest.id);
    } else if (item.kind === "action") {
      if (onAction) onAction(item.id);
      else if (item.id === ACTION_NEW) onCreate?.();
      else onOpenSettings?.();
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
  const previewed = items[index]?.artifact;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/55 p-4 pt-[18vh]"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-[670px]">
      {previewed && (
        <div className="pointer-events-none absolute left-full top-[130px] z-10 ml-3 hidden w-[330px] overflow-hidden rounded-2xl border border-[#3a3a37] bg-[#2b2b29] p-2 shadow-[0_20px_50px_rgba(0,0,0,0.6)] xl:block">
          <ArtifactThumb html={previewed.html} className="aspect-[4/3] w-full rounded-lg" />
          <p className="px-2 pb-1 pt-2 text-[13px] text-[#9a9992]">Artéfact · {relativeTime(previewed.modified)}</p>
        </div>
      )}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Rechercher", "Search", locale)}
        className="flex max-h-[70vh] w-full flex-col overflow-hidden rounded-2xl border border-[#3a3a37] bg-[#2b2b29] shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
      >
        <div className="space-y-3 border-b border-[#343430] px-6 pb-3 pt-4">
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Rechercher", "Search", locale)}
              aria-label={tr("Rechercher", "Search", locale)}
              className="min-w-0 flex-1 bg-transparent text-[16px] text-[#f0efe9] placeholder-[#8a8982] outline-none select-text"
            />
            <button
              onClick={onClose}
              title={tr("Fermer", "Close", locale)}
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
                ? tr("Rien à afficher pour l'instant.", "Nothing to show yet.", locale)
                : tr("Aucun résultat.", "No results.", locale)}
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
                    onContextMenu={
                      item.artifact
                        ? (e) => {
                            e.preventDefault();
                            onArtifactMenu(item.artifact!, e.clientX, e.clientY);
                          }
                        : undefined
                    }
                  />
                );
              })}
            </section>
          ))}
        </div>

        <SearchFooter />
      </div>
      </div>
    </div>
  );
}
