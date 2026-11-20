import { useState } from "react";
import { ArrowUp, Square } from "lucide-react";

interface ComposerProps {
  agentLabel: string;
  busy: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}

export default function Composer({ agentLabel, busy, onSend, onStop }: ComposerProps) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText("");
  };

  return (
    <div className="px-6 pb-4 pt-2">
      <div className="mx-auto max-w-[740px]">
        <div className="rounded-[22px] border border-[#2f2f2d] bg-[#232322] px-4 pb-2.5 pt-3.5 transition focus-within:border-[#454542]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder="Demander à Kana d'écrire, refactorer ou déboguer..."
            className="w-full bg-transparent text-[15px] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-[#8c8b83]">{busy ? "En cours…" : "Prêt"}</span>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[#8c8b83]">{agentLabel} · ACP</span>
              {busy ? (
                <button
                  onClick={onStop}
                  aria-label="Arrêter"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#ecebe4] transition hover:bg-white"
                >
                  <Square className="h-3 w-3 fill-[#181817] text-[#181817]" />
                </button>
              ) : (
                <button
                  onClick={submit}
                  disabled={!text.trim()}
                  aria-label="Envoyer"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2f6bd8] text-white transition hover:bg-[#4079e0] disabled:opacity-35"
                >
                  <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
