import { useRef, useState, type ReactNode } from "react";
import { Blocks, ChevronRight, Folder, Paperclip, Plug, Plus, SquareSlash } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { tr, useLocale } from "../lib/i18n";

interface PlusMenuProps {
  onAddFiles: () => void;
  onAddFolder: () => void;
  onSlash: () => void;
  onOpenConnectors?: () => void;
  onOpenPlugins?: () => void;
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
export default function PlusMenu({ onAddFiles, onAddFolder, onSlash, onOpenConnectors, onOpenPlugins }: PlusMenuProps) {
  const locale = useLocale();
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
        title={tr("Ajouter", "Add", locale)}
        aria-label={tr("Ajouter", "Add", locale)}
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
            label={tr("Ajouter des fichiers ou des photos", "Add files or images", locale)}
            hint="⌘U"
            onClick={run(onAddFiles)}
          />
          <Item icon={<Folder className={icon} strokeWidth={1.6} />} label={tr("Ajouter un dossier", "Add folder", locale)} onClick={run(onAddFolder)} />
          <Item icon={<SquareSlash className={icon} strokeWidth={1.6} />} label={tr("Commandes slash", "Slash commands", locale)} onClick={run(onSlash)} />
          <Item
            icon={<Blocks className={icon} strokeWidth={1.6} />}
            label={tr("Connecteurs", "Connectors", locale)}
            hint={<ChevronRight className="h-4 w-4" />}
            onClick={run(() => onOpenConnectors?.())}
          />
          <Item
            icon={<Plug className={icon} strokeWidth={1.6} />}
            label={tr("Plug-ins", "Plugins", locale)}
            hint={<ChevronRight className="h-4 w-4" />}
            onClick={run(() => onOpenPlugins?.())}
          />
        </div>
      )}
    </div>
  );
}
