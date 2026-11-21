//! Commandes Tauri qui relient l'interface aux agents ACP.

use std::{path::PathBuf, sync::Arc};

use kana_acp::{AcpClient, AcpError, AcpEvent, McpServerConfig};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    agent_spec::{project_dir, spec_for},
    browser_agent::AgentState,
    state::AgentSessions,
};

const EVENT_NAME: &str = "acp-event";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvent {
    thread_id: String,
    #[serde(flatten)]
    event: AcpEvent,
}

async fn client_of(sessions: &AgentSessions, thread_id: &str) -> Result<Arc<AcpClient>, String> {
    sessions
        .get(thread_id)
        .await
        .ok_or_else(|| "l'agent de ce fil n'est pas démarré".to_string())
}

/// Lance l'agent d'un fil s'il ne tourne pas déjà.
#[tauri::command]
pub async fn start_agent(
    app: AppHandle,
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    agent: String,
    cwd: Option<String>,
    model: Option<String>,
) -> Result<(), String> {
    if sessions.get(&thread_id).await.is_some() {
        return Ok(());
    }
    let spec = spec_for(&agent)?;
    let cwd = cwd.map(PathBuf::from).unwrap_or_else(project_dir);
    // Les outils pour naviguer dans le Globe, proposés à chaque agent.
    let mcp: Vec<McpServerConfig> = app
        .state::<AgentState>()
        .mcp()
        .map(|info| {
            vec![McpServerConfig::http("kana-browser", &info.url)
                .with_header("Authorization", &format!("Bearer {}", info.token))]
        })
        .unwrap_or_default();
    let (client, mut events) =
        AcpClient::spawn_with_mcp(&spec, &cwd, &mcp).await.map_err(|error| match error {
            AcpError::AuthRequired(_) => {
                "connexion requise : ouvre les Réglages pour te connecter".to_string()
            }
            other => other.to_string(),
        })?;
    // Le modèle choisi pour la conversation, s'il diffère de celui que l'agent propose par défaut.
    if let Some(model) = model {
        let known = client.models();
        if known.current.as_deref() != Some(model.as_str()) && known.available.iter().any(|m| m.id == model) {
            let _ = client.set_model(&model).await;
        }
    }
    sessions.insert(thread_id.clone(), Arc::new(client)).await;

    tauri::async_runtime::spawn(async move {
        while let Some(event) = events.recv().await {
            let closed = event == AcpEvent::Closed;
            let _ = app.emit(EVENT_NAME, AgentEvent { thread_id: thread_id.clone(), event });
            if closed {
                app.state::<AgentSessions>().remove(&thread_id).await;
                break;
            }
        }
    });
    Ok(())
}

/// Envoie un message à l'agent. La réponse arrive par les événements `acp-event`.
#[tauri::command]
pub async fn send_prompt(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    text: String,
) -> Result<(), String> {
    let client = client_of(&sessions, &thread_id).await?;
    tauri::async_runtime::spawn(async move {
        // Les erreurs sont déjà remontées à l'interface sous forme d'événement.
        let _ = client.prompt(&text).await;
    });
    Ok(())
}

/// Arrête l'agent d'un fil (le processus s'éteint) : le prochain message en relance un neuf,
/// possiblement d'un autre fournisseur. Sans effet si rien ne tourne.
#[tauri::command]
pub async fn stop_agent(sessions: State<'_, AgentSessions>, thread_id: String) -> Result<(), String> {
    sessions.remove(&thread_id).await;
    Ok(())
}

/// Change le modèle d'un agent déjà lancé.
#[tauri::command]
pub async fn set_model(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    model: String,
) -> Result<(), String> {
    let client = client_of(&sessions, &thread_id).await?;
    client.set_model(&model).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn cancel_prompt(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
) -> Result<(), String> {
    let client = client_of(&sessions, &thread_id).await?;
    client.cancel().await.map_err(|e| e.to_string())
}

/// Répond à une demande d'autorisation ; `option_id` vide la refuse.
#[tauri::command]
pub async fn answer_permission(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    request_id: String,
    option_id: Option<String>,
) -> Result<(), String> {
    let client = client_of(&sessions, &thread_id).await?;
    client.resolve_permission(&request_id, option_id).await;
    Ok(())
}
