import { Bot } from "lucide-react";

/** Bandeau au-dessus de la page : un agent est en train de la piloter. */
export default function AgentBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2 border-b border-[#d97757]/30 bg-[#d97757]/10 px-3 py-1.5 text-[12px] text-[#e69b80]"
    >
      <Bot className="h-[14px] w-[14px] shrink-0" strokeWidth={1.8} />
      Un agent pilote cette page
    </div>
  );
}
