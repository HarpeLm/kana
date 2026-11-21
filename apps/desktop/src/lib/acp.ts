import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as mock from "./acpMock";
import { inTauri } from "./env";

export interface PermissionOption {
  id: string;
  name: string;
  kind: string;
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
  | { kind: "turn_usage"; input_tokens: number; output_tokens: number; total_tokens: number }
  | { kind: "context"; used: number; size: number }
  | { kind: "plan"; entries: { content: string; status: string }[] }
  | { kind: "permission"; request_id: string; title: string; options: PermissionOption[] }
  | { kind: "done"; stop_reason: string }
  | { kind: "error"; message: string }
  | { kind: "closed" };

export type ThreadEvent = AcpEvent & { threadId: string };

export type Unlisten = () => void;

// Dans un navigateur simple (sans Tauri), on bascule sur un agent simulé.

/** Lance l'agent d'un fil, dans `cwd` (le dossier de travail de la conversation) s'il y en a un. */
export function startAgent(threadId: string, agent: string, cwd?: string, model?: string, effort?: string): Promise<void> {
  return inTauri
    ? invoke("start_agent", { threadId, agent, cwd: cwd ?? null, model: model ?? null, effort: effort ?? null })
    : Promise.resolve();
}

/** Met l'agent en mode « plan » (il refuse alors lui-même de modifier quoi que ce soit) ou le remet en mode habituel. `false` : il n'a pas de mode plan. */
export function setPlanMode(threadId: string, on: boolean): Promise<boolean> {
  return inTauri ? invoke<boolean>("set_plan_mode", { threadId, on }) : Promise.resolve(false);
}

/** Arrête l'agent d'un fil : le prochain message en lance un neuf (peut-être d'un autre fournisseur). */
export function stopAgent(threadId: string): Promise<void> {
  return inTauri ? invoke("stop_agent", { threadId }) : Promise.resolve();
}

export function sendPrompt(threadId: string, text: string, images: string[] = []): Promise<void> {
  return inTauri ? invoke("send_prompt", { threadId, text, images }) : mock.sendPrompt(threadId, text);
}

export function cancelPrompt(threadId: string): Promise<void> {
  return inTauri ? invoke("cancel_prompt", { threadId }) : Promise.resolve();
}

export function answerPermission(
  threadId: string,
  requestId: string,
  optionId: string | null,
): Promise<void> {
  return inTauri
    ? invoke("answer_permission", { threadId, requestId, optionId })
    : Promise.resolve();
}

export async function onAgentEvent(handler: (event: ThreadEvent) => void): Promise<Unlisten> {
  if (!inTauri) return mock.subscribe(handler);
  return listen<ThreadEvent>("acp-event", (e) => handler(e.payload));
}
