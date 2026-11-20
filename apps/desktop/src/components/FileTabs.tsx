import { X } from "lucide-react";
import type { OpenTab } from "../hooks/useOpenFiles";
import { baseName } from "../lib/fileKinds";
import FileIcon from "./FileIcon";

interface FileTabsProps {
  tabs: OpenTab[];
  activePath: string | null;
  isDirty: (path: string) => boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

/** Onglets des fichiers ouverts. Un onglet d'aperçu est en italique ; un point marque un fichier modifié. */
export default function FileTabs({ tabs, activePath, isDirty, onSelect, onClose }: FileTabsProps) {
  if (tabs.length === 0) {
    return <span className="px-2 text-[14px] text-[#e6e5df]">Fichiers</span>;
  }

  return (
    <div role="tablist" className="flex min-w-0 items-center gap-1 overflow-x-auto">
      {tabs.map((tab) => {
        const active = tab.path === activePath;
        const dirty = isDirty(tab.path);
        return (
          <div
            key={tab.path}
            role="tab"
            aria-selected={active}
            className={`group flex h-8 shrink-0 items-center rounded-lg border text-[14px] transition ${
              active
                ? "border-[#3a3a37] bg-[#232321] text-[#f0efe9]"
                : "border-transparent text-[#8a8982] hover:text-[#e6e5df]"
            }`}
          >
            <button
              onClick={() => onSelect(tab.path)}
              title={tab.path}
              className={`flex h-full max-w-[210px] items-center gap-1.5 pl-3 pr-1.5 ${
                tab.preview ? "italic" : ""
              }`}
            >
              <FileIcon path={tab.path} className="h-[14px] w-[14px]" />
              <span className="truncate">{baseName(tab.path)}</span>
            </button>
            <button
              onClick={() => onClose(tab.path)}
              title={dirty ? "Fermer (modifications non enregistrées)" : "Fermer l'onglet"}
              className="mr-1.5 flex h-5 w-5 items-center justify-center rounded text-[#9a9992] transition hover:bg-[#383835] hover:text-[#f0efe9]"
            >
              {dirty ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-[#e0b25f] group-hover:hidden" />
                  <X className="hidden h-[14px] w-[14px] group-hover:block" strokeWidth={1.8} />
                </>
              ) : (
                <X className="h-[14px] w-[14px]" strokeWidth={1.8} />
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
