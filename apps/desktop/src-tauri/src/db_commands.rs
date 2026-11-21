//! Commandes Tauri du stockage : conversations et messages dans la base SQLite de Kana.

use kana_db::{Store, StoredConversation, StoredMessage, StoredMessageHit, StoredProject};
use tauri::{AppHandle, Manager, State};

/// Ouvre la base dans le dossier de données de l'app (`~/Library/Application Support/...`).
pub fn open_store(app: &AppHandle) -> Result<Store, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Store::open(&dir.join("kana.db")).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_load_conversations(store: State<'_, Store>) -> Result<Vec<StoredConversation>, String> {
    store.conversations().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_conversations(store: State<'_, Store>, items: Vec<StoredConversation>) -> Result<(), String> {
    store.save_conversations(&items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_load_messages(store: State<'_, Store>, conversation_id: String) -> Result<Vec<StoredMessage>, String> {
    store.messages(&conversation_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_messages(
    store: State<'_, Store>,
    conversation_id: String,
    messages: Vec<StoredMessage>,
) -> Result<(), String> {
    store.save_messages(&conversation_id, &messages).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_load_projects(store: State<'_, Store>) -> Result<Vec<StoredProject>, String> {
    store.projects().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_save_projects(store: State<'_, Store>, items: Vec<StoredProject>) -> Result<(), String> {
    store.save_projects(&items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn db_search_messages(
    store: State<'_, Store>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<StoredMessageHit>, String> {
    store.search_messages(&query, limit.unwrap_or(20)).map_err(|e| e.to_string())
}
