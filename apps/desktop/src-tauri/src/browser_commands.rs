//! Commandes Tauri du navigateur intégré : une vue web native par onglet, posée sur la fenêtre.
//!
//! Les cookies et le stockage de ces vues sont conservés entre deux lancements (magasin de
//! données par défaut du système), donc on reste connecté aux sites. Les pages n'ont aucun accès
//! aux commandes de Kana.

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, WebviewUrl,
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
};

use crate::browser::{is_allowed_navigation, parse_web_url, webview_label};

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
    let url = parse_web_url(&url)?;
    let window = app
        .get_window("main")
        .ok_or_else(|| "fenêtre principale introuvable".to_string())?;

    let (navigated, loaded, titled, popup) = (app.clone(), app.clone(), app.clone(), app.clone());
    let (nav_id, load_id, title_id, popup_id) = (id.clone(), id.clone(), id.clone(), id);

    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url))
        .on_navigation(move |target| {
            if !is_allowed_navigation(target) {
                return false;
            }
            let _ = navigated.emit("browser-navigated", UrlEvent { id: nav_id.clone(), url: target.to_string() });
            true
        })
        .on_page_load(move |_, payload| {
            let loading = matches!(payload.event(), PageLoadEvent::Started);
            let _ = loaded.emit("browser-loading", LoadingEvent { id: load_id.clone(), loading });
            let _ = loaded.emit("browser-navigated", UrlEvent { id: load_id.clone(), url: payload.url().to_string() });
        })
        .on_document_title_changed(move |_, title| {
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
    match app.get_webview(&webview_label(&id)) {
        Some(webview) => webview.close().map_err(|e| e.to_string()),
        None => Ok(()),
    }
}
