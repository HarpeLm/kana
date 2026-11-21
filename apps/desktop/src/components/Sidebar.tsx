import { useRef, useState, type PointerEvent } from "react";
import { Settings } from "lucide-react";
import { tr, useLocale } from "../lib/i18n";
import { loadView } from "../lib/sidebarView";
import type { View } from "../data";
import {
  ARCHIVED_GROUP,
  PINNED_GROUP,
  sectionsOf,
  type Conversation,
} from "../lib/conversations";
import type { ConversationActions } from "./conversationActions";
import ConversationGroup from "./ConversationGroup";
import ConversationRow from "./ConversationRow";
import RenameInput from "./RenameInput";
import { useSectionDrag } from "../hooks/useSectionDrag";
import SidebarViewMenu from "./SidebarViewMenu";
import { DEFAULT_VIEW, saveView, visibleGroups, type SidebarView } from "../lib/sidebarView";
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
  searchOpen: boolean;
  onCreate: () => void;
  onOpenSearch: () => void;
  onArtifacts: () => void;
  onOpenScheduled: () => void;
  onOpenCustomizations: () => void;
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
  searchOpen,
  onCreate,
  onOpenSearch,
  onArtifacts,
  onOpenScheduled,
  onOpenCustomizations,
  onOpenSettings,
}: SidebarProps) {
  const locale = useLocale();
  const [listView, setListView] = useState<SidebarView>(loadView);
  const [menuFor, setMenuFor] = useState<{ name: string; anchor: DOMRect } | null>(null);
  const [expandSignal, setExpandSignal] = useState(0);
  const [newSection, setNewSection] = useState(false);
  const changeView = (next: SidebarView) => {
    setListView(next);
    saveView(next);
  };
  const groups = visibleGroups(conversations, listView);
  const sections = sectionsOf(conversations);
  // Les dossiers qu'on peut déplacer, dans l'ordre affiché (seulement avec « Mon ordre »).
  const movable = listView.groupBy === "folder" && listView.sortBy === "manual" ? groups.map((g) => g.name).filter((n) => n !== PINNED_GROUP && n !== ARCHIVED_GROUP) : [];
  const listArea = useRef<HTMLDivElement>(null);
  const sectionDrag = useSectionDrag(movable, actions.onMoveSection, listArea);
  const isFolder = (name: string) => listView.groupBy === "folder" && name !== PINNED_GROUP && name !== ARCHIVED_GROUP;

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
          searching={searchOpen}
          onCreate={onCreate}
          onToggleSearch={onOpenSearch}
          onArtifacts={onArtifacts}
          onScheduled={onOpenScheduled}
          onCustomize={onOpenCustomizations}
        />

        <div ref={listArea} className="relative flex-1 overflow-y-auto px-2 pb-3">
          {newSection && (
            <div className="mt-2">
              <RenameInput
                initial=""
                onCommit={(name) => {
                  setNewSection(false);
                  if (name.trim()) actions.onCreateIn(name.trim());
                }}
                onCancel={() => setNewSection(false)}
              />
            </div>
          )}
          {groups.map((group) => (
            <ConversationGroup
              key={group.name}
              name={group.name}
              defaultCollapsed={group.name === ARCHIVED_GROUP}
              expandSignal={expandSignal}
              sectionRef={movable.includes(group.name) ? sectionDrag.register(group.name) : undefined}
              headerProps={movable.includes(group.name) ? sectionDrag.headerProps(group.name) : undefined}
              dragStyle={movable.includes(group.name) ? sectionDrag.styleOf(group.name).style : undefined}
              lifted={movable.includes(group.name) && sectionDrag.styleOf(group.name).lifted}
              onDropConversation={isFolder(group.name) ? (id) => actions.onMoveToSection(id, group.name) : undefined}
              onCreate={isFolder(group.name) ? () => actions.onCreateIn(group.name) : undefined}
              onOpenViewMenu={(anchor) => setMenuFor((open) => (open?.name === group.name ? null : { name: group.name, anchor }))}
              menu={
                menuFor?.name === group.name ? (
                  <SidebarViewMenu
                    anchor={menuFor.anchor}
                    view={listView}
                    onChange={changeView}
                    onReset={() => changeView(DEFAULT_VIEW)}
                    onNewSection={() => {
                      setMenuFor(null);
                      setNewSection(true);
                    }}
                    onShowAll={() => {
                      setExpandSignal((n) => n + 1);
                      setMenuFor(null);
                    }}
                    onClose={() => setMenuFor(null)}
                  />
                ) : null
              }
            >
              {(() => {
                const itemIds = new Set(group.items.map((c) => c.id));
                const childrenByParent = new Map<string, Conversation[]>();
                const topLevel: Conversation[] = [];
                for (const conv of group.items) {
                  if (conv.parentId && itemIds.has(conv.parentId)) {
                    const list = childrenByParent.get(conv.parentId) ?? [];
                    list.push(conv);
                    childrenByParent.set(conv.parentId, list);
                  } else {
                    topLevel.push(conv);
                  }
                }
                return topLevel.map((conversation) => {
                  const subThreads = childrenByParent.get(conversation.id) ?? [];
                  return (
                    <div key={conversation.id}>
                      <ConversationRow
                        conversation={conversation}
                        selected={view === "workspace" && conversation.id === selectedId}
                        editing={conversation.id === editingId}
                        sections={sections}
                        actions={actions}
                      />
                      {subThreads.length > 0 && (
                        <div
                          aria-label={`Sous-agents de ${conversation.title}`}
                          className="ml-3.5 mt-0.5 space-y-0.5 border-l border-[#343430] pl-2"
                        >
                          {subThreads.map((sub) => (
                            <ConversationRow
                              key={sub.id}
                              conversation={sub}
                              selected={view === "workspace" && sub.id === selectedId}
                              editing={sub.id === editingId}
                              sections={sections}
                              actions={actions}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
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
          {tr("Réglages", "Settings", locale)}
        </button>

        <SidebarResizer dragging={dragging} onPointerDown={onResizeStart} />
      </aside>
    </div>
  );
}
