//! Lecture d'un dépôt Git : les changements (diff), les fichiers, l'aperçu et l'écriture d'un fichier.

mod files;
mod forge;
mod model;
mod parse;
mod run;
mod status;
mod worktree;

pub use forge::{BranchSummary, CommitInfo, FileStat, PullRequest, branch_summary, create_pull_request, parse_pull_requests, pull_requests};
pub use files::{FileList, FilePreview, list_files, read_preview, write_text};
pub use model::{DiffLine, DiffReport, FileDiff, FileStatus, Hunk, LineKind};
pub use parse::parse_diff;
pub use run::{GitError, diff, repo_root};
pub use status::{ChangedFile, changed_files, parse_status};
pub use worktree::{KanaBranch, add_worktree, current_branch, delete_merged_branch, init_repository, kana_branches, remove_worktree};
