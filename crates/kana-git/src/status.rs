//! Les fichiers modifiés d'un dépôt, d'après `git status`.

use std::path::Path;

use serde::Serialize;

use crate::{
    model::FileStatus,
    run::{GitError, git},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: FileStatus,
}

/// Analyse la sortie de `git status --porcelain=v1 -z` (`XY chemin\0`, plus l'ancien chemin
/// après un renommage).
pub fn parse_status(text: &str) -> Vec<ChangedFile> {
    let mut changes = Vec::new();
    let mut entries = text.split('\0').filter(|e| !e.is_empty());
    while let Some(entry) = entries.next() {
        let Some((codes, path)) = entry.split_at_checked(3) else { continue };
        let (x, y) = (codes.as_bytes()[0], codes.as_bytes()[1]);
        let status = match (x, y) {
            (b'?', _) | (b'A', _) | (_, b'A') => FileStatus::Added,
            (b'D', _) | (_, b'D') => FileStatus::Deleted,
            (b'R', _) | (_, b'R') | (b'C', _) | (_, b'C') => FileStatus::Renamed,
            _ => FileStatus::Modified,
        };
        if matches!(x, b'R' | b'C') {
            entries.next(); // ancien chemin
        }
        changes.push(ChangedFile { path: path.to_owned(), status });
    }
    changes
}

/// Les fichiers modifiés, ajoutés, supprimés ou non suivis du dépôt dont `root` est la racine.
pub fn changed_files(root: &Path) -> Result<Vec<ChangedFile>, GitError> {
    let out = git(root, &["status", "--porcelain=v1", "-z", "--untracked-files=all"], &[])?;
    Ok(parse_status(&out))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_each_kind_of_change() {
        let text = " M src/a.rs\0?? nouveau.txt\0A  ajoute.rs\0 D gone.rs\0MM both.rs\0";
        let changes = parse_status(text);
        let summary: Vec<_> = changes.iter().map(|c| (c.path.as_str(), c.status)).collect();
        assert_eq!(
            summary,
            vec![
                ("src/a.rs", FileStatus::Modified),
                ("nouveau.txt", FileStatus::Added),
                ("ajoute.rs", FileStatus::Added),
                ("gone.rs", FileStatus::Deleted),
                ("both.rs", FileStatus::Modified),
            ]
        );
    }

    #[test]
    fn rename_skips_the_old_path_entry() {
        let changes = parse_status("R  nouveau.txt\0ancien.txt\0 M autre.txt\0");
        assert_eq!(changes.len(), 2);
        assert_eq!((changes[0].path.as_str(), changes[0].status), ("nouveau.txt", FileStatus::Renamed));
        assert_eq!(changes[1].path, "autre.txt");
    }

    #[test]
    fn clean_status_is_empty() {
        assert!(parse_status("").is_empty());
    }
}
