import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

interface ConversationGroupProps {
  name: string;
  /** Replié à l'affichage (utilisé pour les conversations archivées). */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/** Groupe repliable de conversations (un projet, les épinglées ou les archivées). */
export default function ConversationGroup({
  name,
  defaultCollapsed = false,
  children,
}: ConversationGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <section className="mt-5 first:mt-2">
      <button
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex h-6 w-full items-center gap-1 px-[10px] text-left text-[13px] text-[#8a8982] transition hover:text-[#c4c3bc]"
      >
        {name}
        <ChevronDown
          className={`h-[13px] w-[13px] transition-transform ${collapsed ? "-rotate-90" : ""}`}
          strokeWidth={1.8}
        />
      </button>
      {!collapsed && <div className="mt-1 space-y-0.5">{children}</div>}
    </section>
  );
}
