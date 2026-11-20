import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCall } from "../lib/chatState";
import ToolRow from "./ToolRow";

/** « Exécuté N commandes » : les outils d'un message, repliés, qui se déplient d'un clic. */
export default function ToolGroup({ tools }: { tools: ToolCall[] }) {
  const [open, setOpen] = useState(false);
  const running = tools.some((t) => t.status === "pending" || t.status === "in_progress");
  const count = `${tools.length} commande${tools.length > 1 ? "s" : ""}`;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[14px] text-[#8c8b83] transition hover:text-[#c4c3bc]"
      >
        {running ? `Exécution de ${count}…` : `Exécuté ${count}`}
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={1.8} />
      </button>
      {open && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-[#2a2a27] bg-[#1e1e1c]">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </ul>
      )}
    </div>
  );
}
