import { useState, type PointerEvent } from "react";
import { ArrowLeft, RefreshCw, X } from "lucide-react";
import { useRepoFiles } from "../hooks/useRepoFiles";
import FilePreview from "./FilePreview";
import FileTree from "./FileTree";
import SidePane from "./SidePane";
import ToolbarButton from "./ToolbarButton";

interface FilesDockProps {
  visible: boolean;
  width: number;
  dragging: boolean;
  onResizeStart: (event: PointerEvent) => void;
  onClose: () => void;
}

const baseName = (path: string) => path.split("/").filter(Boolean).pop() ?? path;

/** Volet Fichiers : l'arbre du dépôt, puis l'aperçu d'un fichier au clic. */
export default function FilesDock({ visible, width, dragging, onResizeStart, onClose }: FilesDockProps) {
  const { list, loading, error, refresh } = useRepoFiles(visible);
  const [openFile, setOpenFile] = useState<string | null>(null);

  return (
    <SidePane
      label="Fichiers"
      visible={visible}
      width={width}
      dragging={dragging}
      onResizeStart={onResizeStart}
      header={
        <>
          {openFile ? (
            <div className="flex min-w-0 items-center gap-1">
              <ToolbarButton title="Retour aux fichiers" onClick={() => setOpenFile(null)}>
                <ArrowLeft className="h-[17px] w-[17px]" strokeWidth={1.6} />
              </ToolbarButton>
              <span title={openFile} className="truncate text-[14px] text-[#e6e5df]">
                {baseName(openFile)}
              </span>
            </div>
          ) : (
            <div className="flex min-w-0 items-baseline gap-2 px-2">
              <span className="text-[14px] text-[#e6e5df]">Fichiers</span>
              {list && (
                <span className="truncate font-mono text-[12px] text-[#8a8982]">
                  {baseName(list.root)} · {list.files.length}
                  {list.truncated ? "+" : ""}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center gap-1">
            {!openFile && (
              <ToolbarButton title="Actualiser" onClick={() => void refresh()}>
                <RefreshCw
                  className={`h-[16px] w-[16px] ${loading ? "animate-spin" : ""}`}
                  strokeWidth={1.6}
                />
              </ToolbarButton>
            )}
            <ToolbarButton title="Fermer les fichiers" onClick={onClose}>
              <X className="h-[17px] w-[17px]" strokeWidth={1.6} />
            </ToolbarButton>
          </div>
        </>
      }
    >
      {openFile ? (
        <FilePreview path={openFile} />
      ) : error ? (
        <p className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
          {error}
        </p>
      ) : (
        list && <FileTree files={list.files} onOpen={setOpenFile} />
      )}
    </SidePane>
  );
}
