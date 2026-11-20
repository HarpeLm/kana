//! Dossiers de travail git (worktrees) : un par conversation, pour que les agents ne se marchent pas dessus.

use std::path::Path;

use crate::run::{GitError, git};

/// Crée un dossier de travail à `path`, sur une nouvelle branche `branch` partie de `base`
/// (la branche courante si `base` est `None`).
pub fn add_worktree(repo: &Path, path: &Path, branch: &str, base: Option<&str>) -> Result<(), GitError> {
    let target = path.to_string_lossy();
    let mut args = vec!["worktree", "add", "-b", branch, target.as_ref()];
    if let Some(base) = base {
        args.push(base);
    }
    git(repo, &args, &[]).map(|_| ())
}

/// Supprime un dossier de travail. Refuse s'il contient des changements non enregistrés :
/// le travail d'un agent ne doit jamais disparaître sans que l'utilisateur le sache.
pub fn remove_worktree(repo: &Path, path: &Path) -> Result<(), GitError> {
    let target = path.to_string_lossy();
    git(repo, &["worktree", "remove", target.as_ref()], &[]).map(|_| ())
}

/// Crée un dépôt neuf dans `dir` (branche `main`) avec un premier commit vide : sans commit, on ne
/// pourrait pas y créer de dossier de travail. Le commit est signé de l'identité git de l'utilisateur ;
/// s'il n'en a pas, d'une identité de repli.
pub fn init_repository(dir: &Path) -> Result<(), GitError> {
    git(dir, &["init", "-q", "-b", "main"], &[])?;
    let plain = git(dir, &["commit", "-q", "--allow-empty", "-m", "Initial commit"], &[]);
    if plain.is_err() {
        git(
            dir,
            &["-c", "user.name=Kana", "-c", "user.email=kana@localhost", "commit", "-q", "--allow-empty", "-m", "Initial commit"],
            &[],
        )?;
    }
    Ok(())
}

/// Le nom de la branche d'un dossier, ou `None` (tête détachée, pas un dépôt).
pub fn current_branch(dir: &Path) -> Option<String> {
    let name = git(dir, &["rev-parse", "--abbrev-ref", "HEAD"], &[]).ok()?;
    let name = name.trim();
    (!name.is_empty() && name != "HEAD").then(|| name.to_owned())
}

#[cfg(test)]
mod tests {
    use std::{fs, process::Command};

    use super::*;

    fn repo(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("kana-wt-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        for args in [
            vec!["init", "-q", "-b", "main"],
            vec!["config", "user.email", "t@t"],
            vec!["config", "user.name", "t"],
            vec!["commit", "-q", "--allow-empty", "-m", "init"],
        ] {
            assert!(Command::new("git").args(&args).current_dir(&dir).status().unwrap().success());
        }
        dir
    }

    #[test]
    fn a_fresh_repository_can_host_worktrees() {
        let dir = std::env::temp_dir().join(format!("kana-init-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        init_repository(&dir).unwrap();
        let path = dir.with_extension("wt");
        add_worktree(&dir, &path, "kana/x", None).unwrap();
        assert_eq!(current_branch(&path).as_deref(), Some("kana/x"));
    }

    #[test]
    fn adds_and_removes_a_clean_worktree() {
        let repo = repo("clean");
        let path = repo.with_extension("wt");
        add_worktree(&repo, &path, "kana/test", None).unwrap();
        assert!(path.join(".git").exists());
        assert_eq!(current_branch(&path).as_deref(), Some("kana/test"));
        remove_worktree(&repo, &path).unwrap();
        assert!(!path.exists());
    }

    #[test]
    fn refuses_to_remove_a_worktree_with_changes() {
        let repo = repo("dirty");
        let path = repo.with_extension("wt");
        add_worktree(&repo, &path, "kana/dirty", None).unwrap();
        fs::write(path.join("work.txt"), "à garder").unwrap();
        assert!(remove_worktree(&repo, &path).is_err());
        assert!(path.join("work.txt").exists());
    }

    #[test]
    fn branches_from_another_branch() {
        let repo = repo("base");
        let first = repo.with_extension("a");
        let second = repo.with_extension("b");
        add_worktree(&repo, &first, "kana/a", None).unwrap();
        add_worktree(&repo, &second, "kana/b", Some("kana/a")).unwrap();
        assert_eq!(current_branch(&second).as_deref(), Some("kana/b"));
    }
}
