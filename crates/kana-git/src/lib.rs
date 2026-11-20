//! Lecture d'un dépôt Git : les changements (diff), les fichiers et l'aperçu de leur contenu.

mod files;
mod model;
mod parse;
mod run;

pub use files::{FileList, FilePreview, list_files, read_preview};
pub use model::{DiffLine, DiffReport, FileDiff, FileStatus, Hunk, LineKind};
pub use parse::parse_diff;
pub use run::{GitError, diff, repo_root};
