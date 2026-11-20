import type { AuthMethod } from "./settings";

/** Dernier état de connexion connu d'un agent. */
export interface CachedAccount {
  phase: "ready" | "needs_login";
  methods: AuthMethod[];
  /** Quand la vérification a eu lieu (ms). */
  checkedAt: number;
}

const KEY = "kana-account-status";

function readAll(): Record<string, CachedAccount> {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadCachedAccount(agentId: string): CachedAccount | undefined {
  return readAll()[agentId];
}

export function saveCachedAccount(agentId: string, account: CachedAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [agentId]: account }));
  } catch {
    // stockage indisponible : l'état ne sera pas conservé
  }
}
