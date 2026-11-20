mod agent_commands;
mod agent_spec;
mod browser;
mod browser_agent;
mod browser_agent_tools;
mod browser_commands;
mod git_commands;
mod secrets;
mod settings_commands;
mod state;
mod terminal_commands;
mod terminals;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AgentSessions::default())
        .manage(terminals::Terminals::default())
        .manage(browser_agent::AgentState::default())
        .setup(|app| {
            start_browser_mcp(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            agent_commands::start_agent,
            agent_commands::send_prompt,
            agent_commands::cancel_prompt,
            agent_commands::answer_permission,
            settings_commands::check_agent,
            settings_commands::login_agent,
            settings_commands::has_api_key,
            settings_commands::set_api_key,
            settings_commands::delete_api_key,
            git_commands::git_diff,
            git_commands::repo_files,
            git_commands::read_repo_file,
            git_commands::write_repo_file,
            browser_commands::browser_open,
            browser_commands::browser_set_bounds,
            browser_commands::browser_set_visible,
            browser_commands::browser_navigate,
            browser_commands::browser_back,
            browser_commands::browser_forward,
            browser_commands::browser_reload,
            browser_commands::browser_close,
            browser_commands::browser_set_active,
            browser_commands::browser_agent_answer,
            terminal_commands::terminal_open,
            terminal_commands::terminal_write,
            terminal_commands::terminal_resize,
            terminal_commands::terminal_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Jeton aléatoire pour le serveur MCP local : sans lui, aucune requête n'est acceptée.
fn random_token() -> Result<String, getrandom::Error> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes)?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}

/// Lance le serveur qui donne aux agents des outils pour naviguer dans le Globe.
fn start_browser_mcp(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use std::sync::Arc;
    use tauri::Manager;

    let token = random_token()?;
    let driver = Arc::new(browser_agent::BrowserAgent::new(app.clone()));
    let server = kana_mcp::McpServer::start(driver, token.clone())?;
    app.state::<browser_agent::AgentState>()
        .set_mcp(browser_agent::McpInfo { url: server.url(), token });
    Ok(())
}
