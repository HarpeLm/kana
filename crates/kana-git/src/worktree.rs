//! Dossiers de travail git (worktrees) : un par conversation, pour que les agents ne se marchent pas dessus.

use std::{
    fs,
    io::Write,
    path::Path,
    process::{Command, Stdio},
};

use serde::Serialize;

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

/// Une branche `kana/…` du dépôt, avec le dossier de travail qui la porte s'il existe encore.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
pub struct KanaBranch {
    pub branch: String,
    pub worktree: Option<String>,
    /// Tout le travail de la branche est déjà dans la branche principale : on peut la supprimer sans perte.
    pub merged: bool,
    /// Commits de la branche absents de la branche principale.
    pub ahead: u32,
    /// Le dossier de travail contient des changements non enregistrés.
    pub dirty: bool,
}

/// Les dossiers de travail du dépôt d'après `git worktree list --porcelain` : (chemin, branche).
fn worktree_branches(repo: &Path) -> Vec<(String, String)> {
    let Ok(out) = git(repo, &["worktree", "list", "--porcelain"], &[]) else { return Vec::new() };
    let (mut path, mut result) = (String::new(), Vec::new());
    for line in out.lines() {
        if let Some(p) = line.strip_prefix("worktree ") {
            path = p.to_owned();
        } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
            result.push((path.clone(), b.to_owned()));
        }
    }
    result
}

/// Les branches `kana/…` du dépôt (celles que Kana crée pour ses conversations), leur état et leur dossier.
pub fn kana_branches(repo: &Path) -> Vec<KanaBranch> {
    let Ok(listing) = git(repo, &["for-each-ref", "--format=%(refname:short)", "refs/heads/kana/"], &[]) else {
        return Vec::new();
    };
    let base = ["main", "master"]
        .into_iter()
        .find(|b| git(repo, &["rev-parse", "--verify", "--quiet", b], &[]).is_ok());
    let worktrees = worktree_branches(repo);
    listing
        .lines()
        .map(|branch| {
            let worktree = worktrees.iter().find(|(_, b)| b == branch).map(|(p, _)| p.clone());
            let ahead = base
                .and_then(|b| git(repo, &["rev-list", "--count", &format!("{b}..{branch}")], &[]).ok())
                .and_then(|n| n.trim().parse().ok())
                .unwrap_or(0);
            let dirty = worktree
                .as_deref()
                .and_then(|w| git(Path::new(w), &["status", "--porcelain"], &[]).ok())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            KanaBranch { branch: branch.to_owned(), worktree, merged: base.is_some() && ahead == 0, ahead, dirty }
        })
        .collect()
}

/// Supprime une branche seulement si tout son travail est déjà ailleurs (`git branch -d`) :
/// git refuse sinon, et c'est voulu.
pub fn delete_merged_branch(repo: &Path, branch: &str) -> Result<(), GitError> {
    git(repo, &["branch", "-d", branch], &[]).map(|_| ())
}

/// Résultat d'un transfert bidirectionnel à chaud entre le dépôt local et un worktree isolé.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HandoffReport {
    pub direction: String,
    pub target_path: String,
    pub branch: Option<String>,
    pub transferred_files: u32,
}

fn git_apply_stdin(dir: &Path, args: &[&str], input: &[u8]) -> Result<(), GitError> {
    let mut child = Command::new("git")
        .args(["-c", "core.quotepath=off"])
        .args(args)
        .current_dir(dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin.write_all(input)?;
    }
    let output = child.wait_with_output()?;
    if !output.status.success() {
        return Err(GitError::Failed(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }
    Ok(())
}

fn copy_untracked_files(from: &Path, to: &Path) -> Result<Vec<String>, GitError> {
    let out = git(from, &["ls-files", "--others", "--exclude-standard", "-z"], &[])?;
    let mut copied = Vec::new();
    for rel in out.split('\0').filter(|p| !p.is_empty()) {
        let src = from.join(rel);
        if !src.is_file() {
            continue;
        }
        let dst = to.join(rel);
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| GitError::Write(e.to_string()))?;
        }
        fs::copy(&src, &dst).map_err(|e| GitError::Write(e.to_string()))?;
        copied.push(rel.to_owned());
    }
    Ok(copied)
}

/// Transfère les modifications non commitées (suivies et non suivies) du dépôt local vers un
/// worktree isolé à `worktree_path` sur la branche `branch` (créé s'il n'existe pas encore).
pub fn handoff_local_to_worktree(
    repo: &Path,
    worktree_path: &Path,
    branch: &str,
    clean_source: bool,
) -> Result<HandoffReport, GitError> {
    if !worktree_path.exists() {
        if let Some(parent) = worktree_path.parent() {
            fs::create_dir_all(parent).map_err(|e| GitError::Write(e.to_string()))?;
        }
        add_worktree(repo, worktree_path, branch, None)?;
    }

    let tracked_names = git(repo, &["diff", "--name-only", "-z", "HEAD"], &[])?;
    let tracked_count = tracked_names.split('\0').filter(|p| !p.is_empty()).count();
    let patch = git(repo, &["diff", "--binary", "HEAD"], &[])?;
    if !patch.trim().is_empty() {
        git_apply_stdin(worktree_path, &["apply", "--allow-empty"], patch.as_bytes())?;
    }

    let copied_untracked = copy_untracked_files(repo, worktree_path)?;

    if clean_source {
        if tracked_count > 0 {
            git(repo, &["checkout", "--", "."], &[])?;
        }
        for rel in &copied_untracked {
            let src = repo.join(rel);
            if src.exists() {
                fs::remove_file(&src).map_err(|e| GitError::Write(e.to_string()))?;
            }
        }
    }

    let transferred_files = (tracked_count + copied_untracked.len()) as u32;
    Ok(HandoffReport {
        direction: "to_worktree".to_owned(),
        target_path: worktree_path.to_string_lossy().into_owned(),
        branch: current_branch(worktree_path).or_else(|| Some(branch.to_owned())),
        transferred_files,
    })
}

/// Rapatrie les changements d'un worktree (commits depuis `HEAD` local + modifications en cours +
/// fichiers non suivis) dans le dépôt local `repo`, sans commit ni fusion définitive.
/// Vérifie d'abord l'applicabilité du patch avec `git apply --check` pour ne jamais salir `repo`.
pub fn handoff_worktree_to_local(repo: &Path, worktree_path: &Path) -> Result<HandoffReport, GitError> {
    let repo_head = git(repo, &["rev-parse", "HEAD"], &[])?.trim().to_owned();
    let tracked_names = git(worktree_path, &["diff", "--name-only", "-z", &repo_head], &[])?;
    let tracked_count = tracked_names.split('\0').filter(|p| !p.is_empty()).count();
    let patch = git(worktree_path, &["diff", "--binary", &repo_head], &[])?;

    if !patch.trim().is_empty() {
        git_apply_stdin(repo, &["apply", "--check"], patch.as_bytes())?;
        git_apply_stdin(repo, &["apply"], patch.as_bytes())?;
    }

    let copied_untracked = copy_untracked_files(worktree_path, repo)?;
    let transferred_files = (tracked_count + copied_untracked.len()) as u32;

    Ok(HandoffReport {
        direction: "to_local".to_owned(),
        target_path: repo.to_string_lossy().into_owned(),
        branch: current_branch(repo),
        transferred_files,
    })
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
    fn lists_kana_branches_and_deletes_only_merged_ones() {
        let repo = repo("kanabranches");
        let clean = repo.with_extension("clean");
        let work = repo.with_extension("work");
        add_worktree(&repo, &clean, "kana/clean", None).unwrap();
        add_worktree(&repo, &work, "kana/work", None).unwrap();
        // « work » a un commit que la branche principale n'a pas, et du travail non enregistré.
        fs::write(work.join("a.txt"), "x").unwrap();
        for args in [vec!["add", "-A"], vec!["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "w"]] {
            assert!(Command::new("git").args(&args).current_dir(&work).status().unwrap().success());
        }
        fs::write(work.join("b.txt"), "y").unwrap();

        let branches = kana_branches(&repo);
        let find = |name: &str| branches.iter().find(|b| b.branch == name).unwrap();
        assert!(find("kana/clean").merged && !find("kana/clean").dirty);
        assert_eq!(find("kana/work").ahead, 1);
        assert!(!find("kana/work").merged && find("kana/work").dirty);
        assert!(find("kana/work").worktree.is_some());

        // La branche propre peut partir une fois son dossier retiré ; l'autre est refusée.
        remove_worktree(&repo, &clean).unwrap();
        delete_merged_branch(&repo, "kana/clean").unwrap();
        assert!(delete_merged_branch(&repo, "kana/work").is_err());
        assert!(kana_branches(&repo).iter().all(|b| b.branch != "kana/clean"));
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

    #[test]
    fn handoff_local_to_worktree_transfers_modified_and_untracked_files() {
        let repo = repo("handoff-to-wt");
        fs::write(repo.join("tracked.txt"), "initial\n").unwrap();
        for args in [vec!["add", "tracked.txt"], vec!["commit", "-q", "-m", "add tracked"]] {
            assert!(Command::new("git").args(&args).current_dir(&repo).status().unwrap().success());
        }

        // Modifications suivies + fichier non suivi dans un sous-dossier.
        fs::write(repo.join("tracked.txt"), "modifié localement\n").unwrap();
        fs::create_dir_all(repo.join("nested")).unwrap();
        fs::write(repo.join("nested/new.txt"), "contenu non suivi\n").unwrap();

        let wt = repo.with_extension("wt");
        let report = handoff_local_to_worktree(&repo, &wt, "kana/handoff-wt", true).unwrap();

        assert_eq!(report.direction, "to_worktree");
        assert_eq!(report.target_path, wt.to_string_lossy());
        assert_eq!(report.branch.as_deref(), Some("kana/handoff-wt"));
        assert_eq!(report.transferred_files, 2);

        // Le worktree reçoit les modifications suivies et le fichier non suivi.
        assert_eq!(fs::read_to_string(wt.join("tracked.txt")).unwrap(), "modifié localement\n");
        assert_eq!(fs::read_to_string(wt.join("nested/new.txt")).unwrap(), "contenu non suivi\n");

        // Le dépôt source a été nettoyé pour les fichiers transférés.
        assert_eq!(fs::read_to_string(repo.join("tracked.txt")).unwrap(), "initial\n");
        assert!(!repo.join("nested/new.txt").exists());
    }

    #[test]
    fn handoff_worktree_to_local_transfers_changes_without_merging() {
        let repo = repo("handoff-to-local");
        fs::write(repo.join("app.txt"), "v1\n").unwrap();
        for args in [vec!["add", "app.txt"], vec!["commit", "-q", "-m", "v1"]] {
            assert!(Command::new("git").args(&args).current_dir(&repo).status().unwrap().success());
        }
        let head_before = git(&repo, &["rev-parse", "HEAD"], &[]).unwrap();

        let wt = repo.with_extension("wt");
        add_worktree(&repo, &wt, "kana/handoff-local", None).unwrap();

        // Dans le worktree : un commit + une modification suivie + un fichier non suivi.
        fs::write(wt.join("committed.txt"), "depuis commit worktree\n").unwrap();
        for args in [vec!["add", "committed.txt"], vec!["commit", "-q", "-m", "wt commit"]] {
            assert!(Command::new("git").args(&args).current_dir(&wt).status().unwrap().success());
        }
        fs::write(wt.join("app.txt"), "v2 depuis worktree\n").unwrap();
        fs::create_dir_all(wt.join("notes")).unwrap();
        fs::write(wt.join("notes/todo.txt"), "à relire\n").unwrap();

        let report = handoff_worktree_to_local(&repo, &wt).unwrap();

        assert_eq!(report.direction, "to_local");
        assert_eq!(report.target_path, repo.to_string_lossy());
        assert_eq!(report.branch.as_deref(), Some("main"));
        assert_eq!(report.transferred_files, 3);

        // Les changements sont appliqués en local sans commit ni fusion définitive.
        assert_eq!(git(&repo, &["rev-parse", "HEAD"], &[]).unwrap(), head_before);
        assert_eq!(fs::read_to_string(repo.join("app.txt")).unwrap(), "v2 depuis worktree\n");
        assert_eq!(fs::read_to_string(repo.join("committed.txt")).unwrap(), "depuis commit worktree\n");
        assert_eq!(fs::read_to_string(repo.join("notes/todo.txt")).unwrap(), "à relire\n");

        // En cas de conflit dans le dépôt local, git apply --check échoue sans salir le dépôt.
        fs::write(repo.join("app.txt"), "conflit local\n").unwrap();
        assert!(handoff_worktree_to_local(&repo, &wt).is_err());
        assert_eq!(fs::read_to_string(repo.join("app.txt")).unwrap(), "conflit local\n");
    }
}
