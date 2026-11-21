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
      patch(id, (c) => ({ ...c, project, projectPath, worktree: undefined, branch: undefined, acpSessionId: undefined })),
    [patch],
  );

  /** Marque une conversation comme active à l'instant (elle remonte dans le tri par activité). */
  const touch = useCallback((id: string) => patch(id, (c) => ({ ...c, openedAt: Date.now() })), [patch]);

  /** Crée une conversation vide directement dans un dossier (une section de la barre latérale). */
  const createIn = useCallback(
    (project: string, projectPath: string | undefined) => {
      const conversation: Conversation = {
        ...makeConversation(project, selected?.agentId ?? DEFAULT_AGENT),
        projectPath,
        modelId: selected?.modelId,
      };
      setItems((list) => [conversation, ...list]);
      setSelectedId(conversation.id);
    },
    [selected],
  );

  /** Déplace un dossier avant ou après un autre : ses conversations suivent. */
  const moveSection = useCallback((from: string, to: string) => {
    if (from === to) return;
    setItems((list) => {
      const order = Array.from(new Set(list.map((c) => c.project)));
      const fromIndex = order.indexOf(from);
      const toIndex = order.indexOf(to);
      if (fromIndex < 0 || toIndex < 0) return list;
      order.splice(fromIndex, 1);
      order.splice(toIndex, 0, from);
      // Le tri est stable : l'ordre des conversations d'un même dossier ne change pas.
      return [...list].sort((a, b) => order.indexOf(a.project) - order.indexOf(b.project));
    });
  }, []);

  /** Choisit le fournisseur (l'agent) et le modèle d'une conversation. */
  const setAgent = useCallback(
    (id: string, agentId: string, modelId?: string) =>
      patch(id, (c) => ({
        ...c,
        agentId,
        modelId,
        acpSessionId: c.agentId === agentId ? c.acpSessionId : undefined,
      })),
    [patch],
  );

  /** Retient l'identifiant de session ACP du fil pour pouvoir le reprendre après redémarrage. */
  const setAcpSessionId = useCallback(
    (id: string, acpSessionId: string | undefined) =>
      setItems((list) => {
        const current = list.find((c) => c.id === id);
        if (!current || current.acpSessionId === acpSessionId) return list;
        return list.map((c) => (c.id === id ? { ...c, acpSessionId } : c));
      }),
    [],
  );

  /** Ajoute un dossier à la session (retenu avec la conversation). */
  const addFolder = useCallback(
    (id: string, path: string) =>
      patch(id, (c) => ({ ...c, extraFolders: [...new Set([...(c.extraFolders ?? []), path])] })),
    [patch],
  );

  /** Le relais : la conversation continue chez un autre fournisseur, avec le résumé de ce qui s'est dit. */
  const relayTo = useCallback(
    (id: string, agentId: string, context: string) =>
      patch(id, (c) => ({ ...c, agentId, modelId: undefined, forkContext: context, acpSessionId: undefined })),
    [patch],
  );

  /** Le résumé à donner à l'agent au prochain message (session compactée). */
  const setForkContext = useCallback(
    (id: string, forkContext: string) => patch(id, (c) => ({ ...c, forkContext })),
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

  /** Le dossier de travail a été supprimé : le prochain message en crée un neuf. */
  const clearWorktree = useCallback(
    (id: string) => patch(id, (c) => ({ ...c, worktree: undefined, branch: undefined, acpSessionId: undefined })),
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
    addFolder,
    togglePin,
    toggleUnread,
    toggleArchive,
    moveToSection,
    moveDown,
    duplicate,
    remove,
    attachWorktree,
    clearWorktree,
    clearForkContext,
    setProject,
    setUseWorktree,
    setAgent,
    setAcpSessionId,
    relayTo,
    setForkContext,
    createIn,
    moveSection,
    touch,
    fork,
  };
}
