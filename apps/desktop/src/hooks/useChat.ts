import { useCallback, useEffect, useRef, useState } from "react";
import {
  answerPermission,
  cancelPrompt,
  onAgentEvent,
  sendPrompt,
  setPlanMode,
  startAgent,
  stopAgent,
  type AgentEnvironment,
  type UserMcpServerParam,
} from "../lib/acp";
import {
  EMPTY_CHAT,
  addError,
  addUserMessage,
  applyEvent,
  attachCheckpointToMessage,
  enqueueMessage,
  loadThreadCheckpoints,
  makeMessage,
  prioritizeQueuedMessage,
  removeQueuedMessage,
  rewindChatToMessage,
  saveThreadCheckpoint,
  type ChatMessage,
  type ChatState,
} from "../lib/chatState";
import { imagePathsIn } from "../lib/attachments";
import { expandSkillCommand, runMatchingHooks } from "../lib/extensibility";
import { buildResumeContext } from "../lib/fork";
import { createCheckpoint, restoreCheckpoint } from "../lib/gitDiff";
import { loadStoredMessages, saveStoredMessages } from "../lib/store";
import { autoAnswer, promptFor, type PermissionMode } from "../lib/permissionMode";

/** Ce que l'appli veut savoir de ce qui se passe dans les fils (consommation, limites). */
export interface ChatObserver {
  onTurnUsage?: (threadId: string, usage: { input: number; output: number; total: number }) => void;
  onDone?: (threadId: string) => void;
  onError?: (threadId: string, message: string) => void;
  onSession?: (threadId: string, sessionId: string) => void;
  onPermission?: (threadId: string, title: string) => void;
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
  /** Environnement d'exécution (local, sandbox OS, SSH, Docker, DevContainer). */
  environment?: AgentEnvironment;
  /** Chemin du projet associé (pour la portée des skills, hooks et MCP). */
  projectPath?: string;
  /** Serveurs MCP utilisateur actifs (globaux + par projet). */
  mcpServers?: UserMcpServerParam[];
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
  const threadPathsRef = useRef(new Map<string, { cwd?: string; projectPath?: string }>());
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
        const checkpoints = loadThreadCheckpoints(threadId);
        const restored = settled(messages).map((m) =>
          m.role === "user" && !m.checkpoint && checkpoints[m.id] ? { ...m, checkpoint: checkpoints[m.id] } : m,
        );
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
      } else if (event.kind === "tool_call") {
        const currentChat = chatsRef.current[event.threadId];
        let prevTool: ChatMessage["tools"][number] | undefined;
        if (currentChat) {
          for (let i = currentChat.messages.length - 1; i >= 0; i--) {
            const found = currentChat.messages[i].tools.find((t) => t.id === event.id);
            if (found) {
              prevTool = found;
              break;
            }
          }
        }
        const prevStatus = prevTool?.status;
        const nextStatus = event.status ?? prevStatus ?? "pending";
        const target = event.title ?? prevTool?.title ?? "Outil";
        const paths = threadPathsRef.current.get(event.threadId);
        if (!prevTool && (nextStatus === "pending" || nextStatus === "in_progress")) {
          void runMatchingHooks("PreToolUse", target, paths?.cwd, paths?.projectPath);
        }
        if (nextStatus === "completed" && prevStatus !== "completed") {
          void runMatchingHooks("PostToolUse", target, paths?.cwd, paths?.projectPath);
        }
      } else if (event.kind === "done") {
        const paths = threadPathsRef.current.get(event.threadId);
        void runMatchingHooks("Stop", event.stop_reason || "done", paths?.cwd, paths?.projectPath);
        watch?.onDone?.(event.threadId);
      } else if (event.kind === "error") {
        watch?.onError?.(event.threadId, event.message);
      } else if (event.kind === "permission") {
        watch?.onPermission?.(event.threadId, event.title);
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

  const sendToThread = useCallback(
    async (
      targetThreadId: string,
      targetAgentId: string,
      text: string,
      modeOverride?: PermissionMode,
      fromQueue = false,
    ) => {
      if (modeOverride && targetThreadId === threadId) modeRef.current = modeOverride;
      if (!fromQueue && chatsRef.current[targetThreadId]?.busy) {
        update(targetThreadId, (chat) => enqueueMessage(chat, text));
        return;
      }
      loaded.current.add(targetThreadId);
      let priorMessages = chatsRef.current[targetThreadId]?.messages ?? [];
      if (priorMessages.length === 0) {
        const pending = loading.current.get(targetThreadId);
        if (pending) priorMessages = await pending;
      }
      const userMessage = makeMessage("user", text);
      if (text.trim() === "/compact" && chatsRef.current[targetThreadId]?.context) {
        userMessage.contextBefore = chatsRef.current[targetThreadId].context!.used;
      }
      update(targetThreadId, (chat) => addUserMessage(chat, text, userMessage));
      try {
        const { cwd, projectPath, preface, carried, model, effort, acpSessionId, environment, mcpServers } =
          await prepareRef.current(targetThreadId);
        threadPathsRef.current.set(targetThreadId, { cwd, projectPath });
        if (!targetThreadId.startsWith("side:")) {
          const checkpoint = await createCheckpoint(userMessage.id, cwd ?? projectPath).catch(() => null);
          if (checkpoint) {
            saveThreadCheckpoint(targetThreadId, userMessage.id, checkpoint);
            update(targetThreadId, (chat) => attachCheckpointToMessage(chat, userMessage.id, checkpoint));
          }
        }
        const started = await startAgent(
          targetThreadId,
          targetAgentId,
          cwd,
          model,
          effort,
          acpSessionId,
          environment,
          mcpServers,
        );
        observerRef.current?.onSession?.(targetThreadId, started.sessionId);
        const activeMode = modeOverride ?? modeRef.current;
        // En plan, l'agent passe dans son propre mode lecture seule quand il en a un ; sinon Kana refuse les modifications (voir autoAnswer).
        await setPlanMode(targetThreadId, activeMode === "plan").catch(() => false);
        const resume = !started.resumed && !carried ? buildResumeContext(priorMessages) : "";
        const prefix = !started.resumed ? `${preface ?? ""}${resume}` : carried ? (preface ?? "") : "";
        const expanded = expandSkillCommand(text, projectPath);
        await sendPrompt(targetThreadId, promptFor(activeMode, `${prefix}${expanded}`), imagePathsIn(expanded));
      } catch (error) {
        update(targetThreadId, (chat) => addError(chat, String(error)));
        observerRef.current?.onError?.(targetThreadId, String(error));
      }
    },
    [threadId, update],
  );

  const send = useCallback(
    (text: string, fromQueue = false, modeOverride?: PermissionMode) =>
      sendToThread(threadId, agentId, text, modeOverride, fromQueue),
    [sendToThread, threadId, agentId],
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

  /** Restaure le checkpoint Git et ramène l'historique avant le tour utilisateur ciblé (ou le dernier). */
  const rewind = useCallback(
    async (messageId?: string): Promise<boolean> => {
      const current = chatsRef.current[threadId];
      if (!current || current.busy) return false;
      const checkpoints = loadThreadCheckpoints(threadId);
      const hydrated: ChatState = {
        ...current,
        messages: current.messages.map((m) =>
          m.role === "user" && !m.checkpoint && checkpoints[m.id] ? { ...m, checkpoint: checkpoints[m.id] } : m,
        ),
      };
      const result = rewindChatToMessage(hydrated, messageId);
      if (!result.target) return false;
      if (result.checkpoint) {
        let paths = threadPathsRef.current.get(threadId);
        if (!paths) {
          const prepared = await prepareRef.current(threadId).catch(() => ({} as PreparedThread));
          paths = { cwd: prepared.cwd, projectPath: prepared.projectPath };
        }
        await restoreCheckpoint(result.checkpoint, paths.cwd ?? paths.projectPath).catch(() => {});
      }
      await stopAgent(threadId).catch(() => {});
      update(threadId, () => result.chat);
      return true;
    },
    [threadId, update],
  );

  return { chat: chats[threadId] ?? EMPTY_CHAT, chats, send, sendToThread, stop, answer, seed, clearContext, removeQueued, steerQueued, rewind };
}
