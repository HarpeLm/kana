import { Plus, X } from "lucide-react";
import type { TerminalTab } from "../hooks/useTerminalTabs";
import ToolbarButton from "./ToolbarButton";

interface TerminalTabsProps {
  tabs: TerminalTab[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  /** Libellé du bouton « + » (selon ce que les onglets contiennent). */
  addLabel?: string;
  /** Montre la croix même quand il n'y a qu'un onglet (fermer le dernier ferme le volet). */
  closeLast?: boolean;
}

/** Onglets du volet Terminal et bouton « + » pour en ouvrir un nouveau. */
export default function TerminalTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
  addLabel = "Nouveau terminal",
  closeLast = false,
}: TerminalTabsProps) {
  const many = tabs.length > 1;
  const closable = many || closeLast;

  return (
    <div className="flex min-w-0 items-center gap-1">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`group flex h-7 items-center rounded-lg text-[14px] transition ${
            closable && tab.id === activeId ? "bg-[#2a2a27]" : ""
          }`}
        >
          <button
            onClick={() => onSelect(tab.id)}
            className={`h-7 max-w-[170px] truncate px-2 ${
              tab.id === activeId ? "text-[#e6e5df]" : "text-[#8a8982] hover:text-[#e6e5df]"
            }`}
          >
            {tab.title}
          </button>
          {closable && (
            <button
              onClick={() => onClose(tab.id)}
              title="Fermer l'onglet"
              className={`mr-1 flex h-5 w-5 items-center justify-center rounded text-[#9a9992] transition hover:bg-[#383835] hover:text-[#f0efe9] group-hover:opacity-100 ${
                tab.id === activeId && closeLast ? "opacity-100" : "opacity-0"
              }`}
            >
              <X className="h-[13px] w-[13px]" strokeWidth={1.8} />
            </button>
          )}
        </div>
      ))}
      <ToolbarButton title={addLabel} onClick={onAdd}>
        <Plus className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </ToolbarButton>
    </div>
  );
}
