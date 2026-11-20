import { useState } from "react";
import "./App.css";
import { AGENTS, type View } from "./data";
import { useBrowserAgent } from "./hooks/useBrowserAgent";
import { useChat } from "./hooks/useChat";
import { useConversations } from "./hooks/useConversations";
import { useNativeContextMenu } from "./hooks/useNativeContextMenu";
import { useResizableWidth } from "./hooks/useResizableWidth";
import { useNavHistory } from "./hooks/useNavHistory";
import { useSidebarWidth } from "./hooks/useSidebarWidth";
import { sectionsOf } from "./lib/conversations";
import type { ConversationActions } from "./components/conversationActions";
import ChatView from "./components/ChatView";
import BrowserApprovalDialog from "./components/BrowserApprovalDialog";
import BrowserDock from "./components/BrowserDock";
import ConfirmDialog from "./components/ConfirmDialog";
import DiffDock from "./components/DiffDock";
import FilesDock from "./components/FilesDock";
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
  const [browserOpened, setBrowserOpened] = useState(false);
  const [terminalMaximized, setTerminalMaximized] = useState(false);
  const [filesMaximized, setFilesMaximized] = useState(false);
  const terminalPanel = useResizableWidth({
    storageKey: "kana-terminal-width",
    min: 320,
    max: 900,
    fallback: 500,
    from: "right",
  });
  const terminalFills = showTerminal && terminalMaximized;
  const filesFill = showFiles && filesMaximized && !terminalFills;
  const terminalIsSide = showTerminal && !terminalMaximized;
  // Largeur des volets placés à droite de chacun, pour que la poignée suive bien la souris.
  const terminalWidth = terminalIsSide ? terminalPanel.width : 0;
  const browserVisible = showBrowser && !terminalFills && !filesFill;
  const browserPanel = useResizableWidth({
    storageKey: "kana-browser-width",
    min: 360,
    max: 1100,
    fallback: 640,
    from: "right",
    offsetRight: terminalWidth,
  });
  const browserWidth = browserVisible ? browserPanel.width : 0;
  const diffVisible = showDiff && !terminalFills && !filesFill;
  const diffPanel = useResizableWidth({
    storageKey: "kana-diff-width",
    min: 360,
    max: 1000,
    fallback: 560,
    from: "right",
    offsetRight: terminalWidth + browserWidth,
  });
  const filesPanel = useResizableWidth({
    storageKey: "kana-files-width",
    min: 420,
    max: 1100,
    fallback: 700,
    from: "right",
    offsetRight: terminalWidth + browserWidth + (diffVisible ? diffPanel.width : 0),
  });
  const toggleBrowser = () => {
    setShowBrowser((v) => !v);
    setBrowserOpened(true);
  };
  // Un agent qui veut naviguer ouvre le Globe, puis attend l'accord de l'utilisateur.
  const browserAgent = useBrowserAgent(() => {
    setShowBrowser(true);
    setBrowserOpened(true);
  });
  // Un lien de la conversation s'ouvre dans le Globe, jamais dans le navigateur du système.
  const [openRequest, setOpenRequest] = useState<{ id: number; url: string } | null>(null);
  const openInGlobe = (url: string) => {
    setOpenRequest((r) => ({ id: (r?.id ?? 0) + 1, url }));
    setShowBrowser(true);
    setBrowserOpened(true);
  };
  const toggleTerminal = () => {
    setShowTerminal((v) => !v);
    setTerminalOpened(true);
  };

  const showRightPanel = showPlan || showArtifacts || showBackgroundTasks;

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
          terminalFills || filesFill ? "hidden" : ""
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
            onBrowser: toggleBrowser,
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
              onOpenLink={openInGlobe}
            />
            {showRightPanel && (
              <RightPanel
                showPlan={showPlan}
                showArtifacts={showArtifacts}
                showBackgroundTasks={showBackgroundTasks}
              />
            )}
          </div>
        ) : (
          <RelayView />
        )}

      </div>

        <FilesDock
          visible={showFiles && !terminalFills}
          maximized={filesMaximized}
          width={filesPanel.width}
          dragging={filesPanel.dragging}
          onResizeStart={filesPanel.startDrag}
          onToggleMaximize={() => setFilesMaximized((v) => !v)}
          onClose={() => {
            setShowFiles(false);
            setFilesMaximized(false);
          }}
        />

        <DiffDock
          visible={diffVisible}
          width={diffPanel.width}
          dragging={diffPanel.dragging}
          onResizeStart={diffPanel.startDrag}
          onClose={() => setShowDiff(false)}
        />

        {browserOpened && (
          <BrowserDock
            visible={browserVisible}
            suspended={searchOpen || deletingId !== null || browserAgent.approval !== null}
            width={browserPanel.width}
            dragging={browserPanel.dragging}
            onResizeStart={browserPanel.startDrag}
            onClose={() => setShowBrowser(false)}
            driving={browserAgent.driving}
            openRequest={openRequest}
          />
        )}

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

      {browserAgent.approval && (
        <BrowserApprovalDialog
          approval={browserAgent.approval}
          onAnswer={(allow) => browserAgent.answer(browserAgent.approval!.requestId, allow)}
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
