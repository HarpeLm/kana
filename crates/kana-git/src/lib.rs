//! Lecture d'un dépôt Git : les changements (diff), les fichiers, l'aperçu et l'écriture d'un fichier.

mod files;
mod forge;
mod model;
mod parse;
mod run;
mod status;
mod worktree;

pub use forge::{
    BranchSummary, CommitInfo, ConflictFile, FileStat, ForgeKind, MergeReport, PrFeedback, PullRequest,
    base_branch, branch_summary, create_pull_request, detect_forge, discard_work, fetch_pr_feedback,
    forge_web_url, inspect_merge_conflicts, merge_branch, parse_gh_pr_feedback, parse_glab_mr_feedback,
    parse_merge_requests, parse_pull_requests, pull_requests, save_work,
};
pub use files::{
    FileList, FilePreview, RULE_FILE_PATHS, RepoSymbol, RuleFile, list_files, read_preview,
    read_rule_files, sync_rule_files, trash_file, write_rule_file, write_text,
};
pub use model::{DiffLine, DiffReport, FileDiff, FileStatus, Hunk, LineKind};
pub use parse::parse_diff;
pub use run::{GitError, create_checkpoint, diff, repo_root, restore_checkpoint, revert_file, revert_hunk};
pub use status::{ChangedFile, changed_files, parse_status};
pub use worktree::{KanaBranch, add_worktree, current_branch, delete_merged_branch, init_repository, kana_branches, remove_worktree};
