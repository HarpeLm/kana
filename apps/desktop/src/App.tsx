import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  List,
  Terminal,
  Globe,
  Folder,
  MoreHorizontal,
  Shapes,
  Code,
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

  // États des boutons en haut à droite
  const [showSidebar, setShowSidebar] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showDiff, setShowDiff] = useState(true);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  // Menu "..." + ses 2 entrées
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showBackgroundTasks, setShowBackgroundTasks] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Options Quota Relay
  const [autoRelay, setAutoRelay] = useState(true);
  const [injectSummary, setInjectSummary] = useState(true);
  const [attachDiff, setAttachDiff] = useState(true);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    }
    if (showMoreMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);

  const btnClass = (active: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition ${
      active
        ? "bg-[#32322f] text-[#ecebe4]"
        : "text-[#9c9b93] hover:bg-[#2c2c29] hover:text-[#ecebe4]"
    }`;

  const showRightPanel = showDiff || showTerminal || showArtifacts || showBackgroundTasks;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#212120] text-[#ecebe4] text-[13px] select-none">
      {/* Barre supérieure */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-[#333330] bg-[#212120] px-4">
        <div className="flex items-center gap-2.5">
          <span className="font-medium text-[#ecebe4]">
            {THREADS.find((t) => t.id === selectedThread)?.branch}
          </span>
          <span className="rounded bg-[#2c2c29] px-1.5 py-0.5 font-mono text-[11px] text-[#a3a29a]">
            Codex · ACP
          </span>
        </div>

        {/* Les 6 icônes en haut à droite */}
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

          {/* Bouton "..." + menu déroulant */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu((v) => !v)}
              className={btnClass(showMoreMenu || showArtifacts || showBackgroundTasks)}
              title="Plus"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {showMoreMenu && (
              <div className="absolute right-0 top-9 z-50 w-56 rounded-xl border border-[#3a3a36] bg-[#282825] p-1.5 shadow-2xl">
                <button
                  onClick={() => {
                    setShowArtifacts((v) => !v);
                    setShowMoreMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                    showArtifacts
                      ? "bg-[#353531] text-[#ecebe4]"
                      : "text-[#dcdbd3] hover:bg-[#32322e]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Shapes className="h-4 w-4 text-[#a3a29a]" />
                    Artéfacts
                  </span>
                </button>

                <button
                  onClick={() => {
                    setShowBackgroundTasks((v) => !v);
                    setShowMoreMenu(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                    showBackgroundTasks
                      ? "bg-[#353531] text-[#ecebe4]"
                      : "text-[#dcdbd3] hover:bg-[#32322e]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Code className="h-4 w-4 text-[#a3a29a]" />
                    Tâches en arrière-plan
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Corps principal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Barre latérale gauche */}
        {showSidebar && (
          <aside className="flex w-60 shrink-0 flex-col border-r border-[#333330] bg-[#1a1a18]">
            <div className="flex-1 overflow-y-auto p-2.5">
              <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-[#787770]">
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
                        ? "bg-[#2b2b28] text-[#ecebe4]"
                        : "text-[#a3a29a] hover:bg-[#242421] hover:text-[#ecebe4]"
                    }`}
                  >
                    <span className="truncate font-mono text-xs">{t.branch}</span>
                    <span className="text-[10px] text-[#787770]">{t.agent}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Widget Quota Relay */}
            <div
              onClick={() => setView("relay")}
              className="cursor-pointer border-t border-[#333330] bg-[#171715] p-3 hover:bg-[#22221f] transition"
            >
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[11px] font-medium uppercase tracking-wider text-[#9c9b93]">
                  Quota Relay
                </span>
                <span className="text-[10px] text-[#d97757]">Configurer</span>
              </div>
              <div className="space-y-2">
                {PROVIDERS.map((p) => (
                  <div key={p.name}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-[#d4d3cb]">
                        {p.name.replace(" Code", "").replace(" CLI", "")}
                      </span>
                      <span className="font-mono text-[10px] text-[#787770]">
                        {p.usage}%
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-[#2e2e2b]">
                      <div
                        className={`h-full rounded-full ${
                          p.state === "cooldown"
                            ? "bg-[#d97757]"
                            : p.state === "active"
                            ? "bg-[#d97757]/75"
                            : "bg-[#5a5953]"
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
            <main className="flex flex-1 flex-col border-r border-[#333330] bg-[#212120]">
              <div className="flex-1 space-y-4 overflow-y-auto p-6 select-text">
                <div className="flex items-center justify-center rounded-md border border-[#d97757]/30 bg-[#d97757]/10 px-3 py-2 text-xs text-[#e69b80]">
                  Claude limit reached — Relayed to Codex (context + git diff injected)
                </div>

                <div className="rounded-lg border border-[#333330] bg-[#282825] p-4">
                  <div className="mb-1 text-xs font-medium text-[#d97757]">
                    Kana · Codex
                  </div>
                  <p className="leading-relaxed text-[#dcdbd3]">
                    Contexte repris depuis le thread SQLite et le worktree courant. Le client ACP
                    est prêt à streamer les prochains tours.
                  </p>
                </div>
              </div>

              {/* Zone de saisie */}
              <div className="p-4">
                <div className="flex items-center gap-2 rounded-xl border border-[#3a3a36] bg-[#2a2a28] px-3.5 py-2.5 focus-within:border-[#d97757]/60">
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Demander à Kana d'écrire, refactorer ou déboguer..."
                    className="flex-1 bg-transparent text-sm text-[#ecebe4] placeholder-[#787770] outline-none"
                  />
                  <button className="rounded-md bg-[#d97757] px-2.5 py-1 text-xs font-medium text-[#1a1a18] hover:bg-[#e38768] transition">
                    Envoyer
                  </button>
                </div>
              </div>
            </main>

            {/* Colonne droite : Diff / Artéfacts / Tâches en arrière-plan / Terminal */}
            {showRightPanel && (
              <section className="flex w-[420px] shrink-0 flex-col bg-[#1d1d1b]">
                {showArtifacts && (
                  <div className="border-b border-[#333330] p-4">
                    <div className="mb-2 text-xs font-medium text-[#ecebe4]">Artéfacts</div>
                    <div className="text-xs text-[#8c8b83]">
                      Aucun artéfact généré dans cette session.
                    </div>
                  </div>
                )}

                {showBackgroundTasks && (
                  <div className="border-b border-[#333330] p-4">
                    <div className="mb-2 text-xs font-medium text-[#ecebe4]">
                      Tâches en arrière-plan
                    </div>
                    <div className="text-xs text-[#8c8b83]">
                      Aucune tâche active en arrière-plan.
                    </div>
                  </div>
                )}

                {showDiff && (
                  <div className="flex flex-1 flex-col overflow-hidden">
                    <div className="border-b border-[#333330] px-4 py-2.5 font-mono text-xs text-[#a3a29a]">
                      git diff crates/kana-acp/src/lib.rs
                    </div>
                    <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-[#a3a29a] select-text">
                      <span className="text-[#787770]">@@ -1,4 +1,6 @@</span>
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
                  <div className="h-44 shrink-0 border-t border-[#333330] bg-[#181816]">
                    <div className="border-b border-[#2b2b28] px-3 py-1.5 text-[11px] text-[#9c9b93]">
                      Terminal · worktree
                    </div>
                    <div className="p-3 font-mono text-xs text-[#a3a29a] select-text">
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
          <div className="flex flex-1 overflow-hidden bg-[#212120]">
            <div className="flex-1 overflow-y-auto border-r border-[#333330] p-6">
              <h1 className="mb-1 text-base font-semibold text-[#ecebe4]">
                Quota Relay Config
              </h1>
              <p className="mb-6 text-xs text-[#8c8b83]">
                Ordre de bascule automatique lorsque ton abonnement actif atteint sa limite.
              </p>

              <div className="max-w-lg space-y-3">
                {PROVIDERS.map((p, idx) => (
                  <div
                    key={p.name}
                    className={`rounded-lg border p-4 ${
                      p.state === "cooldown"
                        ? "border-[#d97757]/40 bg-[#d97757]/5"
                        : "border-[#333330] bg-[#282825]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-medium text-[#ecebe4]">
                        {idx + 1}. {p.name}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] ${
                          p.state === "cooldown"
                            ? "bg-[#d97757]/15 text-[#e69b80]"
                            : p.state === "active"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-[#32322f] text-[#a3a29a]"
                        }`}
                      >
                        {p.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#333330]">
                        <div
                          className="h-full rounded-full bg-[#d97757]"
                          style={{ width: `${p.usage}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-[#a3a29a]">{p.usage}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <aside className="w-80 shrink-0 bg-[#1a1a18] p-6">
              <h2 className="mb-4 text-sm font-semibold text-[#ecebe4]">Handoff Policy</h2>
              <div className="space-y-3">
                {[
                  { label: "Auto-relay on 429 / rate limit", val: autoRelay, set: setAutoRelay },
                  { label: "Inject SQLite thread summary", val: injectSummary, set: setInjectSummary },
                  { label: "Attach live worktree git diff", val: attachDiff, set: setAttachDiff },
                ].map((opt) => (
                  <button
                    key={opt.label}
                    onClick={() => opt.set(!opt.val)}
                    className="flex w-full items-center justify-between rounded-lg border border-[#333330] bg-[#242421] px-3.5 py-3 text-left"
                  >
                    <span className="text-xs text-[#dcdbd3]">{opt.label}</span>
                    <span
                      className={`flex h-5 w-9 items-center rounded-full p-0.5 transition ${
                        opt.val ? "bg-[#d97757] justify-end" : "bg-[#444440] justify-start"
                      }`}
                    >
                      <span className="h-4 w-4 rounded-full bg-[#ecebe4]" />
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
