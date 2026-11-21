import { useState, type PointerEvent } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useOpenFiles } from "../hooks/useOpenFiles";
import { useRepoFiles } from "../hooks/useRepoFiles";
import { baseName, hasRenderedView, showsRendered } from "../lib/fileKinds";
import ConfirmDialog from "./ConfirmDialog";
import FileToolbar from "./FileToolbar";
import FileTabs from "./FileTabs";
import FileTree from "./FileTree";
import FileViewer from "./FileViewer";
import SidePane from "./SidePane";
import ToolbarButton from "./ToolbarButton";

interface FilesDockProps {
  /** Dossier de travail de la conversation ; sans lui, le dépôt où l'app a été lancée. */
  root?: string;
  visible: boolean;
  maximized: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onToggleMaximize: () => void;
  onClose: () => void;
}

/**
 * Volet Fichiers : un éditeur avec des onglets à gauche, l'arbre du dépôt à droite.
 * Un clic sur un fichier l'ouvre en aperçu, un double clic le garde ; ⌘S enregistre.
 */
export default function FilesDock({
  root,
  visible,
  maximized,
  width,
  dragging,
  onResizeStart,
  onToggleMaximize,
  onClose,
}: FilesDockProps) {
  const { list, error, refresh } = useRepoFiles(visible, root);
  const files = useOpenFiles(root);
  const [showTree, setShowTree] = useState(true);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [sourcePaths, setSourcePaths] = useState<Set<string>>(new Set());
  const [closing, setClosing] = useState<string | null>(null);

  const path = files.activePath;
  const doc = path ? files.docs[path] : undefined;

  const requestClose = (target: string) => {
    if (files.isDirty(target)) setClosing(target);
    else files.close(target);
  };

  const save = async (target: string, force = false) => {
    if (await files.save(target, force)) void refresh();
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
          onCopyPath={() => {
            if (path && list) void navigator.clipboard?.writeText(`${list.root}/${path}`).catch(() => {});
          }}
          onRefresh={() => void refresh()}
        />

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
