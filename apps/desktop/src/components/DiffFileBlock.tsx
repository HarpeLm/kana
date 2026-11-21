import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, MessageSquare, RotateCcw } from "lucide-react";
import type { DiffLine, FileDiff, FileStatus } from "../lib/gitDiff";

export interface DiffCommentTarget {
  hunkHeader: string;
  lineNo?: number | null;
  text: string;
}

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

const TOKEN_RE =
  /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:fn|pub|let|mut|const|struct|enum|impl|trait|use|mod|async|await|return|if|else|match|for|while|loop|function|export|import|from|type|interface|class|def|try|catch|throw|true|false|null|None|Some|Ok|Err|self|Self)\b|\b\d+(?:\.\d+)?\b)/g;

function highlightCode(text: string): ReactNode {
  if (!text) return " ";
  const parts: ReactNode[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;
  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push(<Fragment key={`t-${idx++}`}>{text.slice(last, match.index)}</Fragment>);
    }
    const token = match[0];
    let cls = "text-[#d4d3cb]";
    if (token.startsWith("//") || token.startsWith("/*")) {
      cls = "text-[#7f848e] italic";
    } else if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
      cls = "text-[#98c379]";
    } else if (/^\d/.test(token)) {
      cls = "text-[#d19a66]";
    } else {
      cls = "text-[#c678dd]";
    }
    parts.push(
      <span key={`k-${idx++}`} className={cls}>
        {token}
      </span>,
    );
    last = match.index + token.length;
  }
  if (last < text.length) {
    parts.push(<Fragment key={`t-${idx++}`}>{text.slice(last)}</Fragment>);
  }
  return parts.length > 0 ? parts : text;
}

interface SplitRow {
  left: DiffLine | null;
  right: DiffLine | null;
}

function pairSplitLines(lines: DiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === "context") {
      rows.push({ left: line, right: line });
      i += 1;
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    while (i < lines.length && lines[i].kind === "del") {
      dels.push(lines[i]);
      i += 1;
    }
    while (i < lines.length && lines[i].kind === "add") {
      adds.push(lines[i]);
      i += 1;
    }
    const count = Math.max(dels.length, adds.length);
    for (let k = 0; k < count; k += 1) {
      rows.push({ left: dels[k] ?? null, right: adds[k] ?? null });
    }
  }
  return rows;
}

function CommentForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-y border-[#343431] bg-[#20201e] p-2.5 font-sans">
      <textarea
        rows={2}
        autoFocus
        aria-label="Commentaire sur le diff"
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) onSubmit();
        }}
        placeholder="Demander une correction à l'agent sur ce passage…"
        className="w-full resize-none rounded-lg border border-[#3a3a37] bg-[#181817] px-2.5 py-1.5 text-[12.5px] text-[#ecebe4] placeholder-[#7e7d76] outline-none focus:border-[#55554f]"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#dcdbd3] hover:bg-[#3a3a36]"
        >
          Annuler
        </button>
        <button
          type="button"
          disabled={!draft.trim()}
          onClick={onSubmit}
          className="rounded-lg bg-[#1e40af] px-3 py-1 text-[12px] font-medium text-[#f8fafc] hover:bg-[#2563eb] disabled:opacity-40"
        >
          Envoyer à l'agent
        </button>
      </div>
    </div>
  );
}

function Row({
  line,
  onComment,
}: {
  line: DiffLine;
  onComment?: () => void;
}) {
  const style = LINE_STYLE[line.kind];
  return (
    <div className={`group/line flex items-start ${style.row}`}>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-[#6c6b65]">{line.old_no}</span>
      <span className="w-10 shrink-0 select-none pr-2 text-right text-[#6c6b65]">{line.new_no}</span>
      <span className={`w-4 shrink-0 select-none ${style.sign}`}>{style.mark}</span>
      <span className="min-w-0 flex-1 whitespace-pre pr-2 text-[#d4d3cb]">{highlightCode(line.text)}</span>
      {onComment && (
        <button
          type="button"
          onClick={onComment}
          title="Commenter cette ligne"
          aria-label="Commenter cette ligne"
          className="mr-2 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#8c8b83] opacity-0 transition group-hover/line:opacity-100 focus:opacity-100 hover:bg-[#2f2f2c] hover:text-[#ecebe4]"
        >
          <MessageSquare className="h-3 w-3" strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

function SplitCell({
  line,
  side,
  onComment,
}: {
  line: DiffLine | null;
  side: "left" | "right";
  onComment?: () => void;
}) {
  if (!line) {
    return <div className="flex min-w-0 flex-1 bg-[#191917] px-2 text-[#55554f]">&nbsp;</div>;
  }
  const style = LINE_STYLE[line.kind];
  const lineNo = side === "left" ? line.old_no : line.new_no;
  return (
    <div className={`group/line flex min-w-0 flex-1 items-start ${style.row}`}>
      <span className="w-9 shrink-0 select-none pr-2 text-right text-[#6c6b65]">{lineNo}</span>
      <span className={`w-3.5 shrink-0 select-none ${style.sign}`}>{style.mark}</span>
      <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-1 text-[#d4d3cb]">{highlightCode(line.text)}</span>
      {onComment && (
        <button
          type="button"
          onClick={onComment}
          title="Commenter cette ligne"
          aria-label="Commenter cette ligne"
          className="mr-1 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[#8c8b83] opacity-0 transition group-hover/line:opacity-100 focus:opacity-100 hover:bg-[#2f2f2c] hover:text-[#ecebe4]"
        >
          <MessageSquare className="h-3 w-3" strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}

/** Un fichier modifié : son nom, ses compteurs, ses actions accepter/rejeter et ses lignes. */
export default function DiffFileBlock({
  file,
  viewMode = "unified",
  signal,
  focusId,
  accepted = false,
  acceptedHunks,
  onAcceptFile,
  onRejectFile,
  onAcceptHunk,
  onRejectHunk,
  onComment,
}: {
  file: FileDiff;
  viewMode?: "unified" | "split";
  /** Replier / déplier tous les fichiers d'un coup. */
  signal?: { id: number; collapsed: boolean };
  /** Change quand on demande ce fichier : on le déplie et on l'amène à l'écran. */
  focusId?: number;
  accepted?: boolean;
  acceptedHunks?: Set<string>;
  onAcceptFile?: () => void;
  onRejectFile?: () => void;
  onAcceptHunk?: (hunkHeader: string) => void;
  onRejectHunk?: (hunkHeader: string) => void;
  onComment?: (file: string, target: DiffCommentTarget, comment: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const lineCount = file.hunks.reduce((sum, h) => sum + h.lines.length, 0);
  const [collapsed, setCollapsed] = useState(lineCount > COLLAPSE_ABOVE);
  const [commenting, setCommenting] = useState<{ key: string; target: DiffCommentTarget } | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (signal) setCollapsed(signal.collapsed);
  }, [signal?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focusId === undefined) return;
    setCollapsed(false);
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }, [focusId]);

  const status = STATUS[file.status];
  const slash = file.path.lastIndexOf("/");
  const dir = slash >= 0 ? file.path.slice(0, slash + 1) : "";
  const name = slash >= 0 ? file.path.slice(slash + 1) : file.path;

  const openComment = (key: string, target: DiffCommentTarget) => {
    setCommenting({ key, target });
    setDraft("");
  };

  const submitComment = () => {
    if (!commenting || !draft.trim() || !onComment) return;
    onComment(file.path, commenting.target, draft.trim());
    setCommenting(null);
    setDraft("");
  };

  return (
    <section
      ref={ref}
      className={`rounded-xl border bg-[#1c1c1a] ${accepted ? "border-emerald-500/40" : "border-[#2e2e2b]"}`}
    >
      <div className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-t-xl bg-[#1f1f1d] px-3 py-2 transition hover:bg-[#242422]">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
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

        <div className="flex shrink-0 items-center gap-1">
          {accepted && (
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[11px] text-emerald-300">
              Accepté
            </span>
          )}
          {onAcceptFile && (
            <button
              type="button"
              onClick={onAcceptFile}
              title="Accepter ce fichier"
              aria-label={`Accepter ${file.path}`}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] transition ${
                accepted
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-[#2c2c29] text-[#cfcec6] hover:bg-[#383834]"
              }`}
            >
              <Check className="h-3 w-3" strokeWidth={2} />
              <span>Accepter</span>
            </button>
          )}
          {onRejectFile && (
            <button
              type="button"
              onClick={onRejectFile}
              title="Rejeter et annuler ce fichier"
              aria-label={`Rejeter ${file.path}`}
              className="flex items-center gap-1 rounded-md bg-[#2c2c29] px-1.5 py-0.5 text-[11.5px] text-[#f4a99b] transition hover:bg-[#4a2622]"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.8} />
              <span>Rejeter</span>
            </button>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto border-t border-[#2e2e2b] font-mono text-[12.5px] leading-[1.6] select-text">
          {file.binary ? (
            <p className="px-4 py-3 text-[#8a8982]">Fichier binaire ou trop volumineux.</p>
          ) : file.hunks.length === 0 ? (
            <p className="px-4 py-3 text-[#8a8982]">Aucune ligne modifiée (changement de mode ou de nom).</p>
          ) : (
            <div className={viewMode === "split" ? "w-full py-1" : "min-w-max py-1"}>
              {file.hunks.map((hunk) => {
                const hunkKey = `hunk:${hunk.header}`;
                const hunkAccepted = accepted || !!acceptedHunks?.has(hunk.header);
                const splitRows = viewMode === "split" ? pairSplitLines(hunk.lines) : [];
                return (
                  <div key={hunk.header}>
                    <div className="flex select-none items-center gap-2 bg-[#232321] px-3 py-1 text-[11.5px] text-[#8a8982]">
                      <span className="min-w-0 flex-1 truncate">{hunk.header}</span>
                      {hunkAccepted && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-sans text-[10.5px] text-emerald-300">
                          Bloc accepté
                        </span>
                      )}
                      {onAcceptHunk && (
                        <button
                          type="button"
                          onClick={() => onAcceptHunk(hunk.header)}
                          className="rounded bg-[#2e2e2b] px-1.5 py-0.5 font-sans text-[11px] text-[#dcdbd3] hover:bg-[#3a3a36]"
                        >
                          Accepter ce bloc
                        </button>
                      )}
                      {onRejectHunk && (
                        <button
                          type="button"
                          onClick={() => onRejectHunk(hunk.header)}
                          className="rounded bg-[#2e2e2b] px-1.5 py-0.5 font-sans text-[11px] text-[#f4a99b] hover:bg-[#4a2622]"
                        >
                          Rejeter ce bloc
                        </button>
                      )}
                      {onComment && (
                        <button
                          type="button"
                          onClick={() =>
                            openComment(hunkKey, {
                              hunkHeader: hunk.header,
                              lineNo: null,
                              text: hunk.lines.map((l) => l.text).join("\n"),
                            })
                          }
                          title="Commenter ce bloc"
                          aria-label="Commenter ce bloc"
                          className="flex h-5 w-5 items-center justify-center rounded text-[#9a9992] hover:bg-[#333330] hover:text-[#ecebe4]"
                        >
                          <MessageSquare className="h-3 w-3" strokeWidth={1.8} />
                        </button>
                      )}
                    </div>

                    {commenting?.key === hunkKey && (
                      <CommentForm
                        draft={draft}
                        onChange={setDraft}
                        onSubmit={submitComment}
                        onCancel={() => setCommenting(null)}
                      />
                    )}

                    {viewMode === "unified"
                      ? hunk.lines.map((line, i) => {
                          const rowKey = `line:${hunk.header}:${i}`;
                          const lineNo = line.new_no ?? line.old_no;
                          return (
                            <Fragment key={i}>
                              <Row
                                line={line}
                                onComment={
                                  onComment
                                    ? () =>
                                        openComment(rowKey, {
                                          hunkHeader: hunk.header,
                                          lineNo,
                                          text: line.text,
                                        })
                                    : undefined
                                }
                              />
                              {commenting?.key === rowKey && (
                                <CommentForm
                                  draft={draft}
                                  onChange={setDraft}
                                  onSubmit={submitComment}
                                  onCancel={() => setCommenting(null)}
                                />
                              )}
                            </Fragment>
                          );
                        })
                      : splitRows.map((pair, i) => {
                          const rowKey = `split:${hunk.header}:${i}`;
                          return (
                            <Fragment key={i}>
                              <div className="flex divide-x divide-[#2e2e2b]">
                                <SplitCell
                                  line={pair.left}
                                  side="left"
                                  onComment={
                                    onComment && pair.left
                                      ? () =>
                                          openComment(rowKey, {
                                            hunkHeader: hunk.header,
                                            lineNo: pair.left?.old_no ?? null,
                                            text: pair.left!.text,
                                          })
                                      : undefined
                                  }
                                />
                                <SplitCell
                                  line={pair.right}
                                  side="right"
                                  onComment={
                                    onComment && pair.right
                                      ? () =>
                                          openComment(rowKey, {
                                            hunkHeader: hunk.header,
                                            lineNo: pair.right?.new_no ?? null,
                                            text: pair.right!.text,
                                          })
                                      : undefined
                                  }
                                />
                              </div>
                              {commenting?.key === rowKey && (
                                <CommentForm
                                  draft={draft}
                                  onChange={setDraft}
                                  onSubmit={submitComment}
                                  onCancel={() => setCommenting(null)}
                                />
                              )}
                            </Fragment>
                          );
                        })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
