//! Commandes Tauri du navigateur intégré : une vue web native par onglet, posée sur la fenêtre.
//!
//! Les cookies et le stockage de ces vues sont conservés entre deux lancements (magasin de
//! données par défaut du système), donc on reste connecté aux sites. Les pages n'ont aucun accès
//! aux commandes de Kana.

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl,
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
};

use crate::{
    browser::{is_allowed_navigation, parse_web_url, webview_label},
    browser_agent::{AgentState, BrowserAgent, GlobeTraceStatus, build_trace_html},
};

/// Script qui trouve l'icône de la page ; à défaut, `/favicon.ico` à la racine du site.
const FAVICON_JS: &str = r#"(() => {
  const link = document.querySelector('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  return (link && link.href) || (location.origin + '/favicon.ico');
})()"#;

#[derive(Clone, Serialize)]
struct FaviconEvent {
    /// Adresse de la page, dont l'interface retient le domaine.
    page: String,
    icon: String,
}

/// Une fois la page chargée, annonce son icône à l'interface pour les liens qui y mènent.
fn report_favicon(webview: &tauri::Webview, app: AppHandle, page: String) {
    let _ = webview.eval_with_callback(FAVICON_JS, move |raw| {
        let Ok(icon) = serde_json::from_str::<String>(&raw) else { return };
        if icon.starts_with("http://") || icon.starts_with("https://") {
            let _ = app.emit("browser-favicon", FaviconEvent { page: page.clone(), icon });
        }
    });
}

/// Position et taille de la vue, en pixels logiques dans la fenêtre.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Serialize)]
struct UrlEvent {
    id: String,
    url: String,
}

#[derive(Clone, Serialize)]
struct TitleEvent {
    id: String,
    title: String,
}

#[derive(Clone, Serialize)]
struct LoadingEvent {
    id: String,
    loading: bool,
}

fn webview_of(app: &AppHandle, id: &str) -> Result<tauri::Webview, String> {
    app.get_webview(&webview_label(id))
        .ok_or_else(|| "onglet introuvable".to_string())
}

/// Ouvre la vue d'un onglet sur `url`. Sans effet si elle existe déjà.
#[tauri::command]
pub fn browser_open(app: AppHandle, id: String, url: String, bounds: Bounds) -> Result<(), String> {
    let label = webview_label(&id);
    if app.get_webview(&label).is_some() {
        return Ok(());
    }
    let parsed_url = parse_web_url(&url)?;
    app.state::<AgentState>().upsert_tab(id.clone(), parsed_url.to_string(), None);
    let window = app
        .get_window("main")
        .ok_or_else(|| "fenêtre principale introuvable".to_string())?;

    let (navigated, loaded, titled, popup) = (app.clone(), app.clone(), app.clone(), app.clone());
    let (nav_id, load_id, title_id, popup_id) = (id.clone(), id.clone(), id.clone(), id);

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url))
        // Outils de lecture et d'action sur la page, pour les agents.
        .initialization_script(include_str!("agent_page.js"))
        .on_navigation(move |target| {
            if !is_allowed_navigation(target) {
                return false;
            }
            navigated.state::<AgentState>().upsert_tab(nav_id.clone(), target.to_string(), None);
            let _ = navigated.emit("browser-navigated", UrlEvent { id: nav_id.clone(), url: target.to_string() });
            true
        })
        .on_page_load(move |webview, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            if !loading {
                report_favicon(&webview, loaded.clone(), payload.url().to_string());
            }
            loaded.state::<AgentState>().upsert_tab(load_id.clone(), payload.url().to_string(), None);
            let _ = loaded.emit("browser-loading", LoadingEvent { id: load_id.clone(), loading });
            let _ = loaded.emit("browser-navigated", UrlEvent { id: load_id.clone(), url: payload.url().to_string() });
        })
        .on_document_title_changed(move |_, title| {
            titled.state::<AgentState>().upsert_tab(title_id.clone(), String::new(), Some(title.clone()));
            let _ = titled.emit("browser-title", TitleEvent { id: title_id.clone(), title });
        })
        // Un lien qui voudrait ouvrir une nouvelle fenêtre ouvre un nouvel onglet de Kana.
        .on_new_window(move |target, _| {
            if is_allowed_navigation(&target) {
                let _ = popup.emit("browser-new-tab", UrlEvent { id: popup_id.clone(), url: target.to_string() });
            }
            NewWindowResponse::Deny
        });

    window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn browser_set_bounds(app: AppHandle, id: String, bounds: Bounds) -> Result<(), String> {
    let webview = webview_of(&app, &id)?;
    webview
        .set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)))
        .map_err(|e| e.to_string())
}

/// Montre ou cache la vue : une vue native passerait sinon par-dessus les menus de l'app.
#[tauri::command]
pub fn browser_set_visible(app: AppHandle, id: String, visible: bool) -> Result<(), String> {
    let webview = webview_of(&app, &id)?;
    if visible { webview.show() } else { webview.hide() }.map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_navigate(app: AppHandle, id: String, url: String) -> Result<(), String> {
    let url = parse_web_url(&url)?;
    webview_of(&app, &id)?.navigate(url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_back(app: AppHandle, id: String) -> Result<(), String> {
    webview_of(&app, &id)?.eval("history.back()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, id: String) -> Result<(), String> {
    webview_of(&app, &id)?.eval("history.forward()").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_reload(app: AppHandle, id: String) -> Result<(), String> {
    webview_of(&app, &id)?.eval("location.reload()").map_err(|e| e.to_string())
}

/// Ferme la vue d'un onglet. Sans effet si elle n'existe plus.
#[tauri::command]
pub fn browser_close(app: AppHandle, id: String) -> Result<(), String> {
    app.state::<AgentState>().remove_tab(&id);
    match app.get_webview(&webview_label(&id)) {
        Some(webview) => webview.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

/// L'onglet que l'utilisateur regarde : celui sur lequel les agents agissent.
#[tauri::command]
pub fn browser_set_active(state: State<'_, AgentState>, id: String) {
    state.set_active(id);
}

/// Réponse de l'utilisateur à une demande d'accord d'un agent.
#[tauri::command]
pub fn browser_agent_answer(state: State<'_, AgentState>, request_id: String, allow: bool) {
    state.answer(&request_id, allow);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserDiagnosticsReport {
    pub console_errors: Vec<serde_json::Value>,
    pub network_errors: Vec<serde_json::Value>,
}

/// Lit les erreurs console JS et requêtes réseau 4xx/5xx de l'onglet actif.
#[tauri::command]
pub fn browser_get_diagnostics(app: AppHandle, clear: bool) -> Result<BrowserDiagnosticsReport, String> {
    let agent = BrowserAgent::new(app);
    let Ok(webview) = agent.webview() else {
        return Ok(BrowserDiagnosticsReport {
            console_errors: Vec::new(),
            network_errors: Vec::new(),
        });
    };
    let console = agent
        .helper(&webview, &format!("consoleErrors(true, {clear})"))
        .ok()
        .and_then(|v| v["entries"].as_array().cloned())
        .unwrap_or_default();
    let network = agent
        .helper(&webview, &format!("networkErrors({clear})"))
        .ok()
        .and_then(|v| v["entries"].as_array().cloned())
        .unwrap_or_default();
    Ok(BrowserDiagnosticsReport {
        console_errors: console,
        network_errors: network,
    })
}

/// État actuel de la trace de session Globe.
#[tauri::command]
pub fn browser_trace_status(state: State<'_, AgentState>) -> GlobeTraceStatus {
    state.trace_status()
}

/// Démarre ou arrête l'enregistrement de la trace Globe.
#[tauri::command]
pub fn browser_trace_toggle(state: State<'_, AgentState>, active: bool, reset: bool) -> GlobeTraceStatus {
    if active {
        state.trace_start(reset)
    } else {
        state.trace_stop()
    }
}

/// Exporte un rapport HTML autonome de preuve de vérification de la session Globe.
#[tauri::command]
pub fn browser_trace_export(app: AppHandle, state: State<'_, AgentState>) -> Result<String, String> {
    let status = state.trace_status();
    let diag = browser_get_diagnostics(app, false).unwrap_or(BrowserDiagnosticsReport {
        console_errors: Vec::new(),
        network_errors: Vec::new(),
    });
    let console_text = if diag.console_errors.is_empty() {
        "Aucune erreur console JS.".to_owned()
    } else {
        serde_json::to_string_pretty(&diag.console_errors).unwrap_or_default()
    };
    let network_text = if diag.network_errors.is_empty() {
        "Aucune erreur réseau 4xx/5xx.".to_owned()
    } else {
        serde_json::to_string_pretty(&diag.network_errors).unwrap_or_default()
    };
    Ok(build_trace_html(&status.entries, &console_text, &network_text))
}
