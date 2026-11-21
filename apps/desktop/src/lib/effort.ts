import { useSyncExternalStore } from "react";

const KEY = "kana-effort";
const listeners = new Set<() => void>();

function read(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Le niveau d'effort choisi pour un fournisseur (le même pour toutes ses conversations). */
export const chosenEffort = (agentId: string): string | undefined => read()[agentId];

export function chooseEffort(agentId: string, value: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [agentId]: value }));
  } catch {
    // stockage indisponible : le choix ne sera pas retenu
  }
  listeners.forEach((l) => l());
}

export function useChosenEffort(agentId: string): string | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => read()[agentId],
  );
}

const FRENCH: Record<string, string> = {
  default: "Par défaut",
  none: "Aucun",
  minimal: "Minimal",
  low: "Faible",
  medium: "Moyen",
  high: "Élevé",
  xhigh: "Très élevé",
  max: "Maximum",
};

/** Le nom d'un niveau d'effort en français ; un niveau inconnu garde le nom de l'agent. */
export const effortLabel = (id: string, fallback?: string) => FRENCH[id.toLowerCase()] ?? fallback ?? id;
