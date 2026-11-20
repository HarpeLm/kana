import { useCallback, useEffect, useRef, useState } from "react";
import {
  answerPermission,
  cancelPrompt,
  onAgentEvent,
  sendPrompt,
  startAgent,
} from "../lib/acp";
import {
  EMPTY_CHAT,
  addError,
  addUserMessage,
  applyEvent,
  type ChatMessage,
  type ChatState,
} from "../lib/chatState";
import { loadStoredMessages, saveStoredMessages } from "../lib/store";
import { autoAnswer, promptFor, type PermissionMode } from "../lib/permissionMode";

/** Ce qu'il faut préparer avant d'envoyer le premier message d'un fil. */
export interface PreparedThread {
  /** Dossier de travail de l'agent (le worktree de la conversation). */
  cwd?: string;
  /** Texte à placer devant le message (contexte d'une bifurcation). */
  preface?: string;
  /** Modèle choisi pour la conversation. */
  model?: string;
}

/** Un outil resté « en cours » quand l'app s'est arrêtée n'a jamais fini : on le montre comme interrompu. */
function settled(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    tools: m.tools.map((t) => (t.status === "pending" || t.status === "in_progress" ? { ...t, status: "failed" } : t)),
    endedAt: m.role === "agent" ? (m.endedAt ?? m.startedAt) : m.endedAt,
  }));
}

/**
 * Conversation d'un fil avec son agent ACP. L'état de chaque fil est conservé séparément, relu de
 * la base à l'ouverture du fil et enregistré un court instant après chaque changement.
 */
export function useChat(
  threadId: string,
  agentId: string,
  mode: PermissionMode,
  prepare: (threadId: string) => Promise<PreparedThread>,
) {
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const loaded = useRef(new Set<string>());
  const saved = useRef(new Map<string, ChatMessage[]>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const prepareRef = useRef(prepare);
  useEffect(() => {
    prepareRef.current = prepare;
  });

  // Ouvrir un fil relit son historique dans la base.
  useEffect(() => {
    if (loaded.current.has(threadId)) return;
    loaded.current.add(threadId);
    loadStoredMessages(threadId)
      .then((messages) => {
        if (messages.length === 0) return;
        const restored = settled(messages);
        saved.current.set(threadId, restored);
        setChats((all) => {
          const current = all[threadId];
          // Un message déjà écrit pendant le chargement l'emporte : on ne l'écrase pas.
          if (current && current.messages.length > 0) return all;
          return { ...all, [threadId]: { ...(current ?? EMPTY_CHAT), messages: restored } };
        });
      })
      .catch(() => {});
  }, [threadId]);

  // Chaque fil modifié est enregistré, un court instant après son dernier changement.
  useEffect(() => {
    for (const [id, chat] of Object.entries(chats)) {
      if (!loaded.current.has(id) || saved.current.get(id) === chat.messages) continue;
      clearTimeout(timers.current.get(id));
      timers.current.set(
        id,
        setTimeout(() => {
          saved.current.set(id, chat.messages);
          void saveStoredMessages(id, chat.messages).catch(() => {});
        }, 400),
      );
    }
  }, [chats]);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  });

  const update = useCallback((id: string, change: (chat: ChatState) => ChatState) => {
    setChats((all) => ({ ...all, [id]: change(all[id] ?? EMPTY_CHAT) }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    onAgentEvent((event) => {
      // Selon le mode choisi, certaines autorisations sont accordées sans déranger l'utilisateur.
      if (event.kind === "permission") {
        const optionId = autoAnswer(modeRef.current, event);
        if (optionId) {
          answerPermission(event.threadId, event.request_id, optionId).catch(() => {});
          return;
        }
      }
      update(event.threadId, (chat) => applyEvent(chat, event));
    }).then(
      (off) => (cancelled ? off() : (unlisten = off)),
    );
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [update]);

  const send = useCallback(
    async (text: string) => {
      update(threadId, (chat) => addUserMessage(chat, text));
      try {
        const { cwd, preface, model } = await prepareRef.current(threadId);
        await startAgent(threadId, agentId, cwd, model);
        await sendPrompt(threadId, promptFor(modeRef.current, preface ? `${preface}${text}` : text));
      } catch (error) {
        update(threadId, (chat) => addError(chat, String(error)));
      }
    },
    [threadId, agentId, update],
  );

  const stop = useCallback(() => {
    cancelPrompt(threadId).catch(() => {});
  }, [threadId]);

  const answer = useCallback(
    (requestId: string, optionId: string | null) => {
      update(threadId, (chat) => ({
        ...chat,
        permissions: chat.permissions.filter((p) => p.requestId !== requestId),
      }));
      answerPermission(threadId, requestId, optionId).catch(() => {});
    },
    [threadId, update],
  );

  /** Donne à un fil neuf un début d'historique (la copie faite par « bifurquer »). */
  const seed = useCallback((id: string, messages: ChatMessage[]) => {
    loaded.current.add(id);
    setChats((all) => ({ ...all, [id]: { ...EMPTY_CHAT, messages } }));
  }, []);

  return { chat: chats[threadId] ?? EMPTY_CHAT, send, stop, answer, seed };
}
