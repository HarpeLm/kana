import { useEffect, useState, type FormEvent } from "react";
import { Check, Clock, Copy, Pause, Play, Plus, Power, Terminal, Trash2 } from "lucide-react";
import { AGENTS } from "../data";
import { onAgentEvent, sendPrompt, startAgent, stopAgent } from "../lib/acp";
import { inTauri } from "../lib/env";
import { NO_PROJECT, type Project } from "../lib/projects";
import {
  DAEMON_INTERVAL_OPTIONS,
  SCHEDULE_FREQUENCIES,
  TOKEN_BUDGETS,
  executeScheduledTask,
  getScheduledDaemonStatus,
  installScheduledDaemon,
  intervalSeconds,
  launchdLabelFor,
  launchdPlist,
  loadScheduledRuns,
  loadScheduledTasks,
  nextRunAt,
  saveScheduledRuns,
  saveScheduledTasks,
  uninstallScheduledDaemon,
  type DaemonStatus,
  type ScheduledRunRecord,
  type ScheduledTask,
} from "../lib/schedule";

interface ScheduledViewProps {
  projects?: Project[];
  defaultProjectPath?: string;
}

function formatDateTime(ms: number | null): string {
  if (!ms) return "Jamais";
  return new Date(ms).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusBadge(status: string | null): { label: string; className: string } {
  switch (status) {
    case "ok":
      return { label: "Succès", className: "bg-[#243828] text-[#8ce09b]" };
    case "budget_exceeded":
      return { label: "Budget dépassé", className: "bg-[#3f2c1f] text-[#f0a868]" };
    case "error":
      return { label: "Erreur", className: "bg-[#3d2324] text-[#f48b87]" };
    default:
      return { label: "En attente", className: "bg-[#2b2b29] text-[#8c8b83]" };
  }
}

export default function ScheduledView({ projects = [], defaultProjectPath }: ScheduledViewProps) {
  const initialProject =
    (defaultProjectPath && defaultProjectPath !== NO_PROJECT ? defaultProjectPath : undefined) ??
    projects[0]?.path ??
    "/tmp/kana";

  const [tasks, setTasks] = useState<ScheduledTask[]>(loadScheduledTasks);
  const [runs, setRuns] = useState<ScheduledRunRecord[]>(loadScheduledRuns);

  const [showForm, setShowForm] = useState(false);
  const [showDaemon, setShowDaemon] = useState(false);

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectPath, setProjectPath] = useState(initialProject);
  const [agentId, setAgentId] = useState<string>(AGENTS[0]?.id ?? "claude");
  const [interval, setInterval] = useState<string>("1h");
  const [maxTokensBudget, setMaxTokensBudget] = useState<number>(50_000);

  const [openPlistId, setOpenPlistId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [daemonIntervalSecs, setDaemonIntervalSecs] = useState<number>(300);
  const [daemonBusy, setDaemonBusy] = useState(false);
  const [daemonError, setDaemonError] = useState("");
  const [daemonNotice, setDaemonNotice] = useState("");

  useEffect(() => {
    let active = true;
    void getScheduledDaemonStatus()
      .then((status) => {
        if (active) setDaemonStatus(status);
      })
      .catch((err) => {
        if (active) setDaemonError(String(err));
      });
    return () => {
      active = false;
    };
  }, []);

  const handleInstallDaemon = async () => {
    if (daemonBusy) return;
    setDaemonBusy(true);
    setDaemonError("");
    setDaemonNotice("");
    try {
      const next = await installScheduledDaemon(daemonIntervalSecs);
      setDaemonStatus(next);
      setDaemonNotice(next.message);
    } catch (err) {
      setDaemonError(String(err));
    } finally {
      setDaemonBusy(false);
    }
  };

  const handleUninstallDaemon = async () => {
    if (daemonBusy) return;
    setDaemonBusy(true);
    setDaemonError("");
    setDaemonNotice("");
    try {
      const next = await uninstallScheduledDaemon();
      setDaemonStatus(next);
      setDaemonNotice(next.message);
    } catch (err) {
      setDaemonError(String(err));
    } finally {
      setDaemonBusy(false);
    }
  };

  const updateTasks = (next: ScheduledTask[]) => {
    setTasks(next);
    saveScheduledTasks(next);
  };

  const updateRuns = (next: ScheduledRunRecord[]) => {
    setRuns(next);
    saveScheduledRuns(next);
  };

  const createTask = (event: FormEvent) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const cleanPrompt = prompt.trim();
    if (!cleanTitle || !cleanPrompt) return;
    const task: ScheduledTask = {
      id: `sched-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      prompt: cleanPrompt,
      projectPath: projectPath.trim() || initialProject,
      agentId,
      interval,
      maxTokensBudget,
      enabled: true,
      lastRunAt: null,
      lastStatus: null,
    };
    updateTasks([task, ...tasks]);
    setTitle("");
    setPrompt("");
    setShowForm(false);
  };

  const toggleEnabled = (id: string) => {
    updateTasks(tasks.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  const removeTask = (id: string) => {
    updateTasks(tasks.filter((t) => t.id !== id));
    if (openPlistId === id) setOpenPlistId(null);
  };

  const runNow = async (task: ScheduledTask) => {
    if (runningId) return;
    setRunningId(task.id);
    try {
      let tokensUsed: number | undefined;
      let summary: string | undefined;

      if (inTauri) {
        const threadId = `sched:${task.id}:${Date.now()}`;
        let totalTokens = 0;
        let output = "";
        let unlisten: (() => void) | undefined;
        try {
          await new Promise<void>(async (resolve) => {
            const timeout = setTimeout(() => resolve(), 60_000);
            unlisten = await onAgentEvent((ev) => {
              if (ev.threadId !== threadId) return;
              if (ev.kind === "message") output += ev.text;
              else if (ev.kind === "turn_usage") totalTokens += ev.total_tokens;
              else if (ev.kind === "done" || ev.kind === "error" || ev.kind === "closed") {
                clearTimeout(timeout);
                resolve();
              }
            });
            await startAgent(threadId, task.agentId, task.projectPath);
            await sendPrompt(threadId, task.prompt);
          });
        } finally {
          unlisten?.();
          await stopAgent(threadId).catch(() => {});
        }
        if (totalTokens > 0) tokensUsed = totalTokens;
        if (output.trim()) summary = output.trim().slice(0, 220);
      }

      const result = executeScheduledTask(task, { tokensUsed, summary });
      updateTasks(tasks.map((t) => (t.id === task.id ? result.task : t)));
      updateRuns([result.run, ...runs].slice(0, 50));
    } finally {
      setRunningId(null);
    }
  };

  const copyPlist = (task: ScheduledTask) => {
    const xml = launchdPlist(
      launchdLabelFor(task),
      "/Applications/Kana.app/Contents/MacOS/Kana",
      intervalSeconds(task.interval),
    );
    void navigator.clipboard?.writeText(xml).catch(() => {});
    setCopiedId(task.id);
    setTimeout(() => setCopiedId((cur) => (cur === task.id ? null : cur)), 2000);
  };

  const projectOptions = Array.from(
    new Map(
      [
        ...projects.filter((p) => p.path && p.path !== NO_PROJECT).map((p) => [p.path, p.name] as const),
        ...(initialProject ? [[initialProject, initialProject.split("/").pop() || initialProject] as const] : []),
      ],
    ).entries(),
  );

  const daemonActive = Boolean(daemonStatus?.loaded);

  return (
    <div className="flex-1 overflow-y-auto p-7 select-text">
      <div className="mx-auto max-w-[760px] space-y-6">
        {/* En-tête sur 1 ligne */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[18px] font-semibold tracking-tight text-[#ecebe4]">Tâches planifiées</h1>

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-expanded={showDaemon}
              onClick={() => setShowDaemon((v) => !v)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] transition ${
                showDaemon
                  ? "border-[#454540] bg-[#2b2b29] text-[#ecebe4]"
                  : "border-[#2f2f2c] bg-[#21211f] text-[#cfcec6] hover:bg-[#2b2b29]"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${daemonActive ? "bg-[#3fb950]" : "bg-[#6f6e68]"}`}
                aria-hidden="true"
              />
              <span>Daemon (launchd)</span>
              <span className="text-[11.5px] text-[#8c8b83]">{daemonActive ? "Actif" : "Inactif"}</span>
            </button>

            <button
              type="button"
              aria-expanded={showForm}
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-[#ecebe4] px-3 py-1.5 text-[12.5px] font-medium text-[#181817] transition hover:bg-[#dcdbd3]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              <span>Nouvelle tâche</span>
            </button>
          </div>
        </div>

        {/* Panneau compact du daemon système (déplié au clic sur le badge) */}
        {showDaemon && (
          <section
            aria-label="Daemon système macOS (launchd)"
            className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-[#ecebe4]">
                  <span>Daemon système macOS (<code>launchd</code>)</span>
                  {daemonStatus && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-normal ${
                        daemonStatus.loaded
                          ? "bg-[#243828] text-[#8ce09b]"
                          : daemonStatus.installed
                            ? "bg-[#3f2c1f] text-[#f0a868]"
                            : "bg-[#2b2b29] text-[#8c8b83]"
                      }`}
                    >
                      {daemonStatus.loaded
                        ? "Actif (app fermée)"
                        : daemonStatus.installed
                          ? "Installé (inactif)"
                          : "Non installé"}
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-[#8c8b83]">
                  Exécute automatiquement les tâches échues en arrière-plan même lorsque Kana est fermée.
                </p>
              </div>

              <label className="block space-y-1 text-[12px] text-[#8c8b83]">
                <span>Vérification</span>
                <select
                  aria-label="Intervalle du daemon"
                  value={daemonIntervalSecs}
                  onChange={(e) => setDaemonIntervalSecs(Number(e.target.value))}
                  className="rounded-lg border border-[#343430] bg-[#181817] px-2.5 py-1 text-[12.5px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  {DAEMON_INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.secs} value={opt.secs}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {daemonStatus && (
              <div className="space-y-0.5 rounded-lg border border-[#2f2f2c] bg-[#181817] px-3 py-2 font-mono text-[11.5px] text-[#8c8b83]">
                <div>plist : {daemonStatus.plistPath}</div>
                <div>log : {daemonStatus.logPath}</div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={daemonBusy || daemonStatus?.platformSupported === false}
                onClick={() => void handleInstallDaemon()}
                className="flex items-center gap-1.5 rounded-lg bg-[#2b2b29] px-3 py-1.5 text-[12.5px] font-medium text-[#ecebe4] transition hover:bg-[#383835] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Power className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>
                  {daemonBusy
                    ? "Configuration…"
                    : daemonStatus?.loaded
                      ? "Mettre à jour le daemon"
                      : "Installer / Activer le daemon système (launchctl)"}
                </span>
              </button>

              {daemonStatus?.installed && (
                <button
                  type="button"
                  disabled={daemonBusy}
                  onClick={() => void handleUninstallDaemon()}
                  className="rounded-lg px-3 py-1.5 text-[12.5px] text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4] disabled:opacity-40"
                >
                  Désactiver le daemon
                </button>
              )}
            </div>

            {daemonNotice && (
              <p className="rounded-lg bg-[#243828] px-3 py-1.5 text-[12px] text-[#8ce09b]">{daemonNotice}</p>
            )}
            {daemonError && (
              <p className="rounded-lg bg-[#3d2324] px-3 py-1.5 text-[12px] text-[#f48b87]">{daemonError}</p>
            )}
          </section>
        )}

        {/* Formulaire de création (ouvert à la demande via + Nouvelle tâche) */}
        {showForm && (
          <form
            onSubmit={createTask}
            className="space-y-3 rounded-xl border border-[#2f2f2c] bg-[#21211f] p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-[12px] text-[#8c8b83]">
                <span>Titre</span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Résumé matinal des changements"
                  aria-label="Titre de la tâche"
                  className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f]"
                />
              </label>

              <label className="block space-y-1 text-[12px] text-[#8c8b83]">
                <span>Projet</span>
                <select
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  aria-label="Projet"
                  className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  {projectOptions.map(([path, name]) => (
                    <option key={path} value={path}>
                      {name} ({path})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="block space-y-1 text-[12px] text-[#8c8b83]">
              <span>Prompt</span>
              <textarea
                rows={2}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Instruction envoyée périodiquement à l'agent…"
                aria-label="Prompt de la tâche"
                className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f]"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block space-y-1 text-[12px] text-[#8c8b83]">
                <span>Agent</span>
                <select
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
                  aria-label="Agent"
                  className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  {AGENTS.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-[12px] text-[#8c8b83]">
                <span>Fréquence</span>
                <select
                  value={interval}
                  onChange={(e) => setInterval(e.target.value)}
                  aria-label="Fréquence"
                  className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  {SCHEDULE_FREQUENCIES.map((freq) => (
                    <option key={freq.id} value={freq.id}>
                      {freq.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-[12px] text-[#8c8b83]">
                <span>Budget max (jetons)</span>
                <select
                  value={maxTokensBudget}
                  onChange={(e) => setMaxTokensBudget(Number(e.target.value))}
                  aria-label="Budget max"
                  className="w-full rounded-lg border border-[#343430] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
                >
                  {TOKEN_BUDGETS.map((budget) => (
                    <option key={budget} value={budget}>
                      {budget.toLocaleString("fr-FR")} jetons
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg px-3 py-1.5 text-[12.5px] text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={!title.trim() || !prompt.trim()}
                className="rounded-lg bg-[#ecebe4] px-3.5 py-1.5 text-[12.5px] font-medium text-[#181817] transition hover:bg-[#dcdbd3] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Créer la tâche
              </button>
            </div>
          </form>
        )}

        {/* État vide sobre ou liste compacte */}
        {tasks.length === 0 ? (
          <div className="py-16 text-center space-y-1.5">
            <p className="text-[14px] font-medium text-[#ecebe4]">Aucune tâche planifiée</p>
            <p className="mx-auto max-w-[46ch] text-[13px] text-[#8c8b83]">
              Exécute un prompt selon un calendrier, comme un résumé matinal des changements.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tasks.map((task) => {
              const badge = statusBadge(task.lastStatus);
              const agentName = AGENTS.find((a) => a.id === task.agentId)?.name ?? task.agentId;
              const plistXml = launchdPlist(
                launchdLabelFor(task),
                "/Applications/Kana.app/Contents/MacOS/Kana",
                intervalSeconds(task.interval),
              );
              const isPlistOpen = openPlistId === task.id;
              return (
                <div
                  key={task.id}
                  className="space-y-2.5 rounded-xl border border-[#2f2f2c] bg-[#21211f] px-4 py-3.5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-[#ecebe4]">{task.title}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            task.enabled ? "bg-[#253629] text-[#8ce09b]" : "bg-[#2b2b29] text-[#8c8b83]"
                          }`}
                        >
                          {task.enabled ? "Active" : "En pause"}
                        </span>
                        {task.lastStatus && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] ${badge.className}`}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[12.5px] text-[#b8b7ae]">{task.prompt}</p>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-[#8c8b83]">
                        <span>{agentName}</span>
                        <span>· {task.interval}</span>
                        <span>· {task.maxTokensBudget.toLocaleString("fr-FR")} jetons</span>
                        <span>· Dernière : {formatDateTime(task.lastRunAt)}</span>
                        <span>· Prochaine : {formatDateTime(nextRunAt(task.interval, task.lastRunAt))}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={runningId === task.id}
                        onClick={() => void runNow(task)}
                        className="flex items-center gap-1.5 rounded-lg bg-[#2b2b29] px-2.5 py-1.5 text-[12px] text-[#ecebe4] transition hover:bg-[#383835] disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
                        <span>{runningId === task.id ? "Exécution…" : "Exécuter maintenant"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleEnabled(task.id)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
                      >
                        {task.enabled ? (
                          <>
                            <Pause className="h-3.5 w-3.5" strokeWidth={1.8} />
                            <span>Pause</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5" strokeWidth={1.8} />
                            <span>Activer</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => setOpenPlistId(isPlistOpen ? null : task.id)}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#ecebe4]"
                      >
                        <Terminal className="h-3.5 w-3.5" strokeWidth={1.8} />
                        <span>.plist</span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Supprimer ${task.title}`}
                        onClick={() => removeTask(task.id)}
                        className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#2b2b29] hover:text-[#f87171]"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>

                  {isPlistOpen && (
                    <div className="space-y-2 rounded-lg border border-[#2f2f2c] bg-[#181817] p-3">
                      <div className="flex items-center justify-between gap-2 text-[12px] text-[#8c8b83]">
                        <span>~/Library/LaunchAgents/{launchdLabelFor(task)}.plist</span>
                        <button
                          type="button"
                          onClick={() => copyPlist(task)}
                          className="flex items-center gap-1 rounded-md bg-[#2b2b29] px-2 py-1 text-[11.5px] text-[#ecebe4] transition hover:bg-[#383835]"
                        >
                          {copiedId === task.id ? (
                            <>
                              <Check className="h-3 w-3 text-[#3fb950]" strokeWidth={2} />
                              <span>Copié</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" strokeWidth={1.8} />
                              <span>Copier .plist</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="overflow-x-auto font-mono text-[11.5px] leading-relaxed text-[#cfcec6]">
                        <code>{plistXml}</code>
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Historique : visible uniquement s'il y a au moins 1 exécution */}
        {runs.length > 0 && (
          <section className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-medium text-[#8c8b83]">Historique des exécutions</h2>
              <button
                type="button"
                onClick={() => updateRuns([])}
                className="text-[12px] text-[#8c8b83] transition hover:text-[#ecebe4]"
              >
                Effacer l'historique
              </button>
            </div>

            <div className="space-y-2">
              {runs.map((run) => {
                const task = tasks.find((t) => t.id === run.taskId);
                const badge = statusBadge(run.status);
                return (
                  <div
                    key={run.id}
                    className="rounded-xl border border-[#2f2f2c] bg-[#21211f] px-3.5 py-2.5 text-[12.5px]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[#ecebe4]">{task?.title ?? run.taskId}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[12px] text-[#8c8b83]">
                        <span>
                          {run.tokensUsed.toLocaleString("fr-FR")} /{" "}
                          {(task?.maxTokensBudget ?? 0).toLocaleString("fr-FR")} jetons
                        </span>
                        <span>{formatDateTime(run.ranAt)}</span>
                      </div>
                    </div>
                    <p className="mt-1 text-[#b8b7ae]">{run.summary}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
