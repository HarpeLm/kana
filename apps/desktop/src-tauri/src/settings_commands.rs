//! Commandes Tauri de l'écran Réglages : connexion des agents et clés d'API.

use kana_acp::{AcpClient, AcpError, AgentModels, AuthMethod};
use serde::Serialize;

use crate::{
    agent_spec::{project_dir, spec_for},
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
    match AcpClient::spawn(&spec, &project_dir()).await {
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
    AcpClient::spawn_authenticated(&spec, &project_dir(), &method_id)
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

/// Les modèles qu'un agent propose. Lance l'agent un instant : à appeler à l'ouverture du sélecteur,
/// l'interface garde le résultat en mémoire.
#[tauri::command]
pub async fn list_models(agent: String) -> Result<AgentModels, String> {
    let spec = spec_for(&agent)?;
    let dir = project_dir();
    let started = tokio::time::timeout(std::time::Duration::from_secs(45), AcpClient::spawn(&spec, &dir));
    match started.await {
        Ok(Ok((client, _events))) => Ok(client.models().clone()),
        Ok(Err(AcpError::AuthRequired(_))) => Err("connexion requise : ouvre les Réglages".into()),
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err("l'agent met trop de temps à répondre".into()),
    }
}
