//! Commandes Tauri qui relient l'interface aux agents ACP.

use std::{path::PathBuf, sync::Arc};

use kana_acp::{
    AcpClient, AcpError, AcpEvent, AgentSpec, ExecutionTarget, McpServerConfig, SandboxPolicy,
};
use serde::{Deserialize, Serialize};
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartedSession {
    pub session_id: String,
    /// `true` si l'agent tournait déjà ou a repris la session existante via `session/load`.
    pub resumed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentEnvironmentParam {
    pub kind: String,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub sandbox: Option<bool>,
    #[serde(default)]
    pub read_only: Option<bool>,
}

fn parse_ssh_target(raw: &str) -> (String, Option<String>) {
    let trimmed = raw.trim();
    match trimmed.split_once(':') {
        Some((host, path)) if !host.trim().is_empty() => {
            let dir = path.trim();
            (
                host.trim().to_string(),
                if dir.is_empty() { None } else { Some(dir.to_string()) },
            )
        }
        _ => (trimmed.to_string(), None),
    }
}

fn parse_docker_target(raw: &str) -> (String, Option<String>) {
    let trimmed = raw.trim();
    match trimmed.split_once(':') {
        Some((container, workdir)) if !container.trim().is_empty() && workdir.trim().starts_with('/') => {
            (container.trim().to_string(), Some(workdir.trim().to_string()))
        }
        _ => (trimmed.to_string(), None),
    }
}

pub(crate) fn apply_environment(spec: AgentSpec, env: Option<AgentEnvironmentParam>) -> AgentSpec {
    let Some(env) = env else { return spec; };
    let target_raw = env.target.as_deref().map(str::trim).filter(|s| !s.is_empty());
    let spec = match (env.kind.as_str(), target_raw) {
        ("ssh", Some(raw)) => {
            let (host, remote_dir) = parse_ssh_target(raw);
            spec.with_target(ExecutionTarget::Ssh { host, remote_dir })
        }
        ("docker", Some(raw)) => {
            let (container, workdir) = parse_docker_target(raw);
            spec.with_target(ExecutionTarget::Docker { container, workdir })
        }
        ("devcontainer", Some(raw)) => {
            spec.with_target(ExecutionTarget::DevContainer { folder: raw.to_string() })
        }
        _ => spec.with_target(ExecutionTarget::Local),
    };
    let sandbox = if env.read_only == Some(true) {
        SandboxPolicy::ReadOnly
    } else if env.sandbox == Some(true) {
        SandboxPolicy::WorkspaceWrite
    } else {
        SandboxPolicy::None
    };
    spec.with_sandbox(sandbox)
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
    effort: Option<String>,
    resume_session_id: Option<String>,
    environment: Option<AgentEnvironmentParam>,
) -> Result<StartedSession, String> {
    if let Some(existing) = sessions.get(&thread_id).await {
        return Ok(StartedSession {
            session_id: existing.session_id().to_owned(),
            resumed: true,
        });
    }
    let spec = apply_environment(spec_for(&agent)?, environment);
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
        AcpClient::spawn_or_resume(&spec, &cwd, &mcp, resume_session_id.as_deref()).await.map_err(|error| match error {
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
    // Le niveau d'effort choisi, s'il diffère de celui de l'agent.
    if let (Some(value), Some(known)) = (effort, client.models().effort.as_ref()) {
        if known.current.as_deref() != Some(value.as_str()) && known.options.iter().any(|o| o.id == value) {
            let _ = client.set_effort(&value).await;
        }
    }
    let started = StartedSession {
        session_id: client.session_id().to_owned(),
        resumed: client.resumed(),
    };
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
    Ok(started)
}

/// Au-delà, une image n'est pas envoyée (elle reste citée par son chemin) ; et on n'en envoie pas plus de 6.
const MAX_IMAGE_BYTES: u64 = 5 * 1024 * 1024;
const MAX_IMAGES: usize = 6;

/// Lit les images : `(type MIME, contenu en base64)`. Celles qui sont illisibles ou trop lourdes sont ignorées.
fn read_images(paths: Vec<String>) -> Vec<(String, String)> {
    use base64::{Engine, engine::general_purpose::STANDARD};
    paths
        .iter()
        .filter_map(|p| {
            let path = std::path::Path::new(p);
            let mime = crate::attachment_commands::image_mime(path)?;
            if std::fs::metadata(path).ok()?.len() > MAX_IMAGE_BYTES {
                return None;
            }
            Some((mime.to_owned(), STANDARD.encode(std::fs::read(path).ok()?)))
        })
        .take(MAX_IMAGES)
        .collect()
}

/// Envoie un message à l'agent. La réponse arrive par les événements `acp-event`.
#[tauri::command]
pub async fn send_prompt(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    text: String,
    images: Option<Vec<String>>,
) -> Result<(), String> {
    let client = client_of(&sessions, &thread_id).await?;
    // Les images jointes partent comme de vraies images si l'agent sait les lire ; sinon il n'a que leur chemin dans le texte.
    let pictures = if client.supports_images() { read_images(images.unwrap_or_default()) } else { Vec::new() };
    tauri::async_runtime::spawn(async move {
        // Les erreurs sont déjà remontées à l'interface sous forme d'événement.
        let _ = client.prompt_with_images(&text, &pictures).await;
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

/// Change le niveau d'effort d'un agent déjà lancé.
#[tauri::command]
pub async fn set_effort(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    value: String,
) -> Result<(), String> {
    let client = client_of(&sessions, &thread_id).await?;
    client.set_effort(&value).await.map_err(|e| e.to_string())
}

/// Met l'agent en mode « plan » (ou le remet dans son mode habituel). Renvoie `false` si l'agent n'a pas de tel mode :
/// l'interface refuse alors elle-même les modifications.
#[tauri::command]
pub async fn set_plan_mode(
    sessions: State<'_, AgentSessions>,
    thread_id: String,
    on: bool,
) -> Result<bool, String> {
    let client = client_of(&sessions, &thread_id).await?;
    client.set_plan_mode(on).await.map_err(|e| e.to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn configures_sandbox_and_remote_targets_from_environment() {
        let base = AgentSpec::new("opencode", &["acp"]);

        let sandboxed = apply_environment(
            base.clone(),
            Some(AgentEnvironmentParam {
                kind: "local".into(),
                target: None,
                sandbox: Some(true),
                read_only: None,
            }),
        );
        assert_eq!(sandboxed.sandbox, SandboxPolicy::WorkspaceWrite);
        assert_eq!(sandboxed.target, ExecutionTarget::Local);

        let ro = apply_environment(
            base.clone(),
            Some(AgentEnvironmentParam {
                kind: "local".into(),
                target: None,
                sandbox: Some(true),
                read_only: Some(true),
            }),
        );
        assert_eq!(ro.sandbox, SandboxPolicy::ReadOnly);

        let ssh = apply_environment(
            base.clone(),
            Some(AgentEnvironmentParam {
                kind: "ssh".into(),
                target: Some("me@srv:/repo".into()),
                sandbox: None,
                read_only: None,
            }),
        );
        assert_eq!(
            ssh.target,
            ExecutionTarget::Ssh {
                host: "me@srv".into(),
                remote_dir: Some("/repo".into()),
            }
        );

        let docker = apply_environment(
            base.clone(),
            Some(AgentEnvironmentParam {
                kind: "docker".into(),
                target: Some("dev-box:/app".into()),
                sandbox: None,
                read_only: None,
            }),
        );
        assert_eq!(
            docker.target,
            ExecutionTarget::Docker {
                container: "dev-box".into(),
                workdir: Some("/app".into()),
            }
        );

        let dc = apply_environment(
            base,
            Some(AgentEnvironmentParam {
                kind: "devcontainer".into(),
                target: Some("/Users/me/proj".into()),
                sandbox: None,
                read_only: None,
            }),
        );
        assert_eq!(
            dc.target,
            ExecutionTarget::DevContainer {
                folder: "/Users/me/proj".into(),
            }
        );
    }
}
