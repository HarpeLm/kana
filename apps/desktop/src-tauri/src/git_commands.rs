//! Commandes Tauri liées à Git.

use std::path::PathBuf;

use kana_git::{DiffReport, FileList, FilePreview};

/// Dossier d'où chercher le dépôt : celui qu'on demande, sinon celui où l'app a été lancée.
fn start_dir(path: Option<String>) -> Result<PathBuf, String> {
    path.map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .ok_or_else(|| "dossier de départ introuvable".to_string())
}

/// Les changements du dépôt.
#[tauri::command]
pub async fn git_diff(path: Option<String>) -> Result<DiffReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::diff(&start_dir(path)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Les fichiers du dépôt (ceux que `.gitignore` écarte sont exclus).
#[tauri::command]
pub async fn repo_files(path: Option<String>) -> Result<FileList, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::list_files(&start_dir(path)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Le début d'un fichier du dépôt, pour l'aperçu.
#[tauri::command]
pub async fn read_repo_file(path: Option<String>, file: String) -> Result<FilePreview, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::read_preview(&start_dir(path)?, &file).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Enregistre un fichier existant du dépôt. Si `expected_modified` ne correspond plus à la date du
/// fichier, rien n'est écrit : il a été modifié ailleurs. Renvoie la nouvelle date de modification.
#[tauri::command]
pub async fn write_repo_file(
    path: Option<String>,
    file: String,
    content: String,
    expected_modified: Option<u64>,
) -> Result<u64, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::write_text(&start_dir(path)?, &file, &content, expected_modified)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Ce que la branche d'un dossier de travail apporte par rapport à la branche principale.
#[tauri::command]
pub async fn git_branch_summary(path: Option<String>) -> Result<kana_git::BranchSummary, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::branch_summary(&start_dir(path)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Les pull requests de cette branche (liste vide si `gh` n'est pas disponible).
#[tauri::command]
pub async fn git_pull_requests(path: Option<String>, branch: String) -> Result<Vec<kana_git::PullRequest>, String> {
    tauri::async_runtime::spawn_blocking(move || Ok(kana_git::pull_requests(&start_dir(path)?, &branch)))
        .await
        .map_err(|e| e.to_string())?
}

/// Enregistre le travail, pousse la branche vers `origin` et ouvre une pull request.
/// À n'appeler qu'après la confirmation explicite de l'utilisateur : c'est une action publique.
#[tauri::command]
pub async fn git_create_pull_request(path: Option<String>, branch: String, title: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::create_pull_request(&start_dir(path)?, &branch, &title).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// L'adresse du dépôt distant `origin` (vide s'il n'y en a pas).
#[tauri::command]
pub async fn git_remote_url(path: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dir = start_dir(path)?;
        let out = std::process::Command::new("git")
            .arg("-C")
            .arg(&dir)
            .args(["remote", "get-url", "origin"])
            .output()
            .map_err(|e| e.to_string())?;
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Met un fichier du dépôt à la corbeille.
#[tauri::command]
pub async fn delete_repo_file(path: Option<String>, file: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::trash_file(&start_dir(path)?, &file).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// La branche actuelle de chaque dossier (`None` : pas un dépôt, ou tête détachée), dans le même ordre.
#[tauri::command]
pub async fn git_current_branches(paths: Vec<String>) -> Result<Vec<Option<String>>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        paths.iter().map(|p| kana_git::current_branch(std::path::Path::new(p))).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

/// Lit les fichiers de règles projet (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.kana/rules.md`).
#[tauri::command]
pub async fn git_read_rule_files(path: Option<String>) -> Result<Vec<kana_git::RuleFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::read_rule_files(&start_dir(path)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Écrit ou crée l'un des fichiers de règles projet autorisés.
#[tauri::command]
pub async fn git_write_rule_file(
    path: Option<String>,
    file: String,
    content: String,
) -> Result<kana_git::RuleFile, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::write_rule_file(&start_dir(path)?, &file, &content).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Synchronise le même contenu de règles vers plusieurs fichiers cibles autorisés.
#[tauri::command]
pub async fn git_sync_rule_files(
    path: Option<String>,
    content: String,
    targets: Vec<String>,
) -> Result<Vec<kana_git::RuleFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::sync_rule_files(&start_dir(path)?, &content, &targets).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Annule toutes les modifications d'un fichier du dépôt.
#[tauri::command]
pub async fn git_revert_file(path: Option<String>, file: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::revert_file(&start_dir(path)?, &file).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Annule un seul bloc (`hunk_header`) d'un fichier du dépôt.
#[tauri::command]
pub async fn git_revert_hunk(
    path: Option<String>,
    file: String,
    hunk_header: String,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::revert_hunk(&start_dir(path)?, &file, &hunk_header).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Crée un checkpoint Git de l'état courant du dossier de travail sans polluer `HEAD`.
#[tauri::command]
pub async fn git_create_checkpoint(path: Option<String>, label: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::create_checkpoint(&start_dir(path)?, &label).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Restaure le dossier de travail à un checkpoint précédent.
#[tauri::command]
pub async fn git_restore_checkpoint(path: Option<String>, target: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::restore_checkpoint(&start_dir(path)?, &target).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Inspecte les conflits de fusion entre `branch` et la branche principale sans salir le dépôt.
#[tauri::command]
pub async fn git_inspect_conflicts(
    path: Option<String>,
    branch: String,
) -> Result<Vec<kana_git::ConflictFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::inspect_merge_conflicts(&start_dir(path)?, &branch).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Importe les commentaires de review et les logs CI en échec d'une PR/MR (GitHub ou GitLab).
#[tauri::command]
pub async fn git_pr_feedback(
    path: Option<String>,
    pr_number: u64,
) -> Result<kana_git::PrFeedback, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::fetch_pr_feedback(&start_dir(path)?, pr_number).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Collecte les diagnostics compilateur et LSP (`rustc`, `cargo`, `tsc`) du dépôt.
#[tauri::command]
pub async fn git_diagnostics(
    path: Option<String>,
) -> Result<Vec<kana_git::CodeDiagnostic>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        kana_git::collect_repo_diagnostics(&start_dir(path)?).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
