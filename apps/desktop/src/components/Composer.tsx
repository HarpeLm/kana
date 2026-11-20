import { useState } from "react";

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
        <div className="flex items-center gap-2 rounded-xl border border-[#343430] bg-[#242422] px-3.5 py-2.5 focus-within:border-[#4a4a44]">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
            }}
            placeholder="Demander à Kana d'écrire, refactorer ou déboguer..."
            className="flex-1 bg-transparent text-[14px] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
          />
          {busy ? (
            <button
              onClick={onStop}
              className="rounded-lg bg-[#2e2e2b] px-3 py-1 text-[12px] font-medium text-[#e6e5df] transition hover:bg-[#383835]"
            >
              Arrêter
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="rounded-lg bg-[#d97757] px-3 py-1 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:opacity-40"
            >
              Envoyer
            </button>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-end gap-3 px-1 text-[12px] text-[#8c8b83]">
          <span>{agentLabel} · ACP</span>
          <span>{busy ? "En cours…" : "Prêt"}</span>
        </div>
      </div>
    </div>
  );
}
