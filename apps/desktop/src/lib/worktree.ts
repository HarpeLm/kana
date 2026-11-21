import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface WorktreeInfo {
  path: string;
  branch: string;
}

export interface HandoffReport {
  direction: "to_worktree" | "to_local" | string;
  target_path: string;
  branch: string | null;
  transferred_files: number;
}

/**
 * Crée le dossier de travail d'une conversation (un worktree git sur sa propre branche).
 * `null` quand Kana n'est pas lancé dans un dépôt git.
 */
export async function createWorktree(
  conversationId: string,
  baseBranch?: string,
  projectPath?: string,
): Promise<WorktreeInfo | null> {
  if (!inTauri) return null;
  return invoke<WorktreeInfo | null>("create_worktree", {
    conversationId,
    baseBranch: baseBranch ?? null,
    projectPath: projectPath ?? null,
  });
}

/** Supprime le dossier de travail ; refuse s'il contient du travail non enregistré. */
export const removeWorktree = (path: string, projectPath?: string) =>
  invoke<void>("remove_worktree", { path, projectPath: projectPath ?? null });

/**
 * Bascule à chaud les changements locaux en cours vers un worktree isolé dédié à la conversation.
 * En mode navigateur (sans Tauri), renvoie un rapport simulé réaliste.
 */
export async function handoffToWorktree(
  conversationId: string,
  projectPath: string,
  cleanLocal = true,
): Promise<HandoffReport> {
  if (!inTauri) {
    const safeId = conversationId.replace(/[^a-zA-Z0-9_-]/g, "-");
    const repoName = projectPath.split("/").filter(Boolean).pop() ?? "repo";
    return {
      direction: "to_worktree",
      target_path: `~/.kana/worktrees/${repoName}/${safeId}`,
      branch: `kana/${safeId}`,
      transferred_files: 2,
    };
  }
  return invoke<HandoffReport>("handoff_to_worktree", {
    conversationId,
    projectPath,
    cleanLocal,
  });
}

/**
 * Rapatrie à chaud les changements d'un worktree vers le dossier local, sans commit ni fusion définitive.
 * En mode navigateur (sans Tauri), renvoie un rapport simulé réaliste.
 */
export async function handoffToLocal(
  projectPath: string,
  worktree: string,
  branch: string,
): Promise<HandoffReport> {
  if (!inTauri) {
    return {
      direction: "to_local",
      target_path: projectPath,
      branch: "main",
      transferred_files: 2,
    };
  }
  return invoke<HandoffReport>("handoff_to_local", {
    projectPath,
    worktree,
    branch,
  });
}
