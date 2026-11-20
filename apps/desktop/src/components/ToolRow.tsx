import { useState } from "react";
import { ChevronRight, SquareTerminal } from "lucide-react";
import type { ToolCall } from "../lib/chatState";
import { toolCommand, toolLabel } from "../lib/toolLabel";

const firstLine = (text: string) => text.split("\n")[0].slice(0, 80);

/** Une commande lancée par l'agent : une ligne qui se déplie sur la commande et son résultat. */
export default function ToolRow({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const label = toolLabel(tool);
  const command = toolCommand(tool);
  const named = label !== tool.title;
  const running = tool.status === "pending" || tool.status === "in_progress";
  const expandable = Boolean(command || tool.output);
  const prefix = running ? "Exécution" : tool.status === "failed" ? "Commande échouée" : "Commande exécutée";

  return (
    <li>
      <button
        onClick={() => expandable && setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] text-[#8c8b83] transition hover:bg-[#222220] hover:text-[#c4c3bc]"
      >
        <SquareTerminal className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
        <span className="shrink-0">{prefix} :</span>
        {named ? (
          <span className="truncate">{label}</span>
        ) : command ? (
          <span className="truncate font-mono text-[12px] text-[#c4c3bc]">{firstLine(command)}</span>
        ) : (
          <span className="truncate">{tool.title === "Outil" ? "commande" : tool.title}</span>
        )}
        {expandable && (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            strokeWidth={1.8}
          />
        )}
      </button>
      {open && (
        <div className="mb-1 ml-6 mt-1 space-y-2">
          {command && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#202020] p-3.5 font-mono text-[12px] leading-[1.6] text-[#dfded8]">
              <span className="text-[#7e7d76]">$ </span>
              {command}
            </pre>
          )}
          {tool.output && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-[#1c1c1c] p-3.5 font-mono text-[12px] leading-[1.6] text-[#8c8b83]">
              {tool.output}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
