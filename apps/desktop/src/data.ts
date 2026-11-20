export type View = "workspace" | "relay";

export type ProviderState = "cooldown" | "active" | "standby";

export interface Thread {
  id: string;
  branch: string;
  agent: string;
  /** Identifiant du préréglage ACP côté Rust (`kana_acp::preset`). */
  agentId: string;
}

export interface Provider {
  name: string;
  status: string;
  usage: number;
  state: ProviderState;
}

export const THREADS: Thread[] = [
  { id: "1", branch: "feat/acp-client", agent: "Codex", agentId: "codex" },
  { id: "2", branch: "fix/failover-router", agent: "Claude", agentId: "claude" },
  { id: "3", branch: "feat/sqlite-store", agent: "Gemini", agentId: "gemini" },
  { id: "4", branch: "chore/opencode-test", agent: "OpenCode", agentId: "opencode" },
];

export const PROVIDERS: Provider[] = [
  { name: "Claude Code", status: "Cooldown 12m", usage: 100, state: "cooldown" },
  { name: "Codex", status: "Active · ACP Ready", usage: 34, state: "active" },
  { name: "Gemini CLI", status: "Standby · ACP Ready", usage: 12, state: "standby" },
  { name: "OpenCode", status: "Standby · ACP Ready", usage: 5, state: "standby" },
];
