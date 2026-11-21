import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface ModelInfo {
  id: string;
  name: string;
}

export interface EffortInfo {
  config_id: string;
  current: string | null;
  options: ModelInfo[];
}

export interface AgentModels {
  current: string | null;
  available: ModelInfo[];
  /** Le niveau d'effort, quand l'agent en propose (`null` : il n'en propose pas ; absent : pas encore su). */
  effort?: EffortInfo | null;
}

const KEY = "kana-models";

type Cache = Record<string, AgentModels>;

function readCache(): Cache {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Les modèles déjà connus d'un agent (sans lancer l'agent). */
export function cachedModels(agentId: string): AgentModels | undefined {
  return readCache()[agentId];
}

/**
 * Demande à l'agent ses modèles (il est lancé un instant : compte plusieurs secondes) et retient
 * la réponse pour les prochaines fois.
 */
export async function fetchModels(agentId: string): Promise<AgentModels> {
  if (!inTauri) return { current: null, available: [], effort: null };
  const models = await invoke<AgentModels>("list_models", { agent: agentId });
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readCache(), [agentId]: models }));
  } catch {
    // stockage indisponible : la liste sera redemandée
  }
  return models;
}

/** Change le modèle d'un agent déjà lancé dans ce fil. */
export const setThreadModel = (threadId: string, model: string) =>
  invoke<void>("set_model", { threadId, model });

/** Change le niveau d'effort d'un agent déjà lancé dans ce fil. */
export const setThreadEffort = (threadId: string, value: string) =>
  invoke<void>("set_effort", { threadId, value });
