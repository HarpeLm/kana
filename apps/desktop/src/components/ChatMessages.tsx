import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/chatState";
import ChatMarkdown from "./ChatMarkdown";
import MessageActions from "./MessageActions";
import UserMessage from "./UserMessage";
import ToolGroup from "./ToolGroup";

interface ChatMessagesProps {
  messages: ChatMessage[];
  agentLabel: string;
  onOpenLink: (url: string) => void;
  busy: boolean;
  /** Envoyer un texte à l'agent (renvoi ou message modifié). */
  onSend: (text: string) => void;
}

function AgentMessage({ message, onOpenLink }: { message: ChatMessage; onOpenLink: (url: string) => void }) {
  return (
    <div className="group/message space-y-2 text-[#dfded8]">
      {message.thought && (
        <details className="text-[13px] text-[#8c8b83]">
          <summary className="cursor-pointer select-none">Réflexion</summary>
          <p className="mt-1 whitespace-pre-wrap">{message.thought}</p>
        </details>
      )}
      {message.tools.length > 0 && <ToolGroup tools={message.tools} startedAt={message.startedAt} endedAt={message.endedAt} />}
      {message.text && <ChatMarkdown source={message.text} onOpenLink={onOpenLink} />}
      {message.text && <MessageActions text={message.text} at={message.endedAt ?? message.startedAt} />}
    </div>
  );
}

export default function ChatMessages({ messages, agentLabel, onOpenLink, busy, onSend }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 select-text">
      <div className="mx-auto max-w-[740px] space-y-5 text-[15px] leading-[1.7]">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-[13px] text-[#7e7d76]">
            Écris un message pour démarrer la conversation avec {agentLabel}.
          </p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <UserMessage key={message.id} message={message} busy={busy} onSend={onSend} />
          ) : message.role === "error" ? (
            <div
              key={message.id}
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-300"
            >
              {message.text}
            </div>
          ) : (
            <AgentMessage key={message.id} message={message} onOpenLink={onOpenLink} />
          ),
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
