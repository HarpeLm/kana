import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_AGENT,
  DEFAULT_PROJECT,
  loadConversations,
  makeConversation,
  saveConversations,
} from "../lib/conversations";

/** Liste des conversations, avec sélection, renommage, épinglage et suppression. */
export function useConversations() {
  const [items, setItems] = useState(loadConversations);
  const [selectedId, setSelectedId] = useState(() => items[0].id);

  useEffect(() => saveConversations(items), [items]);

  const selected = items.find((c) => c.id === selectedId) ?? items[0];

  const create = useCallback(() => {
    const conversation = makeConversation(
      selected?.project ?? DEFAULT_PROJECT,
      selected?.agentId ?? DEFAULT_AGENT,
    );
    setItems((list) => [conversation, ...list]);
    setSelectedId(conversation.id);
  }, [selected]);

  const rename = useCallback((id: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    setItems((list) => list.map((c) => (c.id === id ? { ...c, title: clean } : c)));
  }, []);

  const togglePin = useCallback((id: string) => {
    setItems((list) => list.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)));
  }, []);

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

  return { items, selected, select: setSelectedId, create, rename, togglePin, remove };
}
