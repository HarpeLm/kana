import { useState, type FormEvent } from "react";
import { Check, Clock, Copy, Pause, Play, Plus, Terminal, Trash2 } from "lucide-react";
import { AGENTS } from "../data";
import { onAgentEvent, sendPrompt, startAgent, stopAgent } from "../lib/acp";
import { inTauri } from "../lib/env";
import { NO_PROJECT, type Project } from "../lib/projects";
import {
  SCHEDULE_FREQUENCIES,
  TOKEN_BUDGETS,
  executeScheduledTask,
  intervalSeconds,
  launchdLabelFor,
  launchdPlist,
  loadScheduledRuns,
  loadScheduledTasks,
  nextRunAt,
  saveScheduledRuns,
  saveScheduledTasks,
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
      return { label: "En attente", className: "bg-[#2c2c29] text-[#9a9992]" };
  }
}

export default function ScheduledView({ projects = [], defaultProjectPath }: ScheduledViewProps) {
  const initialProject =
    (defaultProjectPath && defaultProjectPath !== NO_PROJECT ? defaultProjectPath : undefined) ??
    projects[0]?.path ??
    "/tmp/kana";

  const [tasks, setTasks] = useState<ScheduledTask[]>(loadScheduledTasks);
  const [runs, setRuns] = useState<ScheduledRunRecord[]>(loadScheduledRuns);

  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [projectPath, setProjectPath] = useState(initialProject);
  const [agentId, setAgentId] = useState<string>(AGENTS[0]?.id ?? "claude");
  const [interval, setInterval] = useState<string>("1h");
  const [maxTokensBudget, setMaxTokensBudget] = useState<number>(50_000);

  const [openPlistId, setOpenPlistId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

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

  return (
    <div className="flex-1 overflow-y-auto p-7 select-text">
      <div className="mx-auto max-w-[740px] space-y-6">
        <div>
          <h1 className="mb-1 text-[16px] font-semibold text-[#ecebe4]">Tâches planifiées</h1>
          <p className="max-w-[60ch] text-[13px] text-[#8c8b83]">
            Lance un agent à heure fixe ou à intervalle régulier avec un budget maximal de jetons et une
            configuration daemon macOS <code>launchd</code>.
          </p>
        </div>

        <form
          onSubmit={createTask}
          className="space-y-3 rounded-2xl border border-[#343430] bg-[#21211f] p-4"
        >
          <div className="flex items-center gap-2 text-[13px] font-medium text-[#ecebe4]">
            <Plus className="h-4 w-4 text-[#d97757]" strokeWidth={1.8} />
            <span>Nouvelle tâche planifiée</span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-[12.5px] text-[#9a9992]">
              <span>Titre</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Audit sécurité quotidien"
                aria-label="Titre de la tâche"
                className="w-full rounded-lg border border-[#363632] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f]"
              />
            </label>

            <label className="block space-y-1 text-[12.5px] text-[#9a9992]">
              <span>Projet</span>
              <select
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                aria-label="Projet"
                className="w-full rounded-lg border border-[#363632] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
              >
                {projectOptions.map(([path, name]) => (
                  <option key={path} value={path}>
                    {name} ({path})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-[12.5px] text-[#9a9992]">
            <span>Prompt</span>
            <textarea
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Instruction envoyée périodiquement à l'agent..."
              aria-label="Prompt de la tâche"
              className="w-full rounded-lg border border-[#363632] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f]"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block space-y-1 text-[12.5px] text-[#9a9992]">
              <span>Agent</span>
              <select
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                aria-label="Agent"
                className="w-full rounded-lg border border-[#363632] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
              >
                {AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-[12.5px] text-[#9a9992]">
              <span>Fréquence</span>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                aria-label="Fréquence"
                className="w-full rounded-lg border border-[#363632] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
              >
                {SCHEDULE_FREQUENCIES.map((freq) => (
                  <option key={freq.id} value={freq.id}>
                    {freq.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1 text-[12.5px] text-[#9a9992]">
              <span>Budget max (jetons)</span>
              <select
                value={maxTokensBudget}
                onChange={(e) => setMaxTokensBudget(Number(e.target.value))}
                aria-label="Budget max"
                className="w-full rounded-lg border border-[#363632] bg-[#181817] px-3 py-1.5 text-[13px] text-[#ecebe4] outline-none focus:border-[#55554f]"
              >
                {TOKEN_BUDGETS.map((budget) => (
                  <option key={budget} value={budget}>
                    {budget.toLocaleString("fr-FR")} jetons
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!title.trim() || !prompt.trim()}
              className="rounded-lg bg-[#d97757] px-3.5 py-1.5 text-[13px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Créer la tâche
            </button>
          </div>
        </form>

        {tasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#343430] px-4 py-8 text-center text-[13px] text-[#7e7d76]">
            Aucune tâche planifiée pour l'instant.
          </div>
        ) : (
          <div className="space-y-3">
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
                  className="rounded-2xl border border-[#343430] bg-[#21211f] p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-[#ecebe4]">{task.title}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11.5px] ${
                            task.enabled ? "bg-[#253629] text-[#8ce09b]" : "bg-[#2f2f2c] text-[#8c8b83]"
                          }`}
                        >
                          {task.enabled ? "Active" : "En pause"}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-[11.5px] ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-[12.5px] text-[#b8b7ae]">{task.prompt}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#8c8b83]">
                        <span>{agentName}</span>
                        <span>· {task.interval}</span>
                        <span>· Budget max : {task.maxTokensBudget.toLocaleString("fr-FR")} jetons</span>
                        <span>· Dernière : {formatDateTime(task.lastRunAt)}</span>
                        <span>· Prochaine : {formatDateTime(nextRunAt(task.interval, task.lastRunAt))}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        disabled={runningId === task.id}
                        onClick={() => void runNow(task)}
                        className="flex items-center gap-1.5 rounded-lg bg-[#333331] px-2.5 py-1.5 text-[12px] text-[#ecebe4] transition hover:bg-[#3f3f3c] disabled:opacity-50"
                      >
                        <Play className="h-3.5 w-3.5" strokeWidth={1.8} />
                        <span>{runningId === task.id ? "Exécution…" : "Exécuter maintenant"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleEnabled(task.id)}
                        className="flex items-center gap-1 rounded-lg bg-[#2b2b29] px-2.5 py-1.5 text-[12px] text-[#dcdbd3] transition hover:bg-[#383835]"
                      >
                        {task.enabled ? (
                          <>
                            <Pause className="h-3.5 w-3.5" strokeWidth={1.8} />
                            <span>Mettre en pause</span>
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
                        className="flex items-center gap-1 rounded-lg bg-[#2b2b29] px-2.5 py-1.5 text-[12px] text-[#dcdbd3] transition hover:bg-[#383835]"
                      >
                        <Terminal className="h-3.5 w-3.5" strokeWidth={1.8} />
                        <span>launchd .plist</span>
                      </button>

                      <button
                        type="button"
                        aria-label={`Supprimer ${task.title}`}
                        onClick={() => removeTask(task.id)}
                        className="rounded-lg p-1.5 text-[#8c8b83] transition hover:bg-[#383835] hover:text-[#f87171]"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>

                  {isPlistOpen && (
                    <div className="rounded-xl border border-[#343430] bg-[#181817] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-[12px] text-[#9a9992]">
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

        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-medium text-[#ecebe4]">Historique des exécutions</h2>
            {runs.length > 0 && (
              <button
                type="button"
                onClick={() => updateRuns([])}
                className="text-[12px] text-[#8c8b83] transition hover:text-[#ecebe4]"
              >
                Effacer l'historique
              </button>
            )}
          </div>

          {runs.length === 0 ? (
            <p className="rounded-xl border border-[#2f2f2c] bg-[#1e1e1c] px-4 py-4 text-[12.5px] text-[#7e7d76]">
              Aucune exécution enregistrée pour le moment.
            </p>
          ) : (
            <div className="space-y-2">
              {runs.map((run) => {
                const task = tasks.find((t) => t.id === run.taskId);
                const badge = statusBadge(run.status);
                return (
                  <div
                    key={run.id}
                    className="rounded-xl border border-[#2f2f2c] bg-[#1e1e1c] px-3.5 py-2.5 text-[12.5px]"
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
          )}
        </section>
      </div>
    </div>
  );
}
