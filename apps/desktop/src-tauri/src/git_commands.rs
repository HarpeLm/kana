//! Commandes Tauri liées à Git.

use std::path::PathBuf;

use kana_git::DiffReport;

/// Les changements du dépôt. Sans chemin, on part du dossier où l'app a été lancée.
#[tauri::command]
pub async fn git_diff(path: Option<String>) -> Result<DiffReport, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start = path
            .map(PathBuf::from)
            .or_else(|| std::env::current_dir().ok())
            .ok_or_else(|| "dossier de départ introuvable".to_string())?;
        kana_git::diff(&start).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
