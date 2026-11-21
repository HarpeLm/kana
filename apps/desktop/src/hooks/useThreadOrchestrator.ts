import { useCallback, useEffect, useRef } from "react";
import { agentTitle } from "../lib/autoTitle";
import { chosenEffort } from "../lib/effort";
import { getArtifactGuide } from "../lib/agentGuide";
import { activeMcpServersFor, loadActiveRulesPreface, toMcpServerParams } from "../lib/extensibility";
import { tr } from "../lib/i18n";
import { detectProblem } from "../lib/limits";
import { NO_PROJECT, buildProjectMemoryPreface, scratchDir } from "../lib/projects";
import { notifyOs } from "../lib/settings";
import { clearProblem, markProblem, recordTokens, recordTurn } from "../lib/usage";
import { createWorktree } from "../lib/worktree";
import type { Conversation } from "../lib/conversations";
import type { PreparedThread } from "./useChat";

interface UseThreadOrchestratorParams {
  items: Conversation[];
  selectedId: string;
  findById: (id: string) => Conversation | undefined;
  attachWorktree: (id: string, path: string, branch: string) => void;
  clearForkContext: (id: string) => void;
  setAcpSessionId: (id: string, sessionId: string) => void;
  rename: (id: string, title: string) => void;
  markUnread: (id: string) => void;
}

export function useThreadOrchestrator({
  items,
  selectedId,
  findById,
  attachWorktree,
  clearForkContext,
  setAcpSessionId,
  rename,
  markUnread,
}: UseThreadOrchestratorParams) {
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  const selectedIdRef = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  });

  const pendingTitles = useRef(new Map<string, { request: string; provisional: string }>());

  const prepareThread = useCallback(
    async (threadId: string): Promise<PreparedThread> => {
      const conversation = findById(threadId) ?? itemsRef.current.find((c) => c.id === threadId);
      if (!conversation) return {};
      let cwd = conversation.worktree;
      const projectPath = conversation.projectPath;
      if (projectPath === NO_PROJECT) {
        // Sans projet : un dossier neutre, jamais le dossier personnel.
        cwd = await scratchDir();
      } else if (!cwd) {
        if (conversation.useWorktree !== false) {
          const parentId = conversation.forkedFrom ?? conversation.parentId;
          const base = parentId
            ? (findById(parentId)?.branch ?? itemsRef.current.find((c) => c.id === parentId)?.branch)
            : undefined;
          const info = await createWorktree(threadId, base, projectPath).catch(() => null);
          if (info) {
            cwd = info.path;
            attachWorktree(threadId, info.path, info.branch);
          }
        }
        // Sans dossier de travail à part, l'agent travaille directement dans le dossier du projet.
        if (!cwd) cwd = projectPath;
      }
      const carried = conversation.forkContext;
      if (carried) clearForkContext(threadId);
      const memory = buildProjectMemoryPreface(projectPath);
      const rules = await loadActiveRulesPreface(cwd ?? projectPath);
      const mcpServers = toMcpServerParams(activeMcpServersFor(projectPath));
      const folders = conversation.extraFolders?.length
        ? tr(
            `Dossiers supplémentaires auxquels tu as accès, en plus du dossier de travail (lis-les au besoin, ne les modifie que si je le demande) :\n${conversation.extraFolders.map((f) => `- ${f}`).join("\n")}\n\n`,
            `Additional folders you can access alongside the working directory (read them if needed, only modify them if asked):\n${conversation.extraFolders.map((f) => `- ${f}`).join("\n")}\n\n`,
          )
        : "";
      const preface = `${getArtifactGuide()}${memory}${rules}${folders}${carried ?? ""}`;
      return {
        cwd,
        projectPath,
        preface,
        carried: !!carried,
        model: conversation.modelId,
        effort: chosenEffort(conversation.agentId),
        acpSessionId: conversation.acpSessionId,
        environment: conversation.environment,
        mcpServers,
      };
    },
    [attachWorktree, clearForkContext, findById],
  );

  const agentOf = (threadId: string) =>
    (findById(threadId) ?? itemsRef.current.find((c) => c.id === threadId))?.agentId;

  const observer = {
    onSession: (threadId: string, sessionId: string) => {
      if (threadId.startsWith("side:")) return;
      setAcpSessionId(threadId, sessionId);
    },
    onTurnUsage: (
      threadId: string,
      usage: { input: number; output: number; total: number; cacheRead?: number; cacheWrite?: number },
    ) => {
      if (threadId.startsWith("side:")) return;
      const conv = findById(threadId) ?? itemsRef.current.find((c) => c.id === threadId);
      const agent = conv?.agentId;
      if (agent) {
        recordTokens(agent, usage.input, usage.output, usage.total, {
          cacheRead: usage.cacheRead,
          cacheWrite: usage.cacheWrite,
          threadId,
          projectPath: conv?.projectPath && conv.projectPath !== NO_PROJECT ? conv.projectPath : undefined,
          modelId: conv?.modelId,
        });
      }
    },
    onDone: (threadId: string) => {
      if (threadId.startsWith("side:")) return;
      const conv = findById(threadId) ?? itemsRef.current.find((c) => c.id === threadId);
      const agent = conv?.agentId;
      if (!agent) return;
      // Au premier tour fini, l'agent écrit un vrai titre (sauf si la conversation a été renommée entre-temps).
      const pending = pendingTitles.current.get(threadId);
      if (pending) {
        pendingTitles.current.delete(threadId);
        void agentTitle(agent, pending.request).then((title) => {
          const now = findById(threadId) ?? itemsRef.current.find((c) => c.id === threadId);
          if (title && now && now.title === pending.provisional) rename(threadId, title);
        });
      }
      recordTurn(agent, {
        threadId,
        projectPath: conv?.projectPath && conv.projectPath !== NO_PROJECT ? conv.projectPath : undefined,
      });
      clearProblem(agent);

      const convTitle = conv?.title || "Kana";
      const inBackground = threadId !== selectedIdRef.current;
      if (inBackground || (typeof document !== "undefined" && document.hidden)) {
        notifyOs(convTitle, tr("L'agent a terminé sa réponse.", "The agent finished its response."));
      }
      if (inBackground) {
        markUnread(threadId);
      }
    },
    onPermission: (threadId: string, title: string) => {
      if (threadId.startsWith("side:")) return;
      const convTitle = (findById(threadId) ?? itemsRef.current.find((c) => c.id === threadId))?.title || "Kana";
      const inBackground = threadId !== selectedIdRef.current;
      if (inBackground || (typeof document !== "undefined" && document.hidden)) {
        notifyOs(convTitle, tr(`Autorisation demandée : ${title}`, `Permission requested: ${title}`));
      }
      if (inBackground) {
        markUnread(threadId);
      }
    },
    onError: (threadId: string, message: string) => {
      if (threadId.startsWith("side:")) return;
      const agent = agentOf(threadId);
      const problem = detectProblem(message);
      if (agent && problem) markProblem(agent, problem, message);
    },
  };

  return { prepareThread, observer, pendingTitles };
}
