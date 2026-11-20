import { Folder } from "lucide-react";
import type { OpenDoc, OpenTab } from "../hooks/useOpenFiles";
import DocPane from "./DocPane";

interface FileViewerProps {
  tabs: OpenTab[];
  activePath: string | null;
  docs: Record<string, OpenDoc>;
  /** Fichiers markdown affichés en texte source. */
  sourcePaths: Set<string>;
  onChange: (path: string, text: string) => void;
  onSave: (path: string) => void;
  onOverwrite: (path: string) => void;
  onReload: (path: string) => void;
}

/** Zone de gauche du volet : un éditeur par onglet ouvert (les autres restent montés, masqués). */
export default function FileViewer({
  tabs,
  activePath,
  docs,
  sourcePaths,
  onChange,
  onSave,
  onOverwrite,
  onReload,
}: FileViewerProps) {
  if (tabs.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <Folder className="mb-1 h-[22px] w-[22px] text-[#9a9992]" strokeWidth={1.5} />
        <p className="text-[14px] text-[#e6e5df]">Les fichiers ouverts apparaîtront ici</p>
        <p className="max-w-[300px] text-[13px] leading-[1.5] text-[#7e7d76]">
          Sélectionnez un fichier dans l'arborescence pour l'ouvrir et le modifier.
        </p>
      </div>
    );
  }

  return (
    <>
      {tabs.map((tab) => {
        const doc = docs[tab.path];
        const active = tab.path === activePath;
        return (
          <div key={tab.path} className={active ? "h-full" : "hidden"}>
            {doc && (
              <DocPane
                path={tab.path}
                doc={doc}
                active={active}
                source={sourcePaths.has(tab.path)}
                onChange={(text) => onChange(tab.path, text)}
                onSave={() => onSave(tab.path)}
                onOverwrite={() => onOverwrite(tab.path)}
                onReload={() => onReload(tab.path)}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
