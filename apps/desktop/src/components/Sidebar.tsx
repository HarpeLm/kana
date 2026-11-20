import { THREADS, type View } from "../data";
import QuotaWidget from "./QuotaWidget";

interface SidebarProps {
  view: View;
  selectedThread: string;
  onSelectThread: (id: string) => void;
  onOpenRelay: () => void;
}

export default function Sidebar({
  view,
  selectedThread,
  onSelectThread,
  onOpenRelay,
}: SidebarProps) {
  return (
    <aside className="flex w-[256px] shrink-0 flex-col border-r border-[#2b2b28] bg-[#21211f]">
      <div className="flex h-[44px] shrink-0 items-center px-4 text-[13px] font-medium text-[#e6e5df]">
        Kana
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        <div className="px-2 py-1.5 text-[11px] font-medium text-[#7e7d76]">Worktrees</div>
        <div className="space-y-0.5">
          {THREADS.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectThread(t.id)}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[13px] transition ${
                view === "workspace" && selectedThread === t.id
                  ? "bg-[#2f2f2c] text-[#f0efe9]"
                  : "text-[#b3b2aa] hover:bg-[#292926] hover:text-[#e6e5df]"
              }`}
            >
              <span className="truncate">{t.branch}</span>
              <span className="ml-2 text-[11px] text-[#7e7d76]">{t.agent}</span>
            </button>
          ))}
        </div>
      </div>

      <QuotaWidget onOpen={onOpenRelay} />
    </aside>
  );
}
