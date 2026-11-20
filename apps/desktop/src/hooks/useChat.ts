import { useCallback, useEffect, useState } from "react";
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
  type ChatState,
} from "../lib/chatState";

/** Conversation d'un fil avec son agent ACP. L'état de chaque fil est conservé séparément. */
export function useChat(threadId: string, agentId: string) {
  const [chats, setChats] = useState<Record<string, ChatState>>({});

  const update = useCallback((id: string, change: (chat: ChatState) => ChatState) => {
    setChats((all) => ({ ...all, [id]: change(all[id] ?? EMPTY_CHAT) }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    onAgentEvent((event) => update(event.threadId, (chat) => applyEvent(chat, event))).then(
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
        await startAgent(threadId, agentId);
        await sendPrompt(threadId, text);
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

  return { chat: chats[threadId] ?? EMPTY_CHAT, send, stop, answer };
}
