import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";

interface ConversationMenuProps {
  pinned: boolean;
  align: "left" | "right";
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ITEM =
  "flex h-7 w-full items-center gap-2.5 rounded-lg px-[11px] text-left text-[14px] transition hover:bg-[#383835]";
const ICON = "h-[16px] w-[16px]";

/** Menu d'actions d'une conversation (ligne de la barre latérale ou titre). */
export default function ConversationMenu({
  pinned,
  align,
  onPin,
  onRename,
  onDelete,
  onClose,
}: ConversationMenuProps) {
  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div
      className={`absolute top-full z-50 mt-1 w-[200px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)] ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      <button onClick={run(onPin)} className={`${ITEM} text-[#e6e5df]`}>
        {pinned ? <PinOff className={ICON} strokeWidth={1.6} /> : <Pin className={ICON} strokeWidth={1.6} />}
        {pinned ? "Désépingler" : "Épingler"}
      </button>
      <button onClick={run(onRename)} className={`${ITEM} text-[#e6e5df]`}>
        <Pencil className={ICON} strokeWidth={1.6} />
        Renommer
      </button>
      <button onClick={run(onDelete)} className={`${ITEM} text-[#f0a090]`}>
        <Trash2 className={ICON} strokeWidth={1.6} />
        Supprimer
      </button>
    </div>
  );
}
