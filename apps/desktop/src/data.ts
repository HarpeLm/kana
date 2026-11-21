export type View = "workspace" | "relay" | "settings" | "scheduled" | "artifacts" | "customizations";

export interface AgentInfo {
  /** Identifiant du préréglage ACP côté Rust. */
  id: string;
  name: string;
  hint: string;
  /** Variable d'environnement de la clé d'API, si l'agent en accepte une. */
  keyVariable?: string;
}

export const AGENTS: AgentInfo[] = [
  {
    id: "codex",
    name: "Codex",
    hint: "Compte ChatGPT ou clé d'API OpenAI.",
    keyVariable: "OPENAI_API_KEY",
  },
  {
    id: "claude",
    name: "Claude Code",
    hint: "Compte Claude ou clé d'API Anthropic.",
    keyVariable: "ANTHROPIC_API_KEY",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    hint: "Compte Google ou clé d'API Gemini.",
    keyVariable: "GEMINI_API_KEY",
  },
  { id: "opencode", name: "OpenCode", hint: "Connexion par la commande opencode auth login." },
];

export type ProviderState = "cooldown" | "active" | "standby";

export interface Provider {
  name: string;
  status: string;
  usage: number;
  state: ProviderState;
}

export const PROVIDERS: Provider[] = [
  { name: "Claude Code", status: "Cooldown 12m", usage: 100, state: "cooldown" },
  { name: "Codex", status: "Active · ACP Ready", usage: 34, state: "active" },
  { name: "Gemini CLI", status: "Standby · ACP Ready", usage: 12, state: "standby" },
  { name: "OpenCode", status: "Standby · ACP Ready", usage: 5, state: "standby" },
];
