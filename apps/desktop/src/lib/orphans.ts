import { invoke } from "@tauri-apps/api/core";
import { inTauri } from "./env";

/** Une branche `kana/…` dont plus aucune conversation ne se sert. */
export interface Orphan {
  repo: string;
  repo_name: string;
  branch: string;
  worktree: string | null;
  merged: boolean;
  ahead: number;
  dirty: boolean;
}

export interface CleanOutcome {
  removed_worktree: boolean;
  deleted_branch: boolean;
  kept: string | null;
}

// Exemple montré dans un navigateur sans Tauri.
const SAMPLE: Orphan[] = [
  { repo: "/x/kana", repo_name: "kana", branch: "kana/cmwp1", worktree: "/x/.kana/worktrees/kana/cmwp1", merged: true, ahead: 0, dirty: false },
  { repo: "/x/kana", repo_name: "kana", branch: "kana/cmwp2", worktree: null, merged: false, ahead: 2, dirty: false },
  { repo: "/x/Heifer", repo_name: "Heifer", branch: "kana/cmwp3", worktree: "/x/.kana/worktrees/Heifer/cmwp3", merged: false, ahead: 0, dirty: true },
];

export const scanOrphans = (knownIds: string[], projects: string[]): Promise<Orphan[]> =>
  inTauri ? invoke("scan_orphan_worktrees", { knownIds, projects }) : Promise.resolve(SAMPLE);

export const cleanOrphan = (orphan: Orphan): Promise<CleanOutcome> =>
  inTauri
    ? invoke("clean_orphan_worktree", { repo: orphan.repo, branch: orphan.branch, worktree: orphan.worktree })
    : Promise.resolve({ removed_worktree: !!orphan.worktree && !orphan.dirty, deleted_branch: orphan.merged, kept: orphan.merged ? null : "exemple" });
