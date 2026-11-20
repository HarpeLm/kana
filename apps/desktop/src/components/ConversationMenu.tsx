import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";

interface ConversationMenuProps {
  pinned: boolean;
  /** Rectangle du bouton qui a ouvert le menu : le menu se place sous lui, ou au-dessus s'il manque de place. */
  anchor: DOMRect;
  align: "left" | "right";
  onPin: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ITEM =
  "flex h-7 w-full items-center gap-2.5 rounded-lg px-[11px] text-left text-[14px] transition hover:bg-[#383835]";
const ICON = "h-[16px] w-[16px]";
const MENU_HEIGHT = 112;
const GAP = 4;

/** Menu d'actions d'une conversation (ligne de la barre latérale ou titre). */
export default function ConversationMenu({
  pinned,
  anchor,
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

  const fitsBelow = anchor.bottom + GAP + MENU_HEIGHT <= window.innerHeight;
  const style = {
    position: "fixed" as const,
    top: fitsBelow ? anchor.bottom + GAP : Math.max(GAP, anchor.top - GAP - MENU_HEIGHT),
    ...(align === "right"
      ? { right: window.innerWidth - anchor.right }
      : { left: anchor.left }),
  };

  return (
    <div
      style={style}
      className="z-50 w-[200px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]"
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
