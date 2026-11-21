import { persistSharedSetting } from "./store";

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  projectPath: string;
  agentId: string;
  interval: string;
  maxTokensBudget: number;
  enabled: boolean;
  lastRunAt: number | null;
  lastStatus: string | null;
}

export interface ScheduledRunRecord {
  id: string;
  taskId: string;
  ranAt: number;
  status: string;
  tokensUsed: number;
  summary: string;
}

export const SCHEDULED_TASKS_KEY = "kana-scheduled-tasks";
export const SCHEDULED_RUNS_KEY = "kana-scheduled-runs";

export const SCHEDULE_FREQUENCIES = [
  { id: "15m", label: "Toutes les 15 min" },
  { id: "1h", label: "Toutes les heures" },
  { id: "6h", label: "Toutes les 6 h" },
  { id: "daily:09:00", label: "Tous les jours à 09:00" },
] as const;

export const TOKEN_BUDGETS = [25_000, 50_000, 100_000, 250_000] as const;

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const memoryStore = new Map<string, string>();

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readStorage(key: string): string | null {
  if (hasBrowserStorage()) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryStore.get(key) ?? null;
}

function writeStorage(key: string, value: string): void {
  if (hasBrowserStorage()) {
    persistSharedSetting(key, value);
    return;
  }
  memoryStore.set(key, value);
}

export function loadScheduledTasks(): ScheduledTask[] {
  try {
    const parsed = JSON.parse(readStorage(SCHEDULED_TASKS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScheduledTasks(tasks: ScheduledTask[]): void {
  writeStorage(SCHEDULED_TASKS_KEY, JSON.stringify(tasks));
}

export function loadScheduledRuns(): ScheduledRunRecord[] {
  try {
    const parsed = JSON.parse(readStorage(SCHEDULED_RUNS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScheduledRuns(runs: ScheduledRunRecord[]): void {
  writeStorage(SCHEDULED_RUNS_KEY, JSON.stringify(runs));
}

type ParsedSchedule =
  | { kind: "fixed"; ms: number }
  | { kind: "daily"; hour: number; minute: number };

function parseSchedule(interval: string): ParsedSchedule {
  const trimmed = interval.trim();
  if (trimmed.startsWith("daily:")) {
    const [h, m] = trimmed.slice("daily:".length).split(":");
    const hour = Number(h);
    const minute = Number(m);
    if (Number.isInteger(hour) && Number.isInteger(minute) && hour >= 0 && hour < 24 && minute >= 0 && minute < 60) {
      return { kind: "daily", hour, minute };
    }
  }
  if (trimmed.endsWith("m")) {
    const n = Number(trimmed.slice(0, -1));
    if (Number.isFinite(n) && n > 0) return { kind: "fixed", ms: n * MINUTE_MS };
  }
  if (trimmed.endsWith("h")) {
    const n = Number(trimmed.slice(0, -1));
    if (Number.isFinite(n) && n > 0) return { kind: "fixed", ms: n * HOUR_MS };
  }
  return { kind: "fixed", ms: HOUR_MS };
}

function dayStartUtc(ms: number): number {
  const mod = ((ms % DAY_MS) + DAY_MS) % DAY_MS;
  return ms - mod;
}

export function nextRunAt(interval: string, lastRunAt: number | null, nowMs: number = Date.now()): number {
  const parsed = parseSchedule(interval);
  if (parsed.kind === "fixed") {
    return lastRunAt !== null ? lastRunAt + parsed.ms : nowMs;
  }
  const offset = (parsed.hour * 60 + parsed.minute) * MINUTE_MS;
  if (lastRunAt !== null) {
    const candidate = dayStartUtc(lastRunAt) + offset;
    return lastRunAt < candidate ? candidate : candidate + DAY_MS;
  }
  const today = dayStartUtc(nowMs) + offset;
  return nowMs <= today ? today : today + DAY_MS;
}

export function isTaskDue(task: ScheduledTask, nowMs: number = Date.now()): boolean {
  return task.enabled && nextRunAt(task.interval, task.lastRunAt, nowMs) <= nowMs;
}

export function withinBudget(tokensUsed: number, maxBudget: number): boolean {
  return tokensUsed <= maxBudget;
}

export function intervalSeconds(interval: string): number {
  const parsed = parseSchedule(interval);
  if (parsed.kind === "daily") return 86_400;
  return Math.max(1, Math.round(parsed.ms / 1_000));
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function launchdLabelFor(task: Pick<ScheduledTask, "id">): string {
  const safeId = task.id.replace(/[^a-zA-Z0-9.-]/g, "-");
  return `com.kana.schedule.${safeId}`;
}

export function launchdPlist(label: string, program: string, intervalSecs: number): string {
  const safeLabel = escapeXml(label);
  const safeProgram = escapeXml(program);
  const safeInterval = Math.max(1, Math.floor(intervalSecs));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>Label</key>",
    `\t<string>${safeLabel}</string>`,
    "\t<key>ProgramArguments</key>",
    "\t<array>",
    `\t\t<string>${safeProgram}</string>`,
    "\t</array>",
    "\t<key>StartInterval</key>",
    `\t<integer>${safeInterval}</integer>`,
    "\t<key>RunAtLoad</key>",
    "\t<true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export function estimateTaskTokens(prompt: string): number {
  const base = 600 + prompt.trim().length * 24;
  return Math.max(600, Math.min(20_000, base));
}

export function executeScheduledTask(
  task: ScheduledTask,
  options?: { tokensUsed?: number; summary?: string; nowMs?: number },
): { task: ScheduledTask; run: ScheduledRunRecord } {
  const nowMs = options?.nowMs ?? Date.now();
  const tokensUsed = options?.tokensUsed ?? estimateTaskTokens(task.prompt);
  const ok = withinBudget(tokensUsed, task.maxTokensBudget);
  const status = ok ? "ok" : "budget_exceeded";
  const summary =
    options?.summary ??
    (ok
      ? `Exécution terminée pour « ${task.title} » (${tokensUsed.toLocaleString("fr-FR")} jetons).`
      : `Budget max dépassé : ${tokensUsed.toLocaleString("fr-FR")} / ${task.maxTokensBudget.toLocaleString("fr-FR")} jetons.`);

  const updatedTask: ScheduledTask = {
    ...task,
    lastRunAt: nowMs,
    lastStatus: status,
  };
  const run: ScheduledRunRecord = {
    id: `run-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    taskId: task.id,
    ranAt: nowMs,
    status,
    tokensUsed,
    summary,
  };
  return { task: updatedTask, run };
}
