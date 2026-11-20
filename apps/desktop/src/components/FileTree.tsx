import { useEffect, useMemo, useState } from "react";
import { ChevronRight, File, FileCode, FileText, Search } from "lucide-react";
import { buildTree, filterPaths, visibleRows } from "../lib/fileTree";
import type { ChangeStatus, ChangedFile } from "../lib/files";
import { languageOf } from "../lib/fileKinds";

interface FileTreeProps {
  files: string[];
  changes: ChangedFile[];
  /** Fichier affiché dans l'éditeur. */
  activePath: string | null;
  /** Un clic ouvre en aperçu, un double clic garde le fichier ouvert (`pin`). */
  onOpen: (path: string, pin: boolean) => void;
  /** Augmenter cette valeur replie tous les dossiers. */
  collapseSignal: number;
}

const ROW =
  "flex h-7 w-full items-center gap-1.5 rounded-lg pr-3 text-left text-[13px] transition hover:bg-[#262624]";
const ICON = "h-[15px] w-[15px] shrink-0";

const STATUS_COLOR: Record<ChangeStatus, string> = {
  added: "text-[#7fc08c]",
  modified: "text-[#e0b25f]",
  renamed: "text-[#6aa6e8]",
  deleted: "text-red-400",
};
const STATUS_DOT: Record<ChangeStatus, string> = {
  added: "bg-[#7fc08c]",
  modified: "bg-[#e0b25f]",
  renamed: "bg-[#6aa6e8]",
  deleted: "bg-red-400",
};

function FileIcon({ path }: { path: string }) {
  const language = languageOf(path);
  if (language === "markdown") return <FileText className={`${ICON} text-[#9a9992]`} strokeWidth={1.6} />;
  if (language === "plain") return <File className={`${ICON} text-[#9a9992]`} strokeWidth={1.6} />;
  return <FileCode className={`${ICON} text-[#9a9992]`} strokeWidth={1.6} />;
}

/** Arbre des fichiers. Les fichiers modifiés sont colorés, et leurs dossiers portent un point. */
export default function FileTree({ files, changes, activePath, onOpen, collapseSignal }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const tree = useMemo(() => buildTree(files), [files]);
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded]);
  const matches = useMemo(() => filterPaths(files, query), [files, query]);
  const filtering = query.trim() !== "";

  useEffect(() => setExpanded(new Set()), [collapseSignal]);

  // Statut d'un fichier modifié, et statut « dominant » de chaque dossier qui en contient.
  const { byFile, byFolder } = useMemo(() => {
    const byFile = new Map<string, ChangeStatus>();
    const byFolder = new Map<string, ChangeStatus>();
    for (const { path, status } of changes) {
      byFile.set(path, status);
      const parts = path.split("/");
      for (let i = 1; i < parts.length; i++) {
        const folder = parts.slice(0, i).join("/");
        // « ajouté » l'emporte sur les autres statuts ; sinon le premier rencontré reste.
        const current = byFolder.get(folder);
        if (current !== "added" && (status === "added" || current === undefined)) {
          byFolder.set(folder, status);
        }
      }
    }
    return { byFile, byFolder };
  }, [changes]);

  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const rowClass = (path: string) => `${ROW} ${path === activePath ? "bg-[#2a2a27]" : ""}`;

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-1 pt-3">
        <div className="flex h-8 items-center gap-2 rounded-lg border border-[#343430] bg-[#1d1d1b] px-2.5 focus-within:border-[#4a4a44]">
          <Search className={`${ICON} text-[#9a9992]`} strokeWidth={1.6} />
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
              const status = byFile.get(path);
              return (
                <button
                  key={path}
                  onClick={() => onOpen(path, false)}
                  onDoubleClick={() => onOpen(path, true)}
                  className={`${rowClass(path)} pl-2`}
                >
                  <FileIcon path={path} />
                  <span className="truncate">
                    <span className="text-[#8a8982]">{slash >= 0 ? path.slice(0, slash + 1) : ""}</span>
                    <span className={status ? STATUS_COLOR[status] : "text-[#e6e5df]"}>
                      {path.slice(slash + 1)}
                    </span>
                  </span>
                </button>
              );
            })}
          </>
        ) : (
          rows.map(({ node, depth }) => {
            const status = node.isDir ? byFolder.get(node.path) : byFile.get(node.path);
            return (
              <button
                key={node.path}
                onClick={() => (node.isDir ? toggle(node.path) : onOpen(node.path, false))}
                onDoubleClick={() => !node.isDir && onOpen(node.path, true)}
                style={{ paddingLeft: 8 + depth * 14 }}
                className={rowClass(node.path)}
              >
                {node.isDir ? (
                  <ChevronRight
                    className={`h-[13px] w-[13px] shrink-0 text-[#9a9992] transition-transform ${
                      expanded.has(node.path) ? "rotate-90" : ""
                    }`}
                    strokeWidth={1.8}
                  />
                ) : (
                  <FileIcon path={node.path} />
                )}
                <span
                  className={`min-w-0 flex-1 truncate ${
                    status ? STATUS_COLOR[status] : node.isDir ? "text-[#e6e5df]" : "text-[#cfcec6]"
                  }`}
                >
                  {node.name}
                </span>
                {node.isDir && status && (
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
