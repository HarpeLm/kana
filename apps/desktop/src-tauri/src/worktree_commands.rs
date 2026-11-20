//! Commandes Tauri des dossiers de travail : un worktree git par conversation.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::agent_spec::{default_cwd, project_dir};

#[derive(Serialize)]
pub struct WorktreeInfo {
    pub(crate) path: String,
    pub(crate) branch: String,
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
/// `project_path` : le projet de la conversation (sinon celui du lancement).
/// Renvoie `None` quand le projet n'est pas un dépôt git : l'agent travaillera alors sans.
#[tauri::command]
pub async fn create_worktree(
    conversation_id: String,
    base_branch: Option<String>,
    project_path: Option<String>,
) -> Result<Option<WorktreeInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let from = project_path.map(PathBuf::from).unwrap_or_else(project_dir);
        let Ok(repo) = kana_git::repo_root(&from) else { return Ok(None) };
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
pub async fn remove_worktree(path: String, project_path: Option<String>) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&path);
        if !path.starts_with(root()) {
            return Err("ce dossier n'est pas un dossier de travail de Kana".to_string());
        }
        let from = project_path.map(PathBuf::from).unwrap_or_else(project_dir);
        let repo = kana_git::repo_root(&from).map_err(|e| e.to_string())?;
        kana_git::remove_worktree(&repo, path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use std::{fs, process::Command};

    use super::*;
    use crate::project_commands::create_project;

    /// Parcours complet sur de vrais dossiers : projet neuf → dossier de travail → travail non
    /// enregistré → suppression refusée → suppression après commit. HOME est remplacé par un dossier
    /// temporaire pour ne toucher à rien de réel.
    #[test]
    fn project_worktree_lifecycle() {
        let home = std::env::temp_dir().join(format!("kana-e2e-{}", std::process::id()));
        let _ = fs::remove_dir_all(&home);
        fs::create_dir_all(&home).unwrap();
        // Un seul test modifie HOME : les autres n'en dépendent pas.
        unsafe { std::env::set_var("HOME", &home) };

        tauri::async_runtime::block_on(async {
            // 1. Un projet neuf est créé dans ~/Projets Kana avec un dépôt git.
            let project = create_project("Mon essai".into()).await.unwrap();
            assert_eq!(project.path, home.join("Projets Kana").join("Mon essai").to_string_lossy());
            assert!(Path::new(&project.path).join(".git").exists());
            assert!(create_project("Mon essai".into()).await.is_err(), "un projet existant n'est pas écrasé");

            // 2. Une conversation de ce projet reçoit son dossier de travail et sa branche.
            let info = create_worktree("conv1".into(), None, Some(project.path.clone())).await.unwrap().unwrap();
            assert_eq!(info.branch, "kana/conv1");
            assert!(Path::new(&info.path).starts_with(home.join(".kana").join("worktrees")));
            // Redemandé (relance de l'app) : le même dossier est réutilisé.
            let again = create_worktree("conv1".into(), None, Some(project.path.clone())).await.unwrap().unwrap();
            assert_eq!(again.path, info.path);

            // 3. Le travail d'un agent y reste : le projet principal n'est pas touché.
            fs::write(Path::new(&info.path).join("hello.txt"), "salut").unwrap();
            assert!(!Path::new(&project.path).join("hello.txt").exists());

            // 4. Une bifurcation part de la branche de l'original.
            let fork = create_worktree("conv2".into(), Some(info.branch.clone()), Some(project.path.clone()))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(kana_git::current_branch(Path::new(&fork.path)).as_deref(), Some("kana/conv2"));

            // 5. Du travail non enregistré empêche la suppression ; le fichier survit.
            assert!(remove_worktree(info.path.clone(), Some(project.path.clone())).await.is_err());
            assert!(Path::new(&info.path).join("hello.txt").exists());

            // 6. Une fois enregistré (commit), la suppression passe.
            for args in [vec!["add", "-A"], vec!["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "work"]] {
                assert!(Command::new("git").args(&args).current_dir(&info.path).status().unwrap().success());
            }
            remove_worktree(info.path.clone(), Some(project.path.clone())).await.unwrap();
            assert!(!Path::new(&info.path).exists());

            // 7. Un dossier hors de ~/.kana/worktrees n'est jamais supprimé.
            assert!(remove_worktree(project.path.clone(), Some(project.path.clone())).await.is_err());
            assert!(Path::new(&project.path).exists());

            // 8. Un dossier qui n'est pas un dépôt git : pas de dossier de travail, sans erreur.
            let plain = home.join("plain");
            fs::create_dir_all(&plain).unwrap();
            let none = create_worktree("conv3".into(), None, Some(plain.to_string_lossy().into_owned())).await.unwrap();
            assert!(none.is_none());
        });
    }
}
