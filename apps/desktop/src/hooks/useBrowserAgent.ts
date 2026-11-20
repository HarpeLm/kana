import { useCallback, useEffect, useRef, useState } from "react";
import { inTauri } from "../lib/env";
import { answerBrowserAgent, listenBrowserAgent, type AgentApproval } from "../lib/browserAgent";

/**
 * Ce que font les agents dans le navigateur : ils demandent à ouvrir le Globe et à obtenir
 * l'accord de l'utilisateur. Les demandes s'empilent et se traitent une à une. `driving` reste vrai
 * quelques secondes après chaque geste d'un agent.
 */
const DRIVING_MS = 8000;

export function useBrowserAgent(onOpen: () => void) {
  const [queue, setQueue] = useState<AgentApproval[]>([]);
  const [driving, setDriving] = useState(false);
  const drivingTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
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
      onActive: () => {
        setDriving(true);
        clearTimeout(drivingTimer.current);
        drivingTimer.current = setTimeout(() => setDriving(false), DRIVING_MS);
      },
    }).then((unlisten) => (cancelled ? unlisten() : (off = unlisten)));
    return () => {
      cancelled = true;
      clearTimeout(drivingTimer.current);
      off?.();
    };
  }, []);

  const answer = useCallback((requestId: string, allow: boolean) => {
    setQueue((q) => q.filter((a) => a.requestId !== requestId));
    answerBrowserAgent(requestId, allow).catch(() => {});
  }, []);

  return { approval: queue[0] ?? null, answer, driving };
}
