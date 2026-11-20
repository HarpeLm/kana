import { useCallback, useEffect, useRef, useState } from "react";
import { inTauri } from "../lib/env";
import { answerBrowserAgent, listenBrowserAgent, type AgentApproval } from "../lib/browserAgent";

/**
 * Ce que font les agents dans le navigateur : ils demandent à ouvrir le Globe et à obtenir
 * l'accord de l'utilisateur. Les demandes s'empilent et se traitent une à une.
 */
export function useBrowserAgent(onOpen: () => void) {
  const [queue, setQueue] = useState<AgentApproval[]>([]);
  const openRef = useRef(onOpen);
  useEffect(() => {
    openRef.current = onOpen;
  });

  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    listenBrowserAgent({
      onOpen: () => openRef.current(),
      onApproval: (approval) => setQueue((q) => [...q, approval]),
    }).then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      off?.();
    };
  }, []);

  const answer = useCallback((requestId: string, allow: boolean) => {
    setQueue((q) => q.filter((a) => a.requestId !== requestId));
    answerBrowserAgent(requestId, allow).catch(() => {});
  }, []);

  return { approval: queue[0] ?? null, answer };
}
