import { useState } from "react";
import { PROVIDERS } from "../data";

const badgeColor = {
  cooldown: "bg-[#d97757]/15 text-[#e69b80]",
  active: "bg-emerald-500/15 text-emerald-400",
  standby: "bg-[#2e2e2b] text-[#a3a29a]",
} as const;

export default function RelayView() {
  const [autoRelay, setAutoRelay] = useState(true);
  const [injectSummary, setInjectSummary] = useState(true);
  const [attachDiff, setAttachDiff] = useState(true);

  const options = [
    { label: "Auto-relay on 429 / rate limit", val: autoRelay, set: setAutoRelay },
    { label: "Inject SQLite thread summary", val: injectSummary, set: setInjectSummary },
    { label: "Attach live worktree git diff", val: attachDiff, set: setAttachDiff },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto border-r border-[#2b2b28] p-7">
        <div className="mx-auto max-w-[580px]">
          <h1 className="mb-1 text-[16px] font-semibold text-[#ecebe4]">Quota Relay Config</h1>
          <p className="mb-6 text-[13px] text-[#8c8b83]">
            Ordre de bascule automatique lorsque ton abonnement actif atteint sa limite.
          </p>

          <div className="space-y-3">
            {PROVIDERS.map((p, idx) => (
              <div
                key={p.name}
                className={`rounded-xl border p-4 ${
                  p.state === "cooldown"
                    ? "border-[#d97757]/40 bg-[#d97757]/5"
                    : "border-[#2e2e2b] bg-[#21211f]"
                }`}
              >
                <div className="mb-2 flex items-center justify-between text-[13px]">
                  <span className="font-medium text-[#ecebe4]">
                    {idx + 1}. {p.name}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] ${badgeColor[p.state]}`}>
                    {p.status}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#30302d]">
                    <div
                      className="h-full rounded-full bg-[#d97757]"
                      style={{ width: `${p.usage}%` }}
                    />
                  </div>
                  <span className="font-mono text-[12px] text-[#a3a29a]">{p.usage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="w-80 shrink-0 bg-[#1d1d1b] p-6">
        <h2 className="mb-4 text-[13px] font-semibold text-[#ecebe4]">Handoff Policy</h2>
        <div className="space-y-2.5">
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => opt.set(!opt.val)}
              className="flex w-full items-center justify-between rounded-xl border border-[#2e2e2b] bg-[#242422] px-3.5 py-3 text-left"
            >
              <span className="text-[13px] text-[#dcdbd3]">{opt.label}</span>
              <span
                className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                  opt.val ? "justify-end bg-[#d97757]" : "justify-start bg-[#444440]"
                }`}
              >
                <span className="h-4 w-4 rounded-full bg-[#ecebe4]" />
              </span>
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
