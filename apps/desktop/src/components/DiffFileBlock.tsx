import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DiffLine, FileDiff, FileStatus } from "../lib/gitDiff";

const STATUS: Record<FileStatus, { letter: string; label: string; color: string }> = {
  modified: { letter: "M", label: "Modifié", color: "text-[#e0b25f]" },
  added: { letter: "A", label: "Ajouté", color: "text-emerald-400" },
  deleted: { letter: "D", label: "Supprimé", color: "text-red-400" },
  renamed: { letter: "R", label: "Renommé", color: "text-[#6aa6e8]" },
};

const LINE_STYLE = {
  add: { row: "bg-emerald-500/10", sign: "text-emerald-400", mark: "+" },
  del: { row: "bg-red-500/10", sign: "text-red-400", mark: "-" },
  context: { row: "", sign: "text-transparent", mark: " " },
} as const;

/** Au-delà de ce nombre de lignes, un fichier démarre replié. */
const COLLAPSE_ABOVE = 600;

function Row({ line }: { line: DiffLine }) {
  const style = LINE_STYLE[line.kind];
  return (
    <div className={`flex ${style.row}`}>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-[#6c6b65]">{line.old_no}</span>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-[#6c6b65]">{line.new_no}</span>
      <span className={`w-4 shrink-0 select-none ${style.sign}`}>{style.mark}</span>
      <span className="whitespace-pre pr-4 text-[#d4d3cb]">{line.text}</span>
    </div>
  );
}

/** Un fichier modifié : son nom, ses compteurs et ses lignes. Se replie d'un clic. */
export default function DiffFileBlock({ file }: { file: FileDiff }) {
  const lineCount = file.hunks.reduce((sum, h) => sum + h.lines.length, 0);
  const [collapsed, setCollapsed] = useState(lineCount > COLLAPSE_ABOVE);
  const status = STATUS[file.status];
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? file.path.slice(slash + 1) : file.path;

  return (
    <section className="overflow-hidden rounded-xl border border-[#2e2e2b] bg-[#1c1c1a]">
      <button
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-[#232321]"
      >
        <ChevronDown
          className={`h-[14px] w-[14px] shrink-0 text-[#9a9992] transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
          strokeWidth={1.8}
        />
        <span title={status.label} className={`w-4 shrink-0 font-mono text-[12px] ${status.color}`}>
          {status.letter}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px]">
          <span className="text-[#8a8982]">{dir}</span>
          <span className="text-[#e6e5df]">{name}</span>
          {file.old_path && <span className="text-[#8a8982]"> ← {file.old_path}</span>}
        </span>
        <span className="shrink-0 font-mono text-[12px]">
          <span className="text-emerald-400">+{file.additions}</span>{" "}
          <span className="text-red-400">−{file.deletions}</span>
        </span>
      </button>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-[#2e2e2b] font-mono text-[12.5px] leading-[1.6] select-text">
          {file.binary ? (
            <p className="px-4 py-3 text-[#8a8982]">Fichier binaire ou trop volumineux.</p>
          ) : file.hunks.length === 0 ? (
            <p className="px-4 py-3 text-[#8a8982]">Aucune ligne modifiée (changement de mode ou de nom).</p>
          ) : (
            <div className="min-w-max py-1">
              {file.hunks.map((hunk) => (
                <div key={hunk.header}>
                  <div className="select-none bg-[#232321] px-3 py-0.5 text-[#8a8982]">{hunk.header}</div>
                  {hunk.lines.map((line, i) => (
                    <Row key={i} line={line} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
