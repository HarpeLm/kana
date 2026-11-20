import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

export interface BranchSummary {
  branch: string | null;
  base: string | null;
  additions: number;
  deletions: number;
  files: number;
  ahead: number;
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
