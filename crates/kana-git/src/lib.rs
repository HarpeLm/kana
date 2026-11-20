//! Lecture des changements d'un dépôt Git : le diff, analysé en fichiers, blocs et lignes.

mod model;
mod parse;
mod run;

pub use model::{DiffLine, DiffReport, FileDiff, FileStatus, Hunk, LineKind};
pub use parse::parse_diff;
pub use run::{GitError, diff, repo_root};
