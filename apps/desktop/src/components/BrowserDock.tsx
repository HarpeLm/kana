import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Download, Play, Send, Square, Trash2, X } from "lucide-react";
import { useBrowserTabs } from "../hooks/useBrowserTabs";
import { useNativeBounds } from "../hooks/useNativeBounds";
import { normalizeAddress } from "../lib/address";
import {
  backBrowser,
  closeBrowser,
  forwardBrowser,
  listenBrowser,
  navigateBrowser,
  openBrowser,
  reloadBrowser,
  setBrowserBounds,
  setBrowserVisible,
  type Bounds,
} from "../lib/browser";
import { setActiveBrowserTab } from "../lib/browserAgent";
import { inTauri } from "../lib/env";
import { recordFavicon } from "../lib/favicons";
import AgentBanner from "./AgentBanner";
import BrowserBar, { type GlobeViewportPreset } from "./BrowserBar";
import SidePane from "./SidePane";
import TerminalTabs from "./TerminalTabs";
import ToolbarButton from "./ToolbarButton";

export interface ConsoleErrorEntry {
  level: string;
  message: string;
  source: string;
  at: number;
}

export interface NetworkErrorEntry {
  method: string;
  url: string;
  status: number;
  statusText: string;
  durationMs: number;
  at: number;
}

export interface GlobeTraceEntry {
  at: number;
  tool: string;
  target: string;
  url: string;
  title: string;
  status: string;
}

const DEMO_CONSOLE_ERRORS: ConsoleErrorEntry[] = [
  {
    level: "error",
    message: "TypeError: Cannot read properties of undefined (reading 'user')",
    source: "http://localhost:5173/src/pages/Checkout.tsx:48",
    at: Date.now() - 4500,
  },
  {
    level: "warn",
    message: "UnhandledRejection: Stripe element mount timeout after 3000ms",
    source: "http://localhost:5173/src/lib/payments.ts:19",
    at: Date.now() - 2100,
  },
];

const DEMO_NETWORK_ERRORS: NetworkErrorEntry[] = [
  {
    method: "POST",
    url: "http://localhost:5173/api/v1/checkout/confirm",
    status: 502,
    statusText: "Bad Gateway",
    durationMs: 142,
    at: Date.now() - 3200,
  },
  {
    method: "GET",
    url: "http://localhost:5173/api/v1/profile/limits",
    status: 404,
    statusText: "Not Found",
    durationMs: 38,
    at: Date.now() - 1500,
  },
];

function buildClientTraceHtml(
  entries: GlobeTraceEntry[],
  consoleErrors: ConsoleErrorEntry[],
  networkErrors: NetworkErrorEntry[],
): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rows = entries.length
    ? entries
        .map(
          (e, i) =>
            `<tr><td>${i + 1}</td><td><code>${esc(e.tool)}</code></td><td><code>${esc(e.target)}</code></td><td>${esc(e.title)}</td><td>${esc(e.url)}</td><td>${esc(e.status)}</td></tr>`,
        )
        .join("\n")
    : '<tr><td colspan="6">Aucune action enregistrée dans cette trace.</td></tr>';
  const consoleText = consoleErrors.length
    ? consoleErrors.map((c) => `[${c.level.toUpperCase()}] ${c.message} (${c.source})`).join("\n")
    : "Aucune erreur console JS.";
  const networkText = networkErrors.length
    ? networkErrors.map((n) => `${n.method} ${n.url} -> ${n.status} ${n.statusText} (${n.durationMs} ms)`).join("\n")
    : "Aucune erreur réseau 4xx/5xx.";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Preuve de vérification Globe — Kana</title>
</head>
<body>
  <h1>Preuve de vérification Globe — Kana</h1>
  <p>${entries.length} action(s) horodatée(s)</p>
  <table>
    <thead><tr><th>#</th><th>Outil</th><th>Cible</th><th>Titre</th><th>URL</th><th>Statut</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <h2>État Console JS</h2>
  <pre>${esc(consoleText)}</pre>
  <h2>État Réseau (XHR / Fetch)</h2>
  <pre>${esc(networkText)}</pre>
</body>
</html>`;
}

interface BrowserDockProps {
  visible: boolean;
  /** Une fenêtre ou un menu de l'app est ouvert : la vue native, qui passerait par-dessus, se cache. */
  suspended: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onClose: () => void;
  /** Un agent agit sur la page en ce moment. */
  driving: boolean;
  /** Adresse à ouvrir dans un nouvel onglet ; `id` change à chaque demande. */
  openRequest: { id: number; url: string } | null;
  /** Envoie directement le rapport de diagnostic Console & Réseau à l'agent de la conversation active. */
  onSendDiagnostics?: (report: string) => void;
}

const ignore = () => {};

/**
 * Volet Globe : un navigateur dans Kana, avec des onglets. Chaque onglet est une vue web native
 * posée sur l'emplacement vide du volet. Les sessions (cookies) sont conservées entre deux
 * lancements. Masqué, le volet garde ses onglets ouverts.
 */
export default function BrowserDock({
  visible,
  suspended,
  width,
  dragging,
  onResizeStart,
  onClose,
  driving,
  openRequest,
  onSendDiagnostics,
}: BrowserDockProps) {
  const { tabs, activeId, add, select, close, setUrl, setTitle, setLoading } = useBrowserTabs();
  const slot = useRef<HTMLDivElement>(null);
  const created = useRef(new Set<string>());
  const bounds = useRef<Bounds | null>(null);
  const tabsRef = useRef(tabs);
  const [address, setAddress] = useState(tabs[0].url);
  const [editing, setEditing] = useState(false);
  const [viewport, setViewport] = useState<GlobeViewportPreset>("desktop");
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [consoleErrors, setConsoleErrors] = useState<ConsoleErrorEntry[]>(() =>
    inTauri ? [] : DEMO_CONSOLE_ERRORS,
  );
  const [networkErrors, setNetworkErrors] = useState<NetworkErrorEntry[]>(() =>
    inTauri ? [] : DEMO_NETWORK_ERRORS,
  );
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceRecording, setTraceRecording] = useState(false);
  const [traceEntries, setTraceEntries] = useState<GlobeTraceEntry[]>([]);
  const [exportedTraceHtml, setExportedTraceHtml] = useState<string | null>(null);

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const shown = visible && !suspended;

  const viewportWidth = viewport === "mobile" ? 390 : viewport === "tablet" ? 768 : undefined;
  const applyBoundsFor = useCallback(
    (area: Bounds) => {
      if (!viewportWidth || area.width <= viewportWidth) return area;
      const offsetX = Math.round((area.width - viewportWidth) / 2);
      return { x: area.x + offsetX, y: area.y, width: viewportWidth, height: area.height };
    },
    [viewportWidth],
  );

  // Une vue native n'existe qu'une fois l'emplacement mesuré ; chaque onglet a la sienne.
  const ensureViews = useCallback(() => {
    const area = bounds.current;
    if (!area) return;
    for (const tab of tabsRef.current) {
      if (created.current.has(tab.id)) continue;
      created.current.add(tab.id);
      openBrowser(tab.id, tab.url, area).catch(() => created.current.delete(tab.id));
    }
  }, []);

  useEffect(() => {
    tabsRef.current = tabs;
    if (visible) ensureViews();
  }, [tabs, visible, ensureViews]);

  useNativeBounds(slot, inTauri && visible, (area) => {
    bounds.current = area;
    ensureViews();
    const targetArea = applyBoundsFor(area);
    for (const id of created.current) setBrowserBounds(id, targetArea).catch(ignore);
  });

  useEffect(() => {
    if (!inTauri || !bounds.current) return;
    const targetArea = applyBoundsFor(bounds.current);
    for (const id of created.current) setBrowserBounds(id, targetArea).catch(ignore);
  }, [viewport, applyBoundsFor]);

  // Un lien cliqué dans la conversation s'ouvre dans un nouvel onglet.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!openRequest || handled.current === openRequest.id) return;
    handled.current = openRequest.id;
    add(openRequest.url);
  }, [openRequest, add]);

  // Les agents agissent sur l'onglet que l'utilisateur regarde.
  useEffect(() => {
    if (inTauri) setActiveBrowserTab(activeId).catch(ignore);
  }, [activeId]);

  // Seul l'onglet actif est affiché, et seulement si rien ne passe par-dessus.
  useEffect(() => {
    if (!inTauri) return;
    const timer = setTimeout(() => {
      for (const id of created.current) setBrowserVisible(id, shown && id === activeId).catch(ignore);
    }, 0);
    return () => clearTimeout(timer);
  }, [shown, activeId, tabs]);

  useEffect(() => {
    if (!inTauri) return;
    let off: (() => void) | undefined;
    let cancelled = false;
    Promise.all([
      listenBrowser({
        onNavigated: setUrl,
        onTitle: setTitle,
        onLoading: setLoading,
        onNewTab: (url) => add(url),
        onFavicon: recordFavicon,
      }),
      listen<{ id: string }>("browser-select-tab", (e) => select(e.payload.id)),
      listen<{ id: string }>("browser-close-tab", (e) => close(e.payload.id)),
      listen<{ preset: GlobeViewportPreset }>("browser-viewport", (e) => {
        if (e.payload.preset === "desktop" || e.payload.preset === "tablet" || e.payload.preset === "mobile") {
          setViewport(e.payload.preset);
        }
      }),
      listen<{ recording: boolean; entries: GlobeTraceEntry[] }>("browser-trace-updated", (e) => {
        setTraceRecording(e.payload.recording);
        setTraceEntries(e.payload.entries ?? []);
      }),
    ]).then((unlisteners) => {
      const cleanup = () => unlisteners.forEach((fn) => fn());
      if (cancelled) cleanup();
      else off = cleanup;
    });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [add, select, close, setUrl, setTitle, setLoading]);

  const refreshDiagnostics = useCallback((clear = false) => {
    if (!inTauri) {
      if (clear) {
        setConsoleErrors([]);
        setNetworkErrors([]);
      }
      return;
    }
    invoke<{ consoleErrors: ConsoleErrorEntry[]; networkErrors: NetworkErrorEntry[] }>("browser_get_diagnostics", {
      clear,
    })
      .then((res) => {
        setConsoleErrors(res.consoleErrors ?? []);
        setNetworkErrors(res.networkErrors ?? []);
      })
      .catch(ignore);
  }, []);

  useEffect(() => {
    if (devToolsOpen && inTauri) {
      refreshDiagnostics(false);
    }
  }, [devToolsOpen, activeId, refreshDiagnostics]);

  // La barre d'adresse suit la page, sauf pendant qu'on la modifie.
  useEffect(() => {
    if (!editing) setAddress(active.url);
  }, [active.url, active.id, editing]);

  const recordLocalTrace = useCallback(
    (tool: string, target: string, nextUrl?: string) => {
      if (!traceRecording) return;
      setTraceEntries((prev) => [
        ...prev,
        {
          at: Date.now(),
          tool,
          target,
          url: nextUrl ?? active.url,
          title: active.title,
          status: "ok",
        },
      ]);
    },
    [traceRecording, active.url, active.title],
  );

  const handleViewportChange = (preset: GlobeViewportPreset) => {
    setViewport(preset);
    recordLocalTrace("browser_set_viewport", preset);
  };

  const handleToggleTraceRecording = () => {
    const next = !traceRecording;
    setTraceRecording(next);
    setExportedTraceHtml(null);
    if (inTauri) {
      invoke<{ recording: boolean; entries: GlobeTraceEntry[] }>("browser_trace_toggle", {
        active: next,
        reset: next,
      })
        .then((status) => {
          setTraceRecording(status.recording);
          setTraceEntries(status.entries ?? []);
        })
        .catch(ignore);
    } else if (next) {
      setTraceEntries([
        {
          at: Date.now(),
          tool: "browser_navigate",
          target: active.url,
          url: active.url,
          title: active.title,
          status: "ok",
        },
      ]);
    }
  };

  const handleExportTrace = async () => {
    let html = "";
    if (inTauri) {
      html = await invoke<string>("browser_trace_export").catch(() =>
        buildClientTraceHtml(traceEntries, consoleErrors, networkErrors),
      );
    } else {
      html = buildClientTraceHtml(traceEntries, consoleErrors, networkErrors);
    }
    setExportedTraceHtml(html);
    (window as unknown as { __kanaLastGlobeTrace?: { filename: string; content: string } }).__kanaLastGlobeTrace = {
      filename: "globe-verification-trace.html",
      content: html,
    };
  };

  const handleSendDiagnosticsToAgent = () => {
    if (!onSendDiagnostics) return;
    const consoleSection = consoleErrors.length
      ? consoleErrors.map((c) => `- [${c.level.toUpperCase()}] ${c.message} (${c.source})`).join("\n")
      : "- Aucune erreur console JS.";
    const networkSection = networkErrors.length
      ? networkErrors
          .map((n) => `- ${n.method} ${n.url} -> ${n.status} ${n.statusText} (${n.durationMs} ms)`)
          .join("\n")
      : "- Aucune requête réseau en échec.";
    const report = `Diagnostic DevTools Globe sur \`${active.url}\` :\n\n### Erreurs Console JS\n${consoleSection}\n\n### Requêtes Réseau en échec (4xx/5xx)\n${networkSection}\n\nAnalyse ces erreurs et propose un correctif.`;
    onSendDiagnostics(report);
  };

  const closeTab = (id: string) => {
    const wasLast = tabs.length === 1;
    close(id);
    created.current.delete(id);
    closeBrowser(id).catch(ignore);
    // Fermer le dernier onglet ferme le volet ; il rouvrira sur un onglet neuf.
    if (wasLast) onClose();
  };

  const submit = () => {
    const url = normalizeAddress(address);
    if (!url) return;
    setUrl(activeId, url);
    recordLocalTrace("browser_navigate", url, url);
    navigateBrowser(activeId, url).catch(ignore);
  };

  const totalErrors = consoleErrors.length + networkErrors.length;
  const viewportBadge =
    viewport === "mobile"
      ? "Mobile · 390 × 844 px"
      : viewport === "tablet"
        ? "Tablette · 768 × 1024 px"
        : "Bureau · Responsive";

  return (
    <SidePane
      label="Navigateur"
      visible={visible}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          <TerminalTabs
            tabs={tabs}
            activeId={activeId}
            onSelect={select}
            onClose={closeTab}
            onAdd={() => add()}
            addLabel="Nouvel onglet"
            closeLast
          />
          <ToolbarButton title="Fermer le navigateur" onClick={onClose}>
            <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
          </ToolbarButton>
        </>
      }
    >
      <div className="flex h-full flex-col">
        {driving && <AgentBanner />}
        <BrowserBar
          address={address}
          loading={active.loading}
          onAddressChange={setAddress}
          onFocusChange={setEditing}
          onSubmit={submit}
          onBack={() => {
            recordLocalTrace("browser_back", "history.back");
            backBrowser(activeId).catch(ignore);
          }}
          onForward={() => {
            recordLocalTrace("browser_forward", "history.forward");
            forwardBrowser(activeId).catch(ignore);
          }}
          onReload={() => {
            recordLocalTrace("browser_reload", active.url);
            reloadBrowser(activeId).catch(ignore);
          }}
          viewport={viewport}
          onViewportChange={handleViewportChange}
          devToolsOpen={devToolsOpen}
          errorCount={totalErrors}
          onToggleDevTools={() => setDevToolsOpen((v) => !v)}
          traceRecording={traceRecording}
          traceOpen={traceOpen}
          traceCount={traceEntries.length}
          onToggleTrace={() => setTraceOpen((v) => !v)}
        />
        <div className="flex items-center justify-between border-b border-[#232320] bg-[#161615] px-3 py-1 text-[11px] text-[#8c8b83]">
          <span data-testid="globe-viewport-label">Gabarit actif : {viewportBadge}</span>
          {traceRecording && (
            <span className="text-[#fdba74]">Enregistrement de trace actif ({traceEntries.length} action(s))</span>
          )}
        </div>
        {inTauri ? (
          <div ref={slot} className="min-h-0 flex-1" />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-4">
            <div
              data-testid="globe-viewport-frame"
              style={{ width: viewportWidth ? `${viewportWidth}px` : "100%", maxWidth: "100%" }}
              className="flex flex-col rounded-xl border border-[#2d2d29] bg-[#1b1b19] p-4 text-[13px] text-[#8c8b83] transition-all"
            >
              <div className="mb-1 text-[12px] font-medium text-[#d6d5ce]">
                {active.title} — <span className="text-[#8c8b83]">{active.url}</span>
              </div>
              <p>Le navigateur fonctionne dans la fenêtre de l'app Kana ({viewportBadge}).</p>
            </div>
          </div>
        )}

        {traceOpen && (
          <section
            aria-label="Trace de vérification Globe"
            className="flex max-h-[230px] shrink-0 flex-col border-t border-[#2b2b27] bg-[#161615] p-3 text-[12px]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-medium text-[#ecebe4]">
                Trace de session Globe ({traceEntries.length} action{traceEntries.length > 1 ? "s" : ""})
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleToggleTraceRecording}
                  className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                    traceRecording
                      ? "border-[#7c2d12] bg-[#3b1d16] text-[#fdba74]"
                      : "border-[#343430] bg-[#222220] text-[#ecebe4] hover:bg-[#2c2c28]"
                  }`}
                >
                  {traceRecording ? (
                    <>
                      <Square className="h-3 w-3" />
                      <span>Arrêter la trace</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3" />
                      <span>Démarrer la trace</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void handleExportTrace()}
                  className="flex items-center gap-1 rounded-md border border-[#343430] bg-[#222220] px-2 py-1 text-[11px] text-[#ecebe4] hover:bg-[#2c2c28]"
                >
                  <Download className="h-3 w-3" />
                  <span>Exporter preuve HTML</span>
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded border border-[#262623] bg-[#1b1b19] p-2">
              {traceEntries.length === 0 ? (
                <p className="text-[#7c7b73]">
                  Clique sur « Démarrer la trace » pour enregistrer les actions Globe comme preuve de vérification.
                </p>
              ) : (
                <ul className="space-y-1">
                  {traceEntries.map((entry, idx) => (
                    <li key={`${entry.at}-${idx}`} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono text-[#93c5fd]">
                        #{idx + 1} {entry.tool} → {entry.target}
                      </span>
                      <span className="text-[#8c8b83]">{entry.url}</span>
                    </li>
                  ))}
                </ul>
              )}
              {exportedTraceHtml && (
                <p className="mt-2 rounded bg-[#1f2e22] px-2 py-1 text-[11px] text-[#86efac]">
                  Preuve HTML générée (globe-verification-trace.html, {exportedTraceHtml.length} octets).
                </p>
              )}
            </div>
          </section>
        )}

        {devToolsOpen && (
          <section
            aria-label="Tiroir DevTools Console & Réseau"
            className="flex max-h-[250px] shrink-0 flex-col border-t border-[#2b2b27] bg-[#151514] p-3 text-[12px]"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="font-medium text-[#ecebe4]">
                DevTools — Console JS ({consoleErrors.length}) & Réseau 4xx/5xx ({networkErrors.length})
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => refreshDiagnostics(true)}
                  className="flex items-center gap-1 rounded-md border border-[#343430] bg-[#1f1f1d] px-2 py-1 text-[11px] text-[#a5a49c] hover:text-[#ecebe4]"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Vider DevTools</span>
                </button>
                {onSendDiagnostics && (
                  <button
                    type="button"
                    onClick={handleSendDiagnosticsToAgent}
                    className="flex items-center gap-1 rounded-md border border-[#3b4e6b] bg-[#1f2937] px-2.5 py-1 text-[11px] text-[#bfdbfe] hover:bg-[#273549]"
                  >
                    <Send className="h-3 w-3" />
                    <span>Envoyer à l'agent</span>
                  </button>
                )}
              </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              <div className="rounded border border-[#262623] bg-[#1b1b19] p-2">
                <div className="mb-1 text-[11px] font-semibold text-[#fca5a5]">Erreurs Console JS</div>
                {consoleErrors.length === 0 ? (
                  <p className="text-[11px] text-[#7c7b73]">Aucune erreur console JS.</p>
                ) : (
                  <ul className="space-y-1">
                    {consoleErrors.map((err, i) => (
                      <li key={i} className="text-[11px] text-[#e6e5df]">
                        <span className="font-mono text-[#f87171]">[{err.level.toUpperCase()}]</span> {err.message}
                        <div className="truncate text-[10px] text-[#7c7b73]">{err.source}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded border border-[#262623] bg-[#1b1b19] p-2">
                <div className="mb-1 text-[11px] font-semibold text-[#fdba74]">Requêtes Réseau en échec</div>
                {networkErrors.length === 0 ? (
                  <p className="text-[11px] text-[#7c7b73]">Aucune requête réseau 4xx/5xx en échec.</p>
                ) : (
                  <ul className="space-y-1">
                    {networkErrors.map((req, i) => (
                      <li key={i} className="text-[11px] text-[#e6e5df]">
                        <span className="font-mono text-[#fb923c]">
                          {req.method} {req.status}
                        </span>{" "}
                        {req.statusText} ({req.durationMs} ms)
                        <div className="truncate text-[10px] text-[#7c7b73]">{req.url}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </SidePane>
  );
}
