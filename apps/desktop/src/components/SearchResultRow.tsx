import { useEffect, useRef } from "react";
import { ArtifactsIcon } from "./icons";
import { CornerDownLeft, Folder, MessageSquare, Plus, Settings } from "lucide-react";
import { ACTION_NEW, ACTION_SETTINGS, type SearchItem } from "../lib/searchItems";

interface SearchResultRowProps {
  item: SearchItem;
  active: boolean;
  onHover: () => void;
  onChoose: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}

const ICON = "h-[18px] w-[18px] shrink-0 text-[#c4c3bc]";

function ItemIcon({ item }: { item: SearchItem }) {
  if (item.kind === "artifact") return <ArtifactsIcon className={ICON} />;
  if (item.kind === "project") return <Folder className={ICON} strokeWidth={1.6} />;
  if (item.id === ACTION_NEW) return <Plus className={ICON} strokeWidth={1.6} />;
  if (item.id === ACTION_SETTINGS) return <Settings className={ICON} strokeWidth={1.6} />;
  return <MessageSquare className={ICON} strokeWidth={1.6} />;
}

export default function SearchResultRow({ item, active, onHover, onChoose, onContextMenu }: SearchResultRowProps) {
  const ref = useRef<HTMLButtonElement>(null);

  // Garde la ligne choisie au clavier visible dans la liste.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <button
      ref={ref}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onChoose}
      onContextMenu={onContextMenu}
      className={`flex h-9 w-full items-center gap-3 rounded-lg px-4 text-left text-[15px] transition-colors ${
        active ? "bg-[#3a3a37] text-[#f0efe9]" : "text-[#e6e5df]"
      }`}
    >
      <ItemIcon item={item} />
      <span className="min-w-0 flex-1 truncate">
        {item.title}
        {item.hint && <span className="text-[#8a8982]"> · {item.hint}</span>}
      </span>
      {active && <CornerDownLeft className="h-[15px] w-[15px] shrink-0 text-[#9a9992]" strokeWidth={1.6} />}
    </button>
  );
}
