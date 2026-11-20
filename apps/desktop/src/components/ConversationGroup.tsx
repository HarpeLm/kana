import { useEffect, useState, type DragEvent, type ReactNode } from "react";
import { ChevronDown, Plus, SlidersHorizontal } from "lucide-react";

interface ConversationGroupProps {
  name: string;
  /** Replié à l'affichage (utilisé pour les conversations archivées). */
  defaultCollapsed?: boolean;
  /** Change à chaque « Tout afficher » : le groupe se déplie. */
  expandSignal?: number;
  /** Nouvelle conversation directement dans ce dossier (bouton « + » au survol). */
  onCreate?: () => void;
  /** Ouvre le menu d'affichage de la liste (bouton au survol). */
  onOpenViewMenu?: (anchor: DOMRect) => void;
  /** Le menu d'affichage, posé sous l'en-tête quand il est ouvert. */
  menu?: ReactNode;
  /** Le dossier peut être glissé pour changer de place, et reçoit des conversations. */
  reorderable?: boolean;
  onMoveSection?: (from: string, to: string) => void;
  onDropConversation?: (id: string) => void;
  children: ReactNode;
}

const SECTION_TYPE = "application/x-kana-section";
const CONVERSATION_TYPE = "application/x-kana-conversation";

/** Groupe repliable de conversations (un dossier, les épinglées ou les archivées). */
export default function ConversationGroup({
  name,
  defaultCollapsed = false,
  expandSignal = 0,
  onCreate,
  onOpenViewMenu,
  menu,
  reorderable = false,
  onMoveSection,
  onDropConversation,
  children,
}: ConversationGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (expandSignal > 0) setCollapsed(false);
  }, [expandSignal]);

  const accepts = (event: DragEvent) =>
    (reorderable && event.dataTransfer.types.includes(SECTION_TYPE)) ||
    (!!onDropConversation && event.dataTransfer.types.includes(CONVERSATION_TYPE));

  return (
    <section
      className="relative mt-6"
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const section = e.dataTransfer.getData(SECTION_TYPE);
        const conversation = e.dataTransfer.getData(CONVERSATION_TYPE);
        if (section && reorderable) {
          e.preventDefault();
          onMoveSection?.(section, name);
        } else if (conversation && onDropConversation) {
          e.preventDefault();
          onDropConversation(conversation);
        }
      }}
    >
      <div
        draggable={reorderable}
        onDragStart={(e) => {
          e.dataTransfer.setData(SECTION_TYPE, name);
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`group/header flex h-6 items-center rounded-md ${over ? "bg-[#2b3a55]/60" : ""}`}
      >
        <button
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex h-6 min-w-0 flex-1 items-center gap-1 px-[10px] text-left text-[13px] text-[#8a8982] transition hover:text-[#c4c3bc]"
        >
          <span className="truncate">{name}</span>
          <ChevronDown
            className={`h-[13px] w-[13px] shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
            strokeWidth={1.8}
          />
        </button>
        {onOpenViewMenu && (
          <button
            title="Affichage"
            aria-label="Affichage de la liste"
            onClick={(e) => onOpenViewMenu(e.currentTarget.getBoundingClientRect())}
            className="flex h-6 w-6 items-center justify-center rounded-md text-[#8a8982] opacity-0 transition hover:bg-[#2b2b29] hover:text-[#ecebe4] group-hover/header:opacity-100 focus:opacity-100"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.7} />
          </button>
        )}
        {onCreate && (
          <button
            title={`Nouvelle conversation dans ${name}`}
            aria-label={`Nouvelle conversation dans ${name}`}
            onClick={onCreate}
            className="mr-0.5 flex h-6 w-6 items-center justify-center rounded-md text-[#8a8982] opacity-0 transition hover:bg-[#2b2b29] hover:text-[#ecebe4] group-hover/header:opacity-100 focus:opacity-100"
          >
            <Plus className="h-4 w-4" strokeWidth={1.7} />
          </button>
        )}
      </div>
      {menu}
      {!collapsed && <div className="mt-1 space-y-0.5">{children}</div>}
    </section>
  );
}
