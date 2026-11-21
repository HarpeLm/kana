import { useState, type ReactNode } from "react";
import { Bot, Compass, GitCompare, Plus, Trash2 } from "lucide-react";
import type { CrossReviewPipelineState } from "../AdvisorModal";
import type { Conversation } from "../../lib/conversations";
import {
  addProjectMemory,
  getProjectMemory,
  removeProjectMemory,
  useProjectMemoryVersion,
} from "../../lib/projects";
import { contextWindowFor, useModelWindowsVersion } from "../../lib/contextWindow";
import { AGENTS } from "../../data";
import { tr, useLocale } from "../../lib/i18n";
import {
  EMPTY_USAGE,
  formatCostUsd,
  formatTokens,
  problemOf,
  totalCostTodayUsd,
  usageForProject,
  usageForSession,
  usageToday,
  useUsageVersion,
} from "../../lib/usage";

function Section({ title, count, compact, children }: { title: string; count?: number; compact?: boolean; children: ReactNode }) {
  return (
    <section
      className={`flex flex-col border-t border-[#2f2f2c] py-3 first:border-t-0 first:pt-0 last:pb-0 ${
        compact ? "shrink-0" : "min-h-[132px] flex-1 basis-0"
      }`}
    >
      <h3 className="mb-2 flex shrink-0 items-baseline gap-2 text-[13px] text-[#9a9992]">
        {title}
        {count !== undefined && count > 0 && <span className="text-[12px] text-[#6f6e68]">{count}</span>}
      </h3>
      <div className={compact ? "" : "min-h-0 flex-1 overflow-y-auto"}>{children}</div>
    </section>
  );
}

function Row({
  icon,
  children,
  trailing,
  onClick,
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  const content = (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#9a9992]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {trailing}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left text-[14px] text-[#ecebe4]";
  return onClick ? (
    <button onClick={onClick} title={title} className={`${cls} transition hover:bg-[#2a2a28]`}>
      {content}
    </button>
  ) : (
    <div title={title} className={cls}>
      {content}
    </div>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-1 py-1 text-[13px] text-[#6f6e68]">{children}</p>;

interface SessionMemoryUsageCardProps {
  conversation: Conversation;
  projectPath: string | undefined;
  context: { used: number; size: number; estimated?: boolean } | null;
  agentId: string;
  onOpenRelay: () => void;
  onCompact: () => void;
  canCompact: boolean;
  subagents: Array<{
    conversation: Conversation;
    status: "running" | "done" | "error" | "idle";
  }>;
  onSpawnSubagent: (roleLabel: string, prompt: string, readOnly?: boolean) => void;
  onOpenSubagent: (id: string) => void;
  onOpenAdvisor?: () => void;
  crossReview?: CrossReviewPipelineState | null;
}

export default function SessionMemoryUsageCard({
  conversation,
  projectPath,
  context: reportedContext,
  agentId,
  onOpenRelay,
  onCompact,
  canCompact,
  subagents,
  onOpenSubagent,
  onOpenAdvisor,
  crossReview,
}: SessionMemoryUsageCardProps) {
  const [compacted, setCompacted] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState("");
  useUsageVersion();
  useProjectMemoryVersion();
  useModelWindowsVersion();
  const locale = useLocale();

  const context = reportedContext?.estimated
    ? { ...reportedContext, size: contextWindowFor(conversation.modelId, agentId) }
    : reportedContext;
  const memoryNotes = projectPath ? getProjectMemory(projectPath) : [];

  return (
    <>
      <Section title={tr("Consommation", "Usage", locale)} compact>
        <div className="px-1 pb-2">
          <div className="flex items-baseline justify-between text-[13px] text-[#ecebe4]">
            <span>{tr("Contexte", "Context", locale)}</span>
            <span className="text-[#8c8b83]">
              {context
                ? `${context.estimated ? "≈ " : ""}${formatTokens(context.used)} / ${formatTokens(context.size)} ${tr("jetons", "tokens", locale)}`
                : tr("pas encore mesuré", "not measured yet", locale)}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#30302d]">
            <div
              className={`h-full rounded-full ${context && context.used / context.size > 0.85 ? "bg-[#f85149]" : "bg-[#4a9bff]"}`}
              style={{ width: `${context ? Math.min(100, Math.max(1, (context.used / context.size) * 100)) : 0}%` }}
            />
          </div>
        </div>
        {(() => {
          const sessionUsage = usageForSession(conversation.id);
          const projectUsage = projectPath ? usageForProject(projectPath) : EMPTY_USAGE;
          const todayCost = totalCostTodayUsd();
          const hasCache = sessionUsage.cacheReadTokens > 0 || sessionUsage.cacheWriteTokens > 0;
          return (
            <div className="mb-2 space-y-1 rounded-xl border border-[#2f2f2c] bg-[#1b1b19] px-2.5 py-2 text-[12px]">
              <div className="flex items-center justify-between text-[#dcdbd3]">
                <span>{tr("Coût session", "Session cost", locale)}</span>
                <span className="font-mono text-[#ecebe4]">{formatCostUsd(sessionUsage.costUsd)}</span>
              </div>
              {hasCache && (
                <div className="flex items-center justify-between text-[11.5px] text-[#8c8b83]">
                  <span>{tr("Cache (lecture / écriture)", "Cache (read / write)", locale)}</span>
                  <span className="font-mono">
                    {formatTokens(sessionUsage.cacheReadTokens)} / {formatTokens(sessionUsage.cacheWriteTokens)}
                  </span>
                </div>
              )}
              {projectPath && (
                <div className="flex items-center justify-between text-[#8c8b83]">
                  <span>{tr("Coût projet", "Project cost", locale)}</span>
                  <span className="font-mono text-[#c4c3bc]">{formatCostUsd(projectUsage.costUsd)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-[#8c8b83]">
                <span>{tr("Coût du jour", "Today's cost", locale)}</span>
                <span className="font-mono text-[#c4c3bc]">{formatCostUsd(todayCost)}</span>
              </div>
            </div>
          );
        })()}
        <div className="flex items-center gap-3 px-1 pb-2">
          <span className="min-w-0 flex-1 truncate text-[12.5px] text-[#8c8b83]">
            {compacted
              ? tr("Compactée ✓", "Compacted ✓", locale)
              : context
                ? `${formatTokens(Math.max(0, context.size - context.used))} ${tr("jetons avant saturation", "tokens before full", locale)}`
                : tr("Libère la mémoire de l'agent", "Free agent memory", locale)}
          </span>
          <button
            onClick={() => {
              onCompact();
              setCompacted(true);
              setTimeout(() => setCompacted(false), 4000);
            }}
            disabled={!canCompact}
            title={tr(
              "Éteint l'agent et le relance avec un résumé de la conversation : tes messages restent affichés",
              "Stops the agent and restarts with a conversation summary: messages remain visible",
              locale,
            )}
            className="shrink-0 rounded-lg bg-[#333331] px-3 py-1 text-[12.5px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40 disabled:hover:bg-[#333331]"
          >
            {tr("Compacter la session", "Compact session", locale)}
          </button>
        </div>
        {AGENTS.map((agent) => {
          const usage = usageToday(agent.id);
          const problem = problemOf(agent.id);
          const hasCache = usage.cacheReadTokens > 0 || usage.cacheWriteTokens > 0;
          const detail = problem
            ? problem.kind === "limit"
              ? tr("limite", "limit", locale)
              : tr("connexion", "auth", locale)
            : usage.totalTokens > 0
              ? `${formatTokens(usage.totalTokens)} · ${formatCostUsd(usage.costUsd)}`
              : usage.turns > 0
                ? `${usage.turns} ${tr("rép.", "rep.", locale)}`
                : "—";
          return (
            <Row
              key={agent.id}
              onClick={onOpenRelay}
              title={
                hasCache
                  ? `${tr("Ouvrir les réglages du relais", "Open relay settings", locale)} · cache ${formatTokens(usage.cacheReadTokens)}/${formatTokens(usage.cacheWriteTokens)}`
                  : tr("Ouvrir les réglages du relais", "Open relay settings", locale)
              }
              icon={<span className={`h-2 w-2 rounded-full ${problem ? "bg-[#f0883e]" : agent.id === agentId ? "bg-[#3fb950]" : "bg-[#55554f]"}`} />}
              trailing={
                <span className={`shrink-0 text-[12.5px] ${problem ? "text-[#e69b80]" : "text-[#8c8b83]"}`}>
                  {detail}
                </span>
              }
            >
              {agent.name}
            </Row>
          );
        })}
      </Section>

      <Section title="Mémoire du projet" count={memoryNotes.length} compact>
        {!projectPath ? (
          <Empty>Associe un projet pour partager des notes entre sessions.</Empty>
        ) : (
          <div className="space-y-2 px-1">
            {memoryNotes.length === 0 ? (
              <p className="text-[12.5px] text-[#6f6e68]">Aucune note persistante enregistrée.</p>
            ) : (
              <ul className="space-y-1.5">
                {memoryNotes.map((note, idx) => (
                  <li
                    key={`${idx}-${note}`}
                    className="flex items-start justify-between gap-2 rounded-lg bg-[#1c1c1a] px-2.5 py-1.5 text-[12.5px] text-[#dcdbd3]"
                  >
                    <span className="min-w-0 flex-1 break-words select-text">{note}</span>
                    <button
                      type="button"
                      aria-label="Supprimer la note"
                      onClick={() => removeProjectMemory(projectPath, idx)}
                      className="shrink-0 rounded p-0.5 text-[#7e7d76] transition hover:bg-[#2f2f2c] hover:text-[#f87171]"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!memoryDraft.trim()) return;
                addProjectMemory(projectPath, memoryDraft);
                setMemoryDraft("");
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={memoryDraft}
                onChange={(e) => setMemoryDraft(e.target.value)}
                placeholder="Ajouter une note projet…"
                aria-label="Nouvelle note projet"
                className="min-w-0 flex-1 rounded-lg border border-[#343431] bg-[#1a1a18] px-2.5 py-1 text-[12.5px] text-[#ecebe4] placeholder-[#6f6e68] outline-none focus:border-[#55554f] select-text"
              />
              <button
                type="submit"
                disabled={!memoryDraft.trim()}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-[#333331] px-2.5 py-1 text-[12px] text-[#ecebe4] transition hover:bg-[#3d3d3a] disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={1.8} />
                <span>Ajouter</span>
              </button>
            </form>
          </div>
        )}
      </Section>

      {subagents.length > 0 && (
        <Section title="Sous-agents" count={subagents.length} compact>
          <div className="space-y-1 px-1">
            {subagents.map(({ conversation: sub, status }) => {
              const statusLabel =
                status === "running"
                  ? "En cours…"
                  : status === "error"
                    ? "Erreur"
                    : status === "done"
                      ? "Terminé"
                      : "En attente";
              const statusTone =
                status === "running"
                  ? "text-[#4a9bff]"
                  : status === "error"
                    ? "text-[#f87171]"
                    : status === "done"
                      ? "text-[#3fb950]"
                      : "text-[#8c8b83]";
              return (
                <Row
                  key={sub.id}
                  onClick={() => onOpenSubagent(sub.id)}
                  icon={<Bot className="h-4 w-4" strokeWidth={1.7} />}
                  trailing={<span className={`shrink-0 text-[11.5px] ${statusTone}`}>{statusLabel}</span>}
                >
                  <span className="mr-1.5 rounded bg-[#2e2e2b] px-1.5 py-0.5 text-[11px] text-[#b8b7ae]">
                    {sub.roleLabel ?? "Sous-agent"}
                  </span>
                  {sub.title}
                </Row>
              );
            })}
          </div>
        </Section>
      )}

      {crossReview && (
        <Section title="Cross-Review & /advisor" count={crossReview.stages.length} compact>
          <div className="space-y-2 px-1">
            {onOpenAdvisor && (
              <button
                type="button"
                onClick={onOpenAdvisor}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-[#3a3a35] bg-[#1c1c1a] px-3 py-2 text-left text-[12.5px] text-[#ecebe4] transition hover:border-[#d97757]/60 hover:bg-[#262623]"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Compass className="h-4 w-4 text-[#d97757]" strokeWidth={1.8} />
                  <span>/advisor · Conseiller & Cross-Review</span>
                </span>
              </button>
            )}
            <div className="space-y-1.5 rounded-xl border border-[#2f2f2c] bg-[#1a1a18] p-2.5 text-[12px]">
              <div className="flex items-center gap-1.5 font-medium text-[#dcdbd3]">
                <GitCompare className="h-3.5 w-3.5 text-[#8ab4f8]" />
                <span className="truncate">{crossReview.taskSummary}</span>
              </div>
              <ul className="space-y-1">
                {crossReview.stages.map((st) => (
                  <li
                    key={st.step}
                    className="flex items-center justify-between gap-2 rounded-lg bg-[#222220] px-2 py-1"
                  >
                    <span className="truncate text-[#ecebe4]">
                      Étape {st.step} · {st.role}
                    </span>
                    <span className="shrink-0 font-mono text-[11px] text-[#8ce09b]">
                      {st.agentId} ({st.status === "done" ? "Terminé" : st.status === "running" ? "En cours" : "Prêt"})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
