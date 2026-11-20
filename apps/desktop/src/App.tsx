import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { AGENTS, type View } from "./data";
import { useBrowserAgent } from "./hooks/useBrowserAgent";
import type { Startup } from "./lib/startup";
import { useProjects } from "./hooks/useProjects";
import { setThreadModel } from "./lib/models";
import ModelPicker from "./components/ModelPicker";
import { pickFiles } from "./lib/attachments";
import { NO_PROJECT, NO_PROJECT_NAME, createProject, describeFolder, scratchDir, type Project } from "./lib/projects";
import { useChat, type PreparedThread } from "./hooks/useChat";
import { buildForkContext } from "./lib/fork";
import { createWorktree, removeWorktree } from "./lib/worktree";
import { loadMode, saveMode, type PermissionMode } from "./lib/permissionMode";
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
import SessionPanel from "./components/SessionPanel";
import { useSessionSummary } from "./hooks/useSessionSummary";
import ScheduledView from "./components/ScheduledView";
import SearchPalette from "./components/SearchPalette";
import TerminalDock from "./components/TerminalDock";
import SettingsView from "./components/SettingsView";
import Sidebar from "./components/Sidebar";

const toggle = (set: (fn: (v: boolean) => boolean) => void) => () => set((v) => !v);

export default function App({ startup }: { startup: Startup }) {
  useNativeContextMenu();
  const [view, setView] = useState<View>("workspace");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Conversation dont le dossier de travail est gardé car il contient du travail non enregistré. */
  const [keptWorktree, setKeptWorktree] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const conversations = useConversations(startup.conversations, startup.selectedId);
  const projectList = useProjects(startup.projects);
  const { selected } = conversations;
  const sidebar = useSidebarWidth();

  const openConversation = (id: string) => {
    conversations.select(id);
    setView("workspace");
  };
  const history = useNavHistory(selected.id, openConversation);
  const [permissionMode, setPermissionMode] = useState(loadMode);
  const changeMode = (mode: PermissionMode) => {
    setPermissionMode(mode);
    saveMode(mode);
  };
  // Avant le premier message d'une conversation : son dossier de travail (worktree) et, pour une
  // bifurcation, le résumé de la conversation d'origine.
  const itemsRef = useRef(conversations.items);
  useEffect(() => {
    itemsRef.current = conversations.items;
  });
  const { attachWorktree, clearForkContext } = conversations;
  const prepareThread = useCallback(
    async (threadId: string): Promise<PreparedThread> => {
      const conversation = itemsRef.current.find((c) => c.id === threadId);
      if (!conversation) return {};
      let cwd = conversation.worktree;
      const projectPath = conversation.projectPath;
      if (projectPath === NO_PROJECT) {
        // Sans projet : un dossier neutre, jamais le dossier personnel.
        cwd = await scratchDir();
      } else if (!cwd) {
        if (conversation.useWorktree !== false) {
          const base = conversation.forkedFrom
            ? itemsRef.current.find((c) => c.id === conversation.forkedFrom)?.branch
            : undefined;
          const info = await createWorktree(threadId, base, projectPath).catch(() => null);
          if (info) {
            cwd = info.path;
            attachWorktree(threadId, info.path, info.branch);
          }
        }
        // Sans dossier de travail à part, l'agent travaille directement dans le dossier du projet.
        if (!cwd) cwd = projectPath;
      }
      const preface = conversation.forkContext;
      if (preface) clearForkContext(threadId);
      return { cwd, preface, model: conversation.modelId };
    },
    [attachWorktree, clearForkContext],
  );
  const { chat, send, stop, answer, seed } = useChat(selected.id, selected.agentId, permissionMode, prepareThread);

  // Projet et dossier de travail de la session ouverte (écran de nouvelle session).
  const { setProject, setUseWorktree, setAgent } = conversations;
  const selectProject = (project: Project | null) => {
    if (project) {
      projectList.use(project);
      setProject(selected.id, project.name, project.path);
    } else {
      setProject(selected.id, NO_PROJECT_NAME, NO_PROJECT);
    }
  };
  const openFolder = async () => {
    const [path] = await pickFiles(true).catch(() => [] as string[]);
    if (path) selectProject(await describeFolder(path));
  };
  const createNewProject = async (name: string): Promise<string | null> => {
    try {
      selectProject(await createProject(name));
      return null;
    } catch (error) {
      return String(error);
    }
  };
  // Fournisseur et modèle : le fournisseur ne change que tant que la conversation est vide.
  const chooseModel = (agentId: string, modelId: string | undefined) => {
    setAgent(selected.id, agentId, modelId);
    // Un agent déjà lancé change de modèle sans redémarrer.
    if (modelId && agentId === selected.agentId && chat.messages.length > 0) {
      setThreadModel(selected.id, modelId).catch(() => {});
    }
  };
  const newSession = {
    projectName: selected.project,
    projectPath: selected.projectPath,
    projects: projectList.projects,
    useWorktree: selected.useWorktree !== false,
    onSelectProject: selectProject,
    onOpenFolder: () => void openFolder(),
    onCreateProject: createNewProject,
    onRemoveProject: (project: Project) => projectList.remove(project.path),
    onToggleWorktree: (value: boolean) => setUseWorktree(selected.id, value),
  };

  // Le premier message donne son titre à la conversation et remet son projet en tête des récents.
  const sendMessage = (text: string) => {
    if (selected.title === "Nouvelle conversation") {
      conversations.rename(selected.id, text.split("\n")[0].slice(0, 48));
    }
    const project = projectList.projects.find((p) => p.path === selected.projectPath);
    if (project) projectList.use(project);
    return send(text);
  };

  /** Bifurque : une nouvelle conversation qui reprend l'échange jusqu'à ce message. */
  const forkFrom = (messageId: string) => {
    const index = chat.messages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    const kept = chat.messages.slice(0, index + 1);
    const newId = conversations.fork(selected.id, buildForkContext(kept));
    if (newId) seed(newId, kept);
  };
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
  // Le dossier où se trouve le travail de la conversation : son worktree, sinon son projet.
  const workPath = selected.worktree ?? (selected.projectPath !== NO_PROJECT ? selected.projectPath : undefined);
  // Le résumé se relit quand l'agent finit un tour (`chat.busy` repasse à faux).
  const sessionSummary = useSessionSummary(showRightPanel, workPath, chat.busy);

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
              onSend={sendMessage}
              onStop={stop}
              onAnswer={answer}
              onOpenLink={openInGlobe}
              onFork={forkFrom}
              mode={permissionMode}
              onModeChange={changeMode}
              newSession={newSession}
              modelPicker={
                <ModelPicker
                  agents={AGENTS}
                  agentId={selected.agentId}
                  modelId={selected.modelId}
                  canSwitchProvider={chat.messages.length === 0 && !chat.busy}
                  onSelect={chooseModel}
                />
              }
            />
            {showRightPanel && (
              <SessionPanel
                conversation={selected}
                messages={chat.messages}
                plan={chat.plan}
                summary={sessionSummary.summary}
                pulls={sessionSummary.pulls}
                workPath={workPath}
                onOpenDiff={() => setShowDiff(true)}
                onOpenLink={openInGlobe}
                onRefresh={() => void sessionSummary.refresh()}
              />
            )}
          </div>
        ) : (
          <RelayView />
        )}

      </div>

        <FilesDock
          // Un autre dossier de travail repart d'un volet neuf : ses fichiers ouverts ne sont pas les mêmes.
          key={workPath ?? "depot"}
          root={workPath}
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
          path={workPath}
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
          onCancel={() => {
            setDeletingId(null);
            setKeptWorktree(null);
          }}
          onConfirm={async () => {
            // Le dossier de travail part avec la conversation, sauf s'il contient du travail non enregistré.
            if (deleting.worktree && keptWorktree !== deleting.id) {
              try {
                await removeWorktree(deleting.worktree, deleting.projectPath);
              } catch {
                setKeptWorktree(deleting.id);
                return;
              }
            }
            conversations.remove(deleting.id);
            setDeletingId(null);
            setKeptWorktree(null);
          }}
        >
          La conversation « {deleting.title} » sera supprimée de cet environnement. Cette action
          est définitive.
          {keptWorktree === deleting.id && (
            <span className="mt-2 block text-[#e69b80]">
              Son dossier de travail contient du travail non enregistré (
              <code>{deleting.worktree}</code>) : il ne sera pas supprimé. Clique encore sur
              Supprimer pour retirer seulement la conversation.
            </span>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
