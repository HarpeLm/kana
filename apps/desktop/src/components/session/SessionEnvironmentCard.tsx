import { useEffect, useRef, useState, type ReactNode } from "react";
import { Box, Check, ChevronDown, Cloud, Container, Laptop, Server, Shield } from "lucide-react";
import { useClickOutside } from "../../hooks/useClickOutside";
import type { Conversation, EnvironmentKind } from "../../lib/conversations";
import {
  checkCloudHealth,
  listCloudJobs,
  loadCloudConfig,
  saveCloudConfig,
  submitCloudJob,
  type CloudHealth,
  type CloudJob,
} from "../../lib/cloud";
import { translateRustError, useLocale } from "../../lib/i18n";

interface SessionEnvironmentCardProps {
  conversation: Conversation;
  agentId: string;
  workPath: string | undefined;
  projectPath: string | undefined;
  onChangeEnvironment: (environment: Conversation["environment"]) => void;
}

const ENV_OPTIONS: Array<{ kind: EnvironmentKind; label: string; icon: ReactNode }> = [
  { kind: "local", label: "Cet ordinateur", icon: <Laptop className="h-4 w-4" strokeWidth={1.7} /> },
  { kind: "ssh", label: "SSH distant", icon: <Server className="h-4 w-4" strokeWidth={1.7} /> },
  { kind: "docker", label: "Conteneur Docker", icon: <Container className="h-4 w-4" strokeWidth={1.7} /> },
  { kind: "devcontainer", label: "DevContainer", icon: <Box className="h-4 w-4" strokeWidth={1.7} /> },
  {
    kind: "cloud",
    label: "Kana Cloud (Managé / Mobile)",
    icon: <Cloud className="h-4 w-4 text-[#8ab4f8]" strokeWidth={1.7} />,
  },
];

export default function SessionEnvironmentCard({
  conversation,
  agentId,
  workPath,
  projectPath,
  onChangeEnvironment,
}: SessionEnvironmentCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, menuOpen, () => setMenuOpen(false));

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const [cloudConfig, setCloudConfig] = useState(loadCloudConfig);
  const [cloudHealth, setCloudHealth] = useState<CloudHealth | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState("");
  const [cloudPrompt, setCloudPrompt] = useState("");
  const [cloudJobs, setCloudJobs] = useState<CloudJob[]>([]);
  const [cloudSubmitting, setCloudSubmitting] = useState(false);
  const locale = useLocale();

  const env = conversation.environment ?? { kind: "local" as const, sandbox: false };
  const envKind: EnvironmentKind = env.kind ?? "local";
  const currentOption = ENV_OPTIONS.find((opt) => opt.kind === envKind) ?? ENV_OPTIONS[0];
  const envIcon =
    envKind === "local" && env.sandbox ? (
      <Shield className="h-4 w-4 text-[#8ce09b]" strokeWidth={1.7} />
    ) : (
      currentOption.icon
    );

  const selectEnvironment = (nextKind: EnvironmentKind) => {
    setMenuOpen(false);
    if (nextKind === "local") {
      onChangeEnvironment({ kind: "local", sandbox: env.sandbox ?? false });
    } else if (nextKind === "cloud") {
      const url = env.cloudUrl ?? cloudConfig.url;
      onChangeEnvironment({ kind: "cloud", cloudUrl: url, target: url });
    } else {
      onChangeEnvironment({ kind: nextKind, target: envKind === nextKind ? env.target ?? "" : "" });
    }
  };

  const activeCloudUrl = env.cloudUrl ?? cloudConfig.url;

  const updateCloudSettings = (patch: Partial<{ url: string; token: string }>) => {
    const next = {
      url: patch.url !== undefined ? patch.url : activeCloudUrl,
      token: patch.token !== undefined ? patch.token : cloudConfig.token,
      enabled: true,
    };
    setCloudConfig(next);
    saveCloudConfig(next);
    if (patch.url !== undefined && envKind === "cloud") {
      onChangeEnvironment({ kind: "cloud", cloudUrl: patch.url, target: patch.url });
    }
  };

  const handleTestCloud = async () => {
    if (cloudBusy) return;
    setCloudBusy(true);
    setCloudError("");
    try {
      const health = await checkCloudHealth(activeCloudUrl, cloudConfig.token);
      setCloudHealth(health);
      const jobs = await listCloudJobs(activeCloudUrl, cloudConfig.token).catch(() => []);
      setCloudJobs(jobs);
    } catch (e) {
      setCloudHealth(null);
      setCloudError(translateRustError(String(e), locale));
    } finally {
      setCloudBusy(false);
    }
  };

  const handleSubmitCloudJob = async () => {
    if (cloudSubmitting || !cloudPrompt.trim()) return;
    setCloudSubmitting(true);
    setCloudError("");
    try {
      const job = await submitCloudJob(
        activeCloudUrl,
        cloudConfig.token,
        agentId,
        cloudPrompt.trim(),
        workPath ?? projectPath,
      );
      setCloudPrompt("");
      setCloudJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, 10));
    } catch (e) {
      setCloudError(translateRustError(String(e), locale));
    } finally {
      setCloudSubmitting(false);
    }
  };

  return (
    <div className="space-y-1.5 pb-1">
      <div ref={menuRef} className="relative">
        <button
          type="button"
          aria-label="Environnement d'exécution"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left text-[14px] text-[#ecebe4] transition hover:bg-[#2a2a28]"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#9a9992]">
            {envIcon}
          </span>
          <span className="min-w-0 flex-1 truncate">{currentOption.label}</span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-[#8c8b83] transition-transform ${menuOpen ? "rotate-180" : ""}`}
            strokeWidth={1.8}
          />
        </button>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Choisir un environnement d'exécution"
            className="absolute inset-x-0 top-full z-30 mt-1 rounded-xl border border-[#343430] bg-[#21211f] p-1 shadow-xl"
          >
            {ENV_OPTIONS.map((opt) => {
              const active = opt.kind === envKind;
              return (
                <button
                  key={opt.kind}
                  type="button"
                  role="menuitem"
                  onClick={() => selectEnvironment(opt.kind)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${
                    active
                      ? "bg-[#2b2b29] text-[#ecebe4]"
                      : "text-[#cfcec6] hover:bg-[#2b2b29] hover:text-[#ecebe4]"
                  }`}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#8c8b83]">
                    {opt.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {active && <Check className="h-3.5 w-3.5 shrink-0 text-[#ecebe4]" strokeWidth={2} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {envKind === "ssh" && (
        <input
          type="text"
          aria-label="Cible SSH"
          value={env.target ?? ""}
          onChange={(e) => onChangeEnvironment({ kind: "ssh", target: e.target.value })}
          placeholder="user@host:/chemin"
          className="w-full rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
        />
      )}

      {envKind === "docker" && (
        <input
          type="text"
          aria-label="Conteneur Docker"
          value={env.target ?? ""}
          onChange={(e) => onChangeEnvironment({ kind: "docker", target: e.target.value })}
          placeholder="nom-du-conteneur"
          className="w-full rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
        />
      )}

      {envKind === "devcontainer" && (
        <input
          type="text"
          aria-label="Dossier DevContainer"
          value={env.target ?? ""}
          onChange={(e) => onChangeEnvironment({ kind: "devcontainer", target: e.target.value })}
          placeholder="/chemin/du/workspace"
          className="w-full rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
        />
      )}

      {envKind === "cloud" && (
        <div className="space-y-2 rounded-xl border border-[#343431] bg-[#1b1b19] p-2.5">
          <input
            type="url"
            aria-label="URL du serveur Kana Cloud"
            value={activeCloudUrl}
            onChange={(e) => updateCloudSettings({ url: e.target.value })}
            placeholder="https://kana.example.com"
            className="w-full rounded-lg border border-[#343431] bg-[#181817] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
          />
          <input
            type="password"
            aria-label="Token Bearer Kana Cloud"
            value={cloudConfig.token}
            onChange={(e) => updateCloudSettings({ token: e.target.value })}
            placeholder="Token Bearer (optionnel)"
            className="w-full rounded-lg border border-[#343431] bg-[#181817] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
          />
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={cloudBusy || !activeCloudUrl.trim()}
              onClick={() => void handleTestCloud()}
              className="rounded-lg bg-[#333331] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3f3f3c] disabled:opacity-40"
            >
              {cloudBusy ? "Test…" : "Tester la connexion"}
            </button>
            {cloudHealth?.ok && (
              <span className="rounded-full bg-[#243828] px-2 py-0.5 text-[11px] text-[#8ce09b]">
                Connecté · {cloudHealth.activeJobs} actif(s)
              </span>
            )}
          </div>
          {cloudError && (
            <p className="rounded-lg bg-[#3a2525] px-2 py-1 text-[11.5px] text-red-300">{cloudError}</p>
          )}
          <p className="font-mono text-[11px] text-[#8c8b83]">
            kana serve --port 7788 --token &lt;secret&gt;
          </p>
          <div className="flex items-center gap-1.5 pt-1">
            <input
              type="text"
              aria-label="Prompt tâche Kana Cloud"
              value={cloudPrompt}
              onChange={(e) => setCloudPrompt(e.target.value)}
              placeholder="Lancer une tâche distante…"
              className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#181817] px-2 py-1 text-[12px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
            />
            <button
              type="button"
              disabled={cloudSubmitting || !activeCloudUrl.trim() || !cloudPrompt.trim()}
              onClick={() => void handleSubmitCloudJob()}
              className="shrink-0 rounded-lg bg-[#1e40af] px-2.5 py-1 text-[11.5px] font-medium text-[#f8fafc] transition hover:bg-[#2563eb] disabled:opacity-40"
            >
              {cloudSubmitting ? "Envoi…" : "Envoyer une tâche Cloud"}
            </button>
          </div>
          {cloudJobs.length > 0 && (
            <ul className="space-y-1 pt-1">
              {cloudJobs.slice(0, 3).map((job) => (
                <li
                  key={job.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-[#181817] px-2 py-1 text-[11.5px]"
                >
                  <span className="min-w-0 flex-1 truncate text-[#dcdbd3]">{job.prompt}</span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] ${
                      job.status === "done"
                        ? "bg-[#243828] text-[#8ce09b]"
                        : job.status === "error"
                          ? "bg-[#3d2324] text-[#f48b87]"
                          : "bg-[#223042] text-[#8ab4f8]"
                    }`}
                  >
                    {job.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
