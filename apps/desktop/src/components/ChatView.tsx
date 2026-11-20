interface ChatViewProps {
  prompt: string;
  onPromptChange: (value: string) => void;
}

export default function ChatView({ prompt, onPromptChange }: ChatViewProps) {
  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-6 select-text">
        <div className="mx-auto max-w-[740px] space-y-5 text-[14px] leading-[1.6]">
          <div className="rounded-lg border border-[#d97757]/25 bg-[#d97757]/8 px-3.5 py-2 text-[13px] text-[#e69b80]">
            Claude limit reached — Relayed to Codex (context + git diff injected)
          </div>

          <div className="space-y-3 text-[#dfded8]">
            <p>
              Contexte repris depuis le thread SQLite et le worktree courant. Le client ACP est
              prêt à streamer les prochains tours.
            </p>
            <pre className="overflow-x-auto rounded-xl border border-[#2c2c29] bg-[#1e1e1c] px-4 py-3 font-mono text-[13px] leading-[1.55] text-[#d4d3cb]">
              <code>cargo check --workspace</code>
            </pre>
          </div>
        </div>
      </div>

      <div className="px-6 pb-4 pt-2">
        <div className="mx-auto max-w-[740px]">
          <div className="flex items-center gap-2 rounded-xl border border-[#343430] bg-[#242422] px-3.5 py-2.5 focus-within:border-[#4a4a44]">
            <input
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              placeholder="Demander à Kana d'écrire, refactorer ou déboguer..."
              className="flex-1 bg-transparent text-[14px] text-[#ecebe4] placeholder-[#7e7d76] outline-none"
            />
            <button className="rounded-lg bg-[#d97757] px-3 py-1 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768]">
              Envoyer
            </button>
          </div>
          <div className="mt-1.5 flex items-center justify-end gap-3 px-1 text-[12px] text-[#8c8b83]">
            <span>Codex · ACP</span>
            <span>Auto</span>
          </div>
        </div>
      </div>
    </main>
  );
}
