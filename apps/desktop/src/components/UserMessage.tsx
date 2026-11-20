import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../lib/chatState";
import MessageActions from "./MessageActions";

interface UserMessageProps {
  message: ChatMessage;
  busy: boolean;
  /** Renvoie un texte à l'agent (le même, ou le texte modifié). */
  onSend: (text: string) => void;
}

/** Message de l'utilisateur : la bulle se modifie sur place, puis le texte est renvoyé. */
export default function UserMessage({ message, busy, onSend }: UserMessageProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.text);
  const field = useRef<HTMLTextAreaElement>(null);

  // En édition, le champ prend le focus et s'agrandit avec son contenu.
  useEffect(() => {
    const area = field.current;
    if (!editing || !area) return;
    area.style.height = "auto";
    area.style.height = `${area.scrollHeight}px`;
  }, [editing, text]);
  useEffect(() => {
    if (editing) {
      const area = field.current;
      area?.focus();
      area?.setSelectionRange(area.value.length, area.value.length);
    }
  }, [editing]);

  const startEditing = () => {
    setText(message.text);
    setEditing(true);
  };
  const cancel = () => setEditing(false);
  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    setEditing(false);
    onSend(value);
  };

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[85%] rounded-[20px] bg-[#2a2a28] p-3">
        <textarea
          ref={field}
          value={text}
          rows={1}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              cancel();
            }
          }}
          className="max-h-64 w-full resize-none bg-transparent px-1.5 text-[15px] leading-[1.7] text-[#ecebe4] outline-none"
        />
        <div className="mt-2 flex justify-end gap-2">
          <button
            onClick={cancel}
            className="rounded-full px-3.5 py-1 text-[13px] text-[#a3a29a] transition hover:bg-white/10 hover:text-[#ecebe4]"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            disabled={!text.trim() || busy}
            className="rounded-full bg-[#ecebe4] px-3.5 py-1 text-[13px] font-medium text-[#181817] transition hover:bg-white disabled:opacity-40"
          >
            Envoyer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/message flex flex-col items-end gap-1">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-[20px] bg-[#2a2a28] px-4 py-2.5 text-[#ecebe4]">
        {message.text}
      </p>
      <MessageActions
        text={message.text}
        at={message.startedAt}
        align="right"
        onRetry={busy ? undefined : () => onSend(message.text)}
        onEdit={startEditing}
      />
    </div>
  );
}
