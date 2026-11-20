// Agent simulé, utilisé seulement quand l'app tourne dans un navigateur sans Tauri.
import type { ThreadEvent, Unlisten } from "./acp";

const handlers = new Set<(event: ThreadEvent) => void>();

const emit = (event: ThreadEvent) => handlers.forEach((h) => h(event));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function subscribe(handler: (event: ThreadEvent) => void): Unlisten {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function sendPrompt(threadId: string, text: string): Promise<void> {
  void (async () => {
    const reply = `Mode navigateur : agent simulé. Tu as écrit « ${text} ».`;
    for (const word of reply.split(" ")) {
      await wait(60);
      emit({ threadId, kind: "message", text: word + " " });
    }
    emit({ threadId, kind: "done", stop_reason: "end_turn" });
  })();
}
