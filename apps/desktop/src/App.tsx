import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { AGENTS, type View } from "./data";
import { useBrowserAgent } from "./hooks/useBrowserAgent";
import type { Startup } from "./lib/startup";
import { useProjects } from "./hooks/useProjects";
import { setThreadEffort, setThreadModel } from "./lib/models";
import { chosenEffort } from "./lib/effort";
import { agentTitle, autoTitle } from "./lib/autoTitle";
import { artifactTitle } from "./lib/artifactRefs";
import ArtifactMenu from "./components/ArtifactMenu";
import { trashFile } from "./lib/files";
import ArtifactsView from "./components/ArtifactsView";
import { useAllArtifacts, type ArtifactEntry } from "./lib/artifactIndex";
import EffortPicker from "./components/EffortPicker";
import ModelPicker from "./components/ModelPicker";
import { pickFiles } from "./lib/attachments";
import { NO_PROJECT, NO_PROJECT_NAME, createProject, describeFolder, scratchDir, type Project } from "./lib/projects";
import { useChat, type PreparedThread } from "./hooks/useChat";
import { useRelayFlow } from "./hooks/useRelayFlow";
import { detectProblem } from "./lib/limits";
import { clearProblem, markProblem, recordTokens, recordTurn } from "./lib/usage";
import { isArtifactPath } from "./lib/fileKinds";
import { ARTIFACT_GUIDE } from "./lib/agentGuide";
import { OpenArtifactContext } from "./lib/artifactRefs";
import { buildRelayContext } from "./lib/fork";
import { OpenFileContext } from "./lib/fileRefs";
import { buildForkContext } from "./lib/fork";
import { stopAgent } from "./lib/acp";
import { setKeepAwake } from "./lib/settings";
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
import ArtifactDock from "./components/ArtifactDock";
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
      const carried = conversation.forkContext;
      if (carried) clearForkContext(threadId);
      const folders = conversation.extraFolders?.length
        ? `Dossiers supplémentaires auxquels tu as accès, en plus du dossier de travail (lis-les au besoin, ne les modifie que si je le demande) :\n${conversation.extraFolders.map((f) => `- ${f}`).join("\n")}\n\n`
        : "";
      const preface = `${ARTIFACT_GUIDE}${folders}${carried ?? ""}`;
      return {
        cwd,
        preface,
        carried: !!carried,
        model: conversation.modelId,
        effort: chosenEffort(conversation.agentId),
        acpSessionId: conversation.acpSessionId,
      };
    },
    [attachWorktree, clearForkContext],
  );
  // Ce que les agents consomment, et les limites qu'ils atteignent (voir « Relais »).
  const agentOf = (threadId: string) => itemsRef.current.find((c) => c.id === threadId)?.agentId;
  const pendingTitles = useRef(new Map<string, { request: string; provisional: string }>());
  const observer = {
    onSession: (threadId: string, sessionId: string) => {
      conversations.setAcpSessionId(threadId, sessionId);
    },
    onTurnUsage: (threadId: string, usage: { input: number; output: number; total: number }) => {
      const agent = agentOf(threadId);
      if (agent) recordTokens(agent, usage.input, usage.output, usage.total);
    },
    onDone: (threadId: string) => {
      const agent = agentOf(threadId);
      if (!agent) return;
      // Au premier tour fini, l'agent écrit un vrai titre (sauf si la conversation a été renommée entre-temps).
      const pending = pendingTitles.current.get(threadId);
      if (pending) {
        pendingTitles.current.delete(threadId);
        void agentTitle(agent, pending.request).then((title) => {
          const now = itemsRef.current.find((c) => c.id === threadId);
          if (title && now && now.title === pending.provisional) conversations.rename(threadId, title);
        });
      }
      recordTurn(agent);
      clearProblem(agent);
    },
    onError: (threadId: string, message: string) => {
      const agent = agentOf(threadId);
      const problem = detectProblem(message);
      if (agent && problem) markProblem(agent, problem, message);
    },
  };
  const { chat, send, stop, answer, seed, removeQueued, steerQueued } = useChat(selected.id, selected.agentId, permissionMode, prepareThread, observer);

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
    onSelectProject: selectProject,
    onOpenFolder: () => void openFolder(),
    onCreateProject: createNewProject,
    onRemoveProject: (project: Project) => projectList.remove(project.path),
    onToggleWorktree: (value: boolean) => setUseWorktree(selected.id, value),
  };

  // Le premier message donne son titre à la conversation et remet son projet en tête des récents.
  const sendMessage = (text: string) => {
    if (selected.title === "Nouvelle conversation") {
      const provisional = autoTitle(text);
      conversations.rename(selected.id, provisional);
      if (!text.trim().startsWith("/")) pendingTitles.current.set(selected.id, { request: text, provisional });
    }
    const project = projectList.projects.find((p) => p.path === selected.projectPath);
    if (project) projectList.use(project);
    conversations.touch(selected.id);
    return send(text);
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
    setShowArtDock(true);
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
    setShowFiles(true);
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
      setDeleteError(String(error));
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

  // Barre latérale et boutons du haut
  const [showSidebar, setShowSidebar] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [diffFocus, setDiffFocus] = useState<{ id: number; path: string } | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showArtDock, setShowArtDock] = useState(false);
  const [artMaximized, setArtMaximized] = useState(false);

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
  const artPanel = useResizableWidth({
    storageKey: "kana-artifacts-width",
    min: 420,
    max: 1100,
    fallback: 700,
    from: "right",
    offsetRight: terminalWidth + browserWidth + (diffVisible ? diffPanel.width : 0) + (showFiles && !terminalFills ? filesPanel.width : 0),
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

  // Le dossier où se trouve le travail de la conversation : son worktree, sinon son projet.
  const workPath = selected.worktree ?? (selected.projectPath !== NO_PROJECT ? selected.projectPath : undefined);
  // Le résumé se relit quand l'agent finit un tour (`chat.busy` repasse à faux).
  const sessionSummary = useSessionSummary(showPlan && chat.messages.length > 0, workPath, chat.busy);
  const artifactPaths = (sessionSummary.summary?.changed ?? [])
    .filter((f) => isArtifactPath(f.path) || (f.status === "added" && /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i.test(f.path)))
    .map((f) => f.path);


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
        onArtifacts={() => setView("artifacts")}
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
              showArtifacts: showArtDock,
              onArtifacts: toggle(setShowArtDock),
              keepAwake,
              onKeepAwake: toggleKeepAwake,
            },
          }}
        >
          {view === "settings" || view === "scheduled" || view === "artifacts" ? (
            <span className="px-2 text-[14px] text-[#e6e5df]">
              {view === "settings" ? "Réglages" : view === "artifacts" ? "Artéfacts" : "Tâches planifiées"}
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
          <SettingsView
            conversationIds={conversations.items.map((c) => c.id)}
            projectPaths={projectList.projects.map((p) => p.path)}
          />
        ) : view === "scheduled" ? (
          <ScheduledView />
        ) : view === "artifacts" ? (
          <ArtifactsView items={allArtifacts.items} loading={allArtifacts.loading} onOpen={openArtifactEntry} onMenu={(entry, x, y) => setArtifactMenu({ x, y, root: entry.root, path: entry.path, entry })} currentRoot={workPath ?? selected.projectPath} />
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
              onAnswer={answer}
              onOpenLink={openInGlobe}
              onFork={forkFrom}
              mode={permissionMode}
              onModeChange={changeMode}
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
            {showPlan && (
              <SessionPanel
                conversation={selected}
                messages={chat.messages}
                plan={chat.plan}
                summary={sessionSummary.summary}
                pulls={sessionSummary.pulls}
                workPath={workPath}
                onOpenDiff={(path) => {
                  if (path) setDiffFocus((f) => ({ id: (f?.id ?? 0) + 1, path }));
                  setShowDiff(true);
                }}
                onOpenLink={openInGlobe}
                onRefresh={() => void sessionSummary.refresh()}
                context={chat.context}
                agentId={selected.agentId}
                onOpenRelay={() => setView("relay")}
                started={chat.messages.length > 0}
                onCompact={compactSession}
                canCompact={!chat.busy && chat.messages.length > 0}
                onOpenFile={openFile}
                onOpenTerminal={() => setShowTerminal(true)}
                onArtifactMenu={(path, x, y) => setArtifactMenu({ x, y, root: workPath, path })}
                canAddFolder={!chat.busy}
                onAddFolder={(path) => {
                  conversations.addFolder(selected.id, path);
                  void send(`Tu as aussi accès à ce dossier, en plus du dossier de travail : ${path}\nLis-le quand c'est utile, sans rien y modifier sauf si je te le demande.`);
                }}
                onDiscarded={() => {
                  stopAgent(selected.id).catch(() => {});
                  conversations.clearWorktree(selected.id);
                  void sessionSummary.refresh();
                }}
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
          visible={showArtDock && !terminalFills}
          maximized={artMaximized}
          width={artPanel.width}
          dragging={artPanel.dragging}
          onResizeStart={artPanel.startDrag}
          onToggleMaximize={() => setArtMaximized((v) => !v)}
          onClose={() => {
            setShowArtDock(false);
            setArtMaximized(false);
          }}
        />

        <DiffDock
          path={workPath}
          focusRequest={diffFocus}
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
          title="Supprimer cet artéfact ?"
          confirmLabel="Supprimer"
          onCancel={() => setArtifactToDelete(null)}
          onConfirm={() => void deleteArtifact()}
        >
          « {artifactTitle(artifactToDelete.path)} » sera mis à la corbeille.
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
