//! Commandes Tauri des dossiers de travail : un worktree git par conversation.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::agent_spec::{default_cwd, project_dir};

#[derive(Serialize)]
pub struct WorktreeInfo {
    path: String,
    branch: String,
}

/// Là où vivent les dossiers de travail des conversations : `~/.kana/worktrees`.
fn root() -> PathBuf {
    default_cwd().join(".kana").join("worktrees")
}

/// Un identifiant de conversation devient un nom de dossier et de branche sans surprise.
fn safe_name(id: &str) -> String {
    id.chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '-' }).collect()
}

/// Crée le dossier de travail d'une conversation, sur sa propre branche `kana/<id>`.
/// `base_branch` : la branche dont on part (celle de la conversation d'origine pour une bifurcation).
/// Renvoie `None` quand Kana n'est pas lancé dans un dépôt git : l'agent travaillera alors sans.
#[tauri::command]
pub async fn create_worktree(
    conversation_id: String,
    base_branch: Option<String>,
) -> Result<Option<WorktreeInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Ok(repo) = kana_git::repo_root(&project_dir()) else { return Ok(None) };
        let name = safe_name(&conversation_id);
        let repo_name = repo.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "repo".into());
        let path = root().join(safe_name(&repo_name)).join(&name);
        let branch = format!("kana/{name}");
        if path.exists() {
            // Déjà créé lors d'un lancement précédent : on le réutilise.
            return Ok(Some(WorktreeInfo { path: path.to_string_lossy().into_owned(), branch }));
        }
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        kana_git::add_worktree(&repo, &path, &branch, base_branch.as_deref()).map_err(|e| e.to_string())?;
        Ok(Some(WorktreeInfo { path: path.to_string_lossy().into_owned(), branch }))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Supprime le dossier de travail d'une conversation. Refuse s'il contient du travail non
/// enregistré, et ne touche jamais à un dossier hors de `~/.kana/worktrees`.
#[tauri::command]
pub async fn remove_worktree(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&path);
        if !path.starts_with(root()) {
            return Err("ce dossier n'est pas un dossier de travail de Kana".to_string());
        }
        let repo = kana_git::repo_root(&project_dir()).map_err(|e| e.to_string())?;
        kana_git::remove_worktree(&repo, path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
