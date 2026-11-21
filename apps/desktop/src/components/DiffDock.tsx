import { useState, type PointerEvent } from "react";
import { ChevronsDownUp, ChevronsUpDown, Columns2, RefreshCw, Rows3, X } from "lucide-react";
import { isArtifactPath } from "../lib/fileKinds";
import { revertDiffFile, revertDiffHunk } from "../lib/gitDiff";
import { useGitDiff } from "../hooks/useGitDiff";
import DiffFileBlock, { type DiffCommentTarget } from "./DiffFileBlock";
import SidePane from "./SidePane";
import ToolbarButton from "./ToolbarButton";

interface DiffDockProps {
  visible: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onClose: () => void;
  /** Dossier de travail de la conversation ; sans lui, le dépôt où l'app a été lancée. */
  path?: string;
  /** Un fichier à montrer en premier (clic dans le panneau de la session) ; `id` change à chaque demande. */
  focusRequest?: { id: number; path: string } | null;
  /** Commentaire inline sur une ligne ou un bloc de diff, envoyé à l'agent. */
  onComment?: (file: string, target: DiffCommentTarget, comment: string) => void;
}

const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** Volet Diff : les changements du dépôt, fichier par fichier, unifié ou côte-à-côte. */
export default function DiffDock({
  visible,
  width,
  dragging,
  onResizeStart,
  onClose,
  path,
  focusRequest,
  onComment,
}: DiffDockProps) {
  const [signal, setSignal] = useState<{ id: number; collapsed: boolean } | undefined>();
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const [acceptedFiles, setAcceptedFiles] = useState<Set<string>>(() => new Set());
  const [acceptedHunks, setAcceptedHunks] = useState<Record<string, Set<string>>>({});
  const [actionError, setActionError] = useState("");
  const { report, loading, error, refresh } = useGitDiff(visible, path);

  // Les artéfacts ont leur propre volet : on ne les mélange pas au code.
  const files = (report?.files ?? []).filter(
    (f) => !(isArtifactPath(f.path) || (f.status === "added" && /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i.test(f.path))),
  );
  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

  const toggleAcceptFile = (filePath: string) => {
    setAcceptedFiles((prev) => {
      const next = new Set(prev);
      if (!next.delete(filePath)) next.add(filePath);
      return next;
    });
  };

  const toggleAcceptHunk = (filePath: string, hunkHeader: string) => {
    setAcceptedHunks((prev) => {
      const current = new Set(prev[filePath] ?? []);
      if (!current.delete(hunkHeader)) current.add(hunkHeader);
      return { ...prev, [filePath]: current };
    });
  };

  const rejectFile = async (filePath: string) => {
    setActionError("");
    try {
      await revertDiffFile(filePath, path);
      await refresh();
    } catch (e) {
      setActionError(String(e));
    }
  };

  const rejectHunk = async (filePath: string, hunkHeader: string) => {
    setActionError("");
    try {
      await revertDiffHunk(filePath, hunkHeader, path);
      await refresh();
    } catch (e) {
      setActionError(String(e));
    }
  };

  return (
    <SidePane
      label="Diff"
      visible={visible}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          <div className="flex min-w-0 items-baseline gap-2 px-2">
            <span className="text-[14px] text-[#e6e5df]">Modifications</span>
            {report && (
              <span className="truncate font-mono text-[12px] text-[#8a8982]">
                {baseName(report.root)} · {files.length} fichier{files.length > 1 ? "s" : ""}{" "}
                <span className="text-emerald-400">+{additions}</span>{" "}
                <span className="text-red-400">−{deletions}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setViewMode((m) => (m === "unified" ? "split" : "unified"))}
              aria-pressed={viewMode === "split"}
              title={viewMode === "unified" ? "Passer en vue côte-à-côte" : "Passer en vue unifiée"}
              className="flex h-7 items-center gap-1 rounded-lg bg-[#2a2a28] px-2 text-[11.5px] text-[#dcdbd3] transition hover:bg-[#353532]"
            >
              {viewMode === "split" ? (
                <>
                  <Rows3 className="h-3.5 w-3.5" strokeWidth={1.7} />
                  <span>Unifié</span>
                </>
              ) : (
                <>
                  <Columns2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                  <span>Côte-à-côte</span>
                </>
              )}
            </button>
            {files.length > 1 && (
              <>
                <ToolbarButton title="Tout replier" onClick={() => setSignal({ id: Date.now(), collapsed: true })}>
                  <ChevronsDownUp className="h-[16px] w-[16px]" strokeWidth={1.6} />
                </ToolbarButton>
                <ToolbarButton title="Tout déplier" onClick={() => setSignal({ id: Date.now(), collapsed: false })}>
                  <ChevronsUpDown className="h-[16px] w-[16px]" strokeWidth={1.6} />
                </ToolbarButton>
              </>
            )}
            <ToolbarButton
              title="Actualiser"
              onClick={() => {
                setActionError("");
                void refresh();
              }}
            >
              <RefreshCw
                className={`h-[16px] w-[16px] ${loading ? "animate-spin" : ""}`}
                strokeWidth={1.6}
              />
            </ToolbarButton>
            <ToolbarButton title="Fermer les modifications" onClick={onClose}>
              <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
            </ToolbarButton>
          </div>
        </>
      }
    >
      <div className="h-full space-y-3 overflow-y-auto p-3">
        {(error || actionError) && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
            {actionError || error}
          </p>
        )}
        {!error && report && files.length === 0 && (
          <p className="px-2 pt-6 text-center text-[13px] text-[#7e7d76]">Aucun changement.</p>
        )}
        {files.map((file) => (
          <DiffFileBlock
            key={file.path}
            file={file}
            viewMode={viewMode}
            signal={signal}
            focusId={focusRequest?.path === file.path ? focusRequest.id : undefined}
            accepted={acceptedFiles.has(file.path)}
            acceptedHunks={acceptedHunks[file.path]}
            onAcceptFile={() => toggleAcceptFile(file.path)}
            onRejectFile={() => void rejectFile(file.path)}
            onAcceptHunk={(header) => toggleAcceptHunk(file.path, header)}
            onRejectHunk={(header) => void rejectHunk(file.path, header)}
            onComment={onComment}
          />
        ))}
      </div>
    </SidePane>
  );
}
