import { sectionsOf, type Conversation } from "./conversations";
import type { ArtifactEntry } from "./artifactIndex";
import type { ScheduledTask } from "./schedule";
import type { StoredMessageHit } from "./store";

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
export const ACTION_TOGGLE_TERMINAL = "action:toggle-terminal";
export const ACTION_TOGGLE_DIFF = "action:toggle-diff";
export const ACTION_TOGGLE_FILES = "action:toggle-files";
export const ACTION_TOGGLE_ARTIFACTS = "action:toggle-artifacts";
export const ACTION_TOGGLE_BROWSER = "action:toggle-browser";
export const ACTION_TOGGLE_SESSION = "action:toggle-session";
export const ACTION_CYCLE_MODE = "action:cycle-mode";
export const ACTION_OPEN_RELAY = "action:open-relay";

export interface SearchItem {
  /** `conversation:<id>`, `project:<nom>`, `message:<conv>:<msg>` ou `action:<nom>`. */
  id: string;
  kind: "conversation" | "project" | "action" | "artifact" | "scheduled" | "message";
  title: string;
  /** Texte discret à côté du titre (le projet, le nombre de conversations). */
  hint?: string;
  /** Pour un artéfact : la page à ouvrir et à prévisualiser. */
  artifact?: ArtifactEntry;
  /** Pour un résultat de message plein texte : la conversation à ouvrir. */
  conversationId?: string;
}

export interface SearchSection {
  name: string;
  items: SearchItem[];
}

const ACTIONS: SearchItem[] = [
  { id: ACTION_NEW, kind: "action", title: "Nouvelle conversation", hint: "⌘N" },
  { id: ACTION_SETTINGS, kind: "action", title: "Ouvrir les réglages", hint: "⌘," },
  { id: ACTION_TOGGLE_TERMINAL, kind: "action", title: "Afficher / masquer le terminal", hint: "⌘J" },
  { id: ACTION_TOGGLE_DIFF, kind: "action", title: "Afficher / masquer le diff", hint: "⇧⌘D" },
  { id: ACTION_TOGGLE_FILES, kind: "action", title: "Afficher / masquer les fichiers", hint: "⇧⌘E" },
  { id: ACTION_TOGGLE_ARTIFACTS, kind: "action", title: "Afficher / masquer les artéfacts", hint: "⇧⌘A" },
  { id: ACTION_TOGGLE_BROWSER, kind: "action", title: "Afficher / masquer le Globe", hint: "⇧⌘G" },
  { id: ACTION_TOGGLE_SESSION, kind: "action", title: "Afficher / masquer le panneau de session", hint: "⇧⌘P" },
  { id: ACTION_CYCLE_MODE, kind: "action", title: "Changer le mode d'autorisation", hint: "⇧⌘M" },
  { id: ACTION_OPEN_RELAY, kind: "action", title: "Ouvrir le relais de quota" },
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

const artifactItem = (a: ArtifactEntry): SearchItem => ({
  id: `artifact:${a.key}`,
  kind: "artifact",
  title: a.title,
  hint: a.project,
  artifact: a,
});

const scheduledItem = (t: ScheduledTask): SearchItem => ({
  id: `scheduled:${t.id}`,
  kind: "scheduled",
  title: t.title,
  hint: `${t.interval} · ${t.agentId}${t.enabled ? "" : " · en pause"}`,
});

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

function messageItem(hit: StoredMessageHit, conversations: Conversation[]): SearchItem {
  const conv = conversations.find((c) => c.id === hit.conversationId);
  const convLabel = conv ? `${conv.title} · ${conv.project}` : hit.conversationId;
  return {
    id: `message:${hit.conversationId}:${hit.messageId}`,
    kind: "message",
    title: hit.snippet,
    hint: convLabel,
    conversationId: hit.conversationId,
  };
}

/** Sections affichées dans la fenêtre de recherche selon le texte saisi et l'onglet. */
export function buildSections(
  conversations: Conversation[],
  query: string,
  tab: SearchTab,
  artifacts: ArtifactEntry[] = [],
  scheduledTasks: ScheduledTask[] = [],
  messageHits: StoredMessageHit[] = [],
): SearchSection[] {
  const needle = query.trim().toLowerCase();
  const matches = (text: string) => text.toLowerCase().includes(needle);
  if (tab === "scheduled") {
    const list = scheduledTasks.filter(
      (t) => !needle || matches(t.title) || matches(t.prompt) || matches(t.agentId),
    );
    return list.length > 0 ? [{ name: "Tâches planifiées", items: list.map(scheduledItem) }] : [];
  }
  if (tab === "artifacts") {
    const list = artifacts.filter((a) => !needle || matches(a.title) || matches(a.project));
    return list.length > 0 ? [{ name: needle ? "Artéfacts" : "Récents", items: list.map(artifactItem) }] : [];
  }
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
    if (tab === "all") add("Artéfacts", artifacts.slice(0, 4).map(artifactItem));
    if (tab === "all" && scheduledTasks.length > 0) {
      add("Tâches planifiées", scheduledTasks.slice(0, 4).map(scheduledItem));
    }
    if (tab === "all") add("Actions", ACTIONS);
    return sections;
  }

  if (tab === "all" || tab === "sessions") {
    add("Sessions", conversations.filter((c) => matches(c.title)).map(conversationItem));
    if (messageHits.length > 0) {
      add("Messages", messageHits.map((hit) => messageItem(hit, conversations)));
    }
  }
  if (tab === "all" || tab === "projects") {
    add("Projets", projectItems(projects.filter(matches), conversations));
  }
  if (tab === "all") add("Artéfacts", artifacts.filter((a) => matches(a.title)).map(artifactItem));
  if (tab === "all") {
    add(
      "Tâches planifiées",
      scheduledTasks
        .filter((t) => matches(t.title) || matches(t.prompt))
        .map(scheduledItem),
    );
  }
  if (tab === "all") add("Actions", ACTIONS.filter((a) => matches(a.title) || (a.hint ? matches(a.hint) : false)));
  return sections;
}
