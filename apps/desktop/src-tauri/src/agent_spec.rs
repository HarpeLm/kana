use std::path::PathBuf;

use kana_acp::{AgentSpec, api_key_env, preset};

use crate::secrets;

/// Commande de lancement d'un agent, avec sa clé d'API du Trousseau si elle existe.
pub fn spec_for(agent_id: &str) -> Result<AgentSpec, String> {
    let spec = preset(agent_id).ok_or_else(|| format!("agent inconnu : {agent_id}"))?;
    let key = api_key_env(agent_id).zip(secrets::get_api_key(agent_id));
    Ok(match key {
        Some((variable, value)) => spec.with_env(variable, &value),
        None => spec,
    })
}

/// Dossier de travail par défaut d'un agent : le dossier personnel.
pub fn default_cwd() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("/"))
}
