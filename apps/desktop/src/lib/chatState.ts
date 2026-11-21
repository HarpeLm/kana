import type { AcpEvent, PermissionOption } from "./acp";

export interface ToolCall {
  id: string;
  title: string;
  status: string;
  /** Paramètres annoncés par l'agent pour cet outil. */
  input?: unknown;
  /** Texte produit par l'outil. */
  output?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  thought: string;
  tools: ToolCall[];
  /** Début et fin du travail de l'agent sur ce message (ms), pour afficher la durée. */
  startedAt?: number;
  endedAt?: number;
}

export interface PermissionRequest {
  requestId: string;
  title: string;
  options: PermissionOption[];
}

/** Une étape du plan que l'agent annonce. */
export interface PlanItem {
  content: string;
  status: string;
}

export interface ChatState {
  messages: ChatMessage[];
  /** Le plan en cours de l'agent (chaque annonce remplace la précédente). */
  plan: PlanItem[];
  /** L'occupation de la fenêtre de contexte de l'agent : `used` jetons sur `size`. */
  context: { used: number; size: number; /** Estimé d'après le dernier tour : l'agent ne donne pas la mesure. */ estimated?: boolean } | null;
  permissions: PermissionRequest[];
  busy: boolean;
}

export const EMPTY_CHAT: ChatState = { messages: [], plan: [], context: null, permissions: [], busy: false };

let counter = 0;
// L'heure rend l'identifiant unique d'un lancement à l'autre : les messages rechargés gardent le leur.
const nextId = () => `m${Date.now().toString(36)}${++counter}`;

export function makeMessage(role: ChatMessage["role"], text = ""): ChatMessage {
  return { id: nextId(), role, text, thought: "", tools: [], startedAt: Date.now() };
}

/** Marque la fin du travail de l'agent sur son dernier message. */
function endLastAgentMessage(messages: ChatMessage[]): ChatMessage[] {
  const last = messages[messages.length - 1];
  if (last?.role !== "agent" || last.endedAt) return messages;
  return [...messages.slice(0, -1), { ...last, endedAt: Date.now() }];
}

/** Renvoie la liste avec un message d'agent en dernière position, en le créant si besoin. */
function withAgentMessage(messages: ChatMessage[]): [ChatMessage[], ChatMessage] {
  const last = messages[messages.length - 1];
  if (last?.role === "agent") return [messages.slice(0, -1), last];
  return [messages, makeMessage("agent")];
}

export function addUserMessage(chat: ChatState, text: string): ChatState {
  return { ...chat, busy: true, messages: [...chat.messages, makeMessage("user", text)] };
}

export function addError(chat: ChatState, message: string): ChatState {
  return { ...chat, busy: false, messages: [...chat.messages, makeMessage("error", message)] };
}

export function applyEvent(chat: ChatState, event: AcpEvent): ChatState {
  switch (event.kind) {
    case "message": {
      const [rest, agent] = withAgentMessage(chat.messages);
      return { ...chat, messages: [...rest, { ...agent, text: agent.text + event.text }] };
    }
    case "thought": {
      const [rest, agent] = withAgentMessage(chat.messages);
      return { ...chat, messages: [...rest, { ...agent, thought: agent.thought + event.text }] };
    }
    case "tool_call": {
      const [rest, agent] = withAgentMessage(chat.messages);
      const known = agent.tools.find((t) => t.id === event.id);
      const tools = known
        ? agent.tools.map((t) =>
            t.id === event.id
              ? {
                  ...t,
                  title: event.title ?? t.title,
                  status: event.status ?? t.status,
                  input: event.raw_input ?? t.input,
                  output: event.output ?? t.output,
                }
              : t,
          )
        : [
            ...agent.tools,
            {
              id: event.id,
              title: event.title ?? "Outil",
              status: event.status ?? "pending",
              input: event.raw_input,
              output: event.output ?? undefined,
            },
          ];
      return { ...chat, messages: [...rest, { ...agent, tools }] };
    }
    case "context":
      return { ...chat, context: { used: event.used, size: event.size } };
    case "turn_usage":
      // L'agent ne mesure pas son contexte : on estime avec les jetons d'entrée du dernier tour (une fenêtre de 200 k par défaut).
      if (chat.context && !chat.context.estimated) return chat;
      return event.input_tokens > 0 ? { ...chat, context: { used: event.input_tokens, size: 200_000, estimated: true } } : chat;
    case "plan":
      return { ...chat, plan: event.entries };
    case "permission":
      return {
        ...chat,
        permissions: [
          ...chat.permissions,
          { requestId: event.request_id, title: event.title, options: event.options },
        ],
      };
    case "done":
      return { ...chat, busy: false, messages: endLastAgentMessage(chat.messages) };
    case "error":
      return addError(chat, event.message);
    case "closed":
      return { ...chat, busy: false, permissions: [] };
  }
}
