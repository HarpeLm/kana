import type { ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { ArtifactsIcon } from "./icons";

interface SidebarNavProps {
  searching: boolean;
  onCreate: () => void;
  onToggleSearch: () => void;
  onArtifacts: () => void;
}

const ROW =
  "flex h-[34px] w-full items-center gap-2 rounded-lg px-[10px] text-left text-[14px] text-[#e6e5df] transition hover:bg-[#262624]";
const ICON = "h-[18px] w-[18px] shrink-0";

function Row({ label, icon, onClick, active }: { label: string; icon: ReactNode; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} className={`${ROW} ${active ? "bg-[#262624]" : ""}`}>
      {icon}
      {label}
    </button>
  );
}

/** Actions rapides en haut de la barre latérale : créer, rechercher, artéfacts. */
export default function SidebarNav({ searching, onCreate, onToggleSearch, onArtifacts }: SidebarNavProps) {
  return (
    <nav className="space-y-0.5 px-2">
      <Row label="Créer" icon={<Plus className={ICON} strokeWidth={1.6} />} onClick={onCreate} />
      <Row
        label="Rechercher"
        icon={<Search className={ICON} strokeWidth={1.6} />}
        onClick={onToggleSearch}
        active={searching}
      />
      <Row label="Artéfacts" icon={<ArtifactsIcon className={ICON} />} onClick={onArtifacts} />
    </nav>
  );
}
