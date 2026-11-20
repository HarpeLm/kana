import { useEffect, useState, type CSSProperties, type DragEvent, type HTMLAttributes, type ReactNode, type Ref } from "react";
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
  /** Reçoit des conversations glissées dessus. */
  onDropConversation?: (id: string) => void;
  /** Glisser-déposer du dossier à la souris (voir `useSectionDrag`). */
  sectionRef?: Ref<HTMLElement>;
  dragStyle?: CSSProperties;
  /** Le dossier est soulevé : il suit le curseur, en carte flottante. */
  lifted?: boolean;
  headerProps?: HTMLAttributes<HTMLElement>;
  children: ReactNode;
}

const CONVERSATION_TYPE = "application/x-kana-conversation";

/** Groupe repliable de conversations (un dossier, les épinglées ou les archivées). */
export default function ConversationGroup({
  name,
  defaultCollapsed = false,
  expandSignal = 0,
  onCreate,
  onOpenViewMenu,
  menu,
  onDropConversation,
  sectionRef,
  dragStyle,
  lifted = false,
  headerProps,
  children,
}: ConversationGroupProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [over, setOver] = useState(false);

  useEffect(() => {
    if (expandSignal > 0) setCollapsed(false);
  }, [expandSignal]);

  const accepts = (event: DragEvent) => !!onDropConversation && event.dataTransfer.types.includes(CONVERSATION_TYPE);

  return (
    <section
      ref={sectionRef}
      style={dragStyle}
      className={`relative mt-6 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        lifted ? "z-30 -mx-1 rounded-xl bg-[#262624] px-1 pb-1 shadow-[0_10px_30px_rgba(0,0,0,0.5)] ring-1 ring-[#3a3a37]" : ""
      }`}
      onDragOver={(e) => {
        if (!accepts(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const conversation = e.dataTransfer.getData(CONVERSATION_TYPE);
        if (conversation && onDropConversation) {
          e.preventDefault();
          onDropConversation(conversation);
        }
      }}
    >
      <div
        {...headerProps}
        className={`group/header flex h-6 items-center rounded-md ${headerProps ? "cursor-grab active:cursor-grabbing" : ""} ${
          over ? "bg-[#2b3a55]/60" : ""
        }`}
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
            data-nodrag
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
            data-nodrag
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
