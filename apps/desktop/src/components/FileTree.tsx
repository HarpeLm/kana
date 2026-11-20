import { useMemo, useState } from "react";
import { ChevronRight, File, Folder, Search } from "lucide-react";
import { buildTree, filterPaths, visibleRows } from "../lib/fileTree";

interface FileTreeProps {
  files: string[];
  onOpen: (path: string) => void;
}

const ROW = "flex h-7 w-full items-center gap-1.5 rounded-lg pr-3 text-left text-[13px] transition hover:bg-[#262624]";
const ICON = "h-[15px] w-[15px] shrink-0 text-[#9a9992]";

/** Arbre des fichiers, avec un filtre qui remplace l'arbre par la liste des correspondances. */
export default function FileTree({ files, onOpen }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildTree(files), [files]);
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded]);
  const matches = useMemo(() => filterPaths(files, query), [files, query]);
  const filtering = query.trim() !== "";

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-1 pt-3">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-[#343430] bg-[#1d1d1b] px-2.5 focus-within:border-[#4a4a44]">
          <Search className={ICON} strokeWidth={1.6} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer les fichiers"
            aria-label="Filtrer les fichiers"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[#ecebe4] placeholder-[#6c6b65] outline-none select-text"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 pt-1">
        {filtering ? (
          <>
            {matches.length === 0 && (
              <p className="px-2 pt-4 text-[13px] text-[#7e7d76]">Aucun fichier trouvé.</p>
            )}
            {matches.map((path) => {
              const slash = path.lastIndexOf("/");
              return (
                <button key={path} onClick={() => onOpen(path)} className={`${ROW} pl-2`}>
                  <File className={ICON} strokeWidth={1.6} />
                  <span className="truncate">
                    <span className="text-[#8a8982]">{slash >= 0 ? path.slice(0, slash + 1) : ""}</span>
                    <span className="text-[#e6e5df]">{path.slice(slash + 1)}</span>
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          rows.map(({ node, depth }) => (
            <button
              key={node.path}
              onClick={() => (node.isDir ? toggle(node.path) : onOpen(node.path))}
              style={{ paddingLeft: 8 + depth * 14 }}
              className={ROW}
            >
              {node.isDir ? (
                <ChevronRight
                  className={`h-[13px] w-[13px] shrink-0 text-[#9a9992] transition-transform ${
                    expanded.has(node.path) ? "rotate-90" : ""
                  }`}
                  strokeWidth={1.8}
                />
              ) : (
                <span className="w-[13px] shrink-0" />
              )}
              {node.isDir ? (
                <Folder className={ICON} strokeWidth={1.6} />
              ) : (
                <File className={ICON} strokeWidth={1.6} />
              )}
              <span className={`truncate ${node.isDir ? "text-[#e6e5df]" : "text-[#cfcec6]"}`}>
                {node.name}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
