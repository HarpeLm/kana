import { useState, type PointerEvent } from "react";
import { Settings } from "lucide-react";
import type { View } from "../data";
import {
  ARCHIVED_GROUP,
  groupConversations,
  sectionsOf,
  type Conversation,
} from "../lib/conversations";
import type { ConversationActions } from "./conversationActions";
import ConversationGroup from "./ConversationGroup";
import ConversationRow from "./ConversationRow";
import NavButtons, { type NavButtonsProps } from "./NavButtons";
import SidebarNav from "./SidebarNav";
import SidebarResizer from "./SidebarResizer";

interface SidebarProps {
  conversations: Conversation[];
  actions: ConversationActions;
  selectedId: string;
  editingId: string | null;
  view: View;
  /** Visible ou masquée : le passage de l'un à l'autre est animé. */
  open: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  nav: NavButtonsProps;
  onCreate: () => void;
  onArtifacts: () => void;
  onOpenScheduled: () => void;
  onOpenSettings: () => void;
}

export default function Sidebar({
  conversations,
  actions,
  selectedId,
  editingId,
  view,
  open,
  width,
  dragging,
  onResizeStart,
  nav,
  onCreate,
  onArtifacts,
  onOpenScheduled,
  onOpenSettings,
}: SidebarProps) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const groups = groupConversations(conversations, query);
  const sections = sectionsOf(conversations);

  const toggleSearch = () => {
    setSearching((v) => !v);
    setQuery("");
  };

  // Le conteneur change de largeur et le panneau garde la sienne en s'estompant :
  // le texte ne se réorganise pas pendant l'animation. Pas d'animation pendant le glissement.
  return (
    <div
      style={{ width: open ? width : 0 }}
      inert={!open}
      className={`shrink-0 overflow-hidden motion-reduce:transition-none ${
        dragging ? "" : "transition-[width] duration-200 ease-out"
      }`}
    >
      <aside
        style={{ width }}
        className={`relative flex h-full flex-col border-r border-[#2b2b28] bg-[#21211f] transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          open ? "opacity-100" : "opacity-0"
        }`}
      >
      <div className="flex h-[44px] shrink-0 items-center px-3">
        <NavButtons {...nav} />
      </div>

      <SidebarNav
        view={view}
        searching={searching}
        onCreate={onCreate}
        onToggleSearch={toggleSearch}
        onArtifacts={onArtifacts}
        onScheduled={onOpenScheduled}
        onCustomize={onOpenSettings}
      />

      {searching && (
        <div className="px-2 pt-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && toggleSearch()}
            placeholder="Rechercher une conversation"
            aria-label="Rechercher une conversation"
            className="h-8 w-full rounded-lg border border-[#343430] bg-[#1d1d1b] px-3 text-[13px] text-[#ecebe4] placeholder-[#6c6b65] outline-none focus:border-[#4a4a44] select-text"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {groups.length === 0 && (
          <p className="px-[10px] pt-4 text-[13px] text-[#7e7d76]">Aucune conversation trouvée.</p>
        )}
        {groups.map((group) => (
          <ConversationGroup
            key={group.name}
            name={group.name}
            defaultCollapsed={group.name === ARCHIVED_GROUP}
          >
            {group.items.map((conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                selected={view === "workspace" && conversation.id === selectedId}
                editing={conversation.id === editingId}
                sections={sections}
                actions={actions}
              />
            ))}
          </ConversationGroup>
        ))}
      </div>

      <button
        onClick={onOpenSettings}
        className={`flex h-[44px] shrink-0 items-center gap-2 border-t border-[#2b2b28] px-5 text-left text-[14px] transition ${
          view === "settings"
            ? "bg-[#2b2b29] text-[#f0efe9]"
            : "text-[#c4c3bc] hover:bg-[#262624] hover:text-[#f0efe9]"
        }`}
      >
        <Settings className="h-[16px] w-[16px]" strokeWidth={1.6} />
        Réglages
      </button>

      <SidebarResizer dragging={dragging} onPointerDown={onResizeStart} />
      </aside>
    </div>
  );
}
