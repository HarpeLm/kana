import { useCallback, useEffect, useState } from "react";
import { loadFileList, type FileList } from "../lib/files";

/** La liste des fichiers du dépôt, chargée à l'ouverture du volet et au retour sur la fenêtre. */
export function useRepoFiles(active: boolean, root?: string) {
  const [list, setList] = useState<FileList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setList(await loadFileList(root));
      setError("");
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    if (!active) return;
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, refresh]);

  return { list, loading, error, refresh };
}
