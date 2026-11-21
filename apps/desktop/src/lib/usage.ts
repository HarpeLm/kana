import { useSyncExternalStore } from "react";
import type { Problem } from "./limits";
import { persistSharedSetting } from "./store";

/** Ce qu'un fournisseur, une session ou un projet a consommé. */
export interface DayUsage {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

export interface ProviderProblem extends Problem {
  message: string;
  /** Quand le souci a été constaté (ms). */
  at: number;
}

interface Store {
  /** jour (AAAA-MM-JJ) → fournisseur → consommation */
  days: Record<string, Record<string, DayUsage>>;
  /** threadId → consommation */
  sessions: Record<string, DayUsage>;
  /** projectPath → consommation */
  projects: Record<string, DayUsage>;
  problems: Record<string, ProviderProblem>;
}

const KEY = "kana-usage";
/** Sans heure de reprise connue, on suppose une heure avant de réessayer. */
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;
/** On ne garde que les derniers jours. */
const KEEP_DAYS = 14;

export const EMPTY_USAGE: DayUsage = {
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};

function normalizeUsage(raw: Partial<DayUsage> | undefined): DayUsage {
  if (!raw || typeof raw !== "object") return EMPTY_USAGE;
  return {
    turns: Number(raw.turns) || 0,
    inputTokens: Number(raw.inputTokens) || 0,
    outputTokens: Number(raw.outputTokens) || 0,
    totalTokens: Number(raw.totalTokens) || 0,
    cacheReadTokens: Number(raw.cacheReadTokens) || 0,
    cacheWriteTokens: Number(raw.cacheWriteTokens) || 0,
    costUsd: Number(raw.costUsd) || 0,
  };
}

function normalizeUsageMap(raw: unknown): Record<string, DayUsage> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, DayUsage> = {};
  for (const [k, v] of Object.entries(raw as Record<string, Partial<DayUsage>>)) {
    out[k] = normalizeUsage(v);
  }
  return out;
}

function load(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const rawDays = parsed?.days && typeof parsed.days === "object" ? (parsed.days as Record<string, unknown>) : {};
    const days: Record<string, Record<string, DayUsage>> = {};
    for (const [day, map] of Object.entries(rawDays)) {
      days[day] = normalizeUsageMap(map);
    }
    return {
      days,
      sessions: normalizeUsageMap(parsed?.sessions),
      projects: normalizeUsageMap(parsed?.projects),
      problems: parsed?.problems && typeof parsed.problems === "object" ? parsed.problems : {},
    };
  } catch {
    return { days: {}, sessions: {}, projects: {}, problems: {} };
  }
}

let store: Store = load();
let version = 0;
const listeners = new Set<() => void>();

function commit(next: Store): void {
  const days = Object.keys(next.days).sort().slice(-KEEP_DAYS);
  store = {
    ...next,
    days: Object.fromEntries(days.map((d) => [d, next.days[d]])),
  };
  version++;
  persistSharedSetting(KEY, JSON.stringify(store));
  listeners.forEach((notify) => notify());
}

export const dayKey = (at: number = Date.now()) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface ModelRatesUsdPerMillion {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function ratesFor(agent: string, modelId?: string): ModelRatesUsdPerMillion {
  const a = agent.trim().toLowerCase();
  const m = (modelId ?? "").trim().toLowerCase();

  if (m.includes("free")) {
    return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  }
  if (a === "claude" || m.includes("claude")) {
    if (m.includes("haiku")) return { input: 0.8, output: 4.0, cacheRead: 0.08, cacheWrite: 1.0 };
    if (m.includes("opus")) return { input: 15.0, output: 75.0, cacheRead: 1.5, cacheWrite: 18.75 };
    return { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 3.75 };
  }
  if (a === "codex" || m.includes("gpt") || m.includes("codex") || m.includes("o1") || m.includes("o3") || m.includes("o4")) {
    if (m.includes("mini") || m.includes("nano")) return { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 };
    if (m.includes("o1") || m.includes("o3") || m.includes("o4")) return { input: 10.0, output: 40.0, cacheRead: 2.5, cacheWrite: 10.0 };
    return { input: 2.5, output: 10.0, cacheRead: 0.625, cacheWrite: 2.5 };
  }
  if (a === "gemini" || m.includes("gemini")) {
    if (m.includes("flash")) return { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0.15 };
    return { input: 1.25, output: 5.0, cacheRead: 0.3125, cacheWrite: 1.25 };
  }
  if (a === "opencode") {
    return { input: 0.5, output: 1.5, cacheRead: 0.125, cacheWrite: 0.5 };
  }
  return { input: 2.0, output: 8.0, cacheRead: 0.5, cacheWrite: 2.0 };
}

/** Estime le coût en dollars US (`$`) à partir des jetons d'entrée, sortie et cache. */
export function estimateCostUsd(
  agent: string,
  input: number,
  output: number,
  cacheRead = 0,
  cacheWrite = 0,
  modelId?: string,
): number {
  const rates = ratesFor(agent, modelId);
  const usd =
    (Math.max(0, input) * rates.input +
      Math.max(0, output) * rates.output +
      Math.max(0, cacheRead) * rates.cacheRead +
      Math.max(0, cacheWrite) * rates.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Formate un coût en dollars (`$0.00`, `$0.0042`, `$1.25`). */
export function formatCostUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd <= 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function updateBucket(
  agent: string,
  change: (u: DayUsage) => DayUsage,
  context?: { threadId?: string; projectPath?: string },
): void {
  const day = dayKey();
  const today = store.days[day] ?? {};
  const nextDays = {
    ...store.days,
    [day]: { ...today, [agent]: change(today[agent] ?? EMPTY_USAGE) },
  };
  let nextSessions = store.sessions;
  if (context?.threadId) {
    nextSessions = {
      ...store.sessions,
      [context.threadId]: change(store.sessions[context.threadId] ?? EMPTY_USAGE),
    };
  }
  let nextProjects = store.projects;
  if (context?.projectPath && context.projectPath !== "none") {
    nextProjects = {
      ...store.projects,
      [context.projectPath]: change(store.projects[context.projectPath] ?? EMPTY_USAGE),
    };
  }
  commit({ ...store, days: nextDays, sessions: nextSessions, projects: nextProjects });
}

/** Un tour de plus pour ce fournisseur (la réponse est arrivée). */
export const recordTurn = (agent: string, context?: { threadId?: string; projectPath?: string }) =>
  updateBucket(agent, (u) => ({ ...u, turns: u.turns + 1 }), context);

export interface RecordTokensOptions {
  cacheRead?: number;
  cacheWrite?: number;
  threadId?: string;
  projectPath?: string;
  modelId?: string;
}

/** Les jetons qu'un tour a consommés (entrée, sortie, cache) et leur coût estimé en `$`. */
export function recordTokens(
  agent: string,
  input: number,
  output: number,
  total: number,
  options: RecordTokensOptions = {},
): void {
  const cacheRead = Math.max(0, options.cacheRead ?? 0);
  const cacheWrite = Math.max(0, options.cacheWrite ?? 0);
  const cost = estimateCostUsd(agent, input, output, cacheRead, cacheWrite, options.modelId);
  updateBucket(
    agent,
    (u) => ({
      ...u,
      inputTokens: u.inputTokens + input,
      outputTokens: u.outputTokens + output,
      totalTokens: u.totalTokens + total,
      cacheReadTokens: u.cacheReadTokens + cacheRead,
      cacheWriteTokens: u.cacheWriteTokens + cacheWrite,
      costUsd: Math.round((u.costUsd + cost) * 1_000_000) / 1_000_000,
    }),
    { threadId: options.threadId, projectPath: options.projectPath },
  );
}

export const usageToday = (agent: string): DayUsage => store.days[dayKey()]?.[agent] ?? EMPTY_USAGE;

export const usageForSession = (threadId: string): DayUsage => store.sessions[threadId] ?? EMPTY_USAGE;

export const usageForProject = (projectPath: string): DayUsage =>
  projectPath && projectPath !== "none" ? (store.projects[projectPath] ?? EMPTY_USAGE) : EMPTY_USAGE;

export function totalCostTodayUsd(): number {
  const today = store.days[dayKey()];
  if (!today) return 0;
  const total = Object.values(today).reduce((sum, u) => sum + (u.costUsd ?? 0), 0);
  return Math.round(total * 1_000_000) / 1_000_000;
}

export function reloadUsageFromStorage(): void {
  store = load();
  version++;
  listeners.forEach((notify) => notify());
}

/** Note qu'un fournisseur ne répond plus (limite atteinte, connexion refusée). */
export function markProblem(agent: string, problem: Problem, message: string, now: number = Date.now()): void {
  const until = problem.kind === "limit" ? (problem.until ?? now + DEFAULT_COOLDOWN_MS) : undefined;
  commit({ ...store, problems: { ...store.problems, [agent]: { ...problem, until, message: message.slice(0, 300), at: now } } });
}

export function clearProblem(agent: string): void {
  if (!store.problems[agent]) return;
  const { [agent]: _removed, ...rest } = store.problems;
  commit({ ...store, problems: rest });
}

/** Le souci en cours d'un fournisseur ; une limite dont l'heure de reprise est passée n'en est plus un. */
export function problemOf(agent: string, now: number = Date.now()): ProviderProblem | undefined {
  const problem = store.problems[agent];
  if (!problem) return undefined;
  if (problem.kind === "limit" && problem.until !== undefined && problem.until <= now) return undefined;
  return problem;
}

/** Change à chaque enregistrement : de quoi redessiner ce qui affiche la consommation. */
export function useUsageVersion(): number {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => version,
  );
}

/** « 12,3 k », « 1,2 M » : un nombre de jetons lisible. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} k`;
  return String(n);
}
