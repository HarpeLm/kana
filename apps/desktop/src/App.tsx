import { useRef, useState } from "react";
import "./App.css";
import { AGENTS, type View } from "./data";
import type { Startup } from "./lib/startup";
import { useProjects } from "./hooks/useProjects";
import { setThreadEffort, setThreadModel } from "./lib/models";
import { autoTitle } from "./lib/autoTitle";
import { artifactTitle } from "./lib/artifactRefs";
import ArtifactMenu from "./components/ArtifactMenu";
import { trashFile } from "./lib/files";
import ArtifactsView from "./components/ArtifactsView";
import { useAllArtifacts, type ArtifactEntry } from "./lib/artifactIndex";
import EffortPicker from "./components/EffortPicker";
import ModelPicker from "./components/ModelPicker";
import { pickFiles } from "./lib/attachments";
import { NO_PROJECT, NO_PROJECT_NAME, createProject, describeFolder, type Project } from "./lib/projects";
import { useChat } from "./hooks/useChat";
import { useRelayFlow } from "./hooks/useRelayFlow";
import { isArtifactPath } from "./lib/fileKinds";
import { tr, translateRustError, useLocale } from "./lib/i18n";
import { OpenArtifactContext } from "./lib/artifactRefs";
import { buildForkContext, buildRelayContext } from "./lib/fork";
import { OpenFileContext } from "./lib/fileRefs";
import { setPlanMode, stopAgent } from "./lib/acp";
import { setKeepAwake } from "./lib/settings";
import { removeWorktree } from "./lib/worktree";
import { MODES, loadMode, saveMode, type PermissionMode } from "./lib/permissionMode";
import {
  ACTION_CYCLE_MODE,
  ACTION_NEW,
  ACTION_OPEN_RELAY,
  ACTION_SETTINGS,
  ACTION_TOGGLE_ARTIFACTS,
  ACTION_TOGGLE_BROWSER,
  ACTION_TOGGLE_DIFF,
  ACTION_TOGGLE_FILES,
  ACTION_TOGGLE_SESSION,
  ACTION_TOGGLE_TERMINAL,
} from "./lib/searchItems";
import { useConversations } from "./hooks/useConversations";
import { useCrossReviewPipeline } from "./hooks/useCrossReviewPipeline";
import { useDockPanels } from "./hooks/useDockPanels";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useNativeContextMenu } from "./hooks/useNativeContextMenu";
import { useNavHistory } from "./hooks/useNavHistory";
import { useSidebarWidth } from "./hooks/useSidebarWidth";
import { useThreadOrchestrator } from "./hooks/useThreadOrchestrator";
import { useWorktreeHandoff } from "./hooks/useWorktreeHandoff";
import { sectionsOf } from "./lib/conversations";
import type { ConversationActions } from "./components/conversationActions";
import ChatView from "./components/ChatView";
import AdvisorModal from "./components/AdvisorModal";
import BrowserApprovalDialog from "./components/BrowserApprovalDialog";
import BrowserDock from "./components/BrowserDock";
import ConfirmDialog from "./components/ConfirmDialog";
import DiffDock from "./components/DiffDock";
import ExtensibilityModal, { type ExtensibilityTab } from "./components/ExtensibilityModal";
import InspectorModal from "./components/InspectorModal";
import FilesDock from "./components/FilesDock";
import ArtifactDock from "./components/ArtifactDock";
import ConversationTitle from "./components/ConversationTitle";
import Header from "./components/Header";
import NavButtons from "./components/NavButtons";
import RelayView from "./components/RelayView";
import SessionPanel from "./components/SessionPanel";
import { useSessionSummary } from "./hooks/useSessionSummary";
import ScheduledView from "./components/ScheduledView";
import SearchPalette from "./components/SearchPalette";
import SideChatDock from "./components/SideChatDock";
import TerminalDock from "./components/TerminalDock";
import SettingsView from "./components/SettingsView";
import SettingsModal from "./components/SettingsModal";
import CustomizationsView from "./components/CustomizationsView";
import Sidebar from "./components/Sidebar";
import WelcomeProfileModal from "./components/WelcomeProfileModal";
import { dismissOnboarding, saveUserProfile, useUserProfile } from "./lib/profile";

const toggle = (set: (fn: (v: boolean) => boolean) => void) => () => set((v) => !v);

export default function App({ startup }: { startup: Startup }) {
  useNativeContextMenu();
  const locale = useLocale();
  const profile = useUserProfile();
  const [view, setView] = useState<View>("workspace");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(
    () => !profile.onboarded && !(typeof navigator !== "undefined" && navigator.webdriver),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** Conversation dont le dossier de travail est gardé car il contient du travail non enregistré. */
  const [keptWorktree, setKeptWorktree] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showInspector, setShowInspector] = useState(false);
  const [extensibility, setExtensibility] = useState<{ open: boolean; tab: ExtensibilityTab }>({
    open: false,
    tab: "mcp",
  });
  const conversations = useConversations(startup.conversations, startup.selectedId);
  const projectList = useProjects(startup.projects);
  const { selected } = conversations;
  const sidebar = useSidebarWidth();
  const docks = useDockPanels();

  const openConversation = (id: string) => {
    conversations.select(id);
    setView("workspace");
  };
  const history = useNavHistory(selected.id, openConversation);
  const [permissionMode, setPermissionMode] = useState(loadMode);
  const { prepareThread, observer, pendingTitles } = useThreadOrchestrator({
    items: conversations.items,
    selectedId: selected.id,
    findById: conversations.findById,
    attachWorktree: conversations.attachWorktree,
    clearForkContext: conversations.clearForkContext,
    setAcpSessionId: conversations.setAcpSessionId,
    rename: conversations.rename,
    markUnread: conversations.markUnread,
  });
  const { chat, chats, send, sendToThread, stop, answer, seed, removeQueued, steerQueued, rewind } = useChat(
    selected.id,
    selected.agentId,
    permissionMode,
    prepareThread,
    observer,
  );
  const changeMode = (mode: PermissionMode) => {
    setPermissionMode(mode);
    saveMode(mode);
    if (chat.messages.length > 0) {
      void setPlanMode(selected.id, mode === "plan").catch(() => false);
    }
  };

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
      return translateRustError(String(error));
    }
  };
  // Fournisseur et modèle : le fournisseur ne change que tant que la conversation est vide.
  const chooseModel = (agentId: string, modelId: string | undefined) => {
    if (agentId !== selected.agentId && chat.messages.length > 0) {
      // Un autre fournisseur au milieu de la conversation : le nouvel agent repart avec un résumé de ce qui s'est dit.
      const history = chat.messages.filter((m) => m.role !== "error");
      const from = AGENTS.find((a) => a.id === selected.agentId)?.name ?? selected.agentId;
      stopAgent(selected.id).catch(() => {});
      conversations.relayTo(selected.id, agentId, history.length > 0 ? buildRelayContext(history, from) : "");
    }
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
    activeAgentId: selected.agentId,
    onSelectProject: selectProject,
    onOpenFolder: () => void openFolder(),
    onCreateProject: createNewProject,
    onRemoveProject: (project: Project) => projectList.remove(project.path),
    onToggleWorktree: (value: boolean) => setUseWorktree(selected.id, value),
    onOpenAdvisor: () => crossReview.openAdvisor(""),
    onOpenGlobe: docks.openBrowser,
    onOpenRelay: () => setView("relay"),
  };

  // Le dossier où se trouve le travail de la conversation : son worktree, sinon son projet.
  const workPath = selected.worktree ?? (selected.projectPath !== NO_PROJECT ? selected.projectPath : undefined);
  // Le résumé se relit quand l'agent finit un tour (`chat.busy` repasse à faux).
  const sessionSummary = useSessionSummary(docks.showPlan && chat.messages.length > 0, workPath, chat.busy);
  const artifactPaths = (sessionSummary.summary?.changed ?? [])
    .filter((f) => isArtifactPath(f.path) || (f.status === "added" && /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i.test(f.path)))
    .map((f) => f.path);

  const handleRewind = async (messageId?: string) => {
    const done = await rewind(messageId);
    if (done) void sessionSummary.refresh();
  };

  // Le premier message donne son titre à la conversation et remet son projet en tête des récents.
  const sendMessage = (text: string, modeOverride?: PermissionMode) => {
    const trimmed = text.trim();
    if (trimmed === "/rewind") {
      void handleRewind();
      return;
    }
    if (crossReview.tryOpenFromSlashCommand(trimmed)) {
      return;
    }
    if (selected.title === "Nouvelle conversation") {
      const provisional = autoTitle(text);
      conversations.rename(selected.id, provisional);
      if (!text.trim().startsWith("/")) pendingTitles.current.set(selected.id, { request: text, provisional });
    }
    const project = projectList.projects.find((p) => p.path === selected.projectPath);
    if (project) projectList.use(project);
    conversations.touch(selected.id);
    return send(text, false, modeOverride);
  };

  const crossReview = useCrossReviewPipeline({
    selected,
    setAgent,
    setEnvironment: conversations.setEnvironment,
    spawnSubagent: conversations.spawnSubagent,
    changeMode,
    onShowPlan: () => docks.setShowPlan(true),
    sendMessage,
    sendToThread,
  });

  const worktreeHandoff = useWorktreeHandoff({
    selected,
    messages: chat.messages,
    summaryBranch: sessionSummary.summary?.branch,
    attachWorktree: conversations.attachWorktree,
    clearWorktree: conversations.clearWorktree,
    setUseWorktree,
    relayTo: conversations.relayTo,
    refreshSummary: sessionSummary.refresh,
    send,
  });

  const approvePlan = (targetMode: PermissionMode) => {
    changeMode(targetMode);
    void setPlanMode(selected.id, false).catch(() => false);
    void sendMessage("Le plan est approuvé : passe en exécution et applique les modifications.", targetMode);
  };

  /** Compacte la session : l'agent s'éteint et repart avec un résumé ; l'historique reste affiché. */
  const compactSession = () => {
    if (chat.busy || chat.messages.length === 0) return;
    // On demande le compactage à l'agent lui-même, comme si l'utilisateur tapait /compact.
    void send("/compact");
  };

  // Un fichier cliqué dans le panneau s'ouvre dans le volet Fichiers (une page HTML y est modifiable à même la page).
  const [fileRequest, setFileRequest] = useState<{ id: number; path: string } | null>(null);
  const openFile = (path: string) => {
    setFileRequest((r) => ({ id: (r?.id ?? 0) + 1, path }));
    docks.setShowArtDock(true);
  };

  // Un fichier local cité par l'agent s'ouvre dans le volet Fichiers (chemin relatif au dossier de travail).
  const [filesRequest, setFilesRequest] = useState<{ id: number; path: string; line?: number } | null>(null);
  const openLocalFile = (raw: string, line?: number) => {
    let path = raw;
    for (const base of [workPath, selected.projectPath]) {
      if (base && base !== "none" && path.startsWith(`${base}/`)) path = path.slice(base.length + 1);
    }
    path = path.replace(/^\.\//, "");
    setFilesRequest((r) => ({ id: (r?.id ?? 0) + 1, path, line }));
    docks.setShowFiles(true);
  };

  // Tous les artéfacts : relus quand on ouvre la galerie ou la recherche.
  const allArtifacts = useAllArtifacts(conversations.items, view === "artifacts" || searchOpen);
  const openArtifactEntry = (entry: ArtifactEntry) => {
    conversations.select(entry.conversationId);
    setView("workspace");
    openFile(entry.path);
  };

  // Clic droit sur un artéfact : ouvrir, copier le chemin, supprimer (à la corbeille, après confirmation).
  const [artifactMenu, setArtifactMenu] = useState<{ x: number; y: number; root?: string; path: string; entry?: ArtifactEntry } | null>(null);
  const [artifactToDelete, setArtifactToDelete] = useState<{ root?: string; path: string } | null>(null);
  const [artifactClosed, setArtifactClosed] = useState<{ id: number; path: string } | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const deleteArtifact = async () => {
    const target = artifactToDelete;
    if (!target) return;
    try {
      await trashFile(target.path, target.root);
      setArtifactClosed((c) => ({ id: (c?.id ?? 0) + 1, path: target.path }));
      allArtifacts.refresh();
      void sessionSummary.refresh();
      setArtifactToDelete(null);
    } catch (error) {
      setDeleteError(translateRustError(String(error)));
    }
  };

  const relayBanner = useRelayFlow({
    conversation: selected,
    chat,
    send,
    relayTo: conversations.relayTo,
    onOpenRelay: () => setView("relay"),
  });

  /** Bifurque : une nouvelle conversation qui reprend l'échange jusqu'à ce message. */
  const forkFrom = (messageId: string) => {
    const index = chat.messages.findIndex((m) => m.id === messageId);
    if (index < 0) return;
    const kept = chat.messages.slice(0, index + 1);
    const newId = conversations.fork(selected.id, buildForkContext(kept));
    if (newId) seed(newId, kept);
  };
  const agentLabel = AGENTS.find((a) => a.id === selected.agentId)?.name ?? selected.agentId;

  // Entrées du menu "..."
  const [keepAwake, setKeepAwakeState] = useState(false);
  const keepAwakeSeq = useRef(0);
  const toggleKeepAwake = () => {
    const seq = ++keepAwakeSeq.current;
    const next = !keepAwake;
    setKeepAwakeState(next);
    void setKeepAwake(next)
      .then((active) => {
        if (keepAwakeSeq.current === seq) setKeepAwakeState(active);
      })
      .catch(() => {
        if (keepAwakeSeq.current === seq) setKeepAwakeState(!next);
      });
  };

  const nav = {
    onToggleSidebar: toggle(docks.setShowSidebar),
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
  // « + » au survol d'un dossier : une conversation vide directement dedans, dans le bon projet.
  const createInSection = (name: string) => {
    const project = projectList.projects.find((p) => p.name === name);
    const path = project?.path ?? conversations.items.find((c) => c.project === name && c.projectPath)?.projectPath;
    conversations.createIn(name, path);
    setView("workspace");
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
    onMoveSection: conversations.moveSection,
    onCreateIn: createInSection,
    onMoveToSection: conversations.moveToSection,
    onArchive: conversations.toggleArchive,
    onDelete: setDeletingId,
  };
  const deleting = conversations.items.find((c) => c.id === deletingId);

  const cycleMode = () => {
    const currentIndex = MODES.findIndex((m) => m.id === permissionMode);
    const next = MODES[(currentIndex + 1) % MODES.length];
    changeMode(next.id);
  };

  const toggleSessionPanel = () => {
    if (!docks.showPlan && view !== "workspace") setView("workspace");
    docks.setShowPlan((v) => !v);
  };

  const runPaletteAction = (actionId: string) => {
    switch (actionId) {
      case ACTION_NEW:
        return createConversation();
      case ACTION_SETTINGS:
        return setSettingsOpen(true);
      case ACTION_TOGGLE_TERMINAL:
        return docks.toggleTerminal();
      case ACTION_TOGGLE_DIFF:
        return docks.setShowDiff((v) => !v);
      case ACTION_TOGGLE_FILES:
        return docks.setShowFiles((v) => !v);
      case ACTION_TOGGLE_ARTIFACTS:
        return docks.setShowArtDock((v) => !v);
      case ACTION_TOGGLE_BROWSER:
        return docks.toggleBrowser();
      case ACTION_TOGGLE_SESSION:
        return toggleSessionPanel();
      case ACTION_CYCLE_MODE:
        return cycleMode();
      case ACTION_OPEN_RELAY:
        return setView("relay");
    }
  };

  useGlobalShortcuts({
    blockedByModal:
      deleting !== undefined ||
      artifactToDelete !== null ||
      docks.browserAgent.approval !== null ||
      extensibility.open ||
      showInspector ||
      settingsOpen ||
      welcomeOpen ||
      crossReview.advisorModal.open,
    searchOpen,
    editingId,
    view,
    conversations: conversations.items,
    selectedId: selected.id,
    onToggleSearch: () => setSearchOpen((v) => !v),
    onCreateConversation: createConversation,
    onToggleSidebar: toggle(docks.setShowSidebar),
    onToggleTerminal: docks.toggleTerminal,
    onOpenSettings: () => setSettingsOpen(true),
    onToggleSideChat: () => {
      docks.setShowSideChat((v) => {
        if (!v && view !== "workspace") setView("workspace");
        return !v;
      });
    },
    onToggleDiff: toggle(docks.setShowDiff),
    onToggleFiles: toggle(docks.setShowFiles),
    onToggleArtifacts: toggle(docks.setShowArtDock),
    onToggleBrowser: docks.toggleBrowser,
    onToggleSessionPanel: toggleSessionPanel,
    onCycleMode: cycleMode,
    onOpenConversation: openConversation,
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#181817] text-[#e6e5df] select-none">
      <Sidebar
        open={docks.showSidebar}
        conversations={conversations.items}
        actions={actions}
        selectedId={selected.id}
        editingId={editingId}
        view={view}
        settingsOpen={settingsOpen}
        width={sidebar.width}
        dragging={sidebar.dragging}
        onResizeStart={sidebar.startDrag}
        nav={nav}
        searchOpen={searchOpen}
        onCreate={createConversation}
        onOpenSearch={() => setSearchOpen(true)}
        onArtifacts={() => setView("artifacts")}
        onOpenScheduled={() => setView("scheduled")}
        onOpenCustomizations={() => setView("customizations")}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenSignIn={() => setWelcomeOpen(true)}
      />

      <div className="flex min-w-0 flex-1 overflow-hidden bg-[#181817]">
        <div
          className={`flex min-w-0 flex-1 flex-col overflow-hidden ${
            docks.terminalFills || docks.filesFill ? "hidden" : ""
          }`}
        >
          <Header
            leading={docks.showSidebar ? undefined : <NavButtons {...nav} />}
            toolbar={{
              showPlan: docks.showPlan,
              onPlan: toggle(docks.setShowPlan),
              showTerminal: docks.showTerminal,
              onTerminal: docks.toggleTerminal,
              showDiff: docks.showDiff,
              onDiff: toggle(docks.setShowDiff),
              showBrowser: docks.showBrowser,
              onBrowser: docks.toggleBrowser,
              showFiles: docks.showFiles,
              onFiles: toggle(docks.setShowFiles),
              more: {
                showSideChat: docks.showSideChat,
                onSideChat: () => {
                  if (!docks.showSideChat && view !== "workspace") setView("workspace");
                  docks.setShowSideChat((v) => !v);
                },
                showArtifacts: docks.showArtDock,
                onArtifacts: toggle(docks.setShowArtDock),
                showInspector,
                onInspector: () => setShowInspector(true),
                keepAwake,
                onKeepAwake: toggleKeepAwake,
              },
            }}
          >
            {view === "settings" || view === "scheduled" || view === "artifacts" || view === "customizations" ? (
              <span className="px-2 text-[14px] text-[#e6e5df]">
                {view === "settings"
                  ? tr("Réglages", "Settings", locale)
                  : view === "customizations"
                    ? tr("Personnalisation", "Customize", locale)
                    : view === "artifacts"
                      ? tr("Artéfacts", "Artifacts", locale)
                      : tr("Tâches planifiées", "Scheduled tasks", locale)}
              </span>
            ) : (
              <ConversationTitle
                conversation={selected}
                editing={editingId === selected.id && !docks.showSidebar}
                sections={sectionsOf(conversations.items)}
                actions={actions}
              />
            )}
          </Header>

          {view === "settings" ? (
            <SettingsView
              conversationIds={conversations.items.map((c) => c.id)}
              projectPaths={projectList.projects.map((p) => p.path)}
            />
          ) : view === "customizations" ? (
            <CustomizationsView projectPath={workPath} />
          ) : view === "scheduled" ? (
            <ScheduledView projects={projectList.projects} defaultProjectPath={workPath ?? selected.projectPath} />
          ) : view === "artifacts" ? (
            <ArtifactsView
              items={allArtifacts.items}
              loading={allArtifacts.loading}
              onOpen={openArtifactEntry}
              onMenu={(entry, x, y) => setArtifactMenu({ x, y, root: entry.root, path: entry.path, entry })}
              currentRoot={workPath ?? selected.projectPath}
            />
          ) : view === "workspace" ? (
            <div className="flex flex-1 overflow-hidden">
              <OpenArtifactContext.Provider value={openFile}>
                <OpenFileContext.Provider value={openLocalFile}>
                  <ChatView
                    agentLabel={agentLabel}
                    chat={chat}
                    onSend={sendMessage}
                    onStop={stop}
                    onRemoveQueued={removeQueued}
                    onSteerQueued={steerQueued}
                    workPath={workPath}
                    projectPath={selected.projectPath !== NO_PROJECT ? selected.projectPath : undefined}
                    onAnswer={answer}
                    onOpenLink={docks.openInGlobe}
                    onFork={forkFrom}
                    onRewind={(id) => void handleRewind(id)}
                    onOpenExtensibility={(tab) => setExtensibility({ open: true, tab })}
                    mode={permissionMode}
                    onModeChange={changeMode}
                    onApprovePlan={approvePlan}
                    newSession={newSession}
                    relayBanner={relayBanner}
                    modelPicker={
                      <>
                        <ModelPicker
                          agents={AGENTS}
                          agentId={selected.agentId}
                          modelId={selected.modelId}
                          canSwitchProvider={!chat.busy}
                          onSelect={chooseModel}
                          onOpenProviders={() => setSettingsOpen(true)}
                        />
                        <EffortPicker
                          agentId={selected.agentId}
                          onChange={(value) => {
                            if (chat.messages.length > 0) setThreadEffort(selected.id, value).catch(() => {});
                          }}
                        />
                      </>
                    }
                  />
                </OpenFileContext.Provider>
              </OpenArtifactContext.Provider>
              {docks.showSideChat && (
                <SideChatDock
                  conversation={selected}
                  mainMessages={chat.messages}
                  workPath={workPath}
                  onClose={() => docks.setShowSideChat(false)}
                />
              )}
              {docks.showPlan && (
                <SessionPanel
                  conversation={selected}
                  messages={chat.messages}
                  plan={chat.plan}
                  summary={sessionSummary.summary}
                  pulls={sessionSummary.pulls}
                  workPath={workPath}
                  onOpenDiff={(path) => {
                    if (path) docks.setDiffFocus((f) => ({ id: (f?.id ?? 0) + 1, path }));
                    docks.setShowDiff(true);
                  }}
                  onOpenLink={docks.openInGlobe}
                  onRefresh={() => void sessionSummary.refresh()}
                  context={chat.context}
                  agentId={selected.agentId}
                  onOpenRelay={() => setView("relay")}
                  started={chat.messages.length > 0}
                  onCompact={compactSession}
                  canCompact={!chat.busy && chat.messages.length > 0}
                  onOpenFile={openFile}
                  onOpenTerminal={docks.openTerminal}
                  onArtifactMenu={(path, x, y) => setArtifactMenu({ x, y, root: workPath, path })}
                  onOpenFolder={() => void openFolder()}
                  canAddFolder={!chat.busy}
                  onAddFolder={(path) => {
                    conversations.addFolder(selected.id, path);
                    void send(`Tu as aussi accès à ce dossier, en plus du dossier de travail : ${path}\nLis-le quand c'est utile, sans rien y modifier sauf si je te le demande.`);
                  }}
                  onChangeEnvironment={(env) => {
                    stopAgent(selected.id).catch(() => {});
                    conversations.setEnvironment(selected.id, env);
                  }}
                  subagents={conversations.items
                    .filter((c) => c.parentId === selected.id)
                    .map((sub) => {
                      const subChat = chats[sub.id];
                      const lastRole = subChat?.messages[subChat.messages.length - 1]?.role;
                      const status: "running" | "done" | "error" | "idle" = subChat?.busy
                        ? "running"
                        : lastRole === "error"
                          ? "error"
                          : subChat?.messages.some((m) => m.role === "agent")
                            ? "done"
                            : "idle";
                      return { conversation: sub, status };
                    })}
                  onSpawnSubagent={(roleLabel, prompt, readOnly) => {
                    const subId = conversations.spawnSubagent(selected.id, roleLabel, prompt, readOnly);
                    if (!subId) return;
                    const modeOverride: PermissionMode | undefined = readOnly ? "plan" : undefined;
                    void sendToThread(subId, selected.agentId, prompt, modeOverride);
                  }}
                  onOpenSubagent={(id) => openConversation(id)}
                  onDiscarded={worktreeHandoff.handleDiscarded}
                  onResolveConflicts={worktreeHandoff.handleResolveConflicts}
                  onImportPrFeedback={worktreeHandoff.handleImportPrFeedback}
                  onOpenAdvisor={() => crossReview.openAdvisor("")}
                  crossReview={crossReview.activeCrossReview}
                  onHandoffToWorktree={worktreeHandoff.handleHandoffToWorktree}
                  onHandoffToLocal={worktreeHandoff.handleHandoffToLocal}
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
          openRequest={filesRequest}
          visible={docks.showFiles && !docks.terminalFills}
          maximized={docks.filesMaximized}
          width={docks.filesPanel.width}
          dragging={docks.filesPanel.dragging}
          onResizeStart={docks.filesPanel.startDrag}
          onToggleMaximize={() => docks.setFilesMaximized((v) => !v)}
          onClose={() => {
            docks.setShowFiles(false);
            docks.setFilesMaximized(false);
          }}
          onSendDiagnostics={(report) => void sendMessage(report)}
        />

        <ArtifactDock
          key={"art-" + (workPath ?? "depot")}
          known={artifactPaths}
          root={workPath}
          closeRequest={artifactClosed}
          onComment={(file, note) => {
            if (chat.busy) return;
            const where = note.heading ? ` (section « ${note.heading} »)` : "";
            void send(
              `Commentaire sur l'artéfact \`${file}\`${where} :\n\n> ${note.text}\n\n${note.comment}\n\nModifie uniquement ce passage dans le fichier, sans toucher au reste de la page.`,
            );
          }}
          openRequest={fileRequest}
          visible={docks.showArtDock && !docks.terminalFills}
          maximized={docks.artMaximized}
          width={docks.artPanel.width}
          dragging={docks.artPanel.dragging}
          onResizeStart={docks.artPanel.startDrag}
          onToggleMaximize={() => docks.setArtMaximized((v) => !v)}
          onClose={() => {
            docks.setShowArtDock(false);
            docks.setArtMaximized(false);
          }}
        />

        <DiffDock
          path={workPath}
          focusRequest={docks.diffFocus}
          visible={docks.diffVisible}
          width={docks.diffPanel.width}
          dragging={docks.diffPanel.dragging}
          onResizeStart={docks.diffPanel.startDrag}
          onClose={() => docks.setShowDiff(false)}
          onComment={(file, target, comment) => {
            const where = target.lineNo != null ? ` (ligne ${target.lineNo})` : "";
            void send(
              `Commentaire de review sur \`${file}\`${where} dans \`${target.hunkHeader}\` :\n\n\`\`\`\n${target.text}\n\`\`\`\n\n${comment}\n\nApplique cette correction uniquement sur ce passage.`,
            );
          }}
        />

        {docks.browserOpened && (
          <BrowserDock
            visible={docks.browserVisible}
            suspended={
              searchOpen ||
              deletingId !== null ||
              docks.browserAgent.approval !== null ||
              showInspector ||
              settingsOpen ||
              welcomeOpen
            }
            width={docks.browserPanel.width}
            dragging={docks.browserPanel.dragging}
            onResizeStart={docks.browserPanel.startDrag}
            onClose={() => docks.setShowBrowser(false)}
            driving={docks.browserAgent.driving}
            openRequest={docks.openRequest}
            onSendDiagnostics={(report) => void sendMessage(report)}
          />
        )}

        {docks.terminalOpened && (
          <TerminalDock
            visible={docks.showTerminal}
            maximized={docks.terminalMaximized}
            width={docks.terminalPanel.width}
            dragging={docks.terminalPanel.dragging}
            onResizeStart={docks.terminalPanel.startDrag}
            onToggleMaximize={() => docks.setTerminalMaximized((v) => !v)}
            onClose={() => {
              docks.setShowTerminal(false);
              docks.setTerminalMaximized(false);
            }}
          />
        )}
      </div>

      {artifactMenu && (
        <ArtifactMenu
          x={artifactMenu.x}
          y={artifactMenu.y}
          onClose={() => setArtifactMenu(null)}
          onOpen={() => {
            setSearchOpen(false);
            if (artifactMenu.entry) openArtifactEntry(artifactMenu.entry);
            else openFile(artifactMenu.path);
          }}
          onCopyPath={() => void navigator.clipboard?.writeText(`${artifactMenu.root ?? ""}/${artifactMenu.path}`).catch(() => {})}
          onDelete={() => {
            setDeleteError("");
            setArtifactToDelete({ root: artifactMenu.root, path: artifactMenu.path });
          }}
        />
      )}

      {artifactToDelete && (
        <ConfirmDialog
          title={tr("Supprimer cet artéfact ?", "Delete this artifact?", locale)}
          confirmLabel={tr("Supprimer", "Delete", locale)}
          onCancel={() => setArtifactToDelete(null)}
          onConfirm={() => void deleteArtifact()}
        >
          {tr("« ", '"', locale)}
          {artifactTitle(artifactToDelete.path)}
          {tr(" » sera mis à la corbeille.", '" will be moved to the Trash.', locale)}
          {deleteError && <span className="mt-2 block text-red-300">{deleteError}</span>}
        </ConfirmDialog>
      )}

      {searchOpen && (
        <SearchPalette
          conversations={conversations.items}
          artifacts={allArtifacts.items}
          onOpenArtifact={openArtifactEntry}
          onArtifactMenu={(entry, x, y) => setArtifactMenu({ x, y, root: entry.root, path: entry.path, entry })}
          onOpenConversation={openConversation}
          onOpenScheduled={() => setView("scheduled")}
          onAction={runPaletteAction}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {docks.browserAgent.approval && (
        <BrowserApprovalDialog
          approval={docks.browserAgent.approval}
          onAnswer={(allow) => docks.browserAgent.answer(docks.browserAgent.approval!.requestId, allow)}
        />
      )}

      <ExtensibilityModal
        open={extensibility.open}
        initialTab={extensibility.tab}
        projectPath={selected.projectPath !== NO_PROJECT ? selected.projectPath : undefined}
        ruleRoot={workPath ?? (selected.projectPath !== NO_PROJECT ? selected.projectPath : undefined)}
        onClose={() => setExtensibility((prev) => ({ ...prev, open: false }))}
      />

      <InspectorModal
        open={showInspector}
        conversation={selected}
        messages={chat.messages}
        onClose={() => setShowInspector(false)}
      />

      <AdvisorModal
        open={crossReview.advisorModal.open}
        initialQuery={crossReview.advisorModal.query}
        onClose={crossReview.closeAdvisor}
        onApplySingle={crossReview.applySingleRecommendation}
        onLaunchCrossReview={crossReview.launchCrossReview}
      />

      <SettingsModal
        open={settingsOpen}
        conversationIds={conversations.items.map((c) => c.id)}
        projectPaths={projectList.projects.map((p) => p.path)}
        keepAwake={keepAwake}
        onToggleKeepAwake={toggleKeepAwake}
        onOpenRelay={() => setView("relay")}
        onClose={() => setSettingsOpen(false)}
      />

      <WelcomeProfileModal
        open={welcomeOpen}
        initialName={profile.name}
        onSave={(name) => {
          saveUserProfile(name);
          setWelcomeOpen(false);
        }}
        onLater={() => {
          dismissOnboarding();
          setWelcomeOpen(false);
        }}
      />

      {deleting && (
        <ConfirmDialog
          title={tr("Supprimer cette conversation ?", "Delete this conversation?", locale)}
          confirmLabel={tr("Supprimer", "Delete", locale)}
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
            <span className="mt-2 block text-[#93c5fd]">
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
