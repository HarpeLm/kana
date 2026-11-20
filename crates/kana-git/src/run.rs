//! Exécution de `git` pour lire les changements d'un dépôt.

use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use thiserror::Error;

use crate::{
    model::{DiffReport, FileDiff, FileStatus},
    parse::parse_diff,
};

/// Au-delà, un fichier non suivi n'est pas détaillé (il serait trop long à afficher).
const MAX_UNTRACKED_BYTES: u64 = 512 * 1024;
const MAX_UNTRACKED_FILES: usize = 200;

#[derive(Debug, Error)]
pub enum GitError {
    #[error("impossible de lancer git : {0}")]
    Spawn(#[from] std::io::Error),
    #[error("aucun dépôt git dans {0}")]
    NotARepository(String),
    #[error("git a échoué : {0}")]
    Failed(String),
    #[error("chemin refusé : {0}")]
    InvalidPath(String),
    #[error("lecture impossible : {0}")]
    Read(String),
}

/// Lance git dans `dir` ; `ok_codes` liste les codes de sortie acceptés en plus de 0.
pub(crate) fn git(dir: &Path, args: &[&str], ok_codes: &[i32]) -> Result<String, GitError> {
    let output = Command::new("git")
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .current_dir(dir)
        .output()?;
    let code = output.status.code().unwrap_or(-1);
    if code != 0 && !ok_codes.contains(&code) {
        return Err(GitError::Failed(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Dossier racine du dépôt qui contient `from`.
pub fn repo_root(from: &Path) -> Result<PathBuf, GitError> {
    let out = git(from, &["rev-parse", "--show-toplevel"], &[])
        .map_err(|_| GitError::NotARepository(from.display().to_string()))?;
    Ok(PathBuf::from(out.trim()))
}

fn has_commit(root: &Path) -> bool {
    git(root, &["rev-parse", "--verify", "--quiet", "HEAD"], &[]).is_ok()
}

fn untracked_file(root: &Path, relative: &str) -> Option<FileDiff> {
    let size = fs::metadata(root.join(relative)).ok()?.len();
    if size > MAX_UNTRACKED_BYTES {
        return Some(FileDiff {
            path: relative.to_owned(),
            old_path: None,
            status: FileStatus::Added,
            additions: 0,
            deletions: 0,
            binary: true,
            hunks: Vec::new(),
        });
    }
    // `--no-index` sort avec le code 1 dès qu'il y a une différence.
    let text = git(root, &["diff", "--no-index", "--no-color", "--", "/dev/null", relative], &[1]).ok()?;
    parse_diff(&text).into_iter().next()
}

/// Les changements du dépôt qui contient `repo` : fichiers suivis modifiés et fichiers non suivis.
pub fn diff(repo: &Path) -> Result<DiffReport, GitError> {
    let root = repo_root(repo)?;

    let mut args = vec!["diff", "--no-color", "--no-ext-diff", "-M"];
    if has_commit(&root) {
        args.push("HEAD");
    }
    let mut files = parse_diff(&git(&root, &args, &[])?);

    let untracked = git(&root, &["ls-files", "--others", "--exclude-standard", "-z"], &[])?;
    files.extend(
        untracked
            .split('\0')
            .filter(|path| !path.is_empty())
            .take(MAX_UNTRACKED_FILES)
            .filter_map(|path| untracked_file(&root, path)),
    );

    files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(DiffReport { root: root.display().to_string(), files })
}

#[cfg(test)]
mod tests {
    use std::{env, fs, process::Command};

    use super::*;

    fn run(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args(["-c", "user.name=Test", "-c", "user.email=test@example.com"])
            .args(args)
            .current_dir(dir)
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?}");
    }

    fn scratch_repo(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("kana-git-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        run(&dir, &["init", "-q"]);
        dir
    }

    #[test]
    fn reports_modified_deleted_and_untracked_files() {
        let dir = scratch_repo("changes");
        fs::write(dir.join("a.txt"), "un\ndeux\ntrois\n").unwrap();
        fs::write(dir.join("gone.txt"), "adieu\n").unwrap();
        run(&dir, &["add", "."]);
        run(&dir, &["commit", "-q", "-m", "init"]);

        fs::write(dir.join("a.txt"), "un\nDEUX\ntrois\nquatre\n").unwrap();
        fs::remove_file(dir.join("gone.txt")).unwrap();
        fs::write(dir.join("nouveau.txt"), "salut\n").unwrap();

        let report = diff(&dir).unwrap();
        let summary: Vec<_> = report.files.iter().map(|f| (f.path.as_str(), f.status)).collect();
        assert_eq!(
            summary,
            vec![
                ("a.txt", FileStatus::Modified),
                ("gone.txt", FileStatus::Deleted),
                ("nouveau.txt", FileStatus::Added),
            ]
        );
        let modified = &report.files[0];
        assert_eq!((modified.additions, modified.deletions), (2, 1));
        assert_eq!(report.files[2].additions, 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn clean_repository_has_no_changes() {
        let dir = scratch_repo("clean");
        fs::write(dir.join("a.txt"), "un\n").unwrap();
        run(&dir, &["add", "."]);
        run(&dir, &["commit", "-q", "-m", "init"]);
        assert!(diff(&dir).unwrap().files.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn repository_without_commit_lists_untracked_files() {
        let dir = scratch_repo("empty");
        fs::write(dir.join("a.txt"), "un\n").unwrap();
        let report = diff(&dir).unwrap();
        assert_eq!(report.files.len(), 1);
        assert_eq!(report.files[0].status, FileStatus::Added);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn folder_outside_a_repository_is_an_error() {
        let dir = env::temp_dir().join(format!("kana-git-test-norepo-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        assert!(matches!(diff(&dir), Err(GitError::NotARepository(_))));
        let _ = fs::remove_dir_all(dir);
    }
}
