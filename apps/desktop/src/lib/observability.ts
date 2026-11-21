import { useSyncExternalStore } from "react";
import type { ChatMessage } from "./chatState";
import type { Conversation } from "./conversations";
import { getLocale, type Locale } from "./i18n";
import { redactSecrets, redactUnknown } from "./permissionMode";

export type TraceDirection = "out" | "in" | "mcp";

export interface TraceFrame {
  id: string;
  direction: TraceDirection;
  method: string;
  threadId?: string;
  summary?: string;
  payload?: unknown;
  at: number;
}

export const MAX_TRACE_FRAMES = 300;

let seq = 0;
let frames: TraceFrame[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((cb) => cb());
}

/** Enregistre une trame ACP / MCP dans le ring buffer (300 entrées max), avec masquage des secrets. */
export function recordTraceFrame(
  frame: Omit<TraceFrame, "id" | "at"> & { id?: string; at?: number },
): TraceFrame {
  const entry: TraceFrame = {
    id: frame.id ?? `tr-${Date.now().toString(36)}-${++seq}`,
    direction: frame.direction,
    method: frame.method,
    threadId: frame.threadId,
    summary: frame.summary !== undefined ? redactSecrets(frame.summary) : undefined,
    payload: frame.payload !== undefined ? redactUnknown(frame.payload) : undefined,
    at: frame.at ?? Date.now(),
  };
  const next = [...frames, entry];
  frames = next.length > MAX_TRACE_FRAMES ? next.slice(next.length - MAX_TRACE_FRAMES) : next;
  notify();
  return entry;
}

export function getTraceFrames(): TraceFrame[] {
  return frames;
}

export function clearTraceFrames(): void {
  if (frames.length === 0) return;
  frames = [];
  notify();
}

export function useTraceFrames(): TraceFrame[] {
  return useSyncExternalStore(
    (notifyListener) => {
      listeners.add(notifyListener);
      return () => listeners.delete(notifyListener);
    },
    getTraceFrames,
  );
}

/** Exporte une conversation complète en Markdown structuré. */
export function conversationToMarkdown(
  conversation: Pick<Conversation, "id" | "title" | "project" | "agentId" | "modelId" | "branch">,
  messages: ChatMessage[],
  locale: Locale = getLocale(),
): string {
  const isEn = locale === "en";
  const lines: string[] = [
    `# ${conversation.title}`,
    "",
    `- **ID**: \`${conversation.id}\``,
    `- **${isEn ? "Project" : "Projet"}**: ${conversation.project}`,
    `- **${isEn ? "Provider" : "Fournisseur"}**: ${conversation.agentId}${conversation.modelId ? ` (${conversation.modelId})` : ""}`,
  ];
  if (conversation.branch) {
    lines.push(`- **${isEn ? "Branch" : "Branche"}**: \`${conversation.branch}\``);
  }
  lines.push("");

  for (const msg of messages) {
    const roleLabel =
      msg.role === "user"
        ? isEn
          ? "User"
          : "Utilisateur"
        : msg.role === "agent"
          ? "Agent"
          : msg.role === "error"
            ? isEn
              ? "Error"
              : "Erreur"
            : isEn
              ? "Notice"
              : "Note";
    lines.push(`## ${roleLabel}`);
    lines.push("");
    if (msg.thought?.trim()) {
      lines.push(`<details><summary>${isEn ? "Thought" : "Réflexion"}</summary>`);
      lines.push("");
      lines.push(msg.thought.trim());
      lines.push("");
      lines.push("</details>");
      lines.push("");
    }
    if (msg.tools && msg.tools.length > 0) {
      for (const tool of msg.tools) {
        lines.push(`- \`${tool.title}\` (${tool.status})`);
        if (tool.output?.trim()) {
          lines.push("  ```");
          lines.push(`  ${tool.output.trim().replace(/\n/g, "\n  ")}`);
          lines.push("  ```");
        }
      }
      lines.push("");
    }
    if (msg.text?.trim()) {
      lines.push(msg.text.trim());
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

/** Exporte une conversation et ses messages au format JSON structuré. */
export function conversationToJson(conversation: Conversation, messages: ChatMessage[]): string {
  return JSON.stringify(
    {
      format: "kana-conversation",
      version: 1,
      exportedAt: new Date().toISOString(),
      conversation,
      messages,
    },
    null,
    2,
  );
}

/** Génère un nom de fichier sûr pour l'export d'une conversation. */
export function exportFileName(title: string, ext: "md" | "json"): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "conversation"}.${ext}`;
}

/** Déclenche le téléchargement du fichier exporté et mémorise le dernier export sur `window.__kanaLastExport`. */
export function downloadExport(filename: string, content: string, mimeType: string): void {
  if (typeof window !== "undefined") {
    (window as unknown as { __kanaLastExport?: { filename: string; content: string; mimeType: string; at: number } }).__kanaLastExport = {
      filename,
      content,
      mimeType,
      at: Date.now(),
    };
  }
  if (typeof document === "undefined" || typeof Blob === "undefined") return;
  try {
    const blob = new Blob([content], { type: mimeType });
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    if (typeof navigator === "undefined" || !/jsdom/i.test(navigator.userAgent)) {
      link.click();
    }
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // environnement headless sans support Blob/URL : __kanaLastExport reste disponible
  }
}
