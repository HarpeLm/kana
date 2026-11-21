import { useSyncExternalStore } from "react";
import { problemOf } from "./usage";

/** Le relais : quand un fournisseur ne répond plus, la conversation continue sur le suivant de la liste. */
export interface RelayConfig {
  /** Bascule sans demander. Désactivé : un bandeau propose la bascule. */
  auto: boolean;
  /** Les fournisseurs, par ordre de préférence. */
  order: string[];
  /** Fournisseurs retirés du relais (jamais choisis comme relais). */
  disabled: string[];
}

export const DEFAULT_RELAY: RelayConfig = {
  auto: false,
  // Les abonnements d'abord ; OpenCode, qui a des modèles gratuits, en dernier recours.
  order: ["claude", "codex", "gemini", "opencode"],
  disabled: [],
};

const KEY = "kana-relay";
let config: RelayConfig = load();
const listeners = new Set<() => void>();

function load(): RelayConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const order: string[] = Array.isArray(parsed.order) ? parsed.order : DEFAULT_RELAY.order;
    // Un fournisseur ajouté depuis rejoint la fin de la liste.
    const complete = [...order, ...DEFAULT_RELAY.order.filter((id) => !order.includes(id))];
    return { auto: !!parsed.auto, order: complete, disabled: Array.isArray(parsed.disabled) ? parsed.disabled : [] };
  } catch {
    return DEFAULT_RELAY;
  }
}

export const getRelay = () => config;

export function setRelay(next: RelayConfig): void {
  config = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stockage indisponible : le choix ne sera pas conservé
  }
  listeners.forEach((notify) => notify());
}

export function useRelay(): RelayConfig {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify);
      return () => listeners.delete(notify);
    },
    () => config,
  );
}

/**
 * Vers qui basculer quand `current` ne répond plus : le suivant de la liste, puis les précédents, qui n'est
 * ni retiré du relais ni en panne lui-même. `null` s'il n'y en a aucun.
 */
export function pickTarget(current: string, relay: RelayConfig, problem: (id: string) => unknown = (id) => problemOf(id)): string | null {
  const start = relay.order.indexOf(current);
  const candidates = [...relay.order.slice(start + 1), ...relay.order.slice(0, Math.max(0, start))];
  return candidates.find((id) => id !== current && !relay.disabled.includes(id) && !problem(id)) ?? null;
}
