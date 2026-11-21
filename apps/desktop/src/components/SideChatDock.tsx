import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Eraser, Send, Square, X } from "lucide-react";
import { answerPermission, cancelPrompt, onAgentEvent, sendPrompt, startAgent, stopAgent } from "../lib/acp";
import type { ChatMessage } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import { autoAnswer } from "../lib/permissionMode";

interface SideMessage {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
}

interface SideThreadState {
  messages: SideMessage[];
  busy: boolean;
}

interface SideChatDockProps {
  conversation: Conversation;
  mainMessages: ChatMessage[];
  workPath?: string;
  onClose: () => void;
}

const EMPTY_SIDE: SideThreadState = { messages: [], busy: false };

function buildMainContext(messages: ChatMessage[]): string {
  const recent = messages
    .filter((m) => (m.role === "user" || m.role === "agent") && m.text.trim())
    .slice(-4)
    .map((m) => `${m.role === "user" ? "Utilisateur" : "Agent"} : ${m.text.trim().slice(0, 320)}`);
  if (recent.length === 0) return "";
  return (
    "Question rapide en conversation annexe (réponds brièvement sans modifier le fil principal ni les fichiers).\n" +
    `Contexte récent :\n${recent.join("\n")}\n\n`
  );
}

export default function SideChatDock({ conversation, mainMessages, workPath, onClose }: SideChatDockProps) {
  const [threads, setThreads] = useState<Record<string, SideThreadState>>({});
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const sideThreadId = `side:${conversation.id}`;
  const state = threads[conversation.id] ?? EMPTY_SIDE;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onAgentEvent((event) => {
      if (!event.threadId.startsWith("side:")) return;
      const convId = event.threadId.slice("side:".length);
      if (event.kind === "permission") {
        const optionId = autoAnswer("plan", event);
        void answerPermission(event.threadId, event.request_id, optionId).catch(() => {});
        return;
      }
      setThreads((prev) => {
        const cur = prev[convId] ?? EMPTY_SIDE;
        if (event.kind === "message") {
          const last = cur.messages[cur.messages.length - 1];
          const messages =
            last?.role === "agent"
              ? [...cur.messages.slice(0, -1), { ...last, text: last.text + event.text }]
              : [...cur.messages, { id: `sa-${Date.now()}`, role: "agent" as const, text: event.text }];
          return { ...prev, [convId]: { ...cur, messages } };
        }
        if (event.kind === "error") {
          return {
            ...prev,
            [convId]: {
              busy: false,
              messages: [...cur.messages, { id: `se-${Date.now()}`, role: "error", text: event.message }],
            },
          };
        }
        if (event.kind === "done" || event.kind === "closed") {
          return { ...prev, [convId]: { ...cur, busy: false } };
        }
        return prev;
      });
    }).then((off) => (cancelled ? off() : (unlisten = off)));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages]);

  const ask = async (raw: string) => {
    const question = raw.trim();
    if (!question || state.busy) return;
    const convId = conversation.id;
    setDraft("");
    setThreads((prev) => {
      const cur = prev[convId] ?? EMPTY_SIDE;
      return {
        ...prev,
        [convId]: {
          busy: true,
          messages: [...cur.messages, { id: `su-${Date.now()}`, role: "user", text: question }],
        },
      };
    });
    try {
      await startAgent(
        sideThreadId,
        conversation.agentId,
        workPath,
        conversation.modelId,
        undefined,
        undefined,
        { kind: "local", sandbox: true, readOnly: true },
      );
      const context = buildMainContext(mainMessages);
      await sendPrompt(sideThreadId, `${context}${question}`);
    } catch (error) {
      setThreads((prev) => {
        const cur = prev[convId] ?? EMPTY_SIDE;
        return {
          ...prev,
          [convId]: {
            busy: false,
            messages: [...cur.messages, { id: `se-${Date.now()}`, role: "error", text: String(error) }],
          },
        };
      });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(draft);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    event.preventDefault();
    void ask(draft);
  };

  const clear = () => {
    setThreads((prev) => ({ ...prev, [conversation.id]: EMPTY_SIDE }));
    void stopAgent(sideThreadId).catch(() => {});
  };

  return (
    <aside
      role="region"
      aria-label="Conversation annexe"
      className="flex w-[340px] shrink-0 flex-col border-l border-[#2a2a27] bg-[#1c1c1a]"
    >
      <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-[#2a2a27] px-3.5">
        <div className="min-w-0">
          <h2 className="truncate text-[13.5px] font-medium text-[#ecebe4]">Conversation annexe</h2>
          <p className="truncate text-[11px] text-[#8c8b83]">Fil éphémère · ⌘;</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={clear}
            title="Effacer"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[#b5b4ac] transition hover:bg-[#2a2a27] hover:text-[#ecebe4]"
          >
            <Eraser className="h-3.5 w-3.5" strokeWidth={1.7} />
            <span>Effacer</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            title="Fermer"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-[#b5b4ac] transition hover:bg-[#2a2a27] hover:text-[#ecebe4]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={1.8} />
            <span>Fermer</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3 select-text">
        {state.messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#343430] px-3 py-4 text-[12.5px] leading-relaxed text-[#8c8b83]">
            Pose une question rapide sans polluer le fil principal « {conversation.title} ». Le contexte récent est partagé en lecture seule.
          </p>
        ) : (
          state.messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "ml-6 bg-[#2c2c29] text-[#ecebe4]"
                  : msg.role === "error"
                    ? "border border-[#5a2b2b] bg-[#2a1c1c] text-[#f59c98]"
                    : "mr-4 bg-[#222220] text-[#dcdbd3]"
              }`}
            >
              {msg.text}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSubmit} className="shrink-0 border-t border-[#2a2a27] p-3">
        <div className="flex flex-col gap-2 rounded-xl border border-[#343431] bg-[#232321] p-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Poser une question rapide…"
            aria-label="Question annexe"
            className="w-full resize-none bg-transparent text-[13px] text-[#ecebe4] placeholder-[#7e7d76] outline-none select-text"
          />
          <div className="flex items-center justify-end gap-1.5">
            {state.busy ? (
              <button
                type="button"
                onClick={() => void cancelPrompt(sideThreadId).catch(() => {})}
                className="flex items-center gap-1 rounded-lg bg-[#333331] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3f3f3c]"
              >
                <Square className="h-3 w-3" strokeWidth={2} />
                <span>Arrêter</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="flex items-center gap-1 rounded-lg bg-[#1e40af] px-2.5 py-1 text-[12px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-3 w-3" strokeWidth={2} />
                <span>Envoyer</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </aside>
  );
}
