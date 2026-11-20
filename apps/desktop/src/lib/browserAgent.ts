import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Une demande d'accord d'un agent qui veut utiliser le navigateur. */
export interface AgentApproval {
  requestId: string;
  /** `host` : autoriser un site pour la session ; `action` : autoriser un geste précis. */
  kind: "host" | "action";
  host: string;
  detail: string;
}

/** Indique à Kana quel onglet l'utilisateur regarde : c'est celui où les agents agissent. */
export const setActiveBrowserTab = (id: string) => invoke<void>("browser_set_active", { id });

export const answerBrowserAgent = (requestId: string, allow: boolean) =>
  invoke<void>("browser_agent_answer", { requestId, allow });

export async function listenBrowserAgent(handlers: {
  /** Un agent a besoin du navigateur : il faut ouvrir le Globe. */
  onOpen: () => void;
  onApproval: (approval: AgentApproval) => void;
}): Promise<() => void> {
  const unlisteners = await Promise.all([
    listen("browser-agent-open", () => handlers.onOpen()),
    listen<AgentApproval>("browser-agent-approval", (e) => handlers.onApproval(e.payload)),
  ]);
  return () => unlisteners.forEach((off) => off());
}
