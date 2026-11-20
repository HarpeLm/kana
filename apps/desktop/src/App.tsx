import { useState } from "react";
import "./App.css";
import { AGENTS, type View } from "./data";
import { useChat } from "./hooks/useChat";
import { useConversations } from "./hooks/useConversations";
import { useNativeContextMenu } from "./hooks/useNativeContextMenu";
import { useResizableWidth } from "./hooks/useResizableWidth";
import { useNavHistory } from "./hooks/useNavHistory";
import { useSidebarWidth } from "./hooks/useSidebarWidth";
import { sectionsOf } from "./lib/conversations";
import type { ConversationActions } from "./components/conversationActions";
import ChatView from "./components/ChatView";
import ConfirmDialog from "./components/ConfirmDialog";
import ConversationTitle from "./components/ConversationTitle";
import Header from "./components/Header";
import NavButtons from "./components/NavButtons";
import RelayView from "./components/RelayView";
import RightPanel from "./components/RightPanel";
import ScheduledView from "./components/ScheduledView";
import SearchPalette from "./components/SearchPalette";
import TerminalDock from "./components/TerminalDock";
import SettingsView from "./components/SettingsView";
import Sidebar from "./components/Sidebar";

const toggle = (set: (fn: (v: boolean) => boolean) => void) => () => set((v) => !v);

export default function App() {
  useNativeContextMenu();
  const [view, setView] = useState<View>("workspace");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const conversations = useConversations();
  const { selected } = conversations;
  const sidebar = useSidebarWidth();

  const openConversation = (id: string) => {
    conversations.select(id);
    setView("workspace");
  };
  const history = useNavHistory(selected.id, openConversation);
  const { chat, send, stop, answer } = useChat(selected.id, selected.agentId);
  const agentLabel = AGENTS.find((a) => a.id === selected.agentId)?.name ?? selected.agentId;

  // Barre latérale et boutons du haut
  const [showSidebar, setShowSidebar] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showFiles, setShowFiles] = useState(false);

  // Entrées du menu "..."
  const [showArtifacts, setShowArtifacts] = useState(false);
  const [showSideChat, setShowSideChat] = useState(false);
  const [showBackgroundTasks, setShowBackgroundTasks] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [keepAwake, setKeepAwake] = useState(false);

  // Le terminal est monté à la première ouverture puis gardé : son shell survit quand on le masque.
  const [terminalOpened, setTerminalOpened] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const terminalPanel = useResizableWidth({
    storageKey: "kana-terminal-width",
    min: 320,
    max: 900,
    fallback: 500,
    from: "right",
  });
  const toggleTerminal = () => {
    setShowTerminal((v) => !v);
    setTerminalOpened(true);
  };

  const showRightPanel = showPlan || showDiff || showArtifacts || showBackgroundTasks;

  const nav = {
    onToggleSidebar: toggle(setShowSidebar),
    canBack: history.canBack,
    canForward: history.canForward,
    onBack: history.back,
    onForward: history.forward,
  };

  const createConversation = () => {
    conversations.create();
    setView("workspace");
  };
  const rename = (id: string, title: string) => {
    conversations.rename(id, title);
    setEditingId(null);
  };
  const actions: ConversationActions = {
    onSelect: openConversation,
    onPin: conversations.togglePin,
    onToggleUnread: conversations.toggleUnread,
    onStartRename: setEditingId,
    onRename: rename,
    onCancelRename: () => setEditingId(null),
    onDuplicate: conversations.duplicate,
    onMoveDown: conversations.moveDown,
    onMoveToSection: conversations.moveToSection,
    onArchive: conversations.toggleArchive,
    onDelete: setDeletingId,
  };
  const deleting = conversations.items.find((c) => c.id === deletingId);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#181817] text-[#e6e5df] select-none">
      <Sidebar
        open={showSidebar}
        conversations={conversations.items}
        actions={actions}
        selectedId={selected.id}
        editingId={editingId}
        view={view}
        width={sidebar.width}
        dragging={sidebar.dragging}
        onResizeStart={sidebar.startDrag}
        nav={nav}
        searchOpen={searchOpen}
        onCreate={createConversation}
        onOpenSearch={() => setSearchOpen(true)}
        onArtifacts={() => {
          setShowArtifacts((v) => !v);
          setView("workspace");
        }}
        onOpenScheduled={() => setView("scheduled")}
        onOpenSettings={() => setView("settings")}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden bg-[#181817]">
      <div
        className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
          showTerminal && terminalMaximized ? "hidden" : ""
        }`}
      >
        <Header
          leading={showSidebar ? undefined : <NavButtons {...nav} />}
          toolbar={{
            showPlan,
            onPlan: toggle(setShowPlan),
            showTerminal,
            onTerminal: toggleTerminal,
            showDiff,
            onDiff: toggle(setShowDiff),
            showBrowser,
            onBrowser: toggle(setShowBrowser),
            showFiles,
            onFiles: toggle(setShowFiles),
            more: {
              showArtifacts,
              onArtifacts: toggle(setShowArtifacts),
              showSideChat,
              onSideChat: toggle(setShowSideChat),
              showBackgroundTasks,
              onBackgroundTasks: toggle(setShowBackgroundTasks),
              showSimulator,
              onSimulator: toggle(setShowSimulator),
              keepAwake,
              onKeepAwake: toggle(setKeepAwake),
            },
          }}
        >
          {view === "settings" || view === "scheduled" ? (
            <span className="px-2 text-[14px] text-[#e6e5df]">
              {view === "settings" ? "Réglages" : "Tâches planifiées"}
            </span>
          ) : (
            <ConversationTitle
              conversation={selected}
              editing={editingId === selected.id && !showSidebar}
              sections={sectionsOf(conversations.items)}
              actions={actions}
            />
          )}
        </Header>

        {view === "settings" ? (
          <SettingsView />
        ) : view === "scheduled" ? (
          <ScheduledView />
        ) : view === "workspace" ? (
          <div className="flex flex-1 overflow-hidden">
            <ChatView
              agentLabel={agentLabel}
              chat={chat}
              onSend={send}
              onStop={stop}
              onAnswer={answer}
            />
            {showRightPanel && (
              <RightPanel
                showPlan={showPlan}
                showArtifacts={showArtifacts}
                showBackgroundTasks={showBackgroundTasks}
                showDiff={showDiff}
              />
            )}
          </div>
        ) : (
          <RelayView />
        )}

      </div>

        {terminalOpened && (
          <TerminalDock
            visible={showTerminal}
            maximized={terminalMaximized}
            width={terminalPanel.width}
            dragging={terminalPanel.dragging}
            onResizeStart={terminalPanel.startDrag}
            onToggleMaximize={() => setTerminalMaximized((v) => !v)}
            onClose={() => {
              setShowTerminal(false);
              setTerminalMaximized(false);
            }}
          />
        )}
      </div>

      {searchOpen && (
        <SearchPalette
          conversations={conversations.items}
          onOpenConversation={openConversation}
          onCreate={createConversation}
          onOpenSettings={() => setView("settings")}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Supprimer cette conversation ?"
          confirmLabel="Supprimer"
          onCancel={() => setDeletingId(null)}
          onConfirm={() => {
            conversations.remove(deleting.id);
            setDeletingId(null);
          }}
        >
          La conversation « {deleting.title} » sera supprimée de cet environnement. Cette action
          est définitive.
        </ConfirmDialog>
      )}
    </div>
  );
}
