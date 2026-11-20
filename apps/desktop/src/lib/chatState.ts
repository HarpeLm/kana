import type { AcpEvent, PermissionOption } from "./acp";

export interface ToolCall {
  id: string;
  title: string;
  status: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "agent" | "error";
  text: string;
  thought: string;
  tools: ToolCall[];
}

export interface PermissionRequest {
  requestId: string;
  title: string;
  options: PermissionOption[];
}

export interface ChatState {
  messages: ChatMessage[];
  permissions: PermissionRequest[];
  busy: boolean;
}

export const EMPTY_CHAT: ChatState = { messages: [], permissions: [], busy: false };

let counter = 0;
const nextId = () => `m${++counter}`;

export function makeMessage(role: ChatMessage["role"], text = ""): ChatMessage {
  return { id: nextId(), role, text, thought: "", tools: [] };
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
              ? { ...t, title: event.title ?? t.title, status: event.status ?? t.status }
              : t,
          )
        : [
            ...agent.tools,
            { id: event.id, title: event.title ?? "Outil", status: event.status ?? "pending" },
          ];
      return { ...chat, messages: [...rest, { ...agent, tools }] };
    }
    case "permission":
      return {
        ...chat,
        permissions: [
          ...chat.permissions,
          { requestId: event.request_id, title: event.title, options: event.options },
        ],
      };
    case "done":
      return { ...chat, busy: false };
    case "error":
      return addError(chat, event.message);
    case "closed":
      return { ...chat, busy: false, permissions: [] };
  }
}
