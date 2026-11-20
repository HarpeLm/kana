import type { Conversation, ConversationGroup } from "./conversations";
import { ARCHIVED_GROUP, PINNED_GROUP } from "./conversations";

/** Comment la liste de la barre latérale est présentée. */
export interface SidebarView {
  groupBy: "folder" | "none";
  /** `manual` : l'ordre où l'utilisateur les a rangées (glisser-déposer). */
  sortBy: "manual" | "activity" | "name";
  show: "all" | "unread" | "pinned";
}

export const DEFAULT_VIEW: SidebarView = { groupBy: "folder", sortBy: "manual", show: "all" };

const KEY = "kana-sidebar-view";

export function loadView(): SidebarView {
  try {
    return { ...DEFAULT_VIEW, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEFAULT_VIEW;
  }
}

export function saveView(view: SidebarView): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    // stockage indisponible : le choix ne sera pas conservé
  }
}

export const isDefaultView = (view: SidebarView) =>
  view.groupBy === DEFAULT_VIEW.groupBy && view.sortBy === DEFAULT_VIEW.sortBy && view.show === DEFAULT_VIEW.show;

export const GROUP_BY_LABELS: Record<SidebarView["groupBy"], string> = { folder: "Dossier", none: "Aucun" };
export const SORT_BY_LABELS: Record<SidebarView["sortBy"], string> = {
  manual: "Mon ordre",
  activity: "Dernière activité",
  name: "Nom",
};
export const SHOW_LABELS: Record<SidebarView["show"], string> = { all: "Toutes", unread: "Non lues", pinned: "Épinglées" };

/** Filtre et trie les conversations selon la vue. L'archive reste visible dans tous les cas. */
export function applyView(items: Conversation[], view: SidebarView): Conversation[] {
  const shown = items.filter(
    (c) => c.archived || view.show === "all" || (view.show === "unread" ? c.unread : c.pinned),
  );
  if (view.sortBy === "manual") return shown;
  const sorted = [...shown];
  if (view.sortBy === "name") sorted.sort((a, b) => a.title.localeCompare(b.title, "fr"));
  else sorted.sort((a, b) => (b.openedAt ?? 0) - (a.openedAt ?? 0));
  return sorted;
}

/** Sans regroupement : les épinglées, puis toutes les autres ensemble, puis les archivées. */
export function flatGroups(groups: ConversationGroup[]): ConversationGroup[] {
  const pinned = groups.filter((g) => g.name === PINNED_GROUP);
  const archived = groups.filter((g) => g.name === ARCHIVED_GROUP);
  const rest = groups.filter((g) => g.name !== PINNED_GROUP && g.name !== ARCHIVED_GROUP).flatMap((g) => g.items);
  return [...pinned, ...(rest.length > 0 ? [{ name: "Conversations", items: rest }] : []), ...archived];
}
