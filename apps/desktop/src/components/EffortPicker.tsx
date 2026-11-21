import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useClickOutside } from "../hooks/useClickOutside";
import { chooseEffort, effortLabel, useChosenEffort } from "../lib/effort";
import { cachedModels, fetchModels, type EffortInfo } from "../lib/models";

interface EffortPickerProps {
  agentId: string;
  /** Un agent déjà lancé change de niveau tout de suite. */
  onChange: (value: string) => void;
}

/** Le niveau d'effort de l'agent, à côté du modèle. N'apparaît que si l'agent en propose. */
export default function EffortPicker({ agentId, onChange }: EffortPickerProps) {
  const [open, setOpen] = useState(false);
  const [effort, setEffort] = useState<EffortInfo | null | undefined>(() => cachedModels(agentId)?.effort);
  const chosen = useChosenEffort(agentId);
  const root = useRef<HTMLDivElement>(null);
  useClickOutside(root, open, () => setOpen(false));

  // Une liste de modèles retenue avant cette fonction ne dit rien de l'effort : on la redemande une fois.
  useEffect(() => {
    const known = cachedModels(agentId);
    setEffort(known?.effort);
    if (known?.effort !== undefined) return;
    let live = true;
    fetchModels(agentId)
      .then((fresh) => live && setEffort(fresh.effort ?? null))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [agentId]);

  if (!effort) return null;
  const value = chosen && effort.options.some((o) => o.id === chosen) ? chosen : (effort.current ?? effort.options[0]?.id);
  const name = (id: string) => effortLabel(id, effort.options.find((o) => o.id === id)?.name);

  return (
    <div ref={root} className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Niveau d'effort de l'agent"
        className="flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-1 text-[12px] text-[#9a9992] transition hover:bg-[#262624] hover:text-[#ecebe4]"
      >
        {value ? name(value) : "Effort"}
        <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.8} />
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-30 mb-2 w-[180px] rounded-2xl border border-[#343432] bg-[#2a2a28] p-1 shadow-2xl">
          <p className="px-3 pb-1 pt-2 text-[11.5px] text-[#8c8b83]">Effort</p>
          {effort.options.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                chooseEffort(agentId, o.id);
                onChange(o.id);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[13px] text-[#ecebe4] hover:bg-[#333331]"
            >
              <span className="flex-1">{name(o.id)}</span>
              {o.id === value && <Check className="h-3.5 w-3.5 text-[#4a9bff]" strokeWidth={1.8} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
