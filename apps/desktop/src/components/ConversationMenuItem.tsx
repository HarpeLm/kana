import { ChevronRight } from "lucide-react";

interface ConversationMenuItemProps {
  label: string;
  onClick: () => void;
  /** Lettre affichée à droite : appuyer dessus quand le menu est ouvert déclenche l'action. */
  shortcut?: string;
  /** Ouvre un sous-menu : une flèche remplace le raccourci. */
  submenu?: boolean;
  danger?: boolean;
  onMouseEnter?: () => void;
}

export function MenuDivider() {
  return <div className="mx-[6px] my-1 h-px bg-[#41413d]" />;
}

export default function ConversationMenuItem({
  label,
  onClick,
  shortcut,
  submenu,
  danger,
  onMouseEnter,
}: ConversationMenuItemProps) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={`flex h-7 w-full items-center justify-between rounded-lg px-3 text-left text-[14px] transition hover:bg-[#383835] ${
        danger ? "text-[#f0a090]" : "text-[#e6e5df]"
      }`}
    >
      {label}
      {shortcut && <span className="text-[13px] text-[#9a9992]">{shortcut}</span>}
      {submenu && <ChevronRight className="h-[14px] w-[14px] text-[#9a9992]" strokeWidth={1.8} />}
    </button>
  );
}
