//! Ce qui permet à un agent de piloter le navigateur de Kana : lire la page dans la vue active,
//! lancer les actions, et demander l'accord de l'utilisateur.
//!
//! Un agent ne touche à un site qu'après un accord de l'utilisateur (une fois par site et par
//! session), et les clics qui ressemblent à un paiement, une suppression ou un envoi demandent un
//! accord de plus à chaque fois.

use std::{
    collections::{HashMap, HashSet},
    sync::{
        Mutex, mpsc,
        atomic::{AtomicU64, Ordering},
    },
    thread,
    time::Duration,
};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State, Webview};

use crate::browser::webview_label;

const OPEN_ATTEMPTS: u32 = 40;
const OPEN_STEP: Duration = Duration::from_millis(200);
const EVAL_TIMEOUT: Duration = Duration::from_secs(10);
const APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

/// Adresse et jeton du serveur MCP, à donner aux agents.
#[derive(Clone)]
pub struct McpInfo {
    pub url: String,
    pub token: String,
}

/// État partagé : l'onglet que l'utilisateur regarde, les sites autorisés et les demandes en attente.
#[derive(Default)]
pub struct AgentState {
    active: Mutex<Option<String>>,
    allowed: Mutex<HashSet<String>>,
    pending: Mutex<HashMap<String, mpsc::Sender<bool>>>,
    next_request: AtomicU64,
    mcp: Mutex<Option<McpInfo>>,
}

impl AgentState {
    pub fn set_active(&self, tab_id: String) {
        *self.active.lock().unwrap() = Some(tab_id);
    }

    pub fn set_mcp(&self, info: McpInfo) {
        *self.mcp.lock().unwrap() = Some(info);
    }

    pub fn mcp(&self) -> Option<McpInfo> {
        self.mcp.lock().unwrap().clone()
    }

    /// Transmet la réponse de l'utilisateur à la demande `request_id`.
    pub fn answer(&self, request_id: &str, allow: bool) {
        if let Some(sender) = self.pending.lock().unwrap().remove(request_id) {
            let _ = sender.send(allow);
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalRequest {
    request_id: String,
    /// `host` : autoriser un site ; `action` : autoriser un geste précis.
    kind: &'static str,
    host: String,
    detail: String,
}

pub struct BrowserAgent {
    pub(crate) app: AppHandle,
}

impl BrowserAgent {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    fn state(&self) -> State<'_, AgentState> {
        self.app.state::<AgentState>()
    }

    /// La vue de l'onglet actif. Si le navigateur n'est pas ouvert, on demande à l'interface de
    /// l'ouvrir et on attend un instant.
    pub(crate) fn webview(&self) -> Result<Webview, String> {
        for attempt in 0..OPEN_ATTEMPTS {
            let active = self.state().active.lock().unwrap().clone();
            if let Some(webview) = active.and_then(|id| self.app.get_webview(&webview_label(&id))) {
                return Ok(webview);
            }
            if attempt == 0 {
                let _ = self.app.emit("browser-agent-open", ());
            }
            thread::sleep(OPEN_STEP);
        }
        Err("The browser pane is not available in Kana.".into())
    }

    /// Évalue du JavaScript dans la page et renvoie sa valeur.
    pub(crate) fn eval(&self, webview: &Webview, js: &str) -> Result<Value, String> {
        let (sender, receiver) = mpsc::channel();
        webview
            .eval_with_callback(js.to_owned(), move |result| {
                let _ = sender.send(result);
            })
            .map_err(|e| e.to_string())?;
        let raw = receiver
            .recv_timeout(EVAL_TIMEOUT)
            .map_err(|_| "The page did not answer.".to_string())?;
        serde_json::from_str(&raw).map_err(|e| e.to_string())
    }

    /// Appelle une fonction du script d'aide (`window.__kana`) et renvoie sa réponse.
    pub(crate) fn helper(&self, webview: &Webview, call: &str) -> Result<Value, String> {
        let js = format!("(window.__kana ? window.__kana.{call} : {{ ok: false, error: 'The page is not ready.' }})");
        let reply = self.eval(webview, &js)?;
        if reply["ok"] == true {
            Ok(reply)
        } else {
            Err(reply["error"].as_str().unwrap_or("The page refused.").to_owned())
        }
    }

    /// Attend la fin du chargement de la page (au plus une dizaine de secondes).
    pub(crate) fn wait_loaded(&self, webview: &Webview) {
        thread::sleep(Duration::from_millis(400));
        for _ in 0..40 {
            if self.eval(webview, "document.readyState").is_ok_and(|v| v == "complete") {
                return;
            }
            thread::sleep(Duration::from_millis(250));
        }
    }

    /// « Titre — adresse » de la page affichée.
    pub(crate) fn page_summary(&self, webview: &Webview) -> String {
        match self.helper(webview, "info()") {
            Ok(info) => format!("Page: {} ({})", info["title"].as_str().unwrap_or(""), info["url"].as_str().unwrap_or("")),
            Err(_) => String::new(),
        }
    }

    pub(crate) fn host_of(webview: &Webview) -> String {
        webview.url().ok().and_then(|u| u.host_str().map(str::to_owned)).unwrap_or_default()
    }

    /// Demande à l'utilisateur et attend sa réponse. Sans réponse, c'est un refus.
    fn ask(&self, kind: &'static str, host: &str, detail: &str) -> bool {
        let state = self.state();
        let id = format!("approval-{}", state.next_request.fetch_add(1, Ordering::Relaxed));
        let (sender, receiver) = mpsc::channel();
        state.pending.lock().unwrap().insert(id.clone(), sender);
        let request = ApprovalRequest { request_id: id.clone(), kind, host: host.to_owned(), detail: detail.to_owned() };
        if self.app.emit("browser-agent-approval", request).is_err() {
            state.pending.lock().unwrap().remove(&id);
            return false;
        }
        let answer = receiver.recv_timeout(APPROVAL_TIMEOUT).unwrap_or(false);
        state.pending.lock().unwrap().remove(&id);
        answer
    }

    /// Le site est autorisé pour cette session, ou l'utilisateur vient de l'autoriser.
    pub(crate) fn authorize_host(&self, host: &str) -> Result<(), String> {
        if host.is_empty() || self.state().allowed.lock().unwrap().contains(host) {
            return Ok(());
        }
        if self.ask("host", host, "") {
            self.state().allowed.lock().unwrap().insert(host.to_owned());
            Ok(())
        } else {
            Err(format!("The user did not allow browsing {host}."))
        }
    }

    /// Accord pour un geste précis (paiement, suppression, envoi…).
    pub(crate) fn authorize_action(&self, host: &str, detail: &str) -> Result<(), String> {
        if self.ask("action", host, detail) {
            Ok(())
        } else {
            Err("The user refused this action.".into())
        }
    }
}
