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
