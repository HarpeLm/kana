import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenu from "./ConversationMenu";
import RenameInput from "./RenameInput";

export interface ConversationActions {
  onSelect: (id: string) => void;
  onPin: (id: string) => void;
  onStartRename: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onCancelRename: () => void;
  onDelete: (id: string) => void;
}

interface ConversationRowProps extends ConversationActions {
  conversation: Conversation;
  selected: boolean;
  editing: boolean;
}

export default function ConversationRow({
  conversation,
  selected,
  editing,
  onSelect,
  onPin,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
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
        onCommit={(title) => onRename(conversation.id, title)}
        onCancel={onCancelRename}
      />
    );
  }

  return (
    <div ref={ref} className="group relative">
      <button
        onClick={() => onSelect(conversation.id)}
        className={`flex h-8 w-full items-center rounded-lg px-[10px] pr-9 text-left text-[14px] transition ${
          selected
            ? "bg-[#2b2b29] text-[#f0efe9]"
            : "text-[#d4d3cb] hover:bg-[#262624] hover:text-[#f0efe9]"
        }`}
      >
        <span className="truncate">{conversation.title}</span>
      </button>

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
          pinned={conversation.pinned}
          anchor={menuAnchor}
          align="right"
          onPin={() => onPin(conversation.id)}
          onRename={() => onStartRename(conversation.id)}
          onDelete={() => onDelete(conversation.id)}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
