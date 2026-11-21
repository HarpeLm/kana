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
  forge?: "github" | "gitlab" | string;
}

export interface ConflictFile {
  path: string;
  snippet: string;
}

export interface PrFeedback {
  prNumber: number;
  title: string;
  forge: string;
  reviewComments: string[];
  failedChecks: string[];
  failedLogExcerpt: string;
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
    { path: "artefacts/plan.html", additions: 40, deletions: 0, status: "added" },
  ],
  commits: [{ hash: "a1b2c3d", subject: "ajoute le panneau" }],
  dirty: true,
  has_remote: true,
};
const SAMPLE_PRS: PullRequest[] = [
  { number: 215, title: "grep: don't read the inputs when the program cannot start", url: "https://github.com/uutils/grep/pull/215", state: "OPEN", isDraft: false, additions: 65, deletions: 2, checksFailed: 1, repo: "uutils/grep", forge: "github" },
  { number: 907, title: "Keep bench_insert_small within the budget", url: "https://github.com/servo/smallvec/pull/907", state: "MERGED", isDraft: false, additions: 12, deletions: 3, checksFailed: 0, repo: "servo/smallvec", forge: "github" },
];
const SAMPLE_FEEDBACK: Record<number, PrFeedback> = {
  215: {
    prNumber: 215,
    title: "grep: don't read the inputs when the program cannot start",
    forge: "github",
    reviewComments: [
      "@reviewer (src/main.rs:18): Vérifier le code de sortie quand aucun fichier n'est lisible.",
      "@maintainer: Ajouter un test de non-régression pour les arguments invalides.",
    ],
    failedChecks: ["cargo test (ubuntu-latest) (FAILURE)"],
    failedLogExcerpt: "---- tests::invalid_flag_exits_early stdout ----\nassertion `left == right` failed\n  left: 0\n right: 2",
  },
  907: {
    prNumber: 907,
    title: "Keep bench_insert_small within the budget",
    forge: "github",
    reviewComments: ["@perf-bot: Budget validé sur x86_64."],
    failedChecks: [],
    failedLogExcerpt: "",
  },
};

export const loadBranchSummary = (path?: string): Promise<BranchSummary> =>
  inTauri ? invoke("git_branch_summary", { path: path ?? null }) : Promise.resolve(SAMPLE_SUMMARY);

export const loadPullRequests = (branch: string, path?: string): Promise<PullRequest[]> =>
  inTauri ? invoke("git_pull_requests", { path: path ?? null, branch }) : Promise.resolve(SAMPLE_PRS);

/** Inspecte les conflits de fusion entre `branch` et la branche principale sans salir le dépôt. */
export const inspectMergeConflicts = (projectPath: string, branch: string): Promise<ConflictFile[]> =>
  inTauri
    ? invoke("git_inspect_conflicts", { path: projectPath, branch })
    : Promise.resolve([
        {
          path: "src/main.rs",
          snippet: "<<<<<<< HEAD\nfn main() { println!(\"main\"); }\n=======\nfn main() { println!(\"branch\"); }\n>>>>>>> " + branch,
        },
      ]);

/** Importe les commentaires de review et les logs CI en échec d'une PR/MR (GitHub ou GitLab). */
export const fetchPrFeedback = (prNumber: number, path?: string): Promise<PrFeedback> =>
  inTauri
    ? invoke("git_pr_feedback", { path: path ?? null, prNumber })
    : Promise.resolve(
        SAMPLE_FEEDBACK[prNumber] ?? {
          prNumber,
          title: `PR #${prNumber}`,
          forge: "github",
          reviewComments: [],
          failedChecks: [],
          failedLogExcerpt: "",
        },
      );

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

/** Convertit une URL de remote Git (GitHub, GitLab, Codeberg, Gitea…) en URL web navigable. */
export function parseForgeWebUrl(raw: string): string | null {
  const trimmed = raw.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  if (!trimmed) return null;
  const httpsMatch = trimmed.match(/^https?:\/\/(?:[^/@]+@)?([^/:]+)(?::\d+)?\/(.+)$/);
  if (httpsMatch) return `https://${httpsMatch[1]}/${httpsMatch[2]}`;
  const sshProtoMatch = trimmed.match(/^ssh:\/\/(?:[^/@]+@)?([^/:]+)(?::\d+)?\/(.+)$/);
  if (sshProtoMatch) return `https://${sshProtoMatch[1]}/${sshProtoMatch[2]}`;
  const scpMatch = trimmed.match(/^(?:[^/@]+@)?([^/:]+):(.+)$/);
  if (scpMatch) return `https://${scpMatch[1]}/${scpMatch[2].replace(/^\/+/, "")}`;
  return null;
}

/** L'adresse web (GitHub, GitLab, Codeberg…) du dépôt d'un dossier, ou `null` sans remote. */
export async function forgeUrl(path?: string): Promise<string | null> {
  if (!inTauri) return "https://github.com/exemple/depot";
  const raw: string = await invoke("git_remote_url", { path: path ?? null });
  return parseForgeWebUrl(raw);
}

/** Alias conservé pour compatibilité : préférer `forgeUrl`. */
export const githubUrl = forgeUrl;
