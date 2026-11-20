mod agent_commands;
mod agent_spec;
mod browser;
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
        .manage(state::AgentSessions::default())
        .manage(terminals::Terminals::default())
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
            terminal_commands::terminal_open,
            terminal_commands::terminal_write,
            terminal_commands::terminal_resize,
            terminal_commands::terminal_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
