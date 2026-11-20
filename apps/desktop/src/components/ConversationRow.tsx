import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import { useClickOutside } from "../hooks/useClickOutside";
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

export default function ConversationRow({
  conversation,
  selected,
  editing,
  sections,
  actions,
}: ConversationRowProps) {
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const menuOpen = menuAnchor !== null;
  const ref = useRef<HTMLDivElement>(null);
  const closeMenu = () => setMenuAnchor(null);
  useClickOutside(ref, menuOpen, closeMenu);

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
    <div ref={ref} className="group relative">
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
          className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#d97757] group-hover:hidden"
        />
      )}

      <button
        title="Plus"
        onClick={(e) =>
          setMenuAnchor(menuOpen ? null : e.currentTarget.getBoundingClientRect())
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
          anchor={menuAnchor}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
