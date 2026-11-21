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
pub fn base_branch(dir: &Path) -> Option<String> {
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

/// Forge Git détectée à partir du remote `origin`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ForgeKind {
    GitHub,
    GitLab,
    Generic,
}

fn extract_host_and_path(raw: &str) -> Option<(String, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let clean = trimmed.trim_end_matches('/').trim_end_matches(".git");
    if let Some(rest) = clean.strip_prefix("https://").or_else(|| clean.strip_prefix("http://")) {
        let rest = rest.rsplit_once('@').map_or(rest, |(_, after)| after);
        let (host, path) = rest.split_once('/')?;
        let host_clean = host.split(':').next().unwrap_or(host);
        if host_clean.is_empty() || path.is_empty() {
            return None;
        }
        return Some((host_clean.to_owned(), path.trim_start_matches('/').to_owned()));
    }
    if let Some(rest) = clean.strip_prefix("ssh://") {
        let rest = rest.rsplit_once('@').map_or(rest, |(_, after)| after);
        let (host, path) = rest.split_once('/')?;
        let host_clean = host.split(':').next().unwrap_or(host);
        if host_clean.is_empty() || path.is_empty() {
            return None;
        }
        return Some((host_clean.to_owned(), path.trim_start_matches('/').to_owned()));
    }
    // Format SCP : git@host:owner/repo(.git)
    if let Some((user_host, path)) = clean.split_once(':') {
        let host = user_host.rsplit_once('@').map_or(user_host, |(_, h)| h);
        if !host.is_empty() && !path.is_empty() && !host.contains('/') {
            return Some((host.to_owned(), path.trim_start_matches('/').to_owned()));
        }
    }
    None
}

/// Identifie la forge associée à une URL de dépôt distant (`GitHub`, `GitLab` ou `Generic`).
pub fn detect_forge(remote: &str) -> ForgeKind {
    let host = extract_host_and_path(remote)
        .map(|(h, _)| h.to_ascii_lowercase())
        .unwrap_or_else(|| remote.to_ascii_lowercase());
    if host.contains("github") {
        ForgeKind::GitHub
    } else if host.contains("gitlab") {
        ForgeKind::GitLab
    } else {
        ForgeKind::Generic
    }
}

/// Convertit une URL de remote SSH ou HTTPS (GitHub, GitLab, Codeberg, Gitea…) en URL web navigable.
pub fn forge_web_url(remote: &str) -> Option<String> {
    let (host, path) = extract_host_and_path(remote)?;
    Some(format!("https://{host}/{path}"))
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
    /// Forge source (`github` ou `gitlab`).
    #[serde(default)]
    pub forge: String,
}

/// Le dépôt (`propriétaire/nom`) d'après l'adresse d'une pull request ou merge request.
fn repo_of(url: &str) -> String {
    let without_scheme = url
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    let parts: Vec<&str> = without_scheme.split('/').collect();
    if let Some(pos) = parts.iter().position(|&p| p == "pull" || p == "-")
        && pos >= 2
    {
        return parts[1..pos].join("/");
    }
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
                forge: "github".into(),
                url,
            })
        })
        .collect()
}

/// Lit la sortie JSON de `glab mr list -F json`.
pub fn parse_merge_requests(json: &str) -> Vec<PullRequest> {
    let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(json) else { return Vec::new() };
    items
        .into_iter()
        .filter_map(|item| {
            let url = item["web_url"].as_str().or_else(|| item["url"].as_str())?.to_owned();
            let number = item["iid"].as_u64().or_else(|| item["number"].as_u64())?;
            let title = item["title"].as_str()?.to_owned();
            let raw_state = item["state"].as_str().unwrap_or("opened").to_ascii_lowercase();
            let state = match raw_state.as_str() {
                "merged" => "MERGED",
                "closed" => "CLOSED",
                _ => "OPEN",
            }
            .to_owned();
            let is_draft = item["draft"]
                .as_bool()
                .or_else(|| item["work_in_progress"].as_bool())
                .unwrap_or(false);
            let pipeline_status = item["head_pipeline"]["status"]
                .as_str()
                .or_else(|| item["pipeline"]["status"].as_str())
                .unwrap_or("");
            let checks_failed = if matches!(pipeline_status, "failed" | "canceled") { 1 } else { 0 };
            let repo = item["references"]["full"]
                .as_str()
                .and_then(|s| s.split('!').next())
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .unwrap_or_else(|| repo_of(&url));
            Some(PullRequest {
                number,
                title,
                url,
                state,
                is_draft,
                additions: item["additions"].as_u64().unwrap_or(0),
                deletions: item["deletions"].as_u64().unwrap_or(0),
                checks_failed,
                repo,
                forge: "gitlab".into(),
            })
        })
        .collect()
}

fn origin_remote(dir: &Path) -> Option<String> {
    git(dir, &["remote", "get-url", "origin"], &[])
        .ok()
        .map(|s| s.trim().to_owned())
        .filter(|s| !s.is_empty())
}

/// Les pull/merge requests ouvertes depuis `branch` (`gh` pour GitHub, `glab` pour GitLab).
/// Vide sans erreur si l'outil CLI est absent ou non connecté.
pub fn pull_requests(dir: &Path, branch: &str) -> Vec<PullRequest> {
    let forge = origin_remote(dir).map(|r| detect_forge(&r)).unwrap_or(ForgeKind::GitHub);
    if forge == ForgeKind::GitLab {
        let output = Command::new("glab")
            .args(["mr", "list", "--source-branch", branch, "--all", "-F", "json"])
            .current_dir(dir)
            .output();
        if let Ok(out) = output
            && out.status.success()
        {
            return parse_merge_requests(&String::from_utf8_lossy(&out.stdout));
        }
        return Vec::new();
    }
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

/// Commentaires de review et logs CI en échec importés depuis une PR/MR.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrFeedback {
    pub pr_number: u64,
    pub title: String,
    pub forge: String,
    pub review_comments: Vec<String>,
    pub failed_checks: Vec<String>,
    pub failed_log_excerpt: String,
}

fn format_comment(author: Option<&str>, location: Option<&str>, body: &str) -> Option<String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return None;
    }
    let who = author.map(str::trim).filter(|s| !s.is_empty()).unwrap_or("reviewer");
    let where_part = location.map(str::trim).filter(|s| !s.is_empty()).map(|l| format!(" ({l})")).unwrap_or_default();
    Some(format!("@{who}{where_part}: {trimmed}"))
}

fn truncate_log_excerpt(raw: &str) -> String {
    let lines: Vec<&str> = raw.lines().collect();
    let tail = if lines.len() > 80 { &lines[lines.len() - 80..] } else { &lines[..] };
    let joined = tail.join("\n").trim().to_owned();
    if joined.len() > 3500 {
        joined.chars().rev().take(3500).collect::<String>().chars().rev().collect()
    } else {
        joined
    }
}

/// Parse la sortie JSON de `gh pr view --json number,title,comments,reviews,statusCheckRollup`.
pub fn parse_gh_pr_feedback(json: &str, failed_log_excerpt: &str) -> Option<PrFeedback> {
    let item = serde_json::from_str::<serde_json::Value>(json).ok()?;
    let pr_number = item["number"].as_u64()?;
    let title = item["title"].as_str().unwrap_or("").to_owned();
    let mut review_comments = Vec::new();

    if let Some(comments) = item["comments"].as_array() {
        for c in comments {
            if let Some(formatted) = format_comment(c["author"]["login"].as_str(), None, c["body"].as_str().unwrap_or("")) {
                review_comments.push(formatted);
            }
        }
    }
    if let Some(reviews) = item["reviews"].as_array() {
        for r in reviews {
            let author = r["author"]["login"].as_str();
            let state = r["state"].as_str().unwrap_or("");
            let body = r["body"].as_str().unwrap_or("");
            if !body.trim().is_empty() {
                let loc = if state.is_empty() { None } else { Some(state) };
                if let Some(formatted) = format_comment(author, loc, body) {
                    review_comments.push(formatted);
                }
            }
            if let Some(inline) = r["comments"].as_array() {
                for c in inline {
                    let path = c["path"].as_str().unwrap_or("");
                    let line = c["line"].as_u64().or_else(|| c["originalLine"].as_u64());
                    let loc = match (path.is_empty(), line) {
                        (false, Some(l)) => Some(format!("{path}:{l}")),
                        (false, None) => Some(path.to_owned()),
                        _ => None,
                    };
                    if let Some(formatted) = format_comment(
                        c["author"]["login"].as_str().or(author),
                        loc.as_deref(),
                        c["body"].as_str().unwrap_or(""),
                    ) {
                        review_comments.push(formatted);
                    }
                }
            }
        }
    }

    let mut failed_checks = Vec::new();
    if let Some(checks) = item["statusCheckRollup"].as_array() {
        for c in checks {
            let is_failed = matches!(
                c["conclusion"].as_str(),
                Some("FAILURE" | "TIMED_OUT" | "CANCELLED" | "STARTUP_FAILURE")
            ) || c["state"].as_str() == Some("FAILURE");
            if is_failed {
                let name = c["name"]
                    .as_str()
                    .or_else(|| c["context"].as_str())
                    .unwrap_or("Check CI");
                let detail = c["conclusion"].as_str().or_else(|| c["state"].as_str()).unwrap_or("FAILURE");
                failed_checks.push(format!("{name} ({detail})"));
            }
        }
    }

    Some(PrFeedback {
        pr_number,
        title,
        forge: "github".into(),
        review_comments,
        failed_checks,
        failed_log_excerpt: truncate_log_excerpt(failed_log_excerpt),
    })
}

/// Parse la sortie JSON de `glab mr view -F json` et ses notes associées.
pub fn parse_glab_mr_feedback(json: &str, notes_json: &str, failed_log_excerpt: &str) -> Option<PrFeedback> {
    let item = serde_json::from_str::<serde_json::Value>(json).ok()?;
    let pr_number = item["iid"].as_u64().or_else(|| item["number"].as_u64())?;
    let title = item["title"].as_str().unwrap_or("").to_owned();
    let mut review_comments = Vec::new();

    if let Ok(notes) = serde_json::from_str::<Vec<serde_json::Value>>(notes_json) {
        for n in notes {
            if n["system"].as_bool() == Some(true) {
                continue;
            }
            let path = n["position"]["new_path"].as_str().unwrap_or("");
            let line = n["position"]["new_line"].as_u64();
            let loc = match (path.is_empty(), line) {
                (false, Some(l)) => Some(format!("{path}:{l}")),
                (false, None) => Some(path.to_owned()),
                _ => None,
            };
            if let Some(formatted) = format_comment(
                n["author"]["username"].as_str().or_else(|| n["author"]["name"].as_str()),
                loc.as_deref(),
                n["body"].as_str().unwrap_or(""),
            ) {
                review_comments.push(formatted);
            }
        }
    }

    let mut failed_checks = Vec::new();
    let pipeline = &item["head_pipeline"];
    if let Some(status) = pipeline["status"].as_str().or_else(|| item["pipeline"]["status"].as_str())
        && matches!(status, "failed" | "canceled")
    {
        failed_checks.push(format!("Pipeline GitLab ({status})"));
    }
    if let Some(jobs) = item["jobs"].as_array() {
        for job in jobs {
            if job["status"].as_str() == Some("failed") {
                let name = job["name"].as_str().unwrap_or("job");
                failed_checks.push(format!("{name} (failed)"));
            }
        }
    }

    Some(PrFeedback {
        pr_number,
        title,
        forge: "gitlab".into(),
        review_comments,
        failed_checks,
        failed_log_excerpt: truncate_log_excerpt(failed_log_excerpt),
    })
}

fn extract_gh_run_id(view_json: &str) -> Option<String> {
    let v = serde_json::from_str::<serde_json::Value>(view_json).ok()?;
    let checks = v["statusCheckRollup"].as_array()?;
    for c in checks {
        let is_failed = matches!(
            c["conclusion"].as_str(),
            Some("FAILURE" | "TIMED_OUT" | "CANCELLED" | "STARTUP_FAILURE")
        ) || c["state"].as_str() == Some("FAILURE");
        if is_failed && let Some(url) = c["detailsUrl"].as_str().or_else(|| c["targetUrl"].as_str()) {
            if let Some((_, rest)) = url.split_once("/actions/runs/") {
                let id: String = rest.chars().take_while(|ch| ch.is_ascii_digit()).collect();
                if !id.is_empty() {
                    return Some(id);
                }
            }
        }
    }
    None
}

/// Récupère les commentaires de review et un extrait des logs CI en échec pour la PR/MR `pr_number`.
pub fn fetch_pr_feedback(dir: &Path, pr_number: u64) -> Result<PrFeedback, GitError> {
    let forge = origin_remote(dir).map(|r| detect_forge(&r)).unwrap_or(ForgeKind::GitHub);
    let num = pr_number.to_string();

    if forge == ForgeKind::GitLab {
        let mr_out = Command::new("glab")
            .args(["mr", "view", &num, "-F", "json"])
            .current_dir(dir)
            .output()?;
        if !mr_out.status.success() {
            return Err(GitError::Failed(String::from_utf8_lossy(&mr_out.stderr).trim().to_owned()));
        }
        let mr_json = String::from_utf8_lossy(&mr_out.stdout).into_owned();
        let notes_out = Command::new("glab")
            .args(["api", &format!("projects/:fullpath/merge_requests/{num}/notes")])
            .current_dir(dir)
            .output();
        let notes_json = match notes_out {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).into_owned(),
            _ => "[]".into(),
        };
        let trace_out = Command::new("glab").args(["ci", "trace"]).current_dir(dir).output();
        let log_excerpt = match trace_out {
            Ok(out) if out.status.success() => String::from_utf8_lossy(&out.stdout).into_owned(),
            _ => String::new(),
        };
        return parse_glab_mr_feedback(&mr_json, &notes_json, &log_excerpt)
            .ok_or_else(|| GitError::Failed("réponse GitLab MR illisible".into()));
    }

    let pr_out = Command::new("gh")
        .args([
            "pr", "view", &num, "--json",
            "number,title,comments,reviews,statusCheckRollup",
        ])
        .current_dir(dir)
        .output()?;
    if !pr_out.status.success() {
        return Err(GitError::Failed(String::from_utf8_lossy(&pr_out.stderr).trim().to_owned()));
    }
    let pr_json = String::from_utf8_lossy(&pr_out.stdout).into_owned();

    let mut log_excerpt = String::new();
    if let Some(run_id) = extract_gh_run_id(&pr_json) {
        if let Ok(run_out) = Command::new("gh")
            .args(["run", "view", &run_id, "--log-failed"])
            .current_dir(dir)
            .output()
            && run_out.status.success()
        {
            log_excerpt = String::from_utf8_lossy(&run_out.stdout).into_owned();
        }
    }

    let mut feedback = parse_gh_pr_feedback(&pr_json, &log_excerpt)
        .ok_or_else(|| GitError::Failed("réponse GitHub PR illisible".into()))?;

    // Complète avec les commentaires inline de review si disponibles.
    if let Ok(inline_out) = Command::new("gh")
        .args(["api", &format!("repos/{{owner}}/{{repo}}/pulls/{num}/comments")])
        .current_dir(dir)
        .output()
        && inline_out.status.success()
        && let Ok(items) = serde_json::from_slice::<Vec<serde_json::Value>>(&inline_out.stdout)
    {
        for c in items {
            let path = c["path"].as_str().unwrap_or("");
            let line = c["line"].as_u64().or_else(|| c["original_line"].as_u64());
            let loc = match (path.is_empty(), line) {
                (false, Some(l)) => Some(format!("{path}:{l}")),
                (false, None) => Some(path.to_owned()),
                _ => None,
            };
            if let Some(formatted) = format_comment(
                c["user"]["login"].as_str(),
                loc.as_deref(),
                c["body"].as_str().unwrap_or(""),
            ) && !feedback.review_comments.contains(&formatted)
            {
                feedback.review_comments.push(formatted);
            }
        }
    }

    Ok(feedback)
}

/// Enregistre les changements en cours dans un commit (au nom de l'utilisateur, sans mention en plus).
/// Renvoie `false` s'il n'y avait rien à enregistrer.
pub fn save_work(dir: &Path, message: &str) -> Result<bool, GitError> {
    if git(dir, &["status", "--porcelain"], &[])?.trim().is_empty() {
        return Ok(false);
    }
    git(dir, &["add", "-A"], &[])?;
    git(dir, &["commit", "-q", "-m", message], &[])?;
    Ok(true)
}

/// Le résultat d'une fusion.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MergeReport {
    /// La branche principale qui a reçu le travail.
    pub base: String,
    /// Commits de la branche qui sont entrés dans la branche principale.
    pub merged_commits: u32,
    /// Fusion « en avance rapide » : la branche principale n'avait pas bougé, aucun commit de fusion.
    pub fast_forward: bool,
}

/// Fusionne `branch` dans la branche principale du projet `repo` (là où le projet est ouvert, avec sa
/// branche principale extraite). Refuse si le projet a des changements non enregistrés ou s'il est sur
/// une autre branche. En cas de conflit, la fusion est annulée : le projet reste exactement comme avant.
pub fn merge_branch(repo: &Path, branch: &str) -> Result<MergeReport, GitError> {
    let base = base_branch(repo).ok_or_else(|| GitError::Failed("branche principale introuvable".into()))?;
    let current = crate::worktree::current_branch(repo);
    if current.as_deref() != Some(base.as_str()) {
        return Err(GitError::Failed(format!(
            "le projet est sur la branche « {} » et non sur « {base} » : revenir sur « {base} » avant de fusionner",
            current.unwrap_or_else(|| "(aucune)".into())
        )));
    }
    if !git(repo, &["status", "--porcelain"], &[])?.trim().is_empty() {
        return Err(GitError::Failed(
            "le projet a des changements non enregistrés : les enregistrer ou les mettre de côté avant de fusionner".into(),
        ));
    }
    let count: u32 = git(repo, &["rev-list", "--count", &format!("{base}..{branch}")], &[])?.trim().parse().unwrap_or(0);
    let fast_forward = is_ancestor(repo, &base, branch);
    match git(repo, &["merge", "--no-edit", branch], &[]) {
        Ok(_) => Ok(MergeReport { base, merged_commits: count, fast_forward }),
        Err(error) => {
            // Conflit : on annule, le projet retrouve son état d'avant.
            let _ = git(repo, &["merge", "--abort"], &[]);
            Err(GitError::Failed(format!(
                "la fusion a des conflits avec « {base} » : elle est annulée, rien n'a changé ({error})"
            )))
        }
    }
}

fn is_ancestor(repo: &Path, ancestor: &str, descendant: &str) -> bool {
    Command::new("git")
        .args(["merge-base", "--is-ancestor", ancestor, descendant])
        .current_dir(repo)
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Un fichier en conflit détecté lors de l'inspection d'une fusion sans modifier le dépôt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    pub snippet: String,
}

fn conflict_snippet(content: &str) -> String {
    let lines: Vec<&str> = content.lines().collect();
    if let Some(pos) = lines.iter().position(|l| l.starts_with("<<<<<<<")) {
        let start = pos.saturating_sub(3);
        let end = (pos + 45).min(lines.len());
        return lines[start..end].join("\n");
    }
    lines.iter().take(40).copied().collect::<Vec<_>>().join("\n")
}

/// Simule la fusion de `branch` dans la branche principale via `git merge-tree --write-tree`
/// sans modifier ni l'index ni le dossier de travail, et renvoie les fichiers en conflit.
pub fn inspect_merge_conflicts(repo: &Path, branch: &str) -> Result<Vec<ConflictFile>, GitError> {
    let base = base_branch(repo).ok_or_else(|| GitError::Failed("branche principale introuvable".into()))?;
    let output = Command::new("git")
        .args(["-c", "core.quotepath=off", "merge-tree", "--write-tree", "--name-only", &base, branch])
        .current_dir(repo)
        .output()?;
    let code = output.status.code().unwrap_or(-1);
    if code == 0 {
        return Ok(Vec::new());
    }
    if code != 1 {
        return Err(GitError::Failed(String::from_utf8_lossy(&output.stderr).trim().to_owned()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    let tree_oid = lines.next().unwrap_or("").trim().to_owned();
    let mut paths = Vec::new();
    let mut info_lines = Vec::new();
    let mut in_info = false;
    for line in lines {
        if !in_info {
            if line.trim().is_empty() {
                in_info = true;
            } else if !paths.iter().any(|p: &String| p == line) {
                paths.push(line.to_owned());
            }
        } else if !line.trim().is_empty() {
            info_lines.push(line.to_owned());
        }
    }

    let mut conflicts = Vec::with_capacity(paths.len());
    for path in paths {
        let snippet = match git(repo, &["show", &format!("{tree_oid}:{path}")], &[]) {
            Ok(content) => conflict_snippet(&content),
            Err(_) => {
                let matching: Vec<&str> = info_lines
                    .iter()
                    .filter(|l| l.contains(&path))
                    .map(String::as_str)
                    .collect();
                if matching.is_empty() {
                    format!("Conflit détecté sur {path}")
                } else {
                    matching.join("\n")
                }
            }
        };
        conflicts.push(ConflictFile { path, snippet });
    }
    Ok(conflicts)
}

/// Abandonne un travail : supprime son dossier de travail (avec tout ce qu'il contient) et sa branche,
/// commits non fusionnés compris. Définitif : l'appelant doit avoir demandé confirmation.
pub fn discard_work(repo: &Path, worktree: &Path, branch: &str) -> Result<(), GitError> {
    let target = worktree.to_string_lossy();
    git(repo, &["worktree", "remove", "--force", target.as_ref()], &[])?;
    git(repo, &["branch", "-D", branch], &[]).map(|_| ())
}

/// Crée une pull request pour la branche : enregistre d'abord les changements en cours (un commit
/// au nom de l'utilisateur, sans mention supplémentaire), pousse la branche vers `origin`, puis
/// ouvre la pull request avec `gh`. Renvoie son adresse.
pub fn create_pull_request(dir: &Path, branch: &str, title: &str) -> Result<String, GitError> {
    save_work(dir, title)?;
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

    fn project(name: &str) -> std::path::PathBuf {
        let repo = std::env::temp_dir().join(format!("kana-merge-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&repo);
        let _ = fs::remove_dir_all(repo.with_extension("wt"));
        fs::create_dir_all(&repo).unwrap();
        run(&repo, &["init", "-q", "-b", "main"]);
        fs::write(repo.join("a.txt"), "un\n").unwrap();
        run(&repo, &["add", "-A"]);
        run(&repo, &["commit", "-q", "-m", "init"]);
        repo
    }

    fn commit_in(dir: &Path, file: &str, text: &str, message: &str) {
        fs::write(dir.join(file), text).unwrap();
        run(dir, &["add", "-A"]);
        run(dir, &["commit", "-q", "-m", message]);
    }

    #[test]
    fn merges_a_branch_by_fast_forward() {
        let repo = project("ff");
        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/a", None).unwrap();
        assert!(!save_work(&work, "rien").unwrap());
        fs::write(work.join("b.txt"), "neuf").unwrap();
        assert!(save_work(&work, "ajoute b").unwrap());
        let report = merge_branch(&repo, "kana/a").unwrap();
        assert_eq!(report, MergeReport { base: "main".into(), merged_commits: 1, fast_forward: true });
        assert_eq!(fs::read_to_string(repo.join("b.txt")).unwrap(), "neuf");
    }

    #[test]
    fn merges_with_a_merge_commit_when_main_has_moved() {
        let repo = project("merge");
        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/a", None).unwrap();
        commit_in(&work, "b.txt", "b", "branche");
        commit_in(&repo, "c.txt", "c", "principale");
        let report = merge_branch(&repo, "kana/a").unwrap();
        assert!(!report.fast_forward);
        assert!(repo.join("b.txt").exists() && repo.join("c.txt").exists());
    }

    #[test]
    fn refuses_a_dirty_project_or_another_branch() {
        let repo = project("refuse");
        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/a", None).unwrap();
        commit_in(&work, "b.txt", "b", "branche");
        fs::write(repo.join("sale.txt"), "pas enregistré").unwrap();
        let dirty = merge_branch(&repo, "kana/a").unwrap_err().to_string();
        assert!(dirty.contains("changements non enregistrés"), "{dirty}");
        assert!(!repo.join("b.txt").exists());
        fs::remove_file(repo.join("sale.txt")).unwrap();
        run(&repo, &["checkout", "-q", "-b", "autre"]);
        let other = merge_branch(&repo, "kana/a").unwrap_err().to_string();
        assert!(other.contains("autre"), "{other}");
    }

    #[test]
    fn a_conflict_cancels_the_merge_and_leaves_the_project_untouched() {
        let repo = project("conflict");
        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/a", None).unwrap();
        commit_in(&work, "a.txt", "version de la branche\n", "branche");
        commit_in(&repo, "a.txt", "version principale\n", "principale");
        let before = git(&repo, &["rev-parse", "HEAD"], &[]).unwrap();
        let error = merge_branch(&repo, "kana/a").unwrap_err().to_string();
        assert!(error.contains("conflits"), "{error}");
        assert_eq!(git(&repo, &["rev-parse", "HEAD"], &[]).unwrap(), before);
        assert!(git(&repo, &["status", "--porcelain"], &[]).unwrap().trim().is_empty());
        assert_eq!(fs::read_to_string(repo.join("a.txt")).unwrap(), "version principale\n");
    }

    #[test]
    fn discarding_removes_the_folder_and_the_branch_even_with_unmerged_work() {
        let repo = project("discard");
        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/a", None).unwrap();
        commit_in(&work, "b.txt", "b", "travail jamais fusionné");
        fs::write(work.join("c.txt"), "pas enregistré").unwrap();
        discard_work(&repo, &work, "kana/a").unwrap();
        assert!(!work.exists());
        assert!(crate::worktree::kana_branches(&repo).is_empty());
        assert!(!repo.join("b.txt").exists());
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

    #[test]
    fn inspects_merge_conflicts_without_dirtying_repository() {
        let repo = project("inspect-conflict");
        let work = repo.with_extension("wt");
        add_worktree(&repo, &work, "kana/a", None).unwrap();
        commit_in(&work, "a.txt", "version branche\n", "branche");
        commit_in(&repo, "a.txt", "version principale\n", "principale");

        let before = git(&repo, &["rev-parse", "HEAD"], &[]).unwrap();
        let conflicts = inspect_merge_conflicts(&repo, "kana/a").unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].path, "a.txt");
        assert!(conflicts[0].snippet.contains("<<<<<<<"), "{}", conflicts[0].snippet);
        assert!(conflicts[0].snippet.contains(">>>>>>>"), "{}", conflicts[0].snippet);
        assert_eq!(git(&repo, &["rev-parse", "HEAD"], &[]).unwrap(), before);
        assert!(git(&repo, &["status", "--porcelain"], &[]).unwrap().trim().is_empty());
    }

    #[test]
    fn detects_forges_and_parses_gitlab_mrs_and_pr_feedback() {
        assert_eq!(detect_forge("git@github.com:HarpeLm/kana.git"), ForgeKind::GitHub);
        assert_eq!(detect_forge("https://gitlab.com/org/sub/repo.git"), ForgeKind::GitLab);
        assert_eq!(detect_forge("https://codeberg.org/user/proj.git"), ForgeKind::Generic);
        assert_eq!(
            forge_web_url("git@gitlab.com:team/sub/kana.git").as_deref(),
            Some("https://gitlab.com/team/sub/kana")
        );
        assert_eq!(
            forge_web_url("https://codeberg.org/user/proj.git").as_deref(),
            Some("https://codeberg.org/user/proj")
        );

        let glab_list = r#"[{"iid":42,"title":"feat: gitlab","web_url":"https://gitlab.com/org/repo/-/merge_requests/42","state":"opened","draft":false,"head_pipeline":{"status":"failed"},"references":{"full":"org/repo!42"}}]"#;
        let mrs = parse_merge_requests(glab_list);
        assert_eq!(mrs.len(), 1);
        assert_eq!(mrs[0].number, 42);
        assert_eq!(mrs[0].forge, "gitlab");
        assert_eq!(mrs[0].checks_failed, 1);
        assert_eq!(mrs[0].repo, "org/repo");

        let gh_view = r#"{
          "number": 215,
          "title": "Fix parser",
          "comments": [{"author":{"login":"alice"},"body":"Peux-tu ajouter un test ?"}],
          "reviews": [{"author":{"login":"bob"},"state":"CHANGES_REQUESTED","body":"Attention aux bornes"}],
          "statusCheckRollup": [{"name":"cargo test","conclusion":"FAILURE"}]
        }"#;
        let gh_fb = parse_gh_pr_feedback(gh_view, "error[E0308]: mismatched types").unwrap();
        assert_eq!(gh_fb.pr_number, 215);
        assert_eq!(gh_fb.forge, "github");
        assert_eq!(gh_fb.review_comments.len(), 2);
        assert!(gh_fb.review_comments[0].contains("@alice"));
        assert_eq!(gh_fb.failed_checks, vec!["cargo test (FAILURE)"]);
        assert!(gh_fb.failed_log_excerpt.contains("mismatched types"));

        let glab_view = r#"{"iid":42,"title":"MR test","head_pipeline":{"status":"failed"}}"#;
        let glab_notes = r#"[
          {"author":{"username":"system"},"body":"added 1 commit","system":true},
          {"author":{"username":"claire"},"body":"Corriger la typo","system":false,"position":{"new_path":"src/lib.rs","new_line":12}}
        ]"#;
        let glab_fb = parse_glab_mr_feedback(glab_view, glab_notes, "Job failed").unwrap();
        assert_eq!(glab_fb.pr_number, 42);
        assert_eq!(glab_fb.forge, "gitlab");
        assert_eq!(glab_fb.review_comments, vec!["@claire (src/lib.rs:12): Corriger la typo"]);
        assert_eq!(glab_fb.failed_checks, vec!["Pipeline GitLab (failed)"]);
    }
}
