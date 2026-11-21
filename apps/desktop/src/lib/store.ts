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
