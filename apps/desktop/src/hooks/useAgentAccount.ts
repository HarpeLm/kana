import { useCallback, useEffect, useState } from "react";
import {
  checkAgent,
  deleteApiKey,
  hasApiKey,
  loginAgent,
  setApiKey,
  type AuthMethod,
} from "../lib/settings";

export type AccountPhase = "idle" | "checking" | "ready" | "needs_login" | "logging_in" | "error";

export interface AccountState {
  phase: AccountPhase;
  methods: AuthMethod[];
  message: string;
  hasKey: boolean;
}

/** Connexion d'un agent : vérification, méthodes de login et clé d'API du Trousseau. */
export function useAgentAccount(agentId: string) {
  const [state, setState] = useState<AccountState>({
    phase: "idle",
    methods: [],
    message: "",
    hasKey: false,
  });
  const patch = (change: Partial<AccountState>) => setState((s) => ({ ...s, ...change }));

  useEffect(() => {
    hasApiKey(agentId)
      .then((hasKey) => patch({ hasKey }))
      .catch(() => {});
  }, [agentId]);

  const check = useCallback(async () => {
    patch({ phase: "checking", message: "" });
    try {
      const result = await checkAgent(agentId);
      if (result.status === "ready") patch({ phase: "ready", methods: [] });
      else patch({ phase: "needs_login", methods: result.methods });
    } catch (error) {
      patch({ phase: "error", message: String(error) });
    }
  }, [agentId]);

  const login = useCallback(
    async (methodId: string) => {
      patch({ phase: "logging_in", message: "" });
      try {
        await loginAgent(agentId, methodId);
        await check();
      } catch (error) {
        patch({ phase: "error", message: String(error) });
      }
    },
    [agentId, check],
  );

  const saveKey = useCallback(
    async (key: string) => {
      try {
        await setApiKey(agentId, key);
        patch({ hasKey: true, phase: "idle", message: "" });
      } catch (error) {
        patch({ phase: "error", message: String(error) });
      }
    },
    [agentId],
  );

  const removeKey = useCallback(async () => {
    try {
      await deleteApiKey(agentId);
      patch({ hasKey: false, phase: "idle", message: "" });
    } catch (error) {
      patch({ phase: "error", message: String(error) });
    }
  }, [agentId]);

  return { state, check, login, saveKey, removeKey };
}
