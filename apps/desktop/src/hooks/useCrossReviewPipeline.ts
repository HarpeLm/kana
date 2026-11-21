import { useState } from "react";
import type { CrossReviewPipelineState } from "../components/AdvisorModal";
import type { Conversation } from "../lib/conversations";
import type { PermissionMode } from "../lib/permissionMode";

interface UseCrossReviewPipelineParams {
  selected: Conversation;
  setAgent: (id: string, agentId: string, modelId?: string) => void;
  setEnvironment: (id: string, environment: Conversation["environment"]) => void;
  spawnSubagent: (parentId: string, roleLabel: string, prompt: string, readOnly?: boolean) => string | null | undefined;
  changeMode: (mode: PermissionMode) => void;
  onShowPlan: () => void;
  sendMessage: (text: string, modeOverride?: PermissionMode) => unknown;
  sendToThread: (threadId: string, agentId: string, text: string, modeOverride?: PermissionMode) => unknown;
}

export function useCrossReviewPipeline({
  selected,
  setAgent,
  setEnvironment,
  spawnSubagent,
  changeMode,
  onShowPlan,
  sendMessage,
  sendToThread,
}: UseCrossReviewPipelineParams) {
  const [advisorModal, setAdvisorModal] = useState<{ open: boolean; query: string }>({ open: false, query: "" });
  const [crossReviewMap, setCrossReviewMap] = useState<Record<string, CrossReviewPipelineState>>({});

  const openAdvisor = (query = "") => setAdvisorModal({ open: true, query });
  const closeAdvisor = () => setAdvisorModal((prev) => ({ ...prev, open: false }));

  const tryOpenFromSlashCommand = (trimmed: string): boolean => {
    if (
      trimmed === "/advisor" ||
      trimmed.startsWith("/advisor ") ||
      trimmed === "/cross-review" ||
      trimmed.startsWith("/cross-review ")
    ) {
      const rest = trimmed.replace(/^\/(?:advisor|cross-review)\s*/i, "");
      setAdvisorModal({ open: true, query: rest });
      return true;
    }
    return false;
  };

  const applySingleRecommendation = ({
    agentId: nextAgent,
    mode: nextMode,
    sandbox,
    prompt,
  }: {
    agentId: string;
    mode: PermissionMode;
    sandbox: boolean;
    prompt: string;
  }) => {
    setAgent(selected.id, nextAgent, selected.modelId);
    if (sandbox) {
      setEnvironment(selected.id, { kind: "local", sandbox: true });
    }
    changeMode(nextMode);
    void sendMessage(prompt, nextMode);
  };

  const launchCrossReview = ({
    implementer,
    reviewer,
    verifier,
    mode: nextMode,
    sandbox,
    taskDescription,
  }: {
    implementer: string;
    reviewer: string;
    verifier: string;
    mode: PermissionMode;
    sandbox: boolean;
    taskDescription: string;
  }) => {
    setAgent(selected.id, implementer, selected.modelId);
    if (sandbox) {
      setEnvironment(selected.id, { kind: "local", sandbox: true });
    }
    changeMode(nextMode);
    onShowPlan();

    const reviewPrompt = `[Cross-Review Étape 2/3 · Revue critique du Diff par ${reviewer}]\nRelis le diff produit par ${implementer} pour « ${taskDescription} », signale toute régression, faille ou angle mort et propose les correctifs.`;
    const verifyPrompt = `[Cross-Review Étape 3/3 · Vérification & Tests par ${verifier}]\nVérifie la compilation, les tests unitaires/E2E et le rendu Globe pour « ${taskDescription} ».`;

    const revId = spawnSubagent(selected.id, `Cross-Review (${reviewer})`, reviewPrompt, true);
    if (revId) {
      setAgent(revId, reviewer, undefined);
      void sendToThread(revId, reviewer, reviewPrompt, "plan");
    }

    const verId = spawnSubagent(selected.id, `Vérification (${verifier})`, verifyPrompt, false);
    if (verId) {
      setAgent(verId, verifier, undefined);
      void sendToThread(verId, verifier, verifyPrompt, nextMode);
    }

    setCrossReviewMap((prev) => ({
      ...prev,
      [selected.id]: {
        taskSummary: taskDescription,
        stages: [
          { step: 1, role: "Implémentation", agentId: implementer, status: "running" },
          { step: 2, role: "Cross-Review du Diff", agentId: reviewer, status: "running" },
          { step: 3, role: "Vérification & Globe", agentId: verifier, status: "running" },
        ],
      },
    }));

    void sendMessage(
      `[Pipeline Cross-Review Multi-Fournisseurs (${implementer} → ${reviewer} → ${verifier})]\nÉtape 1 · Implémentation principale : ${taskDescription}`,
      nextMode,
    );
  };

  return {
    advisorModal,
    openAdvisor,
    closeAdvisor,
    activeCrossReview: crossReviewMap[selected.id] ?? null,
    tryOpenFromSlashCommand,
    applySingleRecommendation,
    launchCrossReview,
  };
}
