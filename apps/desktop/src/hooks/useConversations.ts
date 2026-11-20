import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_AGENT,
  DEFAULT_PROJECT,
  makeConversation,
  moveDown as moveItemDown,
  type Conversation,
} from "../lib/conversations";
import { saveStoredConversations } from "../lib/store";

/** Liste des conversations et toutes les actions possibles sur elles. */
export function useConversations(initial: Conversation[], initialSelectedId: string) {
  const [items, setItems] = useState(initial);
  const [selectedId, setSelectedId] = useState(initialSelectedId);

  // Chaque changement est rangé dans la base, un court instant après le dernier.
  useEffect(() => {
    const timer = setTimeout(() => void saveStoredConversations(items).catch(() => {}), 250);
    return () => clearTimeout(timer);
  }, [items]);

  const selected = items.find((c) => c.id === selectedId) ?? items[0];

  const patch = useCallback((id: string, change: (c: Conversation) => Conversation) => {
    setItems((list) => list.map((c) => (c.id === id ? change(c) : c)));
  }, []);

  /** Ouvre une conversation ; l'ouvrir la marque comme lue et comme récente. */
  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      patch(id, (c) => ({ ...c, unread: false, openedAt: Date.now() }));
    },
    [patch],
  );

  const create = useCallback(() => {
    const conversation: Conversation = {
      ...makeConversation(selected?.project ?? DEFAULT_PROJECT, selected?.agentId ?? DEFAULT_AGENT),
      projectPath: selected?.projectPath,
    };
    setItems((list) => [conversation, ...list]);
    setSelectedId(conversation.id);
  }, [selected]);

  const rename = useCallback(
    (id: string, title: string) => {
      const clean = title.trim();
      if (clean) patch(id, (c) => ({ ...c, title: clean }));
    },
    [patch],
  );

  const togglePin = useCallback(
    (id: string) => patch(id, (c) => ({ ...c, pinned: !c.pinned })),
    [patch],
  );

  const toggleUnread = useCallback(
    (id: string) => patch(id, (c) => ({ ...c, unread: !c.unread })),
    [patch],
  );

  const toggleArchive = useCallback(
    (id: string) => patch(id, (c) => ({ ...c, archived: !c.archived, pinned: false })),
    [patch],
  );

  const moveToSection = useCallback(
    (id: string, project: string) => {
      const clean = project.trim();
      if (clean) patch(id, (c) => ({ ...c, project: clean, archived: false }));
    },
    [patch],
  );

  const moveDown = useCallback((id: string) => setItems((list) => moveItemDown(list, id)), []);

  /** Copie les réglages de la conversation (projet, agent) ; l'historique n'est pas copié. */
  const duplicate = useCallback(
    (id: string) => {
      const source = items.find((c) => c.id === id);
      if (!source) return;
      const copy = {
        ...makeConversation(source.project, source.agentId),
        title: `${source.title} (copie)`,
        projectPath: source.projectPath,
        useWorktree: source.useWorktree,
      };
      const index = items.indexOf(source);
      setItems([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
      setSelectedId(copy.id);
    },
    [items],
  );

  /** Change le projet d'une conversation (le dossier où ses agents travaillent). */
  const setProject = useCallback(
    (id: string, project: string, projectPath: string) =>
      patch(id, (c) => ({ ...c, project, projectPath, worktree: undefined, branch: undefined })),
    [patch],
  );

  const setUseWorktree = useCallback(
    (id: string, useWorktree: boolean) => patch(id, (c) => ({ ...c, useWorktree })),
    [patch],
  );

  /** Garde le dossier de travail créé pour une conversation. */
  const attachWorktree = useCallback(
    (id: string, worktree: string, branch: string) => patch(id, (c) => ({ ...c, worktree, branch })),
    [patch],
  );

  /** Le résumé de la conversation d'origine a été donné à l'agent : on ne le redonne pas. */
  const clearForkContext = useCallback(
    (id: string) => patch(id, (c) => ({ ...c, forkContext: undefined })),
    [patch],
  );

  /** Crée une conversation qui prolonge celle-ci (même projet et même agent) ; renvoie son identifiant. */
  const fork = useCallback(
    (id: string, context: string): string | null => {
      const source = items.find((c) => c.id === id);
      if (!source) return null;
      const copy: Conversation = {
        ...makeConversation(source.project, source.agentId),
        title: `${source.title} (bifurcation)`,
        projectPath: source.projectPath,
        useWorktree: source.useWorktree,
        forkedFrom: source.id,
        forkContext: context,
      };
      const index = items.indexOf(source);
      setItems([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
      setSelectedId(copy.id);
      return copy.id;
    },
    [items],
  );

  const remove = useCallback(
    (id: string) => {
      const next = items.filter((c) => c.id !== id);
      if (next.length === 0) {
        const fresh = makeConversation(DEFAULT_PROJECT, DEFAULT_AGENT);
        setItems([fresh]);
        setSelectedId(fresh.id);
        return;
      }
      setItems(next);
      if (selected.id === id) setSelectedId(next[0].id);
    },
    [items, selected],
  );

  return {
    items,
    selected,
    select,
    create,
    rename,
    togglePin,
    toggleUnread,
    toggleArchive,
    moveToSection,
    moveDown,
    duplicate,
    remove,
    attachWorktree,
    clearForkContext,
    setProject,
    setUseWorktree,
    fork,
  };
}
