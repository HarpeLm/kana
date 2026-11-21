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
  /** Snapshot Git capturé avant l'exécution de ce tour utilisateur (pour `/rewind`). */
  checkpoint?: string;
}

export interface PermissionRequest {
  requestId: string;
  title: string;
  options: PermissionOption[];
}

export interface StructuredQuestion {
  messageId: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
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

export function addUserMessage(chat: ChatState, text: string, customMessage?: ChatMessage): ChatState {
  const message = customMessage ?? makeMessage("user", text);
  if (text.trim() === "/compact" && chat.context) message.contextBefore = chat.context.used;
  return { ...chat, busy: true, messages: [...chat.messages, message] };
}

export function attachCheckpointToMessage(chat: ChatState, messageId: string, checkpoint: string): ChatState {
  return {
    ...chat,
    messages: chat.messages.map((m) => (m.id === messageId ? { ...m, checkpoint } : m)),
  };
}

export function rewindChatToMessage(
  chat: ChatState,
  messageId?: string,
): { chat: ChatState; target?: ChatMessage; checkpoint?: string } {
  const index = messageId
    ? chat.messages.findIndex((m) => m.id === messageId && m.role === "user")
    : chat.messages.map((m) => m.role).lastIndexOf("user");
  if (index < 0) return { chat };
  const target = chat.messages[index];
  return {
    chat: {
      ...chat,
      busy: false,
      permissions: [],
      plan: [],
      messages: chat.messages.slice(0, index),
    },
    target,
    checkpoint: target.checkpoint,
  };
}

const CHECKPOINTS_PREFIX = "kana-checkpoints-";

export function loadThreadCheckpoints(threadId: string): Record<string, string> {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return {};
  try {
    const raw = JSON.parse(localStorage.getItem(`${CHECKPOINTS_PREFIX}${threadId}`) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function saveThreadCheckpoint(threadId: string, messageId: string, checkpoint: string): void {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    const current = loadThreadCheckpoints(threadId);
    localStorage.setItem(`${CHECKPOINTS_PREFIX}${threadId}`, JSON.stringify({ ...current, [messageId]: checkpoint }));
  } catch {
    // stockage indisponible : la liste ne sera pas conservée
  }
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
  { name: "rewind", description: "Revenir au tour précédent (code et conversation)" },
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

function normalizeQuestionOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const options: string[] = [];
  for (const entry of raw) {
    const label =
      typeof entry === "string"
        ? entry.trim()
        : entry && typeof entry === "object"
          ? String(
              (entry as { label?: unknown; name?: unknown; title?: unknown }).label ??
                (entry as { name?: unknown }).name ??
                (entry as { title?: unknown }).title ??
                "",
            ).trim()
          : "";
    if (label) options.push(label);
  }
  return options;
}

function parseQuestionBlock(messageId: string, block: string): StructuredQuestion | null {
  const body = block.trim();
  if (!body) return null;

  try {
    const parsed = JSON.parse(body) as {
      question?: unknown;
      options?: unknown;
      multiSelect?: unknown;
      multi_select?: unknown;
    };
    const question = typeof parsed?.question === "string" ? parsed.question.trim() : "";
    const options = normalizeQuestionOptions(parsed?.options);
    if (question && options.length >= 2) {
      const rawMulti = parsed.multiSelect ?? parsed.multi_select;
      return {
        messageId,
        question,
        options,
        ...(typeof rawMulti === "boolean" ? { multiSelect: rawMulti } : {}),
      };
    }
  } catch {
    // Pas du JSON : on tente le format texte structuré.
  }

  let question = "";
  let multiSelect: boolean | undefined;
  const options: string[] = [];
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const qMatch = line.match(/^question\s*:\s*(.+)$/i);
    if (qMatch) {
      question = qMatch[1].trim();
      continue;
    }
    const mMatch = line.match(/^multi_?select\s*:\s*(.+)$/i);
    if (mMatch) {
      const val = mMatch[1].trim().toLowerCase();
      if (val === "true" || val === "oui" || val === "yes" || val === "1") multiSelect = true;
      else if (val === "false" || val === "non" || val === "no" || val === "0") multiSelect = false;
      continue;
    }
    const oMatch = line.match(/^options\s*:\s*(.*)$/i);
    if (oMatch) {
      const inline = oMatch[1].trim();
      if (inline) {
        for (const item of inline.split(",")) {
          const clean = item.trim();
          if (clean) options.push(clean);
        }
      }
      continue;
    }
    const listMatch = line.match(/^(?:[-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const clean = listMatch[1].trim();
      if (clean) options.push(clean);
      continue;
    }
    if (!question) question = line;
  }

  if (!question || options.length < 2) return null;
  return {
    messageId,
    question,
    options,
    ...(multiSelect !== undefined ? { multiSelect } : {}),
  };
}

function cleanQuestionLine(raw: string): string {
  let line = raw.trim().replace(/^#{1,6}\s+/, "").replace(/^>\s+/, "").trim();
  for (const [open, close] of [
    ["**", "**"],
    ["__", "__"],
  ] as const) {
    if (line.startsWith(open) && line.endsWith(close) && line.length > open.length + close.length) {
      line = line.slice(open.length, -close.length).trim();
    }
  }
  return line;
}

/**
 * Extrait une question structurée à choix multiples depuis le dernier message de l'agent
 * lorsqu'il a fini de répondre (`busy === false`).
 */
export function extractStructuredQuestion(messages: ChatMessage[], busy: boolean): StructuredQuestion | null {
  if (busy) return null;
  const lastNonEmpty = [...messages]
    .reverse()
    .find((m) => m.text.trim().length > 0 || m.thought.trim().length > 0 || m.tools.length > 0);
  if (!lastNonEmpty || lastNonEmpty.role !== "agent") return null;

  const text = lastNonEmpty.text.trim();
  if (!text) return null;

  const fenceMatches = [...text.matchAll(/```question[^\n]*\r?\n([\s\S]*?)```/gi)];
  for (let i = fenceMatches.length - 1; i >= 0; i--) {
    const parsed = parseQuestionBlock(lastNonEmpty.id, fenceMatches[i][1]);
    if (parsed) return parsed;
  }

  const lines = text.split(/\r?\n/);
  while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();

  const reversedOptions: string[] = [];
  let cursor = lines.length - 1;
  while (cursor >= 0) {
    const match = lines[cursor].match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/);
    if (!match) break;
    const option = match[1].trim();
    if (!option) break;
    reversedOptions.push(option);
    cursor--;
  }

  if (reversedOptions.length < 2 || reversedOptions.length > 6) return null;
  const options = reversedOptions.reverse();

  // Tolère au plus une ligne vide entre la question et la liste d'options.
  if (cursor >= 0 && !lines[cursor].trim()) cursor--;
  if (cursor < 0) return null;

  const rawQuestionLine = lines[cursor];
  if (/^\s*(?:[-*]|\d+\.)\s+/.test(rawQuestionLine) || /^\s*```/.test(rawQuestionLine)) return null;

  // Vérifie qu'on ne se trouve pas dans un bloc de code non fermé.
  let fenceCount = 0;
  for (let i = 0; i <= cursor; i++) {
    if (/^\s*```/.test(lines[i])) fenceCount++;
  }
  if (fenceCount % 2 === 1) return null;

  const question = cleanQuestionLine(rawQuestionLine);
  if (!question.endsWith("?") || question.length <= 1) return null;

  return {
    messageId: lastNonEmpty.id,
    question,
    options,
  };
}
