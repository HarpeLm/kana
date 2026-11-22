//! Commandes Tauri des projets : le projet du lancement, la création d'un projet neuf, le dossier neutre.

use std::path::PathBuf;

use serde::Serialize;

use crate::agent_spec::{default_cwd, project_dir};

#[derive(Serialize)]
pub struct ProjectInfo {
    pub(crate) name: String,
    pub(crate) path: String,
}

fn info(path: PathBuf) -> ProjectInfo {
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "projet".into());
    ProjectInfo { name, path: path.to_string_lossy().into_owned() }
}

/// Le projet dans lequel Kana a été lancé (le dépôt courant), s'il y en a un.
#[tauri::command]
pub fn launch_project() -> Option<ProjectInfo> {
    let dir = project_dir();
    kana_git::repo_root(&dir).ok().map(info)
}

/// Un nom de projet devient un nom de dossier : pas de séparateur, pas de point au début.
fn folder_name(name: &str) -> Option<String> {
    let clean: String = name
        .trim()
        .chars()
        .map(|c| if c == '/' || c == '\\' || c == ':' || c.is_control() { '-' } else { c })
        .collect();
    let clean = clean.trim_matches('.').trim().to_owned();
    (!clean.is_empty()).then_some(clean)
}

/// Crée un projet neuf : un dossier `~/Projets Kana/<nom>` avec un dépôt git (pour les dossiers de travail).
/// Surtout pas `~/Kana` : sur macOS les noms de dossier ne distinguent pas majuscules et minuscules,
/// et ce serait le dépôt `~/kana` lui-même.
#[tauri::command]
pub async fn create_project(name: String) -> Result<ProjectInfo, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let folder = folder_name(&name).ok_or("le nom du projet est vide")?;
        let path = default_cwd().join("Projets Kana").join(folder);
        if path.exists() {
            return Err(format!("{} existe déjà", path.display()));
        }
        std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
        kana_git::init_repository(&path).map_err(|e| e.to_string())?;
        Ok(info(path))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Un dossier neutre pour les conversations sans projet : surtout pas le dossier personnel,
/// qu'un agent mettrait des minutes à indexer.
#[tauri::command]
pub fn scratch_dir() -> Result<String, String> {
    let path = default_cwd().join(".kana").join("scratch");
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Le nom et le chemin d'un dossier choisi par l'utilisateur.
#[tauri::command]
pub fn describe_folder(path: String) -> ProjectInfo {
    info(PathBuf::from(path))
}

/// Ouvre un dossier ou sélectionne un fichier dans le Finder (macOS), l'explorateur (Windows) ou xdg-open (Linux).
#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    let trimmed = path.trim();
    if trimmed.is_empty() || trimmed == "none" {
        return Err("aucun dossier à afficher".into());
    }
    let target = PathBuf::from(trimmed);
    if !target.exists() {
        return Err(format!("chemin introuvable : {trimmed}"));
    }
    #[cfg(target_os = "macos")]
    let status = {
        let mut cmd = std::process::Command::new("open");
        if target.is_dir() {
            cmd.arg(&target);
        } else {
            cmd.arg("-R").arg(&target);
        }
        cmd.status()
    };
    #[cfg(target_os = "windows")]
    let status = std::process::Command::new("explorer").arg(&target).status();
    #[cfg(all(unix, not(target_os = "macos")))]
    let status = std::process::Command::new("xdg-open").arg(&target).status();

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("impossible d'ouvrir le Finder (code {:?})", s.code())),
        Err(e) => Err(format!("impossible d'ouvrir le Finder : {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_names_are_made_safe() {
        assert_eq!(folder_name("  Mon projet "), Some("Mon projet".into()));
        assert_eq!(folder_name("a/b"), Some("a-b".into()));
        assert_eq!(folder_name("../x"), Some("-x".into()));
        assert_eq!(folder_name(" . "), None);
        assert_eq!(folder_name(""), None);
    }
}
