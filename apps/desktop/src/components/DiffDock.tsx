import { useState, type PointerEvent } from "react";
import { ChevronsDownUp, ChevronsUpDown, RefreshCw, X } from "lucide-react";
import { isArtifactPath } from "../lib/fileKinds";
import { useGitDiff } from "../hooks/useGitDiff";
import DiffFileBlock from "./DiffFileBlock";
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
}

const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** Volet Diff : les changements du dépôt, fichier par fichier. */
export default function DiffDock({ visible, width, dragging, onResizeStart, onClose, path, focusRequest }: DiffDockProps) {
  const [signal, setSignal] = useState<{ id: number; collapsed: boolean } | undefined>();
  const { report, loading, error, refresh } = useGitDiff(visible, path);
  // Les artéfacts ont leur propre volet : on ne les mélange pas au code.
  const files = (report?.files ?? []).filter(
    (f) => !(isArtifactPath(f.path) || (f.status === "added" && /\.(html?|svg|png|jpe?g|gif|webp|pdf)$/i.test(f.path))),
  );
  const additions = files.reduce((sum, f) => sum + f.additions, 0);
  const deletions = files.reduce((sum, f) => sum + f.deletions, 0);

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
            <ToolbarButton title="Actualiser" onClick={() => void refresh()}>
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
        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
            {error}
          </p>
        )}
        {!error && report && files.length === 0 && (
          <p className="px-2 pt-6 text-center text-[13px] text-[#7e7d76]">Aucun changement.</p>
        )}
        {files.map((file) => (
          <DiffFileBlock
            key={file.path}
            file={file}
            signal={signal}
            focusId={focusRequest?.path === file.path ? focusRequest.id : undefined}
          />
        ))}
      </div>
    </SidePane>
  );
}
