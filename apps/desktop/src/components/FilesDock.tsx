import { useEffect, useRef, useState, type PointerEvent } from "react";
import { AlertCircle, AlertTriangle, Maximize2, Minimize2, RefreshCw, Send, X } from "lucide-react";
import { useOpenFiles } from "../hooks/useOpenFiles";
import { useRepoFiles } from "../hooks/useRepoFiles";
import { baseName, hasRenderedView, showsRendered } from "../lib/fileKinds";
import { analyzeBufferDiagnostics, loadDiagnostics, type CodeDiagnostic } from "../lib/files";
import ConfirmDialog from "./ConfirmDialog";
import FileToolbar from "./FileToolbar";
import FileTabs from "./FileTabs";
import FileTree from "./FileTree";
import FileViewer from "./FileViewer";
import SidePane from "./SidePane";
import ToolbarButton from "./ToolbarButton";

interface FilesDockProps {
  /** Un fichier à ouvrir (depuis le panneau de la session) ; `id` change à chaque demande. */
  openRequest?: { id: number; path: string; line?: number } | null;
  /** Dossier de travail de la conversation ; sans lui, le dépôt où l'app a été lancée. */
  root?: string;
  visible: boolean;
  maximized: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
  /** Envoie un rapport de diagnostics LSP/Compilateur à l'agent actif pour correction. */
  onSendDiagnostics?: (prompt: string) => void;
}

/**
 * Volet Fichiers : un éditeur avec des onglets à gauche, l'arbre du dépôt à droite.
 * Un clic sur un fichier l'ouvre en aperçu, un double clic le garde ; ⌘S enregistre.
 */
export default function FilesDock({
  openRequest,
  root,
  visible,
  maximized,
  width,
  dragging,
  onResizeStart,
  onToggleMaximize,
  onClose,
  onSendDiagnostics,
}: FilesDockProps) {
  const { list, error, refresh } = useRepoFiles(visible, root);
  const files = useOpenFiles(root);
  const handledRequest = useRef<number | null>(null);
  const [diagGoTo, setDiagGoTo] = useState<{ id: number; path: string; line: number } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnostics, setDiagnostics] = useState<CodeDiagnostic[]>([]);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);

  const refreshDiagnostics = async () => {
    setLoadingDiagnostics(true);
    try {
      const items = await loadDiagnostics(root);
      setDiagnostics(items);
    } catch {
      setDiagnostics([]);
    } finally {
      setLoadingDiagnostics(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    void refreshDiagnostics();
  }, [visible, root]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!openRequest || handledRequest.current === openRequest.id) return;
    handledRequest.current = openRequest.id;
    files.open(openRequest.path, true);
    void refresh();
  }, [openRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showTree, setShowTree] = useState(true);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [sourcePaths, setSourcePaths] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState<string | null>(null);

  const path = files.activePath;
  const doc = path ? files.docs[path] : undefined;
  const liveBufferDiags = path && doc?.text !== undefined ? analyzeBufferDiagnostics(path, doc.text) : [];
  const mergedDiagnostics = [
    ...liveBufferDiags,
    ...diagnostics.filter(
      (d) => !liveBufferDiags.some((live) => live.file === d.file && live.line === d.line && live.code === d.code),
    ),
  ];
  const activeFileDiagnostics = path ? mergedDiagnostics.filter((d) => d.file === path) : [];

  const requestClose = (target: string) => {
    if (files.isDirty(target)) setClosing(target);
    else files.close(target);
  };

  const save = async (target: string, force = false) => {
    if (await files.save(target, force)) {
      void refresh();
      void refreshDiagnostics();
    }
  };

  const toggleSource = (target: string) =>
    setSourcePaths((current) => {
      const next = new Set(current);
      if (!next.delete(target)) next.add(target);
      return next;
    });

  return (
    <SidePane
      label="Fichiers"
      visible={visible}
      maximized={maximized}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          <FileTabs
            tabs={files.tabs}
            activePath={path}
            isDirty={files.isDirty}
            onSelect={files.select}
            onClose={requestClose}
          />
          <div className="flex shrink-0 items-center gap-1">
            <ToolbarButton title={maximized ? "Réduire" : "Agrandir"} onClick={onToggleMaximize}>
              {maximized ? (
                <Minimize2 className="h-[17px] w-[17px]" strokeWidth={1.6} />
              ) : (
                <Maximize2 className="h-[17px] w-[17px]" strokeWidth={1.6} />
              )}
            </ToolbarButton>
            <ToolbarButton title="Fermer les fichiers" onClick={onClose}>
              <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
            </ToolbarButton>
          </div>
        </>
      }
    >
      <div className="flex h-full flex-col">
        <FileToolbar
          path={path}
          dirty={!!path && files.isDirty(path)}
          saving={!!doc?.saving}
          onSave={() => path && void save(path)}
          canToggleSource={!!path && hasRenderedView(path)}
          sourceMode={!!path && hasRenderedView(path) && !showsRendered(path, sourcePaths.has(path))}
          onToggleSource={() => path && toggleSource(path)}
          onCollapseAll={() => setCollapseSignal((n) => n + 1)}
          treeVisible={showTree}
          onToggleTree={() => setShowTree((v) => !v)}
          diagnosticsVisible={showDiagnostics}
          diagnosticsCount={mergedDiagnostics.length}
          onToggleDiagnostics={() => {
            setShowDiagnostics((v) => {
              const next = !v;
              if (next) void refreshDiagnostics();
              return next;
            });
          }}
          onCopyPath={() => {
            if (path && list) void navigator.clipboard?.writeText(`${list.root}/${path}`).catch(() => {});
          }}
          onRefresh={() => {
            void refresh();
            void refreshDiagnostics();
          }}
        />

        {activeFileDiagnostics.length > 0 && !showDiagnostics && (
          <div className="flex items-center justify-between gap-2 border-b border-[#3a2a24] bg-[#261c19] px-3 py-1 text-[12px] text-[#f4c6b8]">
            <button
              type="button"
              onClick={() => setShowDiagnostics(true)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#f85149]" />
              <span className="truncate">
                Ligne {activeFileDiagnostics[0].line} : {activeFileDiagnostics[0].message}
                {activeFileDiagnostics.length > 1 ? ` (+${activeFileDiagnostics.length - 1})` : ""}
              </span>
            </button>
            {onSendDiagnostics && (
              <button
                type="button"
                onClick={() => {
                  const lines = activeFileDiagnostics
                    .map((d) => `- [${d.severity.toUpperCase()}] \`${d.file}:${d.line}:${d.column}\` — ${d.message}`)
                    .join("\n");
                  onSendDiagnostics(`Corrige ces erreurs dans \`${path}\` :\n\n${lines}`);
                }}
                className="shrink-0 rounded bg-[#d97757] px-2 py-0.5 text-[11px] font-medium text-[#181817] hover:bg-[#e38768]"
              >
                Envoyer à l'agent
              </button>
            )}
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <div className="min-w-0 flex-1">
            <FileViewer
              tabs={files.tabs}
              activePath={path}
              docs={files.docs}
              sourcePaths={sourcePaths}
              onChange={files.setText}
              onSave={(target) => void save(target)}
              onOverwrite={(target) => void save(target, true)}
              onReload={(target) => void files.reload(target)}
              goTo={
                diagGoTo ??
                (openRequest?.line ? { id: openRequest.id, path: openRequest.path, line: openRequest.line } : null)
              }
            />
          </div>

          {showTree && (
            <div className="w-[240px] shrink-0 border-l border-[#262623]">
              {error ? (
                <p className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
                  {error}
                </p>
              ) : (
                list && (
                  <FileTree
                    files={list.files}
                    changes={list.changes}
                    activePath={path}
                    onOpen={files.open}
                    collapseSignal={collapseSignal}
                  />
                )
              )}
            </div>
          )}
        </div>

        {showDiagnostics && (
          <div
            role="region"
            aria-label="Diagnostics LSP & Compilateur"
            className="flex max-h-[210px] shrink-0 flex-col border-t border-[#262623] bg-[#1b1b19]"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[#262623] px-3 py-1.5 text-[12px]">
              <div className="flex items-center gap-2 font-medium text-[#ecebe4]">
                <AlertTriangle className="h-3.5 w-3.5 text-[#f0883e]" strokeWidth={1.8} />
                <span>Diagnostics LSP & Compilateur ({mergedDiagnostics.length})</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void refreshDiagnostics()}
                  disabled={loadingDiagnostics}
                  title="Actualiser les diagnostics"
                  className="flex items-center gap-1 rounded-md bg-[#2a2a27] px-2 py-0.5 text-[11.5px] text-[#dcdbd3] transition hover:bg-[#353531] disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingDiagnostics ? "animate-spin" : ""}`} />
                  <span>Actualiser</span>
                </button>
                {onSendDiagnostics && mergedDiagnostics.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const lines = mergedDiagnostics
                        .map(
                          (d) =>
                            `- [${d.severity.toUpperCase()}${d.code ? ` ${d.code}` : ""} · ${d.source}] \`${d.file}:${d.line}:${d.column}\` — ${d.message}`,
                        )
                        .join("\n");
                      onSendDiagnostics(
                        `Diagnostics LSP / Compilateur détectés dans le dépôt :\n\n${lines}\n\nCorrige ces erreurs de compilation/typage et vérifie les tests.`,
                      );
                    }}
                    className="flex items-center gap-1 rounded-md bg-[#d97757] px-2.5 py-0.5 text-[11.5px] font-medium text-[#181817] transition hover:bg-[#e38768]"
                  >
                    <Send className="h-3 w-3" />
                    <span>Envoyer les erreurs à l'agent</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {mergedDiagnostics.length === 0 ? (
                <p className="px-2 py-2 text-[12px] text-[#8c8b83]">
                  Aucune erreur compilateur ou LSP détectée.
                </p>
              ) : (
                <ul className="space-y-1">
                  {mergedDiagnostics.map((d, idx) => (
                    <li key={`${d.file}:${d.line}:${d.column}:${idx}`}>
                      <button
                        type="button"
                        onClick={() => {
                          files.open(d.file, true);
                          setDiagGoTo((prev) => ({
                            id: (prev?.id ?? 0) + 1,
                            path: d.file,
                            line: d.line,
                          }));
                        }}
                        className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition hover:bg-[#262623]"
                      >
                        <AlertCircle
                          className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                            d.severity === "error" ? "text-[#f85149]" : "text-[#d29922]"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[11.5px] text-[#ecebe4]">
                              {d.file}:{d.line}:{d.column}
                            </span>
                            {d.code && (
                              <span className="rounded bg-[#2e2e2b] px-1.5 py-0.2 font-mono text-[10.5px] text-[#a3a29a]">
                                {d.code}
                              </span>
                            )}
                            <span className="text-[11px] text-[#7e7d76]">{d.source}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[#cfcec6]">{d.message}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>

      {closing && (
        <ConfirmDialog
          title="Fermer sans enregistrer ?"
          confirmLabel="Fermer sans enregistrer"
          onCancel={() => setClosing(null)}
          onConfirm={() => {
            files.close(closing);
            setClosing(null);
          }}
        >
          Les modifications de « {baseName(closing)} » seront perdues.
        </ConfirmDialog>
      )}
    </SidePane>
  );
}
