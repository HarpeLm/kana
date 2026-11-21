import { useContext, useEffect, useRef, type UIEvent } from "react";
import { ChevronRight, Copy } from "lucide-react";
import { artifactTitle, findArtifacts, OpenArtifactContext } from "../lib/artifactRefs";
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
  /** Bifurquer la conversation à partir d'un message. */
  onFork: (messageId: string) => void;
  /** Restaurer le code et la conversation avant ce message utilisateur (`/rewind`). */
  onRewind?: (messageId: string) => void;
}

function AgentMessage({
  message,
  onOpenLink,
  onFork,
  live,
}: {
  live?: boolean;
  message: ChatMessage;
  onOpenLink: (url: string) => void;
  onFork?: () => void;
}) {
  const openArtifact = useContext(OpenArtifactContext);
  const artifacts = message.text ? findArtifacts(message.text) : [];
  return (
    <div className="group/message space-y-2 text-[#dfded8]">
      {message.thought && (
        <details className="text-[13px] text-[#8c8b83]">
          <summary className="cursor-pointer select-none">Réflexion</summary>
          <p className="mt-1 whitespace-pre-wrap">{message.thought}</p>
        </details>
      )}
      {message.tools.length > 0 && <ToolGroup tools={message.tools} startedAt={message.startedAt} endedAt={message.endedAt} live={live} />}
      {artifacts.map((path) => (
        <button
          key={path}
          type="button"
          onClick={() => openArtifact(path)}
          className="flex w-full items-center gap-3 rounded-xl bg-[#262624] px-4 py-3 text-left text-[15px] text-[#e8e7e1] transition-colors hover:bg-[#2d2d2a]"
        >
          <Copy className="h-[17px] w-[17px] shrink-0 text-[#a8a79f]" strokeWidth={1.6} />
          <span className="min-w-0 flex-1 truncate">{artifactTitle(path)}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#8c8b83]" strokeWidth={1.8} />
        </button>
      ))}
      {message.text && <ChatMarkdown source={message.text} onOpenLink={onOpenLink} />}
      {message.text && <MessageActions text={message.text} at={message.endedAt ?? message.startedAt} onFork={onFork} />}
    </div>
  );
}

export default function ChatMessages({ messages, agentLabel, onOpenLink, busy, onSend, onFork, onRewind }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // On suit la fin de la conversation tant qu'on y est : dès qu'on remonte, la lecture n'est plus ramenée en bas.
  const stick = useRef(true);
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const box = event.currentTarget;
    stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  };

  useEffect(() => {
    // Un message qu'on vient d'envoyer ramène toujours en bas.
    if (messages[messages.length - 1]?.role === "user") stick.current = true;
    if (stick.current) endRef.current?.scrollIntoView({ block: "end", inline: "nearest" });
  }, [messages]);

  return (
    <div onScroll={onScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6 select-text">
      <div className="mx-auto min-w-0 max-w-[740px] space-y-5 text-[15px] leading-[1.7] [overflow-wrap:anywhere]">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-[13px] text-[#7e7d76]">
            Écris un message pour démarrer la conversation avec {agentLabel}.
          </p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <UserMessage
              key={message.id}
              message={message}
              busy={busy}
              onSend={onSend}
              onFork={() => onFork(message.id)}
              onRewind={onRewind ? () => onRewind(message.id) : undefined}
            />
          ) : message.role === "notice" ? (
            <p key={message.id} className="text-[15px] text-[#8a8982]">
              {message.text}
            </p>
          ) : message.role === "error" ? (
            <div
              key={message.id}
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] text-red-300"
            >
              {message.text}
            </div>
          ) : (
            <AgentMessage
              key={message.id}
              message={message}
              live={busy && message === messages[messages.length - 1]}
              onOpenLink={onOpenLink}
              onFork={busy ? undefined : () => onFork(message.id)}
            />
          ),
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
