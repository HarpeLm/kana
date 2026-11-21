import { invoke } from "@tauri-apps/api/core";
import type { Conversation } from "./conversations";
import { inTauri } from "./env";
import type { ChatMessage } from "./chatState";

/**
 * Stockage des conversations. Dans l'app, tout est dans la base SQLite de Kana ; dans un
 * navigateur simple (essais), on retombe sur le stockage local du navigateur.
 */

const LOCAL_CONVERSATIONS = "kana-conversations";

export function loadLocalConversations(): Conversation[] | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_CONVERSATIONS) ?? "null");
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function parseFolders(raw: string | null | undefined): string[] | undefined {
  try {
    const list = JSON.parse(raw ?? "null");
    return Array.isArray(list) && list.length > 0 ? list.filter((p) => typeof p === "string") : undefined;
  } catch {
    return undefined;
  }
}

function parseEnvironment(raw: string | null | undefined): Conversation["environment"] {
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (
      parsed &&
      typeof parsed === "object" &&
      ["local", "ssh", "docker", "devcontainer"].includes(parsed.kind)
    ) {
      return {
        kind: parsed.kind,
        target: typeof parsed.target === "string" ? parsed.target : undefined,
        sandbox: typeof parsed.sandbox === "boolean" ? parsed.sandbox : undefined,
        readOnly: typeof parsed.readOnly === "boolean" ? parsed.readOnly : undefined,
      };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Les conversations enregistrées dans la base (liste vide si rien n'y a encore été rangé). */
export async function loadStoredConversations(): Promise<Conversation[]> {
  if (!inTauri) return loadLocalConversations() ?? [];
  const rows = await invoke<
    Array<
      Omit<Conversation, "openedAt" | "extraFolders" | "acpSessionId" | "environment" | "parentId" | "roleLabel"> & {
        openedAt: number | null;
        extraFolders: string | null;
        acpSessionId?: string | null;
        environment?: string | null;
        parentId?: string | null;
        roleLabel?: string | null;
      }
    >
  >("db_load_conversations");
  return rows.map((row) => ({
    ...row,
    openedAt: row.openedAt ?? undefined,
    worktree: row.worktree ?? undefined,
    branch: row.branch ?? undefined,
    forkedFrom: row.forkedFrom ?? undefined,
    forkContext: row.forkContext ?? undefined,
    projectPath: row.projectPath ?? undefined,
    useWorktree: row.useWorktree ?? true,
    modelId: row.modelId ?? undefined,
    extraFolders: parseFolders(row.extraFolders),
    acpSessionId: row.acpSessionId ?? undefined,
    environment: parseEnvironment(row.environment),
    parentId: row.parentId ?? undefined,
    roleLabel: row.roleLabel ?? undefined,
  }));
}

export async function saveStoredConversations(items: Conversation[]): Promise<void> {
  if (!inTauri) {
    try {
      localStorage.setItem(LOCAL_CONVERSATIONS, JSON.stringify(items));
    } catch {
      // stockage indisponible : la liste ne sera pas conservée
    }
    return;
  }
  await invoke("db_save_conversations", {
    items: items.map((c) => ({
      ...c,
      unread: c.unread ?? false,
      archived: c.archived ?? false,
      openedAt: c.openedAt ?? null,
      worktree: c.worktree ?? null,
      branch: c.branch ?? null,
      forkedFrom: c.forkedFrom ?? null,
      forkContext: c.forkContext ?? null,
      projectPath: c.projectPath ?? null,
      useWorktree: c.useWorktree ?? true,
      modelId: c.modelId ?? null,
      extraFolders: c.extraFolders?.length ? JSON.stringify(c.extraFolders) : null,
      acpSessionId: c.acpSessionId ?? null,
      environment: c.environment ? JSON.stringify(c.environment) : null,
      parentId: c.parentId ?? null,
      roleLabel: c.roleLabel ?? null,
    })),
  });
}

const messageKey = (id: string) => `kana-messages-${id}`;

export async function loadStoredMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!inTauri) {
    try {
      const parsed = JSON.parse(localStorage.getItem(messageKey(conversationId)) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const rows = await invoke<
    Array<{ id: string; role: ChatMessage["role"]; text: string; thought: string; tools: unknown; startedAt: number | null; endedAt: number | null }>
  >("db_load_messages", { conversationId });
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    text: row.text,
    thought: row.thought,
    tools: Array.isArray(row.tools) ? (row.tools as ChatMessage["tools"]) : [],
    startedAt: row.startedAt ?? undefined,
    endedAt: row.endedAt ?? undefined,
  }));
}

export interface StoredMessageHit {
  conversationId: string;
  messageId: string;
  role: string;
  snippet: string;
}

function makeLocalSnippet(text: string, thought: string, query: string): string {
  const source = text.toLowerCase().includes(query.toLowerCase()) || !thought.trim() ? text : thought;
  const clean = source.replace(/\s+/g, " ").trim();
  if (clean.length <= 140) return clean;
  const idx = clean.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return `${clean.slice(0, 120)}…`;
  const start = Math.max(0, idx - 40);
  const end = Math.min(clean.length, start + 120);
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}

/** Recherche plein texte dans les messages enregistrés (SQLite FTS5 côté Tauri, scan localStorage en navigateur). */
export async function searchStoredMessages(query: string, limit = 20): Promise<StoredMessageHit[]> {
  const trimmed = query.trim();
  if (!trimmed || limit <= 0) return [];
  if (inTauri) {
    return invoke<StoredMessageHit[]>("db_search_messages", { query: trimmed, limit });
  }
  const tokens = trimmed.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const hits: StoredMessageHit[] = [];
  const seenConv = new Set<string>();
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("kana-messages-")) keys.push(k);
    }
  } catch {
    return [];
  }
  const knownConvs = loadLocalConversations();
  const knownSet = knownConvs ? new Set(knownConvs.map((c) => c.id)) : null;

  for (const key of keys) {
    const conversationId = key.slice("kana-messages-".length);
    if (knownSet && !knownSet.has(conversationId)) continue;
    try {
      const parsed = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(parsed)) continue;
      for (const msg of parsed as ChatMessage[]) {
        const haystack = `${msg.text ?? ""}\n${msg.thought ?? ""}`.toLowerCase();
        if (!tokens.every((t) => haystack.includes(t))) continue;
        hits.push({
          conversationId,
          messageId: msg.id,
          role: msg.role,
          snippet: makeLocalSnippet(msg.text ?? "", msg.thought ?? "", tokens[0]),
        });
        seenConv.add(`${conversationId}:${msg.id}`);
        if (hits.length >= limit) return hits;
      }
    } catch {
      // conversation illisible ignorée
    }
  }
  void seenConv;
  return hits;
}

export async function saveStoredMessages(conversationId: string, messages: ChatMessage[]): Promise<void> {
  if (!inTauri) {
    try {
      localStorage.setItem(messageKey(conversationId), JSON.stringify(messages));
    } catch {
      // stockage plein ou indisponible : l'historique ne sera pas conservé
    }
    return;
  }
  await invoke("db_save_messages", {
    conversationId,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text,
      thought: m.thought,
      tools: m.tools,
      startedAt: m.startedAt ?? null,
      endedAt: m.endedAt ?? null,
    })),
  });
}
