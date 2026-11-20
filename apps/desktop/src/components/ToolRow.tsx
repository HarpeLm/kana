import { useState } from "react";
import { ChevronRight } from "lucide-react";
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

  return (
    <li className="border-t border-[#2a2a27] first:border-t-0">
      <button
        onClick={() => expandable && setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[13px] text-[#9a9992] hover:text-[#c4c3bc]"
      >
        <span className="shrink-0">{running ? "Exécute" : tool.status === "failed" ? "A échoué" : "A exécuté"}</span>
        {named ? (
          <span className="truncate">{label}</span>
        ) : command ? (
          <span className="truncate font-mono text-[12px] text-[#c4c3bc]">{firstLine(command)}</span>
        ) : (
          <span className="truncate">{tool.title === "Outil" ? "une commande" : tool.title}</span>
        )}
        {expandable && (
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
            strokeWidth={1.8}
          />
        )}
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {command && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-[#2c2c29] bg-[#1b1b19] p-3 font-mono text-[12px] leading-[1.6] text-[#dfded8]">
              <span className="text-[#7e7d76]">$ </span>
              {command}
            </pre>
          )}
          {tool.output && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-1 font-mono text-[12px] leading-[1.6] text-[#8c8b83]">
              {tool.output}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
