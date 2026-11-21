import { useEffect, useState } from "react";
import { Activity, Check, Copy, Download, Trash2, X } from "lucide-react";
import type { ChatMessage } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import { tr, useLocale } from "../lib/i18n";
import {
  clearTraceFrames,
  conversationToJson,
  conversationToMarkdown,
  downloadExport,
  exportFileName,
  useTraceFrames,
  type TraceDirection,
} from "../lib/observability";

interface InspectorModalProps {
  open: boolean;
  conversation: Conversation;
  messages: ChatMessage[];
  onClose: () => void;
}

const clock = (at: number, lang: "fr" | "en") =>
  new Date(at).toLocaleTimeString(lang === "en" ? "en-US" : "fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const BADGE_STYLE: Record<TraceDirection, string> = {
  out: "bg-[#2f6bd8]/20 text-[#8ab4f8]",
  in: "bg-emerald-500/15 text-emerald-300",
  mcp: "bg-amber-500/15 text-amber-300",
};

export default function InspectorModal({ open, conversation, messages, onClose }: InspectorModalProps) {
  const locale = useLocale();
  const frames = useTraceFrames();
  const [filter, setFilter] = useState<TraceDirection | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setExportNotice("");
      setCopied(false);
    }
  }, [open]);

  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const visible = [...frames]
    .reverse()
    .filter((frame) => {
      if (filter !== "all" && frame.direction !== filter) return false;
      if (!needle) return true;
      return (
        frame.method.toLowerCase().includes(needle) ||
        (frame.summary ?? "").toLowerCase().includes(needle) ||
        (frame.threadId ?? "").toLowerCase().includes(needle)
      );
    });
  const activeFrame = visible.find((f) => f.id === selectedId) ?? visible[0] ?? null;

  const handleExportMd = () => {
    const content = conversationToMarkdown(conversation, messages, locale);
    const filename = exportFileName(conversation.title, "md");
    downloadExport(filename, content, "text/markdown;charset=utf-8");
    setExportNotice(tr(`Export Markdown prêt (${filename}).`, `Markdown export ready (${filename}).`, locale));
  };

  const handleExportJson = () => {
    const content = conversationToJson(conversation, messages);
    const filename = exportFileName(conversation.title, "json");
    downloadExport(filename, content, "application/json;charset=utf-8");
    setExportNotice(tr(`Export JSON prêt (${filename}).`, `JSON export ready (${filename}).`, locale));
  };

  const handleCopyMd = async () => {
    const content = conversationToMarkdown(conversation, messages, locale);
    try {
      await navigator.clipboard?.writeText(content);
    } catch {
      // presse-papiers indisponible dans certains navigateurs headless
    }
    setCopied(true);
    setExportNotice(tr("Conversation copiée en Markdown.", "Conversation copied as Markdown.", locale));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr("Inspecteur ACP/MCP & Export", "ACP/MCP Inspector & Export", locale)}
        className="flex h-[82vh] w-full max-w-[920px] flex-col overflow-hidden rounded-2xl border border-[#3a3a37] bg-[#21211f] text-[#e6e5df] shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
      >
        <div className="flex items-center justify-between border-b border-[#2f2f2c] px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-[#d97757]" strokeWidth={1.8} />
            <h2 className="text-[15px] font-semibold text-[#ecebe4]">
              {tr("Inspecteur ACP/MCP & Export", "ACP/MCP Inspector & Export", locale)}
            </h2>
            <span className="rounded-full bg-[#2e2e2b] px-2 py-0.5 text-[11.5px] text-[#9a9992]">
              {frames.length} {tr("trames", "frames", locale)}
            </span>
          </div>
          <button
            type="button"
            aria-label={tr("Fermer", "Close", locale)}
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#a3a29a] transition hover:bg-[#2f2f2c] hover:text-[#ecebe4]"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2f2f2c] bg-[#1c1c1a] px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-[#ecebe4]">
              {tr("Exporter la conversation :", "Export conversation:", locale)}{" "}
              <span className="text-[#b5b4ac]">{conversation.title}</span>
            </p>
            {exportNotice && <p className="mt-0.5 text-[12px] text-[#8ce09b]">{exportNotice}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportMd}
              className="flex items-center gap-1.5 rounded-lg bg-[#d97757] px-3 py-1.5 text-[12px] font-medium text-[#181817] transition hover:bg-[#e38768]"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
              <span>{tr("Exporter Markdown (.md)", "Export Markdown (.md)", locale)}</span>
            </button>
            <button
              type="button"
              onClick={handleExportJson}
              className="flex items-center gap-1.5 rounded-lg bg-[#2e2e2b] px-3 py-1.5 text-[12px] font-medium text-[#ecebe4] transition hover:bg-[#3a3a36]"
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.8} />
              <span>{tr("Exporter JSON (.json)", "Export JSON (.json)", locale)}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyMd()}
              className="flex items-center gap-1.5 rounded-lg border border-[#363632] px-3 py-1.5 text-[12px] text-[#dcdbd3] transition hover:bg-[#2b2b29]"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{tr("Copier Markdown", "Copy Markdown", locale)}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#2f2f2c] px-5 py-2.5">
          <div className="flex items-center gap-1">
            {(["all", "out", "in", "mcp"] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setFilter(kind)}
                className={`rounded-lg px-2.5 py-1 text-[12px] transition ${
                  filter === kind
                    ? "bg-[#383834] text-[#ecebe4]"
                    : "text-[#8c8b83] hover:bg-[#2b2b29] hover:text-[#dcdbd3]"
                }`}
              >
                {kind === "all"
                  ? tr("Toutes", "All", locale)
                  : kind === "out"
                    ? tr("Sortant (out)", "Outgoing (out)", locale)
                    : kind === "in"
                      ? tr("Entrant (in)", "Incoming (in)", locale)
                      : "MCP"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("Filtrer par méthode ou contenu…", "Filter by method or content…", locale)}
              aria-label={tr("Filtrer les trames", "Filter frames", locale)}
              className="w-56 rounded-lg border border-[#343431] bg-[#181817] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#7e7d76] outline-none focus:border-[#55554f] select-text"
            />
            <button
              type="button"
              onClick={clearTraceFrames}
              disabled={frames.length === 0}
              className="flex items-center gap-1 rounded-lg bg-[#2e2e2b] px-2.5 py-1 text-[12px] text-[#dcdbd3] transition hover:bg-[#3a3a36] disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
              <span>{tr("Vider", "Clear", locale)}</span>
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div className="w-1/2 overflow-y-auto border-r border-[#2f2f2c] p-2">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-[#7e7d76]">
                {tr("Aucune trame enregistrée pour l'instant.", "No frames recorded yet.", locale)}
              </p>
            ) : (
              <div className="space-y-1">
                {visible.map((frame) => {
                  const active = activeFrame?.id === frame.id;
                  return (
                    <button
                      key={frame.id}
                      type="button"
                      onClick={() => setSelectedId(frame.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition ${
                        active ? "bg-[#32322f] text-[#ecebe4]" : "text-[#c4c3bc] hover:bg-[#282825]"
                      }`}
                    >
                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10.5px] uppercase ${BADGE_STYLE[frame.direction]}`}>
                        {frame.direction}
                      </span>
                      <span className="shrink-0 font-mono text-[12px] font-medium text-[#ecebe4]">{frame.method}</span>
                      {frame.summary && <span className="min-w-0 flex-1 truncate text-[#8c8b83]">{frame.summary}</span>}
                      <span className="shrink-0 font-mono text-[11px] text-[#6f6e68]">{clock(frame.at, locale)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="w-1/2 overflow-y-auto bg-[#181817] p-4 select-text">
            {activeFrame ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[12px] text-[#8c8b83]">
                  <span className="font-mono text-[#ecebe4]">
                    [{activeFrame.direction}] {activeFrame.method}
                  </span>
                  <span>{clock(activeFrame.at, locale)}</span>
                </div>
                {activeFrame.threadId && (
                  <p className="font-mono text-[11.5px] text-[#8c8b83]">thread: {activeFrame.threadId}</p>
                )}
                <pre className="overflow-auto whitespace-pre-wrap rounded-xl border border-[#2c2c29] bg-[#1e1e1c] p-3 font-mono text-[12px] leading-relaxed text-[#dcdbd3]">
                  {JSON.stringify(activeFrame.payload ?? { summary: activeFrame.summary }, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-[12.5px] text-[#7e7d76]">
                {tr("Sélectionne une trame pour inspecter son contenu JSON.", "Select a frame to inspect its JSON payload.", locale)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
