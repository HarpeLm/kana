import type { ReactNode } from "react";
import { Briefcase, Clock, Plus, Search } from "lucide-react";
import type { View } from "../data";
import { ArtifactsIcon } from "./icons";

interface SidebarNavProps {
  view: View;
  searching: boolean;
  onCreate: () => void;
  onToggleSearch: () => void;
  onArtifacts: () => void;
  onScheduled: () => void;
  onCustomize: () => void;
}

const ROW =
  "flex h-8 w-full items-center gap-2 rounded-lg px-[10px] text-left text-[14px] text-[#e6e5df] transition hover:bg-[#262624]";
const ICON = "h-[18px] w-[18px] shrink-0";

interface RowProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
}

function Row({ label, icon, onClick, active }: RowProps) {
  return (
    <button onClick={onClick} className={`${ROW} ${active ? "bg-[#262624]" : ""}`}>
      {icon}
      {label}
    </button>
  );
}

/** Actions rapides en haut de la barre latérale. */
export default function SidebarNav(p: SidebarNavProps) {
  return (
    <nav className="space-y-0.5 px-2 pt-1">
      <Row label="Créer" icon={<Plus className={ICON} strokeWidth={1.6} />} onClick={p.onCreate} />
      <Row
        label="Rechercher"
        icon={<Search className={ICON} strokeWidth={1.6} />}
        onClick={p.onToggleSearch}
        active={p.searching}
      />
      <Row label="Artéfacts" icon={<ArtifactsIcon className={ICON} />} onClick={p.onArtifacts} active={p.view === "artifacts"} />
      <Row
        label="Tâches planifiées"
        icon={<Clock className={ICON} strokeWidth={1.6} />}
        onClick={p.onScheduled}
        active={p.view === "scheduled"}
      />
      <Row
        label="Personnalisation"
        icon={<Briefcase className={ICON} strokeWidth={1.6} />}
        onClick={p.onCustomize}
        active={p.view === "settings"}
      />
    </nav>
  );
}
