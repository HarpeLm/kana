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
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
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

/// Un onglet ouvert dans le volet Globe.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GlobeTabInfo {
    pub id: String,
    pub url: String,
    pub title: String,
}

/// Une action enregistrée pendant une session de trace Globe.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobeTraceEntry {
    pub at: u64,
    pub tool: String,
    pub target: String,
    pub url: String,
    pub title: String,
    pub status: String,
}

/// État courant de l'enregistreur de trace Globe.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobeTraceStatus {
    pub recording: bool,
    pub entries: Vec<GlobeTraceEntry>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn escape_html(raw: &str) -> String {
    raw.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Génère un rapport HTML autonome de preuve de vérification pour une session Globe.
pub fn build_trace_html(
    entries: &[GlobeTraceEntry],
    console_report: &str,
    network_report: &str,
) -> String {
    let mut rows = String::new();
    for (idx, e) in entries.iter().enumerate() {
        rows.push_str(&format!(
            "<tr><td>{}</td><td><code>{}</code></td><td><code>{}</code></td><td>{}</td><td>{}</td><td>{}</td></tr>\n",
            idx + 1,
            escape_html(&e.tool),
            escape_html(&e.target),
            escape_html(&e.title),
            escape_html(&e.url),
            escape_html(&e.status),
        ));
    }
    if rows.is_empty() {
        rows.push_str("<tr><td colspan=\"6\">Aucune action enregistrée dans cette trace.</td></tr>\n");
    }
    format!(
        r#"<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Preuve de vérification Globe — Kana</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #141413; color: #ecebe4; margin: 24px; }}
  h1 {{ font-size: 20px; margin-bottom: 4px; }}
  h2 {{ font-size: 15px; margin-top: 24px; color: #b9b8b0; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }}
  th, td {{ border: 1px solid #2e2e2a; padding: 8px 10px; text-align: left; }}
  th {{ background: #1f1f1d; color: #cfcec6; }}
  pre {{ background: #1c1c1a; border: 1px solid #2e2e2a; border-radius: 8px; padding: 12px; font-size: 12px; white-space: pre-wrap; }}
  code {{ color: #8ab4f8; }}
</style>
</head>
<body>
  <h1>Preuve de vérification Globe — Kana</h1>
  <p>{count} action(s) horodatée(s)</p>
  <h2>Chronologie des actions</h2>
  <table>
    <thead><tr><th>#</th><th>Outil</th><th>Cible</th><th>Titre</th><th>URL</th><th>Statut</th></tr></thead>
    <tbody>
{rows}    </tbody>
  </table>
  <h2>État Console JS</h2>
  <pre>{console}</pre>
  <h2>État Réseau (XHR / Fetch)</h2>
  <pre>{network}</pre>
</body>
</html>"#,
        count = entries.len(),
        rows = rows,
        console = escape_html(console_report),
        network = escape_html(network_report),
    )
}

/// État partagé : l'onglet que l'utilisateur regarde, les sites autorisés et les demandes en attente.
#[derive(Default)]
pub struct AgentState {
    active: Mutex<Option<String>>,
    tabs: Mutex<Vec<GlobeTabInfo>>,
    allowed: Mutex<HashSet<String>>,
    pending: Mutex<HashMap<String, mpsc::Sender<bool>>>,
    next_request: AtomicU64,
    mcp: Mutex<Option<McpInfo>>,
    recording: AtomicBool,
    trace: Mutex<Vec<GlobeTraceEntry>>,
}

impl AgentState {
    pub fn set_active(&self, tab_id: String) {
        *self.active.lock().unwrap() = Some(tab_id);
    }

    pub fn active_tab(&self) -> Option<String> {
        self.active.lock().unwrap().clone()
    }

    pub fn upsert_tab(&self, id: String, url: String, title: Option<String>) {
        let mut tabs = self.tabs.lock().unwrap();
        if let Some(existing) = tabs.iter_mut().find(|t| t.id == id) {
            if !url.is_empty() {
                existing.url = url;
            }
            if let Some(t) = title
                && !t.is_empty()
            {
                existing.title = t;
            }
        } else {
            tabs.push(GlobeTabInfo {
                id,
                url: url.clone(),
                title: title.unwrap_or(url),
            });
        }
    }

    pub fn remove_tab(&self, id: &str) {
        self.tabs.lock().unwrap().retain(|t| t.id != id);
    }

    pub fn tabs(&self) -> Vec<GlobeTabInfo> {
        self.tabs.lock().unwrap().clone()
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

    pub fn trace_start(&self, reset: bool) -> GlobeTraceStatus {
        if reset {
            self.trace.lock().unwrap().clear();
        }
        self.recording.store(true, Ordering::Relaxed);
        self.trace_status()
    }

    pub fn trace_stop(&self) -> GlobeTraceStatus {
        self.recording.store(false, Ordering::Relaxed);
        self.trace_status()
    }

    pub fn trace_status(&self) -> GlobeTraceStatus {
        GlobeTraceStatus {
            recording: self.recording.load(Ordering::Relaxed),
            entries: self.trace.lock().unwrap().clone(),
        }
    }

    pub fn record_trace(&self, tool: &str, target: &str, url: &str, title: &str, status: &str) {
        if !self.recording.load(Ordering::Relaxed) {
            return;
        }
        let mut trace = self.trace.lock().unwrap();
        trace.push(GlobeTraceEntry {
            at: now_ms(),
            tool: tool.to_owned(),
            target: target.to_owned(),
            url: url.to_owned(),
            title: title.to_owned(),
            status: status.to_owned(),
        });
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

/// Journal de diagnostic, écrit seulement dans les versions de développement.
pub(crate) fn debug_log(line: &str) {
    if !cfg!(debug_assertions) {
        return;
    }
    use std::io::Write;
    if let Ok(mut file) = std::fs::OpenOptions::new().create(true).append(true).open("/tmp/kana-debug.log") {
        let _ = writeln!(file, "{line}");
    }
}

pub struct BrowserAgent {
    pub(crate) app: AppHandle,
}

impl BrowserAgent {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    pub(crate) fn state(&self) -> State<'_, AgentState> {
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
                debug_log("navigateur : demande d'ouverture du Globe");
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
        debug_log(&format!("accord demandé : {kind} {host} {detail}"));
        if self.app.emit("browser-agent-approval", request).is_err() {
            state.pending.lock().unwrap().remove(&id);
            return false;
        }
        let answer = receiver.recv_timeout(APPROVAL_TIMEOUT).unwrap_or(false);
        debug_log(&format!("accord reçu : {answer}"));
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
