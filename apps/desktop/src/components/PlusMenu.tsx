import { useRef, useState, type ReactNode } from "react";
import { Blocks, ChevronRight, Folder, Paperclip, Plug, Plus, SquareSlash } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";

interface PlusMenuProps {
  onAddFiles: () => void;
  onAddFolder: () => void;
  onSlash: () => void;
}

function Item({
  icon,
  label,
  hint,
  onClick,
  soon,
}: {
  icon: ReactNode;
  label: string;
  hint?: ReactNode;
  onClick?: () => void;
  soon?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={soon}
      title={soon ? "Bientôt" : undefined}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-1 text-left text-[13px] text-[#ecebe4] transition hover:bg-[#333331] disabled:cursor-default disabled:text-[#7e7d76] disabled:hover:bg-transparent"
    >
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 text-[12px] text-[#8c8b83]">{hint}</span>}
    </button>
  );
}

/** Menu du bouton « + » : joindre des fichiers ou un dossier, commandes slash, connecteurs, plug-ins. */
export default function PlusMenu({ onAddFiles, onAddFolder, onSlash }: PlusMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickOutside(root, open, () => setOpen(false));
  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const icon = "h-4 w-4";

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Ajouter"
        aria-label="Ajouter"
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#a3a29a] transition hover:bg-[#2e2e2c] hover:text-[#ecebe4] ${
          open ? "bg-[#2e2e2c] text-[#ecebe4]" : ""
        }`}
      >
        <Plus className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[320px] rounded-2xl border border-[#343432] bg-[#2a2a28] p-1 shadow-2xl">
          <Item
            icon={<Paperclip className={icon} strokeWidth={1.6} />}
            label="Ajouter des fichiers ou des photos"
            hint="⌘U"
            onClick={run(onAddFiles)}
          />
          <Item icon={<Folder className={icon} strokeWidth={1.6} />} label="Ajouter un dossier" onClick={run(onAddFolder)} />
          <Item icon={<SquareSlash className={icon} strokeWidth={1.6} />} label="Commandes slash" onClick={run(onSlash)} />
          <Item
            icon={<Blocks className={icon} strokeWidth={1.6} />}
            label="Connecteurs"
            hint={<ChevronRight className="h-4 w-4" />}
            soon
          />
          <Item
            icon={<Plug className={icon} strokeWidth={1.6} />}
            label="Plug-ins"
            hint={<ChevronRight className="h-4 w-4" />}
            soon
          />
        </div>
      )}
    </div>
  );
}
