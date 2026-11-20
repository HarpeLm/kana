import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenu from "./ConversationMenu";
import RenameInput from "./RenameInput";

interface ConversationTitleProps {
  conversation: Conversation;
  editing: boolean;
  onPin: () => void;
  onStartRename: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onDelete: () => void;
}

/** Titre de la conversation dans la barre du haut, avec son menu d'actions. */
export default function ConversationTitle({
  conversation,
  editing,
  onPin,
  onStartRename,
  onRename,
  onCancelRename,
  onDelete,
}: ConversationTitleProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setAnchor(null);
  useClickOutside(ref, anchor !== null, close);

  if (editing) {
    return (
      <div className="w-[260px]">
        <RenameInput initial={conversation.title} onCommit={onRename} onCancel={onCancelRename} />
      </div>
    );
  }

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
        className="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-2 text-[14px] text-[#e6e5df] transition hover:bg-[#2a2a27]"
      >
        <span className="truncate">{conversation.title}</span>
        <ChevronDown className="h-[14px] w-[14px] shrink-0 text-[#9a9992]" strokeWidth={1.8} />
      </button>
      {anchor && (
        <ConversationMenu
          pinned={conversation.pinned}
          anchor={anchor}
          align="left"
          onPin={onPin}
          onRename={onStartRename}
          onDelete={onDelete}
          onClose={close}
        />
      )}
    </div>
  );
}
