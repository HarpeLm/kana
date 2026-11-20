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

/// Ce chemin est-il sous `~/.kana/worktrees` ? Les chemins sont comparés après résolution des liens
/// (sur macOS, `/var` est un lien vers `/private/var` et git rapporte la version résolue).
fn inside_root(path: &Path) -> bool {
    let resolve = |p: &Path| p.canonicalize().unwrap_or_else(|_| p.to_path_buf());
    resolve(path).starts_with(resolve(&root()))
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
        if !inside_root(path) {
            return Err("ce dossier n'est pas un dossier de travail de Kana".to_string());
        }
        let from = project_path.map(PathBuf::from).unwrap_or_else(project_dir);
        let repo = kana_git::repo_root(&from).map_err(|e| e.to_string())?;
        kana_git::remove_worktree(&repo, path).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct Orphan {
    pub(crate) repo: String,
    pub(crate) repo_name: String,
    pub(crate) branch: String,
    pub(crate) worktree: Option<String>,
    pub(crate) merged: bool,
    pub(crate) ahead: u32,
    pub(crate) dirty: bool,
}

/// Les branches `kana/…` dont plus aucune conversation ne se sert. `known_ids` : les conversations
/// qui existent ; `projects` : les dossiers des projets où chercher (le projet du lancement en plus).
#[tauri::command]
pub async fn scan_orphan_worktrees(known_ids: Vec<String>, projects: Vec<String>) -> Result<Vec<Orphan>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let known: std::collections::HashSet<String> = known_ids.iter().map(|id| safe_name(id)).collect();
        let mut repos: Vec<PathBuf> = projects
            .iter()
            .filter_map(|p| kana_git::repo_root(Path::new(p)).ok())
            .chain(kana_git::repo_root(&project_dir()).ok())
            .collect();
        repos.sort();
        repos.dedup();
        let mut orphans = Vec::new();
        for repo in repos {
            let repo_name = repo.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            for found in kana_git::kana_branches(&repo) {
                let id = found.branch.trim_start_matches("kana/");
                if known.contains(id) {
                    continue;
                }
                orphans.push(Orphan {
                    repo: repo.to_string_lossy().into_owned(),
                    repo_name: repo_name.clone(),
                    branch: found.branch,
                    worktree: found.worktree,
                    merged: found.merged,
                    ahead: found.ahead,
                    dirty: found.dirty,
                });
            }
        }
        Ok(orphans)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
pub struct CleanOutcome {
    pub(crate) removed_worktree: bool,
    pub(crate) deleted_branch: bool,
    /// Pourquoi tout n'a pas été supprimé : le travail qui reste est toujours gardé.
    pub(crate) kept: Option<String>,
}

/// Nettoie une branche orpheline sans jamais perdre de travail : le dossier de travail n'est retiré que
/// s'il n'a aucun changement non enregistré, la branche que si tout son travail est déjà dans la
/// branche principale. Le reste est gardé et expliqué.
#[tauri::command]
pub async fn clean_orphan_worktree(repo: String, branch: String, worktree: Option<String>) -> Result<CleanOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if !branch.starts_with("kana/") {
            return Err("ce n'est pas une branche de Kana".to_string());
        }
        let repo = kana_git::repo_root(Path::new(&repo)).map_err(|e| e.to_string())?;
        let mut outcome = CleanOutcome { removed_worktree: false, deleted_branch: false, kept: None };
        if let Some(path) = worktree {
            let path = Path::new(&path);
            if !inside_root(path) {
                return Err("ce dossier n'est pas un dossier de travail de Kana".to_string());
            }
            match kana_git::remove_worktree(&repo, path) {
                Ok(()) => outcome.removed_worktree = true,
                Err(_) => {
                    outcome.kept = Some("le dossier de travail contient du travail non enregistré".into());
                    return Ok(outcome);
                }
            }
        }
        match kana_git::delete_merged_branch(&repo, &branch) {
            Ok(()) => outcome.deleted_branch = true,
            Err(_) => outcome.kept = Some("la branche a des commits qui ne sont pas dans la branche principale".into()),
        }
        Ok(outcome)
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

            // 9. Orphelins : conv2 n'a plus de conversation et n'a rien apporté (propre, fusionnée) :
            //    son dossier et sa branche partent. conv1 est encore connue : on n'y touche pas.
            let orphans = scan_orphan_worktrees(vec!["conv1".into()], vec![project.path.clone()]).await.unwrap();
            let conv2 = orphans.iter().find(|o| o.branch == "kana/conv2").expect("conv2 est orpheline");
            assert!(orphans.iter().all(|o| o.branch != "kana/conv1"));
            assert!(conv2.worktree.is_some() && !conv2.dirty && conv2.merged);
            let done = clean_orphan_worktree(conv2.repo.clone(), conv2.branch.clone(), conv2.worktree.clone()).await.unwrap();
            assert!(done.removed_worktree && done.deleted_branch && done.kept.is_none());
            assert!(!Path::new(&fork.path).exists());

            // 10. Devenue orpheline à son tour, conv1 a un commit non fusionné (déjà fait à l'étape 6) :
            //     la branche est gardée, jamais perdue.
            let later = scan_orphan_worktrees(vec![], vec![project.path.clone()]).await.unwrap();
            let conv1 = later.iter().find(|o| o.branch == "kana/conv1").expect("conv1 est orpheline");
            assert!(!conv1.merged && conv1.ahead == 1 && conv1.worktree.is_none());
            let kept = clean_orphan_worktree(conv1.repo.clone(), conv1.branch.clone(), None).await.unwrap();
            assert!(!kept.deleted_branch && kept.kept.is_some());
            assert!(scan_orphan_worktrees(vec![], vec![project.path.clone()]).await.unwrap().iter().any(|o| o.branch == "kana/conv1"));

            // Une branche qui n'est pas de Kana n'est jamais touchée.
            assert!(clean_orphan_worktree(conv1.repo.clone(), "main".into(), None).await.is_err());

            // 8. Un dossier qui n'est pas un dépôt git : pas de dossier de travail, sans erreur.
            let plain = home.join("plain");
            fs::create_dir_all(&plain).unwrap();
            let none = create_worktree("conv3".into(), None, Some(plain.to_string_lossy().into_owned())).await.unwrap();
            assert!(none.is_none());
        });
    }
}
