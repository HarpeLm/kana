mod agent_commands;
mod state;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state::AgentSessions::default())
        .invoke_handler(tauri::generate_handler![
            agent_commands::start_agent,
            agent_commands::send_prompt,
            agent_commands::cancel_prompt,
            agent_commands::answer_permission,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
