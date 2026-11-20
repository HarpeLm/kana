//! Ce qu'une branche de travail apporte par rapport à la branche principale, et ses pull requests
//! (avec l'outil `gh` de GitHub).

use std::{fs, path::Path, process::Command};

use serde::{Deserialize, Serialize};

use crate::run::{GitError, git};

/// Un fichier non suivi plus gros que ça n'est pas compté ligne par ligne.
const MAX_UNTRACKED_BYTES: u64 = 512 * 1024;

/// Un fichier touché par le travail de la branche.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FileStat {
    pub path: String,
    pub additions: u32,
    pub deletions: u32,
    /// `added`, `modified` ou `deleted`.
    pub status: String,
}

/// Un commit de la branche.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CommitInfo {
    pub hash: String,
    pub subject: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct BranchSummary {
    pub branch: Option<String>,
    /// La branche principale à laquelle on compare (`main`, `master`…).
    pub base: Option<String>,
    pub additions: u32,
    pub deletions: u32,
    pub files: u32,
    /// Commits de la branche absents de la branche principale.
    pub ahead: u32,
    /// Les fichiers touchés (commits et changements non enregistrés), du plus gros changement au plus petit.
    pub changed: Vec<FileStat>,
    /// Les derniers commits de la branche, du plus récent au plus ancien.
    pub commits: Vec<CommitInfo>,
    /// Il y a des changements non enregistrés (pas encore commités).
    pub dirty: bool,
    /// Le dépôt a un remote `origin` : on peut y pousser.
    pub has_remote: bool,
}

/// La branche principale du dépôt : celle vers laquelle `origin/HEAD` pointe, sinon `main` ou `master`.
fn base_branch(dir: &Path) -> Option<String> {
    if let Ok(head) = git(dir, &["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], &[]) {
        if let Some(name) = head.trim().strip_prefix("origin/") {
            return Some(name.to_owned());
        }
    }
    ["main", "master"]
        .into_iter()
        .find(|b| git(dir, &["rev-parse", "--verify", "--quiet", b], &[]).is_ok())
        .map(str::to_owned)
}

/// Résume le travail d'un dossier de travail : lignes ajoutées et retirées depuis la branche
/// principale (commits et changements non enregistrés compris), fichiers touchés, commits d'avance.
pub fn branch_summary(dir: &Path) -> Result<BranchSummary, GitError> {
    let branch = crate::worktree::current_branch(dir);
    let base = base_branch(dir);
    let has_remote = git(dir, &["remote", "get-url", "origin"], &[]).is_ok();
    let dirty = !git(dir, &["status", "--porcelain"], &[])?.trim().is_empty();

    // Le point de départ du travail : l'ancêtre commun avec la branche principale (ou HEAD).
    let start = base
        .as_deref()
        .and_then(|b| git(dir, &["merge-base", "HEAD", b], &[]).ok())
        .map(|s| s.trim().to_owned())
        .unwrap_or_else(|| "HEAD".to_owned());

    // `--no-renames` : un fichier renommé compte comme un retrait et un ajout, ce qui reste lisible.
    let mut changed: Vec<FileStat> = Vec::new();
    let statuses: std::collections::HashMap<String, &str> = git(dir, &["diff", "--name-status", "--no-renames", &start], &[])?
        .lines()
        .filter_map(|line| {
            let (code, path) = line.split_once('\t')?;
            Some((path.to_owned(), match code {
                "A" => "added",
                "D" => "deleted",
                _ => "modified",
            }))
        })
        .collect();
    for line in git(dir, &["diff", "--numstat", "--no-renames", &start], &[])?.lines() {
        let mut parts = line.splitn(3, '\t');
        let (Some(add), Some(del), Some(path)) = (parts.next(), parts.next(), parts.next()) else { continue };
        changed.push(FileStat {
            path: path.to_owned(),
            additions: add.parse().unwrap_or(0),
            deletions: del.parse().unwrap_or(0),
            status: statuses.get(path).copied().unwrap_or("modified").to_owned(),
        });
    }
    // Les fichiers non suivis ne sont pas dans `git diff` : on compte leurs lignes.
    for name in git(dir, &["ls-files", "--others", "--exclude-standard"], &[])?.lines() {
        let path = dir.join(name);
        let lines = if fs::metadata(&path).map(|m| m.len() <= MAX_UNTRACKED_BYTES).unwrap_or(false) {
            fs::read_to_string(&path).map(|t| t.lines().count() as u32).unwrap_or(0)
        } else {
            0
        };
        changed.push(FileStat { path: name.to_owned(), additions: lines, deletions: 0, status: "added".into() });
    }
    changed.sort_by_key(|f| std::cmp::Reverse(f.additions + f.deletions));
    let additions = changed.iter().map(|f| f.additions).sum();
    let deletions = changed.iter().map(|f| f.deletions).sum();
    let files = changed.len() as u32;

    let ahead = base
        .as_deref()
        .and_then(|b| git(dir, &["rev-list", "--count", &format!("{b}..HEAD")], &[]).ok())
        .and_then(|n| n.trim().parse().ok())
        .unwrap_or(0);

    let commits = base
        .as_deref()
        .and_then(|b| git(dir, &["log", "--format=%h%x09%s", "-n", "10", &format!("{b}..HEAD")], &[]).ok())
        .map(|log| {
            log.lines()
                .filter_map(|line| {
                    let (hash, subject) = line.split_once('\t')?;
                    Some(CommitInfo { hash: hash.to_owned(), subject: subject.to_owned() })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(BranchSummary { branch, base, additions, deletions, files, ahead, changed, commits, dirty, has_remote })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub number: u64,
    pub title: String,
    pub url: String,
    /// `OPEN`, `MERGED` ou `CLOSED`.
    pub state: String,
    pub is_draft: bool,
    pub additions: u64,
    pub deletions: u64,
    /// Nombre de vérifications (CI) en échec.
    #[serde(default)]
    pub checks_failed: u32,
    /// `propriétaire/dépôt`, tiré de l'adresse.
    #[serde(default)]
    pub repo: String,
}

/// Le dépôt (`propriétaire/nom`) d'après l'adresse d'une pull request GitHub.
fn repo_of(url: &str) -> String {
    let parts: Vec<&str> = url.trim_start_matches("https://").split('/').collect();
    if parts.len() >= 3 { format!("{}/{}", parts[1], parts[2]) } else { String::new() }
}

/// Lit la sortie JSON de `gh pr list` ; les vérifications en échec sont comptées.
pub fn parse_pull_requests(json: &str) -> Vec<PullRequest> {
    let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(json) else { return Vec::new() };
    items
        .into_iter()
        .filter_map(|item| {
            let url = item["url"].as_str()?.to_owned();
            let failed = item["statusCheckRollup"]
                .as_array()
                .map(|checks| {
                    checks
                        .iter()
                        .filter(|c| {
                            matches!(c["conclusion"].as_str(), Some("FAILURE" | "TIMED_OUT" | "CANCELLED" | "STARTUP_FAILURE"))
                                || c["state"].as_str() == Some("FAILURE")
                        })
                        .count() as u32
                })
                .unwrap_or(0);
            Some(PullRequest {
                number: item["number"].as_u64()?,
                title: item["title"].as_str()?.to_owned(),
                state: item["state"].as_str().unwrap_or("OPEN").to_owned(),
                is_draft: item["isDraft"].as_bool().unwrap_or(false),
                additions: item["additions"].as_u64().unwrap_or(0),
                deletions: item["deletions"].as_u64().unwrap_or(0),
                checks_failed: failed,
                repo: repo_of(&url),
                url,
            })
        })
        .collect()
}

/// Les pull requests ouvertes depuis `branch`. Vide sans erreur si `gh` est absent, non connecté,
/// ou si le dépôt n'est pas sur GitHub : l'interface n'a alors simplement rien à montrer.
pub fn pull_requests(dir: &Path, branch: &str) -> Vec<PullRequest> {
    let output = Command::new("gh")
        .args([
            "pr", "list", "--head", branch, "--state", "all", "--limit", "10", "--json",
            "number,title,url,state,isDraft,additions,deletions,statusCheckRollup",
        ])
        .current_dir(dir)
        .output();
    match output {
        Ok(out) if out.status.success() => parse_pull_requests(&String::from_utf8_lossy(&out.stdout)),
        _ => Vec::new(),
    }
}

/// Crée une pull request pour la branche : enregistre d'abord les changements en cours (un commit
/// au nom de l'utilisateur, sans mention supplémentaire), pousse la branche vers `origin`, puis
/// ouvre la pull request avec `gh`. Renvoie son adresse.
pub fn create_pull_request(dir: &Path, branch: &str, title: &str) -> Result<String, GitError> {
    if !git(dir, &["status", "--porcelain"], &[])?.trim().is_empty() {
        git(dir, &["add", "-A"], &[])?;
        git(dir, &["commit", "-q", "-m", title], &[])?;
    }
    git(dir, &["push", "-u", "origin", branch], &[])?;
    let out = Command::new("gh")
        .args(["pr", "create", "--head", branch, "--title", title, "--fill"])
        .current_dir(dir)
        .output()?;
    if !out.status.success() {
        return Err(GitError::Failed(String::from_utf8_lossy(&out.stderr).trim().to_owned()));
    }
    // `gh` termine par l'adresse de la pull request.
    Ok(String::from_utf8_lossy(&out.stdout).lines().last().unwrap_or_default().trim().to_owned())
}

#[cfg(test)]
mod tests {
    use std::process::Command;

    use super::*;
    use crate::worktree::add_worktree;

    fn run(dir: &Path, args: &[&str]) {
        assert!(
            Command::new("git")
                .args(["-c", "user.name=t", "-c", "user.email=t@t"])
                .args(args)
                .current_dir(dir)
                .status()
                .unwrap()
                .success(),
            "{args:?}"
        );
    }

    #[test]
    fn summarizes_commits_and_unsaved_work_since_the_main_branch() {
        let repo = std::env::temp_dir().join(format!("kana-forge-{}", std::process::id()));
        let _ = fs::remove_dir_all(&repo);
        fs::create_dir_all(&repo).unwrap();
        run(&repo, &["init", "-q", "-b", "main"]);
        fs::write(repo.join("a.txt"), "un\ndeux\n").unwrap();
        run(&repo, &["add", "-A"]);
        run(&repo, &["commit", "-q", "-m", "init"]);

        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/x", None).unwrap();
        let clean = branch_summary(&work).unwrap();
        assert_eq!((clean.additions, clean.deletions, clean.files, clean.ahead, clean.dirty), (0, 0, 0, 0, false));
        assert_eq!(clean.branch.as_deref(), Some("kana/x"));
        assert_eq!(clean.base.as_deref(), Some("main"));
        assert!(!clean.has_remote);

        // Un commit sur la branche, puis du travail non enregistré (modifié + nouveau fichier).
        fs::write(work.join("a.txt"), "un\ndeux\ntrois\n").unwrap();
        run(&work, &["commit", "-q", "-am", "ajoute trois"]);
        fs::write(work.join("a.txt"), "un\ntrois\n").unwrap();
        fs::write(work.join("b.txt"), "x\ny\n").unwrap();
        let summary = branch_summary(&work).unwrap();
        assert_eq!(summary.ahead, 1);
        assert!(summary.dirty);
        assert_eq!(summary.files, 2);
        assert_eq!(summary.additions, 3, "{summary:?}"); // trois (+1), b.txt (+2)
        assert_eq!(summary.deletions, 1); // deux
        // Le détail : b.txt est nouveau, a.txt modifié ; un commit « ajoute trois ».
        let by_path = |p: &str| summary.changed.iter().find(|f| f.path == p).unwrap();
        assert_eq!(by_path("b.txt").status, "added");
        assert_eq!(by_path("b.txt").additions, 2);
        assert_eq!(by_path("a.txt").status, "modified");
        assert_eq!(summary.commits.len(), 1);
        assert_eq!(summary.commits[0].subject, "ajoute trois");
    }

    #[test]
    fn reads_pull_requests_from_gh_output() {
        let json = r#"[
          {"number":215,"title":"grep: don't read","url":"https://github.com/uutils/grep/pull/215","state":"OPEN",
           "isDraft":false,"additions":65,"deletions":2,
           "statusCheckRollup":[{"conclusion":"SUCCESS"},{"conclusion":"FAILURE"},{"state":"FAILURE"}]},
          {"number":7,"title":"autre","url":"https://github.com/a/b/pull/7","state":"MERGED","isDraft":true,
           "additions":1,"deletions":0}
        ]"#;
        let prs = parse_pull_requests(json);
        assert_eq!(prs.len(), 2);
        assert_eq!(prs[0].repo, "uutils/grep");
        assert_eq!(prs[0].checks_failed, 2);
        assert_eq!(prs[1].state, "MERGED");
        assert!(prs[1].is_draft);
        assert!(parse_pull_requests("pas du json").is_empty());
    }
}
