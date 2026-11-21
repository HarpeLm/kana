import { useSyncExternalStore } from "react";
import type { Problem } from "./limits";

/** Ce qu'un fournisseur a consommé un jour donné. */
export interface DayUsage {
  turns: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ProviderProblem extends Problem {
  message: string;
  /** Quand le souci a été constaté (ms). */
  at: number;
}

interface Store {
  /** jour (AAAA-MM-JJ) → fournisseur → consommation */
  days: Record<string, Record<string, DayUsage>>;
  problems: Record<string, ProviderProblem>;
}

const KEY = "kana-usage";
/** Sans heure de reprise connue, on suppose une heure avant de réessayer. */
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;
/** On ne garde que les derniers jours. */
const KEEP_DAYS = 14;

let store: Store = load();
let version = 0;
const listeners = new Set<() => void>();

function load(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return { days: parsed.days ?? {}, problems: parsed.problems ?? {} };
  } catch {
    return { days: {}, problems: {} };
  }
}

function commit(next: Store): void {
  const days = Object.keys(next.days).sort().slice(-KEEP_DAYS);
  store = { ...next, days: Object.fromEntries(days.map((d) => [d, next.days[d]])) };
  version++;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // stockage indisponible : la consommation ne sera pas conservée
  }
  listeners.forEach((notify) => notify());
}

export const dayKey = (at: number = Date.now()) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const EMPTY: DayUsage = { turns: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };

function bump(agent: string, change: (u: DayUsage) => DayUsage): void {
  const day = dayKey();
  const today = store.days[day] ?? {};
  commit({ ...store, days: { ...store.days, [day]: { ...today, [agent]: change(today[agent] ?? EMPTY) } } });
}

/** Un tour de plus pour ce fournisseur (la réponse est arrivée). */
export const recordTurn = (agent: string) => bump(agent, (u) => ({ ...u, turns: u.turns + 1 }));

/** Les jetons qu'un tour a consommés, quand l'agent les annonce. */
export const recordTokens = (agent: string, input: number, output: number, total: number) =>
  bump(agent, (u) => ({
    ...u,
    inputTokens: u.inputTokens + input,
    outputTokens: u.outputTokens + output,
    totalTokens: u.totalTokens + total,
  }));

export const usageToday = (agent: string): DayUsage => store.days[dayKey()]?.[agent] ?? EMPTY;

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
