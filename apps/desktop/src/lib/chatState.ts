import type { AcpEvent, AvailableCommand, PermissionOption } from "./acp";

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
  role: "user" | "agent" | "error" | "notice";
  text: string;
  thought: string;
  tools: ToolCall[];
  /** Début et fin du travail de l'agent sur ce message (ms), pour afficher la durée. */
  startedAt?: number;
  endedAt?: number;
  /** Pour un « /compact » : le contexte occupé avant, afin d'annoncer les jetons économisés. */
  contextBefore?: number;
  /** Une pensée ou un outil est venu après le dernier texte : le texte qui reprend commence une nouvelle ligne. */
  breakBefore?: boolean;
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
  /** Commandes slash dynamiques annoncées par l'agent via `available_commands_update`. */
  commands: AvailableCommand[];
  /** Messages en file d'attente pendant que l'agent travaille. */
  queued: string[];
  /** L'occupation de la fenêtre de contexte de l'agent : `used` jetons sur `size`. */
  context: { used: number; size: number; /** Estimé d'après le dernier tour : l'agent ne donne pas la mesure. */ estimated?: boolean } | null;
  permissions: PermissionRequest[];
  busy: boolean;
}

export const EMPTY_CHAT: ChatState = { messages: [], plan: [], commands: [], queued: [], context: null, permissions: [], busy: false };

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
  const message = makeMessage("user", text);
  if (text.trim() === "/compact" && chat.context) message.contextBefore = chat.context.used;
  return { ...chat, busy: true, messages: [...chat.messages, message] };
}

export function addError(chat: ChatState, message: string): ChatState {
  return { ...chat, busy: false, messages: [...chat.messages, makeMessage("error", message)] };
}

export function applyEvent(chat: ChatState, event: AcpEvent): ChatState {
  switch (event.kind) {
    case "message": {
      const [rest, agent] = withAgentMessage(chat.messages);
      // Le texte qui reprend après une pensée ou un outil ne se colle pas à la phrase d'avant.
      const gap = agent.breakBefore && agent.text.trim() && !/\s$/.test(agent.text) && !/^\s/.test(event.text) ? "\n\n" : "";
      return { ...chat, messages: [...rest, { ...agent, text: agent.text + gap + event.text, breakBefore: false }] };
    }
    case "thought": {
      const [rest, agent] = withAgentMessage(chat.messages);
      return { ...chat, messages: [...rest, { ...agent, thought: agent.thought + event.text, breakBefore: true }] };
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
      return { ...chat, messages: [...rest, { ...agent, tools, breakBefore: true }] };
    }
    case "context":
      return { ...chat, context: { used: event.used, size: event.size } };
    case "turn_usage":
      // L'agent ne mesure pas son contexte : on estime avec les jetons d'entrée du dernier tour (une fenêtre de 200 k par défaut).
      if (chat.context && !chat.context.estimated) return chat;
      return event.input_tokens > 0 ? { ...chat, context: { used: event.input_tokens, size: 200_000, estimated: true } } : chat;
    case "plan":
      return { ...chat, plan: event.entries };
    case "available_commands":
      return { ...chat, commands: event.commands };
    case "permission":
      return {
        ...chat,
        permissions: [
          ...chat.permissions,
          { requestId: event.request_id, title: event.title, options: event.options },
        ],
      };
    case "done": {
      const messages = endLastAgentMessage(chat.messages);
      const at = messages.map((m) => m.role).lastIndexOf("user");
      const asked = messages[at];
      // Un « /compact » : on remplace la réponse de l'agent par une simple ligne, comme Claude Code.
      if (asked && asked.text.trim() === "/compact" && messages.length > at + 1 && messages.slice(at + 1).every((m) => m.role === "agent")) {
        const saved = asked.contextBefore && chat.context ? asked.contextBefore - chat.context.used : 0;
        const label = saved > 0 ? `Session compactée · ${(saved / 1000).toFixed(1).replace(".", ",")} k tokens économisés` : "Session compactée";
        return { ...chat, busy: false, messages: [...messages.slice(0, at + 1), { ...makeMessage("notice", label), endedAt: Date.now() }] };
      }
      return { ...chat, busy: false, messages };
    }
    case "error":
      return addError(chat, event.message);
    case "closed":
      return { ...chat, busy: false, permissions: [] };
  }
}

export function enqueueMessage(chat: ChatState, text: string): ChatState {
  if (!text.trim()) return chat;
  return { ...chat, queued: [...chat.queued, text] };
}

export function removeQueuedMessage(chat: ChatState, index: number): ChatState {
  if (index < 0 || index >= chat.queued.length) return chat;
  return { ...chat, queued: chat.queued.filter((_, i) => i !== index) };
}

export function prioritizeQueuedMessage(chat: ChatState, index: number): ChatState {
  if (index <= 0 || index >= chat.queued.length) return chat;
  const target = chat.queued[index];
  return { ...chat, queued: [target, ...chat.queued.filter((_, i) => i !== index)] };
}

export const DEFAULT_COMMANDS: AvailableCommand[] = [
  { name: "compact", description: "Compacter la session et économiser le contexte" },
  { name: "plan", description: "Planifier sans modifier les fichiers" },
  { name: "review", description: "Relire les changements en cours et signaler les problèmes" },
  { name: "init", description: "Analyser le dépôt et préparer les instructions du projet" },
  { name: "clear", description: "Réinitialiser la session de l'agent" },
];

/** Fusionne les commandes annoncées par l'agent (`available_commands_update`) avec celles de base. */
export function mergeCommands(dynamic: AvailableCommand[], query = ""): AvailableCommand[] {
  const byName = new Map<string, AvailableCommand>();
  for (const cmd of dynamic) byName.set(cmd.name.toLowerCase(), cmd);
  for (const cmd of DEFAULT_COMMANDS) {
    const key = cmd.name.toLowerCase();
    if (!byName.has(key)) byName.set(key, cmd);
  }
  const all = [...byName.values()];
  const needle = query.trim().toLowerCase();
  if (!needle) return all;
  return all
    .filter((c) => c.name.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aPrefix = a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bPrefix = b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return aPrefix - bPrefix;
    });
}

export interface ComposerTrigger {
  kind: "slash" | "mention";
  query: string;
  start: number;
  end: number;
}

/** Repère `/commande` au début du message ou `@mention` avant le curseur. */
export function detectTrigger(text: string, cursor: number): ComposerTrigger | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const slash = before.match(/^\s*\/([^\s]*)$/);
  if (slash) {
    return { kind: "slash", query: slash[1], start: before.lastIndexOf("/"), end: safeCursor };
  }
  const mention = before.match(/(?:^|[\s([{"'])@([^\s]*)$/);
  if (mention) {
    return { kind: "mention", query: mention[1], start: before.lastIndexOf("@"), end: safeCursor };
  }
  return null;
}

/** Remplace le déclencheur actif par `replacement` et renvoie la nouvelle position du curseur. */
export function applyTrigger(
  text: string,
  trigger: ComposerTrigger,
  replacement: string,
): { text: string; cursor: number } {
  const head = text.slice(0, trigger.start);
  const tail = text.slice(trigger.end);
  const needsSpace = !tail || !/^\s/.test(tail);
  const inserted = replacement + (needsSpace ? " " : "");
  return { text: head + inserted + tail, cursor: head.length + inserted.length };
}
