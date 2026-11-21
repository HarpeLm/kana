import { AGENTS } from "../data";
import { stopAgent } from "../lib/acp";
import type { ChatMessage } from "../lib/chatState";
import type { Conversation } from "../lib/conversations";
import type { ConflictFile, PrFeedback } from "../lib/forge";
import { buildRelayContext } from "../lib/fork";
import { NO_PROJECT } from "../lib/projects";
import { handoffToLocal, handoffToWorktree, type HandoffReport } from "../lib/worktree";

interface UseWorktreeHandoffParams {
  selected: Conversation;
  messages: ChatMessage[];
  summaryBranch: string | null | undefined;
  attachWorktree: (id: string, path: string, branch: string) => void;
  clearWorktree: (id: string) => void;
  setUseWorktree: (id: string, value: boolean) => void;
  relayTo: (id: string, agentId: string, context: string) => void;
  refreshSummary: () => Promise<void> | void;
  send: (text: string) => unknown;
}

export function useWorktreeHandoff({
  selected,
  messages,
  summaryBranch,
  attachWorktree,
  clearWorktree,
  setUseWorktree,
  relayTo,
  refreshSummary,
  send,
}: UseWorktreeHandoffParams) {
  const relayConversationHistory = () => {
    if (messages.length === 0) return;
    const history = messages.filter((m) => m.role !== "error");
    const from = AGENTS.find((a) => a.id === selected.agentId)?.name ?? selected.agentId;
    relayTo(selected.id, selected.agentId, history.length > 0 ? buildRelayContext(history, from) : "");
  };

  const handleHandoffToWorktree = async (): Promise<HandoffReport | void> => {
    const projectPath = selected.projectPath;
    if (!projectPath || projectPath === NO_PROJECT) return;
    const report = await handoffToWorktree(selected.id, projectPath, true);
    await stopAgent(selected.id).catch(() => {});
    const branch = report.branch ?? `kana/${selected.id}`;
    attachWorktree(selected.id, report.target_path, branch);
    setUseWorktree(selected.id, true);
    relayConversationHistory();
    void refreshSummary();
    return report;
  };

  const handleHandoffToLocal = async (): Promise<HandoffReport | void> => {
    const projectPath = selected.projectPath;
    const wt = selected.worktree;
    const branch = summaryBranch ?? selected.branch;
    if (!projectPath || projectPath === NO_PROJECT || !wt || !branch) return;
    const report = await handoffToLocal(projectPath, wt, branch);
    await stopAgent(selected.id).catch(() => {});
    clearWorktree(selected.id);
    setUseWorktree(selected.id, false);
    relayConversationHistory();
    void refreshSummary();
    return report;
  };

  const handleDiscarded = () => {
    stopAgent(selected.id).catch(() => {});
    clearWorktree(selected.id);
    void refreshSummary();
  };

  const handleResolveConflicts = (branch: string, base: string, conflicts: ConflictFile[]) => {
    const details = conflicts.length
      ? conflicts.map((c) => `### \`${c.path}\`\n\`\`\`\n${c.snippet}\n\`\`\``).join("\n\n")
      : "(Aucun détail disponible.)";
    void send(
      `La fusion de \`${branch}\` dans \`${base}\` a des conflits.\n\nFichiers concernés :\n\n${details}\n\nDans ton dossier de travail actuel, fusionne ou rebase \`${base}\` dans \`${branch}\`, résous proprement les conflits et vérifie les tests.`,
    );
  };

  const handleImportPrFeedback = (feedback: PrFeedback) => {
    const comments = feedback.reviewComments.length
      ? `Commentaires de review :\n${feedback.reviewComments.map((c) => `- ${c}`).join("\n")}`
      : "Aucun commentaire de review.";
    const checks = feedback.failedChecks.length
      ? `Vérifications CI en échec :\n${feedback.failedChecks.map((c) => `- ${c}`).join("\n")}`
      : "Aucune vérification CI en échec.";
    const logs = feedback.failedLogExcerpt
      ? `\n\nExtrait des logs CI en échec :\n\`\`\`\n${feedback.failedLogExcerpt}\n\`\`\``
      : "";
    void send(
      `Feedback importé depuis ${feedback.forge === "gitlab" ? "la MR" : "la PR"} #${feedback.prNumber} (« ${feedback.title} ») :\n\n${comments}\n\n${checks}${logs}\n\nCorrige les points signalés et vérifie les tests.`,
    );
  };

  return {
    handleHandoffToWorktree,
    handleHandoffToLocal,
    handleDiscarded,
    handleResolveConflicts,
    handleImportPrFeedback,
  };
}
