import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_AGENT,
  DEFAULT_PROJECT,
  loadConversations,
  makeConversation,
  moveDown as moveItemDown,
  saveConversations,
  type Conversation,
} from "../lib/conversations";

/** Liste des conversations et toutes les actions possibles sur elles. */
export function useConversations() {
  const [items, setItems] = useState(loadConversations);
  const [selectedId, setSelectedId] = useState(() => items[0].id);

  useEffect(() => saveConversations(items), [items]);

  const selected = items.find((c) => c.id === selectedId) ?? items[0];

  const patch = useCallback((id: string, change: (c: Conversation) => Conversation) => {
    setItems((list) => list.map((c) => (c.id === id ? change(c) : c)));
  }, []);

  /** Ouvre une conversation ; l'ouvrir la marque comme lue. */
  const select = useCallback(
    (id: string) => {
      setSelectedId(id);
      patch(id, (c) => (c.unread ? { ...c, unread: false } : c));
    },
    [patch],
  );

  const create = useCallback(() => {
    const conversation = makeConversation(
      selected?.project ?? DEFAULT_PROJECT,
      selected?.agentId ?? DEFAULT_AGENT,
    );
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
      };
      const index = items.indexOf(source);
      setItems([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
      setSelectedId(copy.id);
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
  };
}
