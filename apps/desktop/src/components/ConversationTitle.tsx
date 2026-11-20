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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

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
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 max-w-full items-center gap-1.5 rounded-lg px-2 text-[14px] text-[#e6e5df] transition hover:bg-[#2a2a27]"
      >
        <span className="truncate">{conversation.title}</span>
        <ChevronDown className="h-[14px] w-[14px] shrink-0 text-[#9a9992]" strokeWidth={1.8} />
      </button>
      {open && (
        <ConversationMenu
          pinned={conversation.pinned}
          align="left"
          onPin={onPin}
          onRename={onStartRename}
          onDelete={onDelete}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
