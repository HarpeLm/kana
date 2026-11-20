import { useCallback, useEffect, useState } from "react";
import { loadDiff, type DiffReport } from "../lib/gitDiff";

/**
 * Les changements du dépôt. Chargés à l'ouverture du volet, puis à chaque retour sur la fenêtre
 * (on a souvent modifié des fichiers dans un autre outil entre-temps).
 */
export function useGitDiff(active: boolean) {
  const [report, setReport] = useState<DiffReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await loadDiff());
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, refresh]);

  return { report, loading, error, refresh };
}
