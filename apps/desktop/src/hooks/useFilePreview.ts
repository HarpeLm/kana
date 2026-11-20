import { useEffect, useState } from "react";
import { loadFilePreview, type FilePreview } from "../lib/files";

/** L'aperçu d'un fichier, rechargé quand on change de fichier. */
export function useFilePreview(path: string) {
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setPreview(null);
    setError("");
    loadFilePreview(path)
      .then((data) => current && setPreview(data))
      .catch((e) => current && setError(String(e)));
    return () => {
      current = false;
    };
  }, [path]);

  return { preview, error, loading: !preview && !error };
}
