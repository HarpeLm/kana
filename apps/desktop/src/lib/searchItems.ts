import { sectionsOf, type Conversation } from "./conversations";

export type SearchTab = "all" | "sessions" | "projects" | "artifacts" | "scheduled";

export const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "sessions", label: "Sessions" },
  { id: "projects", label: "Projets" },
  { id: "artifacts", label: "Artéfacts" },
  { id: "scheduled", label: "Tâches planifiées" },
];

export const ACTION_NEW = "action:new";
export const ACTION_SETTINGS = "action:settings";

export interface SearchItem {
  /** `conversation:<id>`, `project:<nom>` ou `action:<nom>`. */
  id: string;
  kind: "conversation" | "project" | "action";
  title: string;
  /** Texte discret à côté du titre (le projet, le nombre de conversations). */
  hint?: string;
}

export interface SearchSection {
  name: string;
  items: SearchItem[];
}

const ACTIONS: SearchItem[] = [
  { id: ACTION_NEW, kind: "action", title: "Nouvelle conversation" },
  { id: ACTION_SETTINGS, kind: "action", title: "Ouvrir les réglages" },
];

const RECENT_COUNT = 6;

function conversationItem(c: Conversation): SearchItem {
  return {
    id: `conversation:${c.id}`,
    kind: "conversation",
    title: c.title,
    hint: c.archived ? `${c.project} · archivée` : c.project,
  };
}

function projectItems(names: string[], conversations: Conversation[]): SearchItem[] {
  return names.map((name) => {
    const count = conversations.filter((c) => c.project === name).length;
    return {
      id: `project:${name}`,
      kind: "project",
      title: name,
      hint: `${count} conversation${count > 1 ? "s" : ""}`,
    };
  });
}

/** Sections affichées dans la fenêtre de recherche selon le texte saisi et l'onglet. */
export function buildSections(
  conversations: Conversation[],
  query: string,
  tab: SearchTab,
): SearchSection[] {
  // Les artéfacts et les tâches planifiées n'existent pas encore.
  if (tab === "artifacts" || tab === "scheduled") return [];

  const needle = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(needle);
  const sections: SearchSection[] = [];
  const add = (name: string, items: SearchItem[]) => {
    if (items.length > 0) sections.push({ name, items });
  };

  const live = conversations.filter((c) => !c.archived);
  const recent = [...live].sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
  const projects = sectionsOf(conversations);

  if (!needle) {
    if (tab === "projects") {
      add("Projets", projectItems(projects, conversations));
      return sections;
    }
    if (tab === "all") add("Nécessite votre attention", live.filter((c) => c.unread).map(conversationItem));
    const list = tab === "all" ? recent.filter((c) => !c.unread).slice(0, RECENT_COUNT) : recent;
    add("Récents", list.map(conversationItem));
    if (tab === "all") add("Actions", ACTIONS);
    return sections;
  }

  if (tab === "all" || tab === "sessions") {
    add("Sessions", conversations.filter((c) => matches(c.title)).map(conversationItem));
  }
  if (tab === "all" || tab === "projects") {
    add("Projets", projectItems(projects.filter(matches), conversations));
  }
  if (tab === "all") add("Actions", ACTIONS.filter((a) => matches(a.title)));
  return sections;
}
