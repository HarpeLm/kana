import { useRef, useState } from "react";
import { Check, ChevronDown, ClipboardList, Hand, ShieldAlert, ShieldCheck } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { MODES, type PermissionMode } from "../lib/permissionMode";

const icons = { ask: Hand, plan: ClipboardList, auto: ShieldCheck, full: ShieldAlert };

interface ModeMenuProps {
  mode: PermissionMode;
  onChange: (mode: PermissionMode) => void;
}

/** Choix du mode d'autorisation, sous la zone de saisie. « Accès complet » reste en orange. */
export default function ModeMenu({ mode, onChange }: ModeMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useClickOutside(root, open, () => setOpen(false));
  const current = MODES.find((m) => m.id === mode) ?? MODES[0];
  const Icon = icons[current.id];
  const full = mode === "full";

  return (
    <div ref={root} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] transition hover:bg-[#262624] ${
          full ? "text-[#e8743b]" : "text-[#9a9992] hover:text-[#ecebe4]"
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.7} />
        {current.label}
        <ChevronDown className="h-3 w-3" strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-2 w-[600px] max-w-[calc(100vw-3rem)] rounded-2xl border border-[#343432] bg-[#2a2a28] p-1 shadow-2xl">
          <p className="px-3 pb-0.5 pt-1.5 text-[12px] text-[#9a9992]">Comment les actions de l'agent doivent-elles être approuvées ?</p>
          {MODES.map((item) => {
            const ItemIcon = icons[item.id];
            const danger = item.id === "full";
            return (
              <button
                key={item.id}
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-1.5 text-left transition ${
                  danger ? "text-[#e8743b] hover:bg-[#e8743b]/10" : "text-[#ecebe4] hover:bg-[#333331]"
                }`}
              >
                <ItemIcon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.6} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] leading-[1.35]">{item.label}</span>
                  <span className={`block text-[11.5px] leading-[1.35] ${danger ? "text-[#e8743b]/80" : "text-[#8c8b83]"}`}>
                    {item.description}
                  </span>
                </span>
                {item.id === mode && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
