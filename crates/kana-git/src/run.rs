//! Exécution de `git` pour lire les changements d'un dépôt.

use std::{
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
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
    #[error("écriture impossible : {0}")]
    Write(String),
    #[error("fichier modifié ailleurs depuis son ouverture : {0}")]
    Conflict(String),
}

/// Lance git dans `dir` ; `ok_codes` liste les codes de sortie acceptés en plus de 0.
pub(crate) fn git(dir: &Path, args: &[&str], ok_codes: &[i32]) -> Result<String, GitError> {
    git_with_env(dir, args, ok_codes, &[])
}

pub(crate) fn git_with_env(
    dir: &Path,
    args: &[&str],
    ok_codes: &[i32],
    envs: &[(&str, &Path)],
) -> Result<String, GitError> {
    let mut cmd = Command::new("git");
    cmd.args(["-c", "core.quotepath=off"]).args(args).current_dir(dir);
    for (key, val) in envs {
        cmd.env(key, val);
    }
    let output = cmd.output()?;
    let code = output.status.code().unwrap_or(-1);
    if code != 0 && !ok_codes.contains(&code) {
        return Err(GitError::Failed(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

fn git_with_stdin(dir: &Path, args: &[&str], input: &str) -> Result<String, GitError> {
    let mut child = Command::new("git")
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input.as_bytes())?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
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

fn resolve_repo_path(root: &Path, relative: &str) -> Result<PathBuf, GitError> {
    if relative.trim().is_empty() {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }
    let requested = Path::new(relative);
    let invalid = requested.is_absolute()
        || requested.components().any(|c| match c {
            Component::ParentDir | Component::Prefix(_) => true,
            Component::Normal(part) => part == ".git",
            _ => false,
        });
    if invalid {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }
    let root_real = fs::canonicalize(root).map_err(|e| GitError::Read(e.to_string()))?;
    let target = root_real.join(requested);
    // Remonte jusqu'au premier parent existant pour bloquer tout lien symbolique sortant du dépôt.
    let mut probe = target.as_path();
    while !probe.exists() {
        let Some(parent) = probe.parent() else { break };
        probe = parent;
    }
    let probe_real = fs::canonicalize(probe).map_err(|e| GitError::Read(e.to_string()))?;
    if !probe_real.starts_with(&root_real) {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }
    if let Ok(meta) = fs::symlink_metadata(&target)
        && meta.file_type().is_symlink()
        && let Ok(real) = fs::canonicalize(&target)
        && !real.starts_with(&root_real)
    {
        return Err(GitError::InvalidPath(relative.to_owned()));
    }
    Ok(target)
}

/// Annule toutes les modifications d'un fichier du dépôt (modifié, supprimé, indexé ou non suivi).
pub fn revert_file(repo: &Path, file: &str) -> Result<(), GitError> {
    let root = repo_root(repo)?;
    let target = resolve_repo_path(&root, file)?;
    if has_commit(&root) && git(&root, &["cat-file", "-e", &format!("HEAD:{file}")], &[]).is_ok() {
        git(&root, &["checkout", "HEAD", "--", file], &[])?;
        return Ok(());
    }
    if has_commit(&root) {
        let _ = git(&root, &["reset", "-q", "HEAD", "--", file], &[]);
    } else {
        let _ = git(&root, &["rm", "-f", "--cached", "--quiet", "--ignore-unmatch", "--", file], &[]);
    }
    if target.is_file() || fs::symlink_metadata(&target).is_ok() {
        fs::remove_file(&target).map_err(|e| GitError::Write(e.to_string()))?;
    }
    Ok(())
}

/// Annule uniquement le bloc (`hunk_header`) d'un fichier dans le dépôt.
pub fn revert_hunk(repo: &Path, file: &str, hunk_header: &str) -> Result<(), GitError> {
    let root = repo_root(repo)?;
    let _ = resolve_repo_path(&root, file)?;

    let raw = if has_commit(&root) {
        git(&root, &["diff", "--no-color", "--no-ext-diff", "HEAD", "--", file], &[])?
    } else {
        git(&root, &["diff", "--no-color", "--no-ext-diff", "--", file], &[])?
    };

    if raw.trim().is_empty() {
        if let Some(untracked) = untracked_file(&root, file)
            && untracked.hunks.iter().any(|h| h.header.trim() == hunk_header.trim())
        {
            return revert_file(&root, file);
        }
        return Err(GitError::Failed(format!("bloc introuvable dans {file}")));
    }

    let mut header_lines: Vec<&str> = Vec::new();
    let mut hunks: Vec<Vec<&str>> = Vec::new();
    let mut current_hunk: Option<Vec<&str>> = None;

    for line in raw.lines() {
        if line.starts_with("@@") {
            if let Some(prev) = current_hunk.take() {
                hunks.push(prev);
            }
            current_hunk = Some(vec![line]);
        } else if let Some(hunk) = current_hunk.as_mut() {
            hunk.push(line);
        } else {
            header_lines.push(line);
        }
    }
    if let Some(last) = current_hunk.take() {
        hunks.push(last);
    }

    let wanted = hunk_header.trim();
    let Some(target_hunk) = hunks
        .into_iter()
        .find(|h| h.first().is_some_and(|head| head.trim() == wanted))
    else {
        return Err(GitError::Failed(format!("bloc introuvable : {hunk_header}")));
    };

    let mut patch = String::new();
    for line in header_lines {
        patch.push_str(line);
        patch.push('\n');
    }
    for line in target_hunk {
        patch.push_str(line);
        patch.push('\n');
    }

    git_with_stdin(&root, &["apply", "--reverse", "-"], &patch)?;
    // Si ce bloc était déjà indexé, on le retire aussi de l'index sans échouer s'il ne l'était pas.
    let _ = git_with_stdin(&root, &["apply", "--reverse", "--cached", "-"], &patch);
    Ok(())
}

static CHECKPOINT_SEQ: AtomicU64 = AtomicU64::new(1);

fn sanitize_checkpoint_label(label: &str) -> String {
    let clean: String = label
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .take(48)
        .collect();
    let trimmed = clean.trim_matches('-');
    if trimmed.is_empty() { "turn".to_owned() } else { trimmed.to_owned() }
}

/// Capture l'état complet du dossier de travail (fichiers suivis et non suivis) dans une ref
/// `refs/kana/checkpoints/...` sans modifier `HEAD` ni l'historique `git log`.
pub fn create_checkpoint(dir: &Path, label: &str) -> Result<String, GitError> {
    let root = repo_root(dir)?;
    let seq = CHECKPOINT_SEQ.fetch_add(1, Ordering::Relaxed);
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let temp_index = std::env::temp_dir().join(format!(
        "kana-cp-idx-{}-{ts}-{seq}",
        std::process::id()
    ));
    let _ = fs::remove_file(&temp_index);

    let capture = || -> Result<String, GitError> {
        let envs = [("GIT_INDEX_FILE", temp_index.as_path())];
        git_with_env(&root, &["add", "-A"], &[], &envs)?;
        let tree = git_with_env(&root, &["write-tree"], &[], &envs)?.trim().to_owned();
        let msg = format!("kana checkpoint: {}", label.trim());
        let commit = if has_commit(&root) {
            git(
                &root,
                &["-c", "user.name=Kana", "-c", "user.email=kana@local", "commit-tree", &tree, "-p", "HEAD", "-m", &msg],
                &[],
            )?
        } else {
            git(
                &root,
                &["-c", "user.name=Kana", "-c", "user.email=kana@local", "commit-tree", &tree, "-m", &msg],
                &[],
            )?
        };
        let commit_oid = commit.trim().to_owned();
        let ref_name = format!(
            "refs/kana/checkpoints/{}-{ts}-{seq}",
            sanitize_checkpoint_label(label)
        );
        git(&root, &["update-ref", &ref_name, &commit_oid], &[])?;
        Ok(ref_name)
    };
    let result = capture();
    let _ = fs::remove_file(&temp_index);
    result
}

/// Restaure le dossier de travail à l'état exact capturé par `target` (ref de checkpoint ou hash),
/// sans déplacer `HEAD` ni réécrire l'historique.
pub fn restore_checkpoint(dir: &Path, target: &str) -> Result<(), GitError> {
    let trimmed = target.trim();
    if trimmed.is_empty() || trimmed.starts_with('-') {
        return Err(GitError::Failed("identifiant de checkpoint invalide".into()));
    }
    let root = repo_root(dir)?;
    let tree = git(&root, &["rev-parse", "--verify", "--quiet", &format!("{trimmed}^{{tree}}")], &[])
        .map_err(|_| GitError::Failed(format!("checkpoint introuvable : {trimmed}")))?
        .trim()
        .to_owned();

    git(&root, &["clean", "-fd"], &[])?;
    git(&root, &["read-tree", "--reset", "-u", &tree], &[])?;
    if has_commit(&root) {
        let _ = git(&root, &["reset", "-q", "HEAD"], &[]);
    } else {
        let _ = git(&root, &["rm", "-r", "--cached", "--quiet", "--ignore-unmatch", "."], &[]);
    }
    Ok(())
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

    #[test]
    fn reverts_modified_deleted_and_untracked_files() {
        let dir = scratch_repo("revert-file");
        fs::write(dir.join("a.txt"), "un\n").unwrap();
        fs::write(dir.join("b.txt"), "deux\n").unwrap();
        run(&dir, &["add", "."]);
        run(&dir, &["commit", "-q", "-m", "init"]);

        fs::write(dir.join("a.txt"), "modifié\n").unwrap();
        fs::remove_file(dir.join("b.txt")).unwrap();
        fs::write(dir.join("new.txt"), "non suivi\n").unwrap();

        assert!(matches!(revert_file(&dir, "../evil"), Err(GitError::InvalidPath(_))));
        revert_file(&dir, "a.txt").unwrap();
        revert_file(&dir, "b.txt").unwrap();
        revert_file(&dir, "new.txt").unwrap();

        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "un\n");
        assert_eq!(fs::read_to_string(dir.join("b.txt")).unwrap(), "deux\n");
        assert!(!dir.join("new.txt").exists());
        assert!(diff(&dir).unwrap().files.is_empty());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn reverts_only_the_selected_hunk() {
        let dir = scratch_repo("revert-hunk");
        let original = (1..=20).map(|i| format!("ligne {i}\n")).collect::<String>();
        fs::write(dir.join("code.txt"), &original).unwrap();
        run(&dir, &["add", "."]);
        run(&dir, &["commit", "-q", "-m", "init"]);

        let modified = (1..=20)
            .map(|i| match i {
                2 => "ligne 2 MODIFIEE\n".to_string(),
                18 => "ligne 18 MODIFIEE\n".to_string(),
                _ => format!("ligne {i}\n"),
            })
            .collect::<String>();
        fs::write(dir.join("code.txt"), modified).unwrap();

        let report = diff(&dir).unwrap();
        assert_eq!(report.files[0].hunks.len(), 2);
        let first_hunk = report.files[0].hunks[0].header.clone();

        revert_hunk(&dir, "code.txt", &first_hunk).unwrap();

        let after = fs::read_to_string(dir.join("code.txt")).unwrap();
        assert!(after.contains("ligne 2\n"));
        assert!(!after.contains("ligne 2 MODIFIEE"));
        assert!(after.contains("ligne 18 MODIFIEE\n"));
        assert_eq!(diff(&dir).unwrap().files[0].hunks.len(), 1);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn creates_and_restores_checkpoints_without_polluting_head() {
        let dir = scratch_repo("checkpoint");
        fs::write(dir.join("a.txt"), "base\n").unwrap();
        run(&dir, &["add", "."]);
        run(&dir, &["commit", "-q", "-m", "init"]);
        let head_before = git(&dir, &["rev-parse", "HEAD"], &[]).unwrap();

        // État au moment du checkpoint : a.txt modifié, b.txt non suivi.
        fs::write(dir.join("a.txt"), "checkpoint\n").unwrap();
        fs::write(dir.join("b.txt"), "untracked-cp\n").unwrap();
        let cp = create_checkpoint(&dir, "turn 1").unwrap();
        assert!(cp.starts_with("refs/kana/checkpoints/turn-1-"));
        assert_eq!(git(&dir, &["rev-parse", "HEAD"], &[]).unwrap(), head_before);

        // Modifications ultérieures : a.txt écrasé, b.txt supprimé, c.txt ajouté.
        fs::write(dir.join("a.txt"), "apres\n").unwrap();
        fs::remove_file(dir.join("b.txt")).unwrap();
        fs::write(dir.join("c.txt"), "nouveau\n").unwrap();

        restore_checkpoint(&dir, &cp).unwrap();

        assert_eq!(git(&dir, &["rev-parse", "HEAD"], &[]).unwrap(), head_before);
        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "checkpoint\n");
        assert_eq!(fs::read_to_string(dir.join("b.txt")).unwrap(), "untracked-cp\n");
        assert!(!dir.join("c.txt").exists());
        let _ = fs::remove_dir_all(dir);
    }
}
