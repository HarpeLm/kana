import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenuItem from "./ConversationMenuItem";
import ToolbarButton from "./ToolbarButton";

interface FilesMenuProps {
  /** Faux quand aucun fichier n'est ouvert. */
  hasFile: boolean;
  onCopyPath: () => void;
  onRefresh: () => void;
}

/** Menu « ... » du volet Fichiers. */
export default function FilesMenu({ hasFile, onCopyPath, onRefresh }: FilesMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => setOpen(false));

  const run = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div ref={ref} className="relative">
      <ToolbarButton title="Plus" active={open} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={1.6} />
      </ToolbarButton>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-[7px] w-[220px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
          <ConversationMenuItem label="Copier le chemin" disabled={!hasFile} onClick={run(onCopyPath)} />
          <ConversationMenuItem label="Actualiser les fichiers" onClick={run(onRefresh)} />
        </div>
      )}
    </div>
  );
}
