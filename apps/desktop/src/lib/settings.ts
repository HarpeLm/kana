import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface AuthMethod {
  id: string;
  name: string;
  description: string;
}

export type AgentStatus =
  | { status: "ready" }
  | { status: "auth_required"; methods: AuthMethod[] };

// Simulation pour un navigateur sans Tauri : rien n'est réellement stocké ni connecté.
const demoKeys = new Set<string>();
const demoStatus: AgentStatus = {
  status: "auth_required",
  methods: [
    {
      id: "demo",
      name: "Se connecter (démo)",
      description: "Mode navigateur : aucune vraie connexion.",
    },
  ],
};

export function checkAgent(agent: string): Promise<AgentStatus> {
  return inTauri ? invoke("check_agent", { agent }) : Promise.resolve(demoStatus);
}

export function loginAgent(agent: string, methodId: string): Promise<void> {
  return inTauri ? invoke("login_agent", { agent, methodId }) : Promise.resolve();
}

export function hasApiKey(agent: string): Promise<boolean> {
  return inTauri ? invoke("has_api_key", { agent }) : Promise.resolve(demoKeys.has(agent));
}

export function setApiKey(agent: string, key: string): Promise<void> {
  if (inTauri) return invoke("set_api_key", { agent, key });
  demoKeys.add(agent);
  return Promise.resolve();
}

export function deleteApiKey(agent: string): Promise<void> {
  if (inTauri) return invoke("delete_api_key", { agent });
  demoKeys.delete(agent);
  return Promise.resolve();
}

export function setKeepAwake(active: boolean): Promise<boolean> {
  return inTauri ? invoke<boolean>("set_keep_awake", { active }) : Promise.resolve(active);
}
