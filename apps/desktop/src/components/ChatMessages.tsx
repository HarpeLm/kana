import { useEffect, useRef } from "react";
import type { ChatMessage } from "../lib/chatState";
import { toolLabel } from "../lib/toolLabel";
import ChatMarkdown from "./ChatMarkdown";

interface ChatMessagesProps {
  messages: ChatMessage[];
  agentLabel: string;
  onOpenLink: (url: string) => void;
}

const toolColor: Record<string, string> = {
  completed: "text-emerald-400",
  failed: "text-red-400",
  in_progress: "text-[#e69b80]",
};

function AgentMessage({ message, onOpenLink }: { message: ChatMessage; onOpenLink: (url: string) => void }) {
  return (
    <div className="space-y-2 text-[#dfded8]">
      {message.thought && (
        <details className="text-[13px] text-[#8c8b83]">
          <summary className="cursor-pointer select-none">Réflexion</summary>
          <p className="mt-1 whitespace-pre-wrap">{message.thought}</p>
        </details>
      )}
      {message.tools.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {message.tools.map((tool) => (
            <li
              key={tool.id}
              className="rounded-md border border-[#2c2c29] bg-[#1e1e1c] px-2 py-0.5 font-mono text-[12px] text-[#a3a29a]"
            >
              <span className={toolColor[tool.status] ?? "text-[#8c8b83]"}>●</span> {toolLabel(tool)}
            </li>
          ))}
        </ul>
      )}
      {message.text && <ChatMarkdown source={message.text} onOpenLink={onOpenLink} />}
    </div>
  );
}

export default function ChatMessages({ messages, agentLabel, onOpenLink }: ChatMessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 select-text">
      <div className="mx-auto max-w-[740px] space-y-5 text-[14px] leading-[1.6]">
        {messages.length === 0 && (
          <p className="pt-10 text-center text-[13px] text-[#7e7d76]">
            Écris un message pour démarrer la conversation avec {agentLabel}.
          </p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-[#2a2a27] px-3.5 py-2 text-[#ecebe4]">
                {message.text}
              </p>
            </div>
          ) : message.role === "error" ? (
            <div
              key={message.id}
              className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2 text-[13px] text-red-300"
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
