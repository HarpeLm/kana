import { useEffect, useState } from "react";
import { artifactTitle } from "./artifactRefs";
import type { Conversation } from "./conversations";
import { loadFileList, loadFilePreview } from "./files";
import { NO_PROJECT } from "./projects";

/** Une page d'artéfact trouvée dans le dossier `artefacts/` d'une conversation. */
export interface ArtifactEntry {
  key: string;
  /** Dossier où elle se trouve (le dossier de travail de la conversation). */
  root: string;
  path: string;
  title: string;
  /** Dernière modification (ms). */
  modified: number;
  /** Une conversation de ce dossier, pour l'ouvrir. */
  conversationId: string;
  project: string;
  html: string;
}

const PAGE = /(^|\/)artefacts\/[^/]+\.html?$/i;
const PER_ROOT = 40;

/** Les dossiers où chercher : celui de chaque conversation, avec la conversation qui le représente. */
function rootsOf(conversations: Conversation[]): Map<string, Conversation> {
  const roots = new Map<string, Conversation>();
  for (const c of conversations) {
    if (c.archived) continue;
    const root = c.worktree ?? c.projectPath;
    if (!root || root === NO_PROJECT || roots.has(root)) continue;
    roots.set(root, c);
  }
  return roots;
}

async function scan(conversations: Conversation[]): Promise<ArtifactEntry[]> {
  const found: ArtifactEntry[] = [];
  await Promise.all(
    [...rootsOf(conversations)].map(async ([root, conversation]) => {
      try {
        const list = await loadFileList(root);
        const pages = list.files.filter((f) => PAGE.test(f)).slice(0, PER_ROOT);
        await Promise.all(
          pages.map(async (path) => {
            const preview = await loadFilePreview(path, root).catch(() => null);
            if (!preview || preview.binary) return;
            found.push({
              key: `${root}::${path}`,
              root,
              path,
              title: artifactTitle(path),
              modified: preview.modified,
              conversationId: conversation.id,
              project: conversation.project,
              html: preview.text,
            });
          }),
        );
      } catch {
        // un dossier illisible (supprimé, sans git) n'empêche pas les autres
      }
    }),
  );
  return found.sort((a, b) => b.modified - a.modified);
}

/** Tous les artéfacts des conversations, du plus récent au plus ancien ; relu à chaque fois que `active` passe à vrai. */
export function useAllArtifacts(conversations: Conversation[], active: boolean) {
  const [items, setItems] = useState<ArtifactEntry[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active) return;
    let live = true;
    setLoading(true);
    scan(conversations)
      .then((found) => live && setItems(found))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // les conversations changent souvent (titres) : seul le moment où on ouvre compte
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps
  return { items, loading };
}
