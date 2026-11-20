import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface WorktreeInfo {
  path: string;
  branch: string;
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
