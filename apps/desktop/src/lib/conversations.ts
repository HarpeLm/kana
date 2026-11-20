export interface Conversation {
  id: string;
  title: string;
  /** Nom du groupe dans la barre latérale (le projet). */
  project: string;
  /** Identifiant du préréglage ACP côté Rust. */
  agentId: string;
  pinned: boolean;
  /** Marquée « non lue » : un point s'affiche jusqu'à son ouverture. */
  unread?: boolean;
  /** Rangée dans « Archivées » au lieu de son projet. */
  archived?: boolean;
}

export const DEFAULT_PROJECT = "kana";
export const DEFAULT_AGENT = "opencode";
export const PINNED_GROUP = "Épinglés";
export const ARCHIVED_GROUP = "Archivées";

const SEED: Conversation[] = [
  { id: "c1", title: "feat/acp-client", project: DEFAULT_PROJECT, agentId: "codex", pinned: false },
  { id: "c2", title: "fix/failover-router", project: DEFAULT_PROJECT, agentId: "claude", pinned: false },
  { id: "c3", title: "feat/sqlite-store", project: DEFAULT_PROJECT, agentId: "gemini", pinned: false },
  { id: "c4", title: "chore/opencode-test", project: DEFAULT_PROJECT, agentId: "opencode", pinned: false },
];

const STORAGE_KEY = "kana-conversations";

export function makeConversation(project: string, agentId: string): Conversation {
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return { id, title: "Nouvelle conversation", project, agentId, pinned: false };
}

export function loadConversations(): Conversation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // stockage indisponible ou corrompu : on repart des exemples
  }
  return SEED;
}

export function saveConversations(items: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // stockage indisponible : la liste ne sera pas conservée
  }
}

export interface ConversationGroup {
  name: string;
  items: Conversation[];
}

/** Noms des projets (sections) existants, dans l'ordre d'apparition. */
export function sectionsOf(items: Conversation[]): string[] {
  return Array.from(new Set(items.map((c) => c.project)));
}

/**
 * Épinglés d'abord, puis un groupe par projet dans l'ordre d'apparition, puis Archivées ;
 * filtre sur le titre.
 */
export function groupConversations(items: Conversation[], query: string): ConversationGroup[] {
  const needle = query.trim().toLowerCase();
  const visible = items.filter((c) => !needle || c.title.toLowerCase().includes(needle));
  const active = visible.filter((c) => !c.archived);

  const groups: ConversationGroup[] = [];
  const pinned = active.filter((c) => c.pinned);
  if (pinned.length > 0) groups.push({ name: PINNED_GROUP, items: pinned });

  for (const conversation of active.filter((c) => !c.pinned)) {
    const group = groups.find((g) => g.name === conversation.project && g.name !== PINNED_GROUP);
    if (group) group.items.push(conversation);
    else groups.push({ name: conversation.project, items: [conversation] });
  }

  const archived = visible.filter((c) => c.archived);
  if (archived.length > 0) groups.push({ name: ARCHIVED_GROUP, items: archived });
  return groups;
}

/** Échange la conversation avec la suivante du même groupe ; renvoie la liste inchangée s'il n'y en a pas. */
export function moveDown(items: Conversation[], id: string): Conversation[] {
  const index = items.findIndex((c) => c.id === id);
  if (index < 0) return items;
  const current = items[index];
  const sameGroup = (other: Conversation) =>
    !other.archived === !current.archived &&
    other.pinned === current.pinned &&
    (current.pinned || other.project === current.project);
  const next = items.findIndex((c, i) => i > index && sameGroup(c));
  if (next < 0) return items;
  const copy = [...items];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}
