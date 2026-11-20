import { useCallback, useEffect, useState } from "react";
import { saveProjects, type Project } from "../lib/projects";

/** Les projets connus, du plus récemment utilisé au plus ancien. */
export function useProjects(initial: Project[]) {
  const [items, setItems] = useState(initial);

  useEffect(() => {
    const timer = setTimeout(() => void saveProjects(items).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [items]);

  /** Ajoute un projet (ou retrouve celui qui a le même dossier) et le marque comme utilisé à l'instant. */
  const use = useCallback((project: Project) => {
    setItems((list) => {
      const rest = list.filter((p) => p.path !== project.path);
      return [{ ...project, lastUsed: Date.now() }, ...rest];
    });
  }, []);

  const recent = [...items].sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0));
  return { projects: recent, use };
}
