import { useState } from "react";
import "./App.css";
import {
  PanelLeft,
  ChevronDown,
  List,
  Terminal,
  Globe,
  Folder,
  MoreHorizontal,
  GitBranch,
  Send,
  ArrowDown,
  CheckCircle2,
  Clock,
  Sparkles,
} from "lucide-react";

type View = "workspace" | "relay";

function DiffBoxIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 7v6" />
      <path d="M9 10h6" />
      <path d="M9 16h6" />
    </svg>
  );
}

const THREADS = [
  { id: "1", branch: "feat/acp-client", agent: "Codex" },
  { id: "2", branch: "fix/failover-router", agent: "Claude" },
  { id: "3", branch: "feat/sqlite-store", agent: "Gemini" },
];

const PROVIDERS = [
  { name: "Claude Code", status: "Cooldown 12m", usage: 100, state: "cooldown" },
  { name: "Codex", status: "Active · ACP Ready", usage: 34, state: "active" },
  { name: "Gemini CLI", status: "Standby · ACP Ready", usage: 12, state: "standby" },
  { name: "OpenCode", status: "Standby · ACP Ready", usage: 5, state: "standby" },
];

export default function App() {
  const [view, setView] = useState<View>("workspace");
  const [selectedThread, setSelectedThread] = useState("1");
  const [prompt, setPrompt] = useState("");

  // États des boutons de la barre en haut à gauche
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showDiff, setShowDiff] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  // Options Quota Relay
  const [autoRelay, setAutoRelay] = useState(true);
  const [injectSummary, setInjectSummary] = useState(true);
  const [attachDiff, setAttachDiff] = useState(true);

  const btnClass = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition ${
      active
        ? "bg-zinc-800 text-zinc-100"
        : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200"
    }`;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0e0e11] text-zinc-200 text-[13px] select-none">
      {/* Barre supérieure avec les 6 icônes en haut à gauche */}
      {/* Barre supérieure : sidebar + titre à gauche, 6 icônes à droite */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-800/80 bg-[#121216] px-3">
        {/* Gauche : bouton sidebar + titre du thread */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className={btnClass(showSidebar)}
            title="Afficher / masquer la barre latérale"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <div className="h-4 w-px bg-zinc-800" />

          <button className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800/70 transition">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-mono">
              {THREADS.find((t) => t.id === selectedThread)?.branch}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
          </button>

          <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-emerald-400">
            Codex · ACP
          </span>
        </div>

        {/* Droite : les 6 icônes */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSidebar((v) => !v)}
            className={btnClass(showSidebar)}
            title="Threads"
          >
            <List className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowTerminal((v) => !v)}
            className={btnClass(showTerminal)}
            title="Terminal"
          >
            <Terminal className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowDiff((v) => !v)}
            className={btnClass(showDiff)}
            title="Git Diff"
          >
            <DiffBoxIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowBrowser((v) => !v)}
            className={btnClass(showBrowser)}
            title="Aperçu Web"
          >
            <Globe className="h-4 w-4" />
          </button>

          <button
            onClick={() => setShowFiles((v) => !v)}
            className={btnClass(showFiles)}
            title="Fichiers du worktree"
          >
            <Folder className="h-4 w-4" />
          </button>

          <button
            onClick={() => setView(view === "workspace" ? "relay" : "workspace")}
            className={btnClass(view === "relay")}
            title="Quota Relay & Paramètres"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Corps principal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Barre latérale gauche */}
        {showSidebar && (
          <aside className="flex w-60 shrink-0 flex-col border-r border-zinc-800/80 bg-[#121216]">
            <div className="flex-1 overflow-y-auto p-2">
              <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Worktree Threads
              </div>
              <div className="space-y-0.5">
                {THREADS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedThread(t.id);
                      setView("workspace");
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left transition ${
                      view === "workspace" && selectedThread === t.id
                        ? "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25"
                        : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate font-mono text-xs">
                      <GitBranch className="h-3.5 w-3.5 shrink-0 opacity-75" />
                      <span className="truncate">{t.branch}</span>
                    </span>
                    <span className="text-[10px] text-zinc-500">{t.agent}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Widget Quota Relay */}
            <div
              onClick={() => setView("relay")}
              className="cursor-pointer border-t border-zinc-800/80 bg-[#0f0f13] p-3 hover:bg-zinc-900/70 transition"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                  Quota Relay
                </span>
                <span className="text-[10px] text-amber-400">Configurer →</span>
              </div>
              <div className="space-y-2">
                {PROVIDERS.map((p) => (
                  <div key={p.name}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="flex items-center gap-1.5 text-zinc-300">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            p.state === "cooldown"
                              ? "bg-amber-500"
                              : p.state === "active"
                              ? "bg-emerald-400"
                              : "bg-zinc-600"
                          }`}
                        />
                        {p.name.replace(" Code", "").replace(" CLI", "")}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {p.usage}%
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${
                          p.state === "cooldown"
                            ? "bg-amber-500"
                            : p.state === "active"
                            ? "bg-amber-400/80"
                            : "bg-zinc-600"
                        }`}
                        style={{ width: `${p.usage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {view === "workspace" ? (
          <div className="flex flex-1 overflow-hidden">
            {/* Colonne centrale : Thread */}
            <main className="flex flex-1 flex-col border-r border-zinc-800/80">
              <div className="flex-1 space-y-4 overflow-y-auto p-5 select-text">
                <div className="flex items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                  Claude limit reached — Relayed to Codex (context + git diff injected)
                </div>

                <div className="rounded-lg border border-zinc-800 bg-[#141419] p-4">
                  <div className="mb-1 text-xs font-medium text-amber-400">
                    Kana · Codex
                  </div>
                  <p className="leading-relaxed text-zinc-300">
                    Contexte repris depuis le thread SQLite et le worktree courant. Le client ACP
                    est prêt à streamer les prochains tours.
                  </p>
                </div>
              </div>

              <div className="border-t border-zinc-800/80 p-3">
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-[#141419] px-3 py-2 focus-within:border-amber-500/50">
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Demander à Kana d'écrire, refactorer ou déboguer..."
                    className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none"
                  />
                  <button className="rounded-md bg-amber-500/90 p-1.5 text-zinc-950 hover:bg-amber-400 transition">
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </main>

            {/* Colonne droite : Diff / Terminal */}
            {(showDiff || showTerminal) && (
              <section className="flex w-[420px] shrink-0 flex-col bg-[#101014]">
                {showDiff && (
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-zinc-800/80 px-4 py-2.5 text-xs font-medium text-zinc-300">
                      <DiffBoxIcon className="h-3.5 w-3.5 text-zinc-400" />
                      git diff crates/kana-acp/src/lib.rs
                    </div>
                    <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-400 select-text">
                      <span className="text-zinc-500">@@ -1,4 +1,6 @@</span>
                      {"\n"}
                      <span className="block bg-emerald-500/10 text-emerald-400">
                        + pub struct AcpClient {"{"}
                      </span>
                      <span className="block bg-emerald-500/10 text-emerald-400">
                        +     command: String,
                      </span>
                      <span className="block bg-emerald-500/10 text-emerald-400">
                        + {"}"}
                      </span>
                    </pre>
                  </div>
                )}

                {showTerminal && (
                  <div className="h-44 shrink-0 border-t border-zinc-800/80 bg-[#0b0b0e]">
                    <div className="flex items-center gap-2 border-b border-zinc-800/60 px-3 py-1.5 text-[11px] text-zinc-400">
                      <Terminal className="h-3.5 w-3.5" />
                      Terminal · worktree
                    </div>
                    <div className="p-3 font-mono text-xs text-zinc-400 select-text">
                      <div>$ cargo check --workspace</div>
                      <div className="text-emerald-400">
                        Finished `dev` profile in 0.42s
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          /* Vue configuration Quota Relay */
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto border-r border-zinc-800/80 p-6">
              <h1 className="mb-1 text-base font-semibold text-zinc-100">
                Quota Relay Config
              </h1>
              <p className="mb-6 text-xs text-zinc-500">
                Ordre de bascule automatique lorsque ton abonnement actif atteint sa limite.
              </p>

              <div className="max-w-lg space-y-2">
                {PROVIDERS.map((p, idx) => (
                  <div key={p.name}>
                    <div
                      className={`rounded-lg border p-4 ${
                        p.state === "cooldown"
                          ? "border-amber-500/40 bg-amber-500/5"
                          : "border-zinc-800 bg-[#141419]"
                      }`}
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span className="font-medium text-zinc-100">
                          {idx + 1}. {p.name}
                        </span>
                        <span
                          className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${
                            p.state === "cooldown"
                              ? "bg-amber-500/15 text-amber-300"
                              : p.state === "active"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {p.state === "cooldown" ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {p.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${p.usage}%` }}
                          />
                        </div>
                        <span className="font-mono text-xs text-zinc-400">{p.usage}%</span>
                      </div>
                    </div>
                    {idx < PROVIDERS.length - 1 && (
                      <div className="flex justify-center py-1 text-zinc-600">
                        <ArrowDown className="h-3.5 w-3.5" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <aside className="w-80 shrink-0 p-6">
              <h2 className="mb-4 text-sm font-semibold text-zinc-100">Handoff Policy</h2>
              <div className="space-y-3">
                {[
                  { label: "Auto-relay on 429 / rate limit", val: autoRelay, set: setAutoRelay },
                  { label: "Inject SQLite thread summary", val: injectSummary, set: setInjectSummary },
                  { label: "Attach live worktree git diff", val: attachDiff, set: setAttachDiff },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => opt.set(!opt.val)}
                    className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-[#141419] px-3.5 py-3 text-left"
                  >
                    <span className="text-xs text-zinc-300">{opt.label}</span>
                    <span
                      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                        opt.val ? "bg-amber-500 justify-end" : "bg-zinc-700 justify-start"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-white" />
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
