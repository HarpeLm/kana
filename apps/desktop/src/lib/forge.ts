import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface FileStat {
  path: string;
  additions: number;
  deletions: number;
  status: "added" | "modified" | "deleted" | string;
}

export interface CommitInfo {
  hash: string;
  subject: string;
}

export interface BranchSummary {
  branch: string | null;
  base: string | null;
  additions: number;
  deletions: number;
  files: number;
  ahead: number;
  changed: FileStat[];
  commits: CommitInfo[];
  dirty: boolean;
  has_remote: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED" | string;
  isDraft: boolean;
  additions: number;
  deletions: number;
  checksFailed: number;
  repo: string;
}

// Exemples montrés dans un navigateur sans Tauri, pour voir la mise en page.
const SAMPLE_SUMMARY: BranchSummary = {
  branch: "kana/exemple",
  base: "main",
  additions: 11,
  deletions: 0,
  files: 2,
  ahead: 1,
  changed: [
    { path: "src/main.rs", additions: 8, deletions: 0, status: "modified" },
    { path: "src/panneau.rs", additions: 3, deletions: 0, status: "added" },
  ],
  commits: [{ hash: "a1b2c3d", subject: "ajoute le panneau" }],
  dirty: true,
  has_remote: true,
};
const SAMPLE_PRS: PullRequest[] = [
  { number: 215, title: "grep: don't read the inputs when the program cannot start", url: "https://github.com/uutils/grep/pull/215", state: "OPEN", isDraft: false, additions: 65, deletions: 2, checksFailed: 1, repo: "uutils/grep" },
  { number: 907, title: "Keep bench_insert_small within the budget", url: "https://github.com/servo/smallvec/pull/907", state: "MERGED", isDraft: false, additions: 12, deletions: 3, checksFailed: 0, repo: "servo/smallvec" },
];

export const loadBranchSummary = (path?: string): Promise<BranchSummary> =>
  inTauri ? invoke("git_branch_summary", { path: path ?? null }) : Promise.resolve(SAMPLE_SUMMARY);

export const loadPullRequests = (branch: string, path?: string): Promise<PullRequest[]> =>
  inTauri ? invoke("git_pull_requests", { path: path ?? null, branch }) : Promise.resolve(SAMPLE_PRS);

/** Enregistre le travail, pousse la branche et ouvre la pull request ; renvoie son adresse. */
export const createPullRequest = (branch: string, title: string, path?: string): Promise<string> =>
  inTauri
    ? invoke("git_create_pull_request", { path: path ?? null, branch, title })
    : Promise.reject(new Error("Disponible dans l'app Kana seulement."));

export interface MergeResult {
  base: string;
  merged_commits: number;
  fast_forward: boolean;
  /** Des changements non enregistrés ont été mis dans un commit avant la fusion. */
  saved: boolean;
}

/** Fusionne le travail de la conversation dans la branche principale du projet (sans GitHub). */
export const mergeWork = (projectPath: string, worktree: string, branch: string, title: string): Promise<MergeResult> =>
  inTauri
    ? invoke("merge_worktree", { projectPath, worktree, branch, title })
    : Promise.reject(new Error("Disponible dans l'app Kana seulement."));

/** Abandonne le travail : supprime son dossier de travail et sa branche. Définitif. */
export const discardWork = (projectPath: string, worktree: string, branch: string): Promise<void> =>
  inTauri
    ? invoke("discard_worktree", { projectPath, worktree, branch })
    : Promise.reject(new Error("Disponible dans l'app Kana seulement."));
