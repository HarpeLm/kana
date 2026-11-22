import { useRef, useState, type PointerEvent } from "react";
import { loadView } from "../lib/sidebarView";
import type { View } from "../data";
import {
  ARCHIVED_GROUP,
  PINNED_GROUP,
  sectionsOf,
  type Conversation,
} from "../lib/conversations";
import type { ConversationActions } from "./conversationActions";
import AccountMenu from "./AccountMenu";
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
  settingsOpen: boolean;
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
  onOpenSignIn: () => void;
}

export default function Sidebar({
  conversations,
  actions,
  selectedId,
  editingId,
  view,
  settingsOpen,
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
  onOpenSignIn,
}: SidebarProps) {
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
      className={`relative shrink-0 overflow-hidden motion-reduce:transition-none ${
        dragging ? "" : "transition-[width] duration-200 ease-out"
      }`}
    >
      <div style={{ width }} className="relative h-full p-2 pr-1">
        <aside
          className={`flex h-full w-full flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-[#1e1f22]/75 backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.42)] transition-opacity duration-200 ease-out motion-reduce:transition-none ${
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

        <AccountMenu
          settingsOpen={settingsOpen || view === "settings"}
          onOpenSettings={onOpenSettings}
          onOpenSignIn={onOpenSignIn}
        />
        </aside>

        <SidebarResizer dragging={dragging} onPointerDown={onResizeStart} />
      </div>
    </div>
  );
}
