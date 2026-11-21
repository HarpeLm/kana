import { Bot } from "lucide-react";

/** Bandeau au-dessus de la page : un agent est en train de la piloter. */
export default function AgentBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-[#3b82f6]/40 bg-[#1e3a8a]/25 px-3 py-1.5 text-[12px] text-[#93c5fd]"
    >
      <Bot className="h-[14px] w-[14px] shrink-0" strokeWidth={1.8} />
      Un agent pilote cette page
    </div>
  );
}
