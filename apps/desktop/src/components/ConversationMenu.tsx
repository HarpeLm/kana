import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useClickOutside } from "../hooks/useClickOutside";
import type { Conversation } from "../lib/conversations";
import type { ConversationActions } from "./conversationActions";
import ConversationMenuItem, { MenuDivider } from "./ConversationMenuItem";
import ConversationSectionMenu from "./ConversationSectionMenu";

interface ConversationMenuProps {
  conversation: Conversation;
  /** Sections existantes, pour « Déplacer vers une section ». */
  sections: string[];
  actions: ConversationActions;
  /** Rectangle du bouton (ou point du clic droit) qui a ouvert le menu : le menu s'y aligne. */
  anchor: DOMRect;
  /** Lecture en direct du rectangle d'ancrage, pour que le menu suive le défilement ou le redimensionnement. */
  getAnchor?: () => DOMRect | null;
  /** Faux pour la conversation ouverte : on ne la marque pas « non lue » pendant qu'on la lit. */
  canMarkUnread: boolean;
  onClose: () => void;
}

const GAP = 4;
const EDGE = 8;

/** Menu d'une conversation, avec raccourcis à une lettre tant qu'il est ouvert. */
export default function ConversationMenu({
  conversation,
  sections,
  actions,
  anchor,
  getAnchor,
  canMarkUnread,
  onClose,
}: ConversationMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, true, onClose);
  const [position, setPosition] = useState({ top: anchor.bottom + GAP, left: anchor.left });
  const [sectionsOpen, setSectionsOpen] = useState(false);
  const id = conversation.id;
  const getAnchorRef = useRef(getAnchor);
  getAnchorRef.current = getAnchor;

  // Une fois mesuré : sous le bouton s'il y a la place, sinon au-dessus ; suit l'ancre en temps réel.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const computePos = (rect: DOMRect) => {
      const fitsBelow = rect.bottom + GAP + el.offsetHeight <= window.innerHeight - EDGE;
      return {
        top: fitsBelow ? rect.bottom + GAP : Math.max(EDGE, rect.top - GAP - el.offsetHeight),
        left: Math.min(Math.max(EDGE, rect.left), window.innerWidth - el.offsetWidth - EDGE),
      };
    };

    const initial = computePos(getAnchorRef.current?.() ?? anchor);
    setPosition(initial);
    el.style.top = `${initial.top}px`;
    el.style.left = `${initial.left}px`;

    let frame = 0;
    let lastTop = initial.top;
    let lastLeft = initial.left;

    const track = () => {
      const rect = getAnchorRef.current?.() ?? anchor;
      const next = computePos(rect);
      if (Math.abs(next.top - lastTop) >= 0.25 || Math.abs(next.left - lastLeft) >= 0.25) {
        lastTop = next.top;
        lastLeft = next.left;
        el.style.top = `${next.top}px`;
        el.style.left = `${next.left}px`;
      }
      frame = window.requestAnimationFrame(track);
    };

    frame = window.requestAnimationFrame(track);
    return () => window.cancelAnimationFrame(frame);
  }, [anchor]);

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const markable = canMarkUnread || conversation.unread;
  const shortcuts: Record<string, () => void> = {
    p: () => actions.onPin(id),
    ...(markable ? { u: () => actions.onToggleUnread(id) } : {}),
    r: () => actions.onStartRename(id),
    f: () => actions.onDuplicate(id),
    a: () => actions.onArchive(id),
    d: () => actions.onDelete(id),
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if ((event.target as HTMLElement).tagName === "INPUT") return;
      if (event.key === "Escape") return onClose();
      const action = shortcuts[event.key.toLowerCase()];
      if (!action) return;
      event.preventDefault();
      onClose();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const otherSections = sections.filter((s) => s !== conversation.project);

  return createPortal(
    <div
      ref={ref}
      style={{ position: "fixed", ...position }}
      className="z-50 w-[220px] rounded-xl border border-white/[0.09] bg-[#1e1f22]/90 p-1.5 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_14px_34px_rgba(0,0,0,0.6)]"
    >
      <ConversationMenuItem
        label={conversation.pinned ? "Désépingler" : "Épingler"}
        shortcut="P"
        onClick={run(() => actions.onPin(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />
      <ConversationMenuItem
        label={conversation.unread ? "Marquer comme lu" : "Marquer comme non lu"}
        shortcut="U"
        disabled={!markable}
        onClick={run(() => actions.onToggleUnread(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />
      <ConversationMenuItem
        label="Renommer"
        shortcut="R"
        onClick={run(() => actions.onStartRename(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />
      <ConversationMenuItem
        label="Dupliquer"
        shortcut="F"
        onClick={run(() => actions.onDuplicate(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />

      <MenuDivider />

      <ConversationMenuItem
        label="Déplacer vers le bas"
        onClick={run(() => actions.onMoveDown(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />
      <div className="relative">
        <ConversationMenuItem
          label="Déplacer vers une section"
          submenu
          onClick={() => setSectionsOpen((v) => !v)}
          onMouseEnter={() => setSectionsOpen(true)}
        />
        {sectionsOpen && (
          <ConversationSectionMenu
            sections={otherSections}
            onPick={(section) => {
              onClose();
              actions.onMoveToSection(id, section);
            }}
          />
        )}
      </div>

      <MenuDivider />

      <ConversationMenuItem
        label={conversation.archived ? "Désarchiver" : "Archiver"}
        shortcut="A"
        onClick={run(() => actions.onArchive(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />
      <ConversationMenuItem
        label="Supprimer"
        shortcut="D"
        danger
        onClick={run(() => actions.onDelete(id))}
        onMouseEnter={() => setSectionsOpen(false)}
      />
    </div>,
    document.body,
  );
}
