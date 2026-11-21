import { useCallback, useEffect, useRef, useState } from "react";
import {
  answerPermission,
  cancelPrompt,
  onAgentEvent,
  sendPrompt,
  setPlanMode,
  startAgent,
} from "../lib/acp";
import {
  EMPTY_CHAT,
  addError,
  addUserMessage,
  applyEvent,
  enqueueMessage,
  prioritizeQueuedMessage,
  removeQueuedMessage,
  type ChatMessage,
  type ChatState,
} from "../lib/chatState";
import { imagePathsIn } from "../lib/attachments";
import { buildResumeContext } from "../lib/fork";
import { loadStoredMessages, saveStoredMessages } from "../lib/store";
import { autoAnswer, promptFor, type PermissionMode } from "../lib/permissionMode";

/** Ce que l'appli veut savoir de ce qui se passe dans les fils (consommation, limites). */
export interface ChatObserver {
  onTurnUsage?: (threadId: string, usage: { input: number; output: number; total: number }) => void;
  onDone?: (threadId: string) => void;
  onError?: (threadId: string, message: string) => void;
  onSession?: (threadId: string, sessionId: string) => void;
}

/** Ce qu'il faut préparer avant d'envoyer le premier message d'un fil. */
export interface PreparedThread {
  /** Dossier de travail de l'agent (le worktree de la conversation). */
  cwd?: string;
  /** Texte à placer devant le message (contexte d'une bifurcation). */
  preface?: string;
  /** Un résumé est à transmettre (relais, bifurcation) : le nouvel agent doit le recevoir même s'il a déjà reçu les consignes. */
  carried?: boolean;
  /** Modèle choisi pour la conversation. */
  model?: string;
  /** Niveau d'effort choisi pour ce fournisseur. */
  effort?: string;
  /** Session ACP précédente à tenter de reprendre via `session/load`. */
  acpSessionId?: string;
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
  observer?: ChatObserver,
) {
  const observerRef = useRef(observer);
  useEffect(() => {
    observerRef.current = observer;
  });
  const [chats, setChats] = useState<Record<string, ChatState>>({});
  const chatsRef = useRef(chats);
  useEffect(() => {
    chatsRef.current = chats;
  });
  const loaded = useRef(new Set<string>());
  const loading = useRef(new Map<string, Promise<ChatMessage[]>>());
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
    const pending = loadStoredMessages(threadId)
      .then((messages) => {
        if (messages.length === 0) return messages;
        const restored = settled(messages);
        saved.current.set(threadId, restored);
        setChats((all) => {
          const current = all[threadId];
          // Un message déjà écrit pendant le chargement l'emporte : on ne l'écrase pas.
          if (current && current.messages.length > 0) return all;
          return { ...all, [threadId]: { ...(current ?? EMPTY_CHAT), messages: restored } };
        });
        return restored;
      })
      .catch(() => [] as ChatMessage[])
      .finally(() => {
        loading.current.delete(threadId);
      });
    loading.current.set(threadId, pending);
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
    setChats((all) => {
      const next = { ...all, [id]: change(all[id] ?? EMPTY_CHAT) };
      chatsRef.current = next;
      return next;
    });
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
      const watch = observerRef.current;
      if (event.kind === "turn_usage") {
        watch?.onTurnUsage?.(event.threadId, { input: event.input_tokens, output: event.output_tokens, total: event.total_tokens });
      } else if (event.kind === "done") {
        watch?.onDone?.(event.threadId);
      } else if (event.kind === "error") {
        watch?.onError?.(event.threadId, event.message);
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
    async (text: string, fromQueue = false) => {
      if (!fromQueue && chatsRef.current[threadId]?.busy) {
        update(threadId, (chat) => enqueueMessage(chat, text));
        return;
      }
      let priorMessages = chatsRef.current[threadId]?.messages ?? [];
      if (priorMessages.length === 0) {
        const pending = loading.current.get(threadId);
        if (pending) priorMessages = await pending;
      }
      update(threadId, (chat) => addUserMessage(chat, text));
      try {
        const { cwd, preface, carried, model, effort, acpSessionId } = await prepareRef.current(threadId);
        const started = await startAgent(threadId, agentId, cwd, model, effort, acpSessionId);
        observerRef.current?.onSession?.(threadId, started.sessionId);
        // En plan, l'agent passe dans son propre mode lecture seule quand il en a un ; sinon Kana refuse les modifications (voir autoAnswer).
        await setPlanMode(threadId, modeRef.current === "plan").catch(() => false);
        const resume = !started.resumed && !carried ? buildResumeContext(priorMessages) : "";
        const prefix = !started.resumed ? `${preface ?? ""}${resume}` : carried ? (preface ?? "") : "";
        await sendPrompt(threadId, promptFor(modeRef.current, `${prefix}${text}`), imagePathsIn(text));
      } catch (error) {
        update(threadId, (chat) => addError(chat, String(error)));
        observerRef.current?.onError?.(threadId, String(error));
      }
    },
    [threadId, agentId, update],
  );

  const removeQueued = useCallback(
    (index: number) => {
      update(threadId, (chat) => removeQueuedMessage(chat, index));
    },
    [threadId, update],
  );

  const steerQueued = useCallback(
    (index: number) => {
      update(threadId, (chat) => prioritizeQueuedMessage(chat, index));
      cancelPrompt(threadId).catch(() => {});
    },
    [threadId, update],
  );

  // Dès que le tour courant s'achève, le message suivant en file d'attente part automatiquement.
  const activeChat = chats[threadId];
  const activeBusy = activeChat?.busy ?? false;
  const queuedCount = activeChat?.queued.length ?? 0;
  useEffect(() => {
    if (activeBusy || queuedCount === 0) return;
    const current = chatsRef.current[threadId];
    if (!current || current.busy || current.queued.length === 0) return;
    const next = current.queued[0];
    // Marque immédiatement busy et dépile dans chatsRef pour résister au double passage de StrictMode.
    chatsRef.current = {
      ...chatsRef.current,
      [threadId]: { ...removeQueuedMessage(current, 0), busy: true },
    };
    update(threadId, (chat) => removeQueuedMessage(chat, 0));
    void send(next, true);
  }, [threadId, activeBusy, queuedCount, send, update]);

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

  /** Efface l'occupation du contexte d'un fil (l'agent repart de zéro après un compactage). */
  const clearContext = useCallback((id: string) => {
    setChats((all) => {
      if (!all[id]) return all;
      const next = { ...all, [id]: { ...all[id], context: null } };
      chatsRef.current = next;
      return next;
    });
  }, []);

  /** Donne à un fil neuf un début d'historique (la copie faite par « bifurquer »). */
  const seed = useCallback((id: string, messages: ChatMessage[]) => {
    loaded.current.add(id);
    setChats((all) => {
      const next = { ...all, [id]: { ...EMPTY_CHAT, messages } };
      chatsRef.current = next;
      return next;
    });
  }, []);

  return { chat: chats[threadId] ?? EMPTY_CHAT, send, stop, answer, seed, clearContext, removeQueued, steerQueued };
}
