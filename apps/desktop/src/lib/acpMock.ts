// Agent simulé, utilisé seulement quand l'app tourne dans un navigateur sans Tauri.
import type { ThreadEvent, Unlisten } from "./acp";

const handlers = new Set<(event: ThreadEvent) => void>();
const cancelled = new Set<string>();

const emit = (event: ThreadEvent) => handlers.forEach((h) => h(event));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function subscribe(handler: (event: ThreadEvent) => void): Unlisten {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export function cancelPrompt(threadId: string): void {
  cancelled.add(threadId);
}

export async function sendPrompt(threadId: string, text: string): Promise<void> {
  cancelled.delete(threadId);
  void (async () => {
    // Le début du message contient les consignes de Kana : l'agent simulé ne répond qu'à ce que l'utilisateur a écrit.
    const written = text.trim().split("\n\n").pop() ?? text;
    const reply = `Mode navigateur : agent simulé. Tu as écrit « ${written} ».`;
    for (const word of reply.split(" ")) {
      if (cancelled.has(threadId)) break;
      await wait(60);
      if (cancelled.has(threadId)) break;
      emit({ threadId, kind: "message", text: word + " " });
    }
    const stop_reason = cancelled.delete(threadId) ? "cancelled" : "end_turn";
    emit({ threadId, kind: "done", stop_reason });
  })();
}
