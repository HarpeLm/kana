import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Conversation } from "../lib/conversations";
import { useClickOutside } from "../hooks/useClickOutside";
import type { ConversationActions } from "./conversationActions";
import ConversationMenu from "./ConversationMenu";
import RenameInput from "./RenameInput";

interface ConversationTitleProps {
  conversation: Conversation;
  editing: boolean;
  sections: string[];
  actions: ConversationActions;
}

/** Titre de la conversation dans la barre du haut, avec son menu d'actions. */
export default function ConversationTitle({
  conversation,
  editing,
  sections,
  actions,
}: ConversationTitleProps) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setAnchor(null);
  useClickOutside(ref, anchor !== null, close);

  if (editing) {
    return (
      <div className="w-[260px]">
        <RenameInput
          initial={conversation.title}
          onCommit={(title) => actions.onRename(conversation.id, title)}
          onCancel={actions.onCancelRename}
        />
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
          conversation={conversation}
          sections={sections}
          actions={actions}
          anchor={anchor}
          canMarkUnread={false}
          onClose={close}
        />
      )}
    </div>
  );
}
