import { useState } from "react";
import "./App.css";
import { THREADS, type View } from "./data";
import { useChat } from "./hooks/useChat";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import ChatView from "./components/ChatView";
import RightPanel from "./components/RightPanel";
import RelayView from "./components/RelayView";
import SettingsView from "./components/SettingsView";

export default function App() {
  const [view, setView] = useState<View>("workspace");
  const [selectedThread, setSelectedThread] = useState("1");
  const thread = THREADS.find((t) => t.id === selectedThread) ?? THREADS[0];
  const { chat, send, stop, answer } = useChat(thread.id, thread.agentId);

  // Boutons de la barre en haut à droite
  const [showSidebar, setShowSidebar] = useState(false);
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

  const showRightPanel = showDiff || showTerminal || showArtifacts || showBackgroundTasks;
  const toggle = (set: (fn: (v: boolean) => boolean) => void) => () => set((v) => !v);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#181817] text-[#e6e5df] select-none">
      {showSidebar && (
        <Sidebar
          view={view}
          selectedThread={selectedThread}
          onSelectThread={(id) => {
            setSelectedThread(id);
            setView("workspace");
          }}
          onOpenRelay={() => setView("relay")}
          onOpenSettings={() => setView("settings")}
        />
      )}

      <div className="flex flex-1 flex-col overflow-hidden bg-[#181817]">
        <Header
          title={view === "settings" ? "Réglages" : thread.branch}
          toolbar={{
            onToggleSidebar: toggle(setShowSidebar),
            showTerminal,
            onTerminal: toggle(setShowTerminal),
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
        />

        {view === "settings" ? (
          <SettingsView />
        ) : view === "workspace" ? (
          <div className="flex flex-1 overflow-hidden">
            <ChatView
              agentLabel={thread.agent}
              chat={chat}
              onSend={send}
              onStop={stop}
              onAnswer={answer}
            />
            {showRightPanel && (
              <RightPanel
                showArtifacts={showArtifacts}
                showBackgroundTasks={showBackgroundTasks}
                showDiff={showDiff}
                showTerminal={showTerminal}
              />
            )}
          </div>
        ) : (
          <RelayView />
        )}
      </div>
    </div>
  );
}
