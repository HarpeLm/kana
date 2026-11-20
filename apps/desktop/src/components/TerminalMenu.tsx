import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import ConversationMenuItem from "./ConversationMenuItem";
import ToolbarButton from "./ToolbarButton";

interface TerminalMenuProps {
  onClear: () => void;
  onRestart: () => void;
}

/** Menu « ... » du volet Terminal : effacer l'écran ou relancer le shell de l'onglet actif. */
export default function TerminalMenu({ onClear, onRestart }: TerminalMenuProps) {
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
        <div className="absolute right-0 top-full z-50 mt-[7px] w-[210px] rounded-xl border border-[#3a3a37] bg-[#2b2b29] p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
          <ConversationMenuItem label="Effacer l'écran" onClick={run(onClear)} />
          <ConversationMenuItem label="Relancer le shell" onClick={run(onRestart)} />
        </div>
      )}
    </div>
  );
}
