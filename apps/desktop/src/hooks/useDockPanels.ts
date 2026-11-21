import { useState } from "react";
import { useBrowserAgent } from "./useBrowserAgent";
import { useResizableWidth } from "./useResizableWidth";

export function useDockPanels() {
  const [showSidebar, setShowSidebar] = useState(true);
  const [showPlan, setShowPlan] = useState(false);
  const [showTerminal, setShowTerminal] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [diffFocus, setDiffFocus] = useState<{ id: number; path: string } | null>(null);
  const [showBrowser, setShowBrowser] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [showArtDock, setShowArtDock] = useState(false);
  const [showSideChat, setShowSideChat] = useState(false);
  const [artMaximized, setArtMaximized] = useState(false);

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
    offsetRight:
      terminalWidth +
      browserWidth +
      (diffVisible ? diffPanel.width : 0) +
      (showFiles && !terminalFills ? filesPanel.width : 0),
  });

  const toggleBrowser = () => {
    setShowBrowser((v) => !v);
    setBrowserOpened(true);
  };

  const browserAgent = useBrowserAgent(() => {
    setShowBrowser(true);
    setBrowserOpened(true);
  });

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

  return {
    showSidebar,
    setShowSidebar,
    showPlan,
    setShowPlan,
    showTerminal,
    setShowTerminal,
    showDiff,
    setShowDiff,
    diffFocus,
    setDiffFocus,
    showBrowser,
    setShowBrowser,
    showFiles,
    setShowFiles,
    showArtDock,
    setShowArtDock,
    showSideChat,
    setShowSideChat,
    artMaximized,
    setArtMaximized,
    terminalOpened,
    browserOpened,
    terminalMaximized,
    setTerminalMaximized,
    filesMaximized,
    setFilesMaximized,
    terminalPanel,
    terminalFills,
    filesFill,
    browserVisible,
    browserPanel,
    diffVisible,
    diffPanel,
    filesPanel,
    artPanel,
    toggleBrowser,
    browserAgent,
    openRequest,
    openInGlobe,
    toggleTerminal,
  };
}
