import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { ToolCall } from "../lib/chatState";
import ToolRow from "./ToolRow";

const isRunning = (tools: ToolCall[]) => tools.some((t) => t.status === "pending" || t.status === "in_progress");

/** « 3m 33s », « 12s ». */
function formatDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`;
}

interface ToolGroupProps {
  tools: ToolCall[];
  /** Début et fin du travail de l'agent (ms), pour la durée. */
  startedAt?: number;
  endedAt?: number;
}

/** Les outils d'un message, repliés sous « Exécution durant 3m 33s » ; un clic les déplie. */
export default function ToolGroup({ tools, startedAt, endedAt }: ToolGroupProps) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const running = isRunning(tools) && !endedAt;

  // La durée avance chaque seconde tant que l'agent travaille.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const count = `${tools.length} commande${tools.length > 1 ? "s" : ""}`;
  const elapsed = startedAt ? formatDuration((endedAt ?? now) - startedAt) : null;
  const title = running
    ? elapsed
      ? `Exécution durant ${elapsed}`
      : `Exécution de ${count}…`
    : elapsed
      ? `Exécuté ${count} pendant ${elapsed}`
      : `Exécuté ${count}`;

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg py-0.5 text-[14px] text-[#8c8b83] transition hover:text-[#c4c3bc]"
      >
        {title}
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={1.8} />
      </button>
      {open && (
        <ul className="mt-1.5 space-y-0.5">
          {tools.map((tool) => (
            <ToolRow key={tool.id} tool={tool} />
          ))}
        </ul>
      )}
    </div>
  );
}
