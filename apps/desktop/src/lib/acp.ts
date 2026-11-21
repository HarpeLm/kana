import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as mock from "./acpMock";
import { inTauri } from "./env";
import { recordTraceFrame } from "./observability";

export interface PermissionOption {
  id: string;
  name: string;
  kind: string;
}

export interface AvailableCommand {
  name: string;
  description: string;
  hint?: string | null;
}

export type AcpEvent =
  | { kind: "message"; text: string }
  | { kind: "thought"; text: string }
  | {
      kind: "tool_call";
      id: string;
      title: string | null;
      status: string | null;
      raw_input?: unknown;
      output?: string | null;
    }
  | {
      kind: "turn_usage";
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      cache_read_tokens?: number;
      cache_write_tokens?: number;
    }
  | { kind: "context"; used: number; size: number }
  | { kind: "plan"; entries: { content: string; status: string }[] }
  | { kind: "available_commands"; commands: AvailableCommand[] }
  | { kind: "permission"; request_id: string; title: string; options: PermissionOption[] }
  | { kind: "done"; stop_reason: string }
  | { kind: "error"; message: string }
  | { kind: "closed" };

export type ThreadEvent = AcpEvent & { threadId: string };

export type Unlisten = () => void;

export interface StartedSession {
  sessionId: string;
  resumed: boolean;
}

export interface AgentEnvironment {
  kind: "local" | "ssh" | "docker" | "devcontainer";
  target?: string;
  sandbox?: boolean;
  readOnly?: boolean;
}

export interface UserMcpServerParam {
  name: string;
  transport: "stdio" | "http" | "sse";
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  oauthToken?: string;
  headers?: Record<string, string>;
}

// Dans un navigateur simple (sans Tauri), on bascule sur un agent simulé.
const mockSessions = new Set<string>();
const subscribers = new Set<(event: ThreadEvent) => void>();
let upstreamUnlisten: Unlisten | null = null;
let upstreamStarting: Promise<void> | null = null;

function isMcpToolCall(event: ThreadEvent): boolean {
  if (event.kind !== "tool_call") return false;
  const hay = `${event.title ?? ""} ${JSON.stringify(event.raw_input ?? "")}`.toLowerCase();
  return hay.includes("mcp") || hay.includes("browser_");
}

function dispatchAgentEvent(event: ThreadEvent): void {
  recordTraceFrame({
    direction: isMcpToolCall(event) ? "mcp" : "in",
    method: `acp/${event.kind}`,
    threadId: event.threadId,
    summary:
      event.kind === "message"
        ? event.text.slice(0, 80)
        : event.kind === "tool_call"
          ? `${event.title ?? event.id} (${event.status ?? "pending"})`
          : event.kind === "permission"
            ? event.title
            : event.kind === "error"
              ? event.message
              : event.kind === "done"
                ? event.stop_reason
                : undefined,
    payload: event,
  });
  for (const listener of [...subscribers]) {
    listener(event);
  }
}

async function ensureUpstream(): Promise<void> {
  if (upstreamUnlisten) return;
  if (upstreamStarting) return upstreamStarting;
  upstreamStarting = (async () => {
    if (!inTauri) {
      upstreamUnlisten = mock.subscribe(dispatchAgentEvent);
    } else {
      upstreamUnlisten = await listen<ThreadEvent>("acp-event", (e) => dispatchAgentEvent(e.payload));
    }
    if (subscribers.size === 0 && upstreamUnlisten) {
      const off = upstreamUnlisten;
      upstreamUnlisten = null;
      off();
    }
  })().finally(() => {
    upstreamStarting = null;
  });
  return upstreamStarting;
}

/** Lance l'agent d'un fil, dans `cwd` (le dossier de travail de la conversation) s'il y en a un. */
export function startAgent(
  threadId: string,
  agent: string,
  cwd?: string,
  model?: string,
  effort?: string,
  resumeSessionId?: string,
  environment?: AgentEnvironment,
  mcpServers?: UserMcpServerParam[],
): Promise<StartedSession> {
  recordTraceFrame({
    direction: "out",
    method: "agent/start",
    threadId,
    summary: `${agent}${model ? ` · ${model}` : ""}${environment?.kind ? ` (${environment.kind})` : ""}`,
    payload: { agent, cwd, model, effort, resumeSessionId, environment, mcpCount: mcpServers?.length ?? 0 },
  });
  if (mcpServers && mcpServers.length > 0) {
    recordTraceFrame({
      direction: "mcp",
      method: "mcp/attach",
      threadId,
      summary: mcpServers.map((s) => `${s.name} (${s.transport})`).join(", "),
      payload: mcpServers.map((s) => ({ name: s.name, transport: s.transport, url: s.url, command: s.command })),
    });
  }
  if (inTauri) {
    return invoke<StartedSession>("start_agent", {
      threadId,
      agent,
      cwd: cwd ?? null,
      model: model ?? null,
      effort: effort ?? null,
      resumeSessionId: resumeSessionId ?? null,
      environment: environment ?? null,
      mcpServers: mcpServers?.length ? mcpServers : null,
    });
  }
  const resumed = mockSessions.has(threadId) || !!resumeSessionId;
  mockSessions.add(threadId);
  return Promise.resolve({ sessionId: resumeSessionId ?? "mock", resumed });
}

/** Met l'agent en mode « plan » (il refuse alors lui-même de modifier quoi que ce soit) ou le remet en mode habituel. `false` : il n'a pas de mode plan. */
export function setPlanMode(threadId: string, on: boolean): Promise<boolean> {
  return inTauri ? invoke<boolean>("set_plan_mode", { threadId, on }) : Promise.resolve(false);
}

/** Arrête l'agent d'un fil : le prochain message en lance un neuf (peut-être d'un autre fournisseur). */
export function stopAgent(threadId: string): Promise<void> {
  if (!inTauri) {
    mockSessions.delete(threadId);
    return Promise.resolve();
  }
  return invoke("stop_agent", { threadId });
}

export function sendPrompt(threadId: string, text: string, images: string[] = []): Promise<void> {
  recordTraceFrame({
    direction: "out",
    method: "session/prompt",
    threadId,
    summary: text.slice(0, 100),
    payload: { length: text.length, images: images.length },
  });
  return inTauri ? invoke("send_prompt", { threadId, text, images }) : mock.sendPrompt(threadId, text);
}

export function cancelPrompt(threadId: string): Promise<void> {
  if (!inTauri) {
    mock.cancelPrompt(threadId);
    return Promise.resolve();
  }
  return invoke("cancel_prompt", { threadId });
}

export function answerPermission(
  threadId: string,
  requestId: string,
  optionId: string | null,
): Promise<void> {
  recordTraceFrame({
    direction: "out",
    method: "session/permission_response",
    threadId,
    summary: `${requestId} -> ${optionId ?? "cancel"}`,
    payload: { requestId, optionId },
  });
  return inTauri
    ? invoke("answer_permission", { threadId, requestId, optionId })
    : Promise.resolve();
}

export async function onAgentEvent(handler: (event: ThreadEvent) => void): Promise<Unlisten> {
  subscribers.add(handler);
  await ensureUpstream();
  return () => {
    subscribers.delete(handler);
    if (subscribers.size === 0 && upstreamUnlisten) {
      const off = upstreamUnlisten;
      upstreamUnlisten = null;
      off();
    }
  };
}
