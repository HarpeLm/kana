import { ChevronsDownUp, Code, ListTree } from "lucide-react";
import FilesMenu from "./FilesMenu";
import ToolbarButton from "./ToolbarButton";

interface FileToolbarProps {
  /** Chemin du fichier affiché, s'il y en a un. */
  path: string | null;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  /** Un fichier markdown peut s'afficher mis en forme ou en texte source. */
  canToggleSource: boolean;
  sourceMode: boolean;
  onToggleSource: () => void;
  onCollapseAll: () => void;
  treeVisible: boolean;
  onToggleTree: () => void;
  onCopyPath: () => void;
  onRefresh: () => void;
}

/** Barre sous les onglets : chemin du fichier à gauche, actions à droite. */
export default function FileToolbar(p: FileToolbarProps) {
  return (
    <div className="flex h-[44px] shrink-0 items-center justify-between gap-3 border-b border-[#262623] px-4">
      <span title={p.path ?? ""} className="min-w-0 truncate text-[14px] text-[#8a8982]">
        {p.path}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {p.dirty && (
          <button
            onClick={p.onSave}
            disabled={p.saving}
            title="Enregistrer (⌘S)"
            className="mr-1 h-7 rounded-lg bg-[#d97757] px-3 text-[13px] font-medium text-[#181817] transition hover:bg-[#e38768] disabled:opacity-60"
          >
            {p.saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
        {p.canToggleSource && (
          <ToolbarButton
            title={p.sourceMode ? "Afficher le rendu" : "Afficher le source"}
            active={p.sourceMode}
            onClick={p.onToggleSource}
          >
            <Code className="h-[17px] w-[17px]" strokeWidth={1.6} />
          </ToolbarButton>
        )}
        <ToolbarButton title="Tout replier" onClick={p.onCollapseAll}>
          <ChevronsDownUp className="h-[17px] w-[17px]" strokeWidth={1.6} />
        </ToolbarButton>
        <ToolbarButton title="Afficher les fichiers" active={p.treeVisible} onClick={p.onToggleTree}>
          <ListTree className="h-[17px] w-[17px]" strokeWidth={1.6} />
        </ToolbarButton>
        <FilesMenu hasFile={p.path !== null} onCopyPath={p.onCopyPath} onRefresh={p.onRefresh} />
      </div>
    </div>
  );
}
