//! Commandes Tauri de l'écran Réglages : connexion des agents et clés d'API.

use kana_acp::{AcpClient, AcpError, AuthMethod};
use serde::Serialize;

use crate::{
    agent_spec::{default_cwd, spec_for},
    secrets,
};

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AgentStatus {
    Ready,
    AuthRequired { methods: Vec<AuthMethod> },
}

/// Lance l'agent un instant pour savoir s'il est connecté.
#[tauri::command]
pub async fn check_agent(agent: String) -> Result<AgentStatus, String> {
    let spec = spec_for(&agent)?;
    match AcpClient::spawn(&spec, &default_cwd()).await {
        Ok(_) => Ok(AgentStatus::Ready),
        Err(AcpError::AuthRequired(methods)) => Ok(AgentStatus::AuthRequired { methods }),
        Err(error) => Err(error.to_string()),
    }
}

/// Exécute une méthode de connexion de l'agent (souvent une page web à valider).
/// L'agent garde lui-même ses identifiants ; Kana ne voit jamais le mot de passe.
#[tauri::command]
pub async fn login_agent(agent: String, method_id: String) -> Result<(), String> {
    let spec = spec_for(&agent)?;
    AcpClient::spawn_authenticated(&spec, &default_cwd(), &method_id)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key(agent: String) -> bool {
    secrets::get_api_key(&agent).is_some()
}

#[tauri::command]
pub fn set_api_key(agent: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("la clé est vide".into());
    }
    secrets::set_api_key(&agent, key.trim())
}

#[tauri::command]
pub fn delete_api_key(agent: String) -> Result<(), String> {
    secrets::delete_api_key(&agent)
}
