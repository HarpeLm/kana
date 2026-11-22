import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import type { ConversationActions } from "./conversationActions";
import ConversationMenu from "./ConversationMenu";
import RenameInput from "./RenameInput";

interface ConversationRowProps {
  conversation: Conversation;
  selected: boolean;
  editing: boolean;
  sections: string[];
  actions: ConversationActions;
}

type MenuAnchorState =
  | { kind: "button"; initial: DOMRect }
  | { kind: "context"; initial: DOMRect; rightInset: number; topOffset: number };

export default function ConversationRow({
  conversation,
  selected,
  editing,
  sections,
  actions,
}: ConversationRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchorState | null>(null);
  const menuOpen = menuAnchor !== null;
  const closeMenu = () => setMenuAnchor(null);

  if (editing) {
    return (
      <RenameInput
        initial={conversation.title}
        onCommit={(title) => actions.onRename(conversation.id, title)}
        onCancel={actions.onCancelRename}
      />
    );
  }

  return (
    <div
      ref={rowRef}
      className="group relative"
      draggable
      onDragStart={(e) => {
        // Glisser une conversation sur un autre dossier l'y déplace.
        e.dataTransfer.setData("application/x-kana-conversation", conversation.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onContextMenu={(e) => {
        // Clic droit ou clic à deux doigts : le menu s'ouvre à l'endroit du curseur et suit la ligne.
        e.preventDefault();
        const rowRect = rowRef.current?.getBoundingClientRect();
        const initial = new DOMRect(e.clientX, e.clientY, 0, 0);
        setMenuAnchor({
          kind: "context",
          initial,
          rightInset: rowRect ? Math.max(0, rowRect.right - e.clientX) : 0,
          topOffset: rowRect ? e.clientY - rowRect.top : 0,
        });
      }}
    >
      <button
        onClick={() => actions.onSelect(conversation.id)}
        className={`flex h-8 w-full items-center rounded-lg px-[10px] pr-9 text-left text-[14px] transition ${
          selected
            ? "bg-[#2b2b29] text-[#f0efe9]"
            : "text-[#d4d3cb] hover:bg-[#262624] hover:text-[#f0efe9]"
        }`}
      >
        <span className="truncate">{conversation.title}</span>
      </button>

      {conversation.unread && !menuOpen && (
        <span
          aria-label="Non lue"
          className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#3b82f6] group-hover:hidden"
        />
      )}

      <button
        ref={moreBtnRef}
        title="Plus"
        onClick={(e) =>
          setMenuAnchor(
            menuOpen
              ? null
              : { kind: "button", initial: e.currentTarget.getBoundingClientRect() },
          )
        }
        className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[#c4c3bc] transition hover:bg-[#383835] ${
          selected || menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        <MoreHorizontal className="h-[16px] w-[16px]" strokeWidth={1.6} />
      </button>

      {menuAnchor && (
        <ConversationMenu
          conversation={conversation}
          sections={sections}
          actions={actions}
          anchor={menuAnchor.initial}
          getAnchor={() => {
            if (menuAnchor.kind === "button") {
              return moreBtnRef.current?.getBoundingClientRect() ?? menuAnchor.initial;
            }
            const rowRect = rowRef.current?.getBoundingClientRect();
            if (!rowRect) return menuAnchor.initial;
            const x = Math.max(rowRect.left, rowRect.right - menuAnchor.rightInset);
            const y = rowRect.top + menuAnchor.topOffset;
            return new DOMRect(x, y, 0, 0);
          }}
          canMarkUnread={!selected}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
