import { ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";

export interface NavButtonsProps {
  onToggleSidebar: () => void;
  canBack: boolean;
  canForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

const BUTTON =
  "flex h-7 w-7 items-center justify-center rounded-lg text-[#c4c3bc] transition hover:bg-[#2a2a27] hover:text-[#f2f1eb] disabled:text-[#5d5c57] disabled:hover:bg-transparent";
const ICON = "h-[18px] w-[18px]";

/** Afficher la barre latérale, puis revenir à la conversation précédente ou suivante. */
export default function NavButtons(p: NavButtonsProps) {
  return (
    <div className="flex items-center">
      <button title="Barre latérale" onClick={p.onToggleSidebar} className={BUTTON}>
        <PanelLeft className={ICON} strokeWidth={1.6} />
      </button>
      <button title="Précédent" disabled={!p.canBack} onClick={p.onBack} className={BUTTON}>
        <ChevronLeft className={ICON} strokeWidth={1.6} />
      </button>
      <button title="Suivant" disabled={!p.canForward} onClick={p.onForward} className={BUTTON}>
        <ChevronRight className={ICON} strokeWidth={1.6} />
      </button>
    </div>
  );
}
