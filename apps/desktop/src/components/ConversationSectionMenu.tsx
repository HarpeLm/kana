import { useState } from "react";
import RenameInput from "./RenameInput";

interface ConversationSectionMenuProps {
  /** Sections où l'on peut déplacer la conversation (sans la sienne). */
  sections: string[];
  onPick: (section: string) => void;
}

const ITEM =
  "flex h-7 w-full items-center rounded-lg px-3 text-left text-[14px] text-[#e6e5df] transition hover:bg-[#383835]";

/** Sous-menu « Déplacer vers une section » : les sections existantes ou une nouvelle. */
export default function ConversationSectionMenu({ sections, onPick }: ConversationSectionMenuProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="absolute left-full top-0 z-50 ml-1 w-[200px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
      {sections.map((section) => (
        <button key={section} onClick={() => onPick(section)} className={ITEM}>
          <span className="truncate">{section}</span>
        </button>
      ))}
      {creating ? (
        <RenameInput initial="" onCommit={onPick} onCancel={() => setCreating(false)} />
      ) : (
        <button onClick={() => setCreating(true)} className={`${ITEM} text-[#9a9992]`}>
          Nouvelle section…
        </button>
      )}
    </div>
  );
}
