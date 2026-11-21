use std::{
    collections::HashMap,
    path::Path,
    process::Stdio,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use serde_json::{Value, json};
use tokio::{
    io::AsyncWriteExt,
    process::{Child, ChildStdin, Command},
    sync::{Mutex, mpsc, oneshot},
};

use crate::{
    agents::AgentSpec,
    auth::AuthMethod,
    error::AcpError,
    event::AcpEvent,
    mcp::{McpServerConfig, supports_http},
    models::AgentModels,
    protocol, reader,
};

/// Code JSON-RPC que les agents renvoient quand il faut se connecter d'abord.
const AUTH_REQUIRED_CODE: i64 = -32000;

type Reply = Result<Value, AcpError>;

/// État partagé entre le client et la tâche qui lit la sortie de l'agent.
pub(crate) struct Shared {
    stdin: Mutex<ChildStdin>,
    pub(crate) pending: Mutex<HashMap<u64, oneshot::Sender<Reply>>>,
    pub(crate) permissions: Mutex<HashMap<String, oneshot::Sender<Option<String>>>>,
    pub(crate) events: mpsc::UnboundedSender<AcpEvent>,
}

impl Shared {
    pub(crate) async fn send(&self, message: &Value) -> Result<(), AcpError> {
        let mut line = serde_json::to_string(message)
            .map_err(|e| AcpError::Protocol(e.to_string()))?;
        line.push('\n');
        let mut stdin = self.stdin.lock().await;
        stdin.write_all(line.as_bytes()).await?;
        stdin.flush().await?;
        Ok(())
    }
}

/// Connexion à un agent ACP lancé en sous-processus, avec une session ouverte.
pub struct AcpClient {
    shared: Arc<Shared>,
    next_id: AtomicU64,
    session_id: String,
    models: AgentModels,
    _child: Child,
}

impl AcpClient {
    /// Lance l'agent dans `cwd`, négocie le protocole et ouvre une session.
    /// Les événements de l'agent arrivent sur le récepteur renvoyé.
    ///
    /// Renvoie `AcpError::AuthRequired` avec les méthodes de connexion de l'agent
    /// si celui-ci n'est pas connecté.
    pub async fn spawn(
        spec: &AgentSpec,
        cwd: &Path,
    ) -> Result<(Self, mpsc::UnboundedReceiver<AcpEvent>), AcpError> {
        Self::connect(spec, cwd, None, &[]).await
    }

    /// Comme `spawn`, et propose des serveurs MCP à l'agent (ceux qu'il ne sait pas utiliser par HTTP
    /// sont ignorés).
    pub async fn spawn_with_mcp(
        spec: &AgentSpec,
        cwd: &Path,
        mcp: &[McpServerConfig],
    ) -> Result<(Self, mpsc::UnboundedReceiver<AcpEvent>), AcpError> {
        Self::connect(spec, cwd, None, mcp).await
    }

    /// Comme `spawn`, mais exécute d'abord la méthode de connexion `method_id`.
    pub async fn spawn_authenticated(
        spec: &AgentSpec,
        cwd: &Path,
        method_id: &str,
    ) -> Result<(Self, mpsc::UnboundedReceiver<AcpEvent>), AcpError> {
        Self::connect(spec, cwd, Some(method_id), &[]).await
    }

    async fn connect(
        spec: &AgentSpec,
        cwd: &Path,
        method_id: Option<&str>,
        mcp: &[McpServerConfig],
    ) -> Result<(Self, mpsc::UnboundedReceiver<AcpEvent>), AcpError> {
        let mut child = Command::new(&spec.command)
            .args(&spec.args)
            .envs(spec.env.iter().map(|(name, value)| (name, value)))
            .current_dir(cwd)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .kill_on_drop(true)
            .spawn()
            .map_err(AcpError::Spawn)?;

        let stdin = child.stdin.take().ok_or(AcpError::Closed)?;
        let stdout = child.stdout.take().ok_or(AcpError::Closed)?;
        let (events, receiver) = mpsc::unbounded_channel();
        let shared = Arc::new(Shared {
            stdin: Mutex::new(stdin),
            pending: Mutex::default(),
            permissions: Mutex::default(),
            events,
        });
        tokio::spawn(reader::read_loop(stdout, shared.clone()));

        let mut client = Self {
            shared,
            next_id: AtomicU64::new(1),
            session_id: String::new(),
            models: AgentModels::default(),
            _child: child,
        };
        let init = client.request("initialize", protocol::initialize_params()).await?;
        if let Some(method_id) = method_id {
            client
                .request("authenticate", json!({ "methodId": method_id }))
                .await?;
        }
        let servers = if supports_http(&init) {
            mcp.iter().map(McpServerConfig::to_acp).collect()
        } else {
            Vec::new()
        };
        let session = match client
            .request("session/new", protocol::new_session_params(cwd, servers))
            .await
        {
            Err(AcpError::Rpc { code: AUTH_REQUIRED_CODE, .. }) => {
                return Err(AcpError::AuthRequired(AuthMethod::list_from(&init)));
            }
            other => other?,
        };
        client.models = AgentModels::from_session(&session);
        client.session_id = session["sessionId"]
            .as_str()
            .ok_or_else(|| AcpError::Protocol("session/new sans sessionId".into()))?
            .to_owned();
        Ok((client, receiver))
    }

    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    /// Les modèles que l'agent propose (liste vide s'il n'a pas de choix).
    pub fn models(&self) -> &AgentModels {
        &self.models
    }

    /// Change le modèle utilisé par l'agent pour la suite de la session.
    pub async fn set_model(&self, model_id: &str) -> Result<(), AcpError> {
        match &self.models.config_id {
            Some(config_id) => {
                let params = json!({ "sessionId": self.session_id, "configId": config_id, "value": model_id });
                self.request("session/set_config_option", params).await.map(|_| ())
            }
            None => {
                let params = json!({ "sessionId": self.session_id, "modelId": model_id });
                self.request("session/set_model", params).await.map(|_| ())
            }
        }
    }

    /// Envoie un message à l'agent et attend la fin de son tour.
    /// Les réponses partielles arrivent en `AcpEvent::Message` pendant l'attente ;
    /// le tour se termine par `AcpEvent::Done` ou `AcpEvent::Error`.
    pub async fn prompt(&self, text: &str) -> Result<String, AcpError> {
        let params = protocol::prompt_params(&self.session_id, text);
        match self.request("session/prompt", params).await {
            Ok(result) => {
                let stop_reason = result["stopReason"].as_str().unwrap_or("end_turn").to_owned();
                if let Some(usage) = AcpEvent::turn_usage(&result) {
                    let _ = self.shared.events.send(usage);
                }
                let _ = self.shared.events.send(AcpEvent::Done { stop_reason: stop_reason.clone() });
                Ok(stop_reason)
            }
            Err(error) => {
                let _ = self.shared.events.send(AcpEvent::Error { message: error.to_string() });
                Err(error)
            }
        }
    }

    /// Demande à l'agent d'interrompre le tour en cours.
    pub async fn cancel(&self) -> Result<(), AcpError> {
        let params = json!({ "sessionId": self.session_id });
        self.shared.send(&protocol::notification("session/cancel", params)).await
    }

    /// Répond à une demande d'autorisation ; `None` l'annule.
    /// Renvoie `false` si la demande n'existe plus.
    pub async fn resolve_permission(&self, request_id: &str, option_id: Option<String>) -> bool {
        match self.shared.permissions.lock().await.remove(request_id) {
            Some(sender) => sender.send(option_id).is_ok(),
            None => false,
        }
    }

    async fn request(&self, method: &str, params: Value) -> Reply {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (sender, receiver) = oneshot::channel();
        self.shared.pending.lock().await.insert(id, sender);
        if let Err(error) = self.shared.send(&protocol::request(id, method, params)).await {
            self.shared.pending.lock().await.remove(&id);
            return Err(error);
        }
        receiver.await.map_err(|_| AcpError::Closed)?
    }
}
