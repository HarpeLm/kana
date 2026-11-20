//! Commandes Tauri du terminal intégré.

use std::path::PathBuf;

use base64::{Engine, engine::general_purpose::STANDARD};
use kana_pty::PtySession;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{agent_spec::default_cwd, terminals::Terminals};

#[derive(Clone, Serialize)]
struct TerminalData {
    id: String,
    /// Octets de sortie en base64 : une séquence UTF-8 peut être coupée entre deux morceaux.
    data: String,
}

#[derive(Clone, Serialize)]
struct TerminalExit {
    id: String,
}

fn shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into())
}

/// Ouvre un shell de connexion s'il n'y en a pas déjà un pour cet identifiant.
#[tauri::command]
pub fn terminal_open(
    app: AppHandle,
    terminals: State<'_, Terminals>,
    id: String,
    cwd: Option<String>,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    if terminals.contains(&id) {
        return Ok(());
    }
    let cwd = cwd.map(PathBuf::from).unwrap_or_else(default_cwd);

    let data_app = app.clone();
    let data_id = id.clone();
    let exit_id = id.clone();
    let session = PtySession::spawn(
        &shell(),
        &["-l"],
        &cwd,
        rows,
        cols,
        move |bytes| {
            let payload = TerminalData { id: data_id.clone(), data: STANDARD.encode(bytes) };
            let _ = data_app.emit("terminal-data", payload);
        },
        move || {
            let _ = app.emit("terminal-exit", TerminalExit { id: exit_id.clone() });
            app.state::<Terminals>().remove(&exit_id);
        },
    )
    .map_err(|e| e.to_string())?;

    terminals.insert(id, session);
    Ok(())
}

#[tauri::command]
pub fn terminal_write(
    terminals: State<'_, Terminals>,
    id: String,
    data: String,
) -> Result<(), String> {
    terminals
        .with(&id, |session| session.write(data.as_bytes()))
        .ok_or_else(|| "terminal fermé".to_string())?
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_resize(
    terminals: State<'_, Terminals>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    terminals
        .with(&id, |session| session.resize(rows, cols))
        .ok_or_else(|| "terminal fermé".to_string())?
        .map_err(|e| e.to_string())
}

/// Ferme le terminal et arrête son shell.
#[tauri::command]
pub fn terminal_close(terminals: State<'_, Terminals>, id: String) {
    terminals.remove(&id);
}
