import { useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import {
  GROUP_BY_LABELS,
  SHOW_LABELS,
  SORT_BY_LABELS,
  isDefaultView,
  type SidebarView,
} from "../lib/sidebarView";

interface SidebarViewMenuProps {
  /** Le bouton qui a ouvert le menu : le menu se pose dessous, par-dessus le reste de l'app. */
  anchor: DOMRect;
  view: SidebarView;
  onChange: (view: SidebarView) => void;
  onReset: () => void;
  onNewSection: () => void;
  onShowAll: () => void;
  onClose: () => void;
}

type Open = "groupBy" | "sortBy" | "show" | null;

function Option({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg py-1.5 pl-3 pr-3 text-left text-[13px] text-[#ecebe4] hover:bg-[#333331]"
    >
      <span className="flex-1">{label}</span>
      {selected && <Check className="h-3.5 w-3.5 text-[#4a9bff]" strokeWidth={1.8} />}
    </button>
  );
}

/** Menu d'affichage de la liste : regrouper, trier, filtrer, nouvelle section, tout déplier. */
export default function SidebarViewMenu({ anchor, view, onChange, onReset, onNewSection, onShowAll, onClose }: SidebarViewMenuProps) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open>(null);
  useClickOutside(root, true, onClose);

  // Le sous-menu s'ouvre sur le côté dès qu'on survole la ligne, sans clic.
  const row = (key: Exclude<Open, null>, title: string, value: string, options: ReactNode) => (
    <div className="relative" onMouseEnter={() => setOpen(key)}>
      <button
        onClick={() => setOpen(key)}
        className={`flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-[#ecebe4] ${open === key ? "bg-[#333331]" : ""}`}
      >
        <span className="flex-1">{title}</span>
        <span className="text-[#8c8b83]">{value}</span>
        <ChevronRight className="h-3.5 w-3.5 text-[#8c8b83]" strokeWidth={1.8} />
      </button>
      {open === key && (
        <div className="absolute left-full top-[-4px] pl-2">
          <div className="w-[190px] rounded-2xl border border-[#343432] bg-[#2a2a28] p-1 shadow-2xl">{options}</div>
        </div>
      )}
    </div>
  );

  const plain = "flex w-full items-center rounded-lg px-3 py-1.5 text-left text-[13px] hover:bg-[#333331]";

  return (
    <div
      ref={root}
      style={{ left: Math.max(8, anchor.left - 4), top: anchor.bottom + 6 }}
      className="fixed z-50 w-[280px] rounded-2xl border border-[#343432] bg-[#2a2a28] p-1 shadow-2xl"
      onClick={(e) => e.stopPropagation()}
    >
      {row(
        "groupBy",
        "Grouper par",
        GROUP_BY_LABELS[view.groupBy],
        (Object.keys(GROUP_BY_LABELS) as SidebarView["groupBy"][]).map((k) => (
          <Option key={k} label={GROUP_BY_LABELS[k]} selected={view.groupBy === k} onClick={() => onChange({ ...view, groupBy: k })} />
        )),
      )}
      {row(
        "sortBy",
        "Trier par",
        SORT_BY_LABELS[view.sortBy],
        (Object.keys(SORT_BY_LABELS) as SidebarView["sortBy"][]).map((k) => (
          <Option key={k} label={SORT_BY_LABELS[k]} selected={view.sortBy === k} onClick={() => onChange({ ...view, sortBy: k })} />
        )),
      )}
      {row(
        "show",
        "Afficher",
        SHOW_LABELS[view.show],
        (Object.keys(SHOW_LABELS) as SidebarView["show"][]).map((k) => (
          <Option key={k} label={SHOW_LABELS[k]} selected={view.show === k} onClick={() => onChange({ ...view, show: k })} />
        )),
      )}

      <div className="my-1 border-t border-[#343432]" />
      <button className={`${plain} text-[#ecebe4]`} onMouseEnter={() => setOpen(null)} onClick={onNewSection}>
        Nouvelle section
      </button>
      <div className="my-1 border-t border-[#343432]" />
      <button className={`${plain} ${isDefaultView(view) ? "cursor-default text-[#6f6e68] hover:bg-transparent" : "text-[#ecebe4]"}`} disabled={isDefaultView(view)} onMouseEnter={() => setOpen(null)} onClick={onReset}>
        Réinitialiser les paramètres par défaut
      </button>
      <button className={`${plain} text-[#ecebe4]`} onMouseEnter={() => setOpen(null)} onClick={onShowAll}>
        Tout afficher
      </button>
    </div>
  );
}
