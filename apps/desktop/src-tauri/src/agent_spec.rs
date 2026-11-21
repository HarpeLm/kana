use std::path::PathBuf;

use kana_acp::{AgentSpec, api_key_env, preset, with_cached_adapter};

use crate::secrets;

/// Commande de lancement d'un agent, avec son adaptateur local en cache (`~/.kana/adapters`)
/// et sa clé d'API du Trousseau si elle existe.
pub fn spec_for(agent_id: &str) -> Result<AgentSpec, String> {
    let base = preset(agent_id).ok_or_else(|| format!("agent inconnu : {agent_id}"))?;
    let spec = with_cached_adapter(base, &default_cwd());
    let key = api_key_env(agent_id).zip(secrets::get_api_key(agent_id));
    Ok(match key {
        Some((variable, value)) => spec.with_env(variable, &value),
        None => spec,
    })
}

/// Dossier de départ d'un terminal : le dossier personnel.
pub fn default_cwd() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Dossier de travail des agents : le dépôt où Kana a été lancé. Jamais le dossier personnel :
/// un agent qui s'y installe indexe tout le disque de l'utilisateur et met des minutes à répondre.
/// Sans dépôt, un dossier temporaire neutre.
pub fn project_dir() -> PathBuf {
    std::env::current_dir()
        .ok()
        .and_then(|dir| kana_git::repo_root(&dir).ok())
        .unwrap_or_else(std::env::temp_dir)
}
