import { useCallback, useEffect, useState } from "react";
import { loadBranchSummary, loadPullRequests, type BranchSummary, type PullRequest } from "../lib/forge";

const POLL_MS = 20_000;

/**
 * Le résumé du travail d'une conversation : ce que sa branche apporte, et les pull requests
 * ouvertes depuis elle. Relu à l'ouverture, au retour sur la fenêtre, toutes les 20 secondes et
 * chaque fois que `refreshKey` change (l'agent vient de finir un tour).
 */
export function useSessionSummary(active: boolean, path: string | undefined, refreshKey: unknown) {
  const [summary, setSummary] = useState<BranchSummary | null>(null);
  const [pulls, setPulls] = useState<PullRequest[]>([]);

  const refresh = useCallback(async () => {
    try {
      const next = await loadBranchSummary(path);
      setSummary(next);
      setPulls(next.branch ? await loadPullRequests(next.branch, path).catch(() => []) : []);
    } catch {
      setSummary(null);
      setPulls([]);
    }
  }, [path]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [active, refresh, refreshKey]);

  return { summary, pulls, refresh };
}
