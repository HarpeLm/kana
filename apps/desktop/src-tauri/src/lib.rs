mod agent_commands;
mod agent_spec;
mod attachment_commands;
mod browser;
mod browser_agent;
mod browser_agent_tools;
mod browser_commands;
mod db_commands;
mod git_commands;
mod project_commands;
mod secrets;
mod settings_commands;
mod state;
mod terminal_commands;
mod terminals;
mod worktree_commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(state::AgentSessions::default())
        .manage(state::KeepAwake::default())
        .manage(terminals::Terminals::default())
        .manage(browser_agent::AgentState::default())
        .setup(|app| {
            start_browser_mcp(app.handle())?;
            app.manage(db_commands::open_store(app.handle())?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            attachment_commands::image_preview,
            attachment_commands::save_clipboard_image,
            db_commands::db_load_conversations,
            db_commands::db_save_conversations,
            db_commands::db_load_messages,
            db_commands::db_save_messages,
            db_commands::db_load_projects,
            db_commands::db_save_projects,
            db_commands::db_search_messages,
            project_commands::launch_project,
            project_commands::create_project,
            project_commands::scratch_dir,
            project_commands::describe_folder,
            worktree_commands::create_worktree,
            worktree_commands::remove_worktree,
            worktree_commands::merge_worktree,
            worktree_commands::discard_worktree,
            worktree_commands::scan_orphan_worktrees,
            worktree_commands::clean_orphan_worktree,
            agent_commands::start_agent,
            agent_commands::send_prompt,
            agent_commands::cancel_prompt,
            agent_commands::set_model,
            agent_commands::set_effort,
            agent_commands::set_plan_mode,
            agent_commands::stop_agent,
            settings_commands::list_models,
            settings_commands::suggest_title,
            agent_commands::answer_permission,
            settings_commands::check_agent,
            settings_commands::login_agent,
            settings_commands::has_api_key,
            settings_commands::set_api_key,
            settings_commands::delete_api_key,
            settings_commands::set_keep_awake,
            settings_commands::notify_user,
            settings_commands::core_detect_problem,
            settings_commands::core_pick_relay_target,
            settings_commands::core_auto_answer,
            settings_commands::run_hook_command,
            settings_commands::list_adapter_caches,
            settings_commands::install_adapter_cache,
            settings_commands::check_app_update,
            git_commands::git_diff,
            git_commands::git_branch_summary,
            git_commands::git_pull_requests,
            git_commands::git_remote_url,
            git_commands::git_current_branches,
            git_commands::git_create_pull_request,
            git_commands::git_read_rule_files,
            git_commands::git_write_rule_file,
            git_commands::git_sync_rule_files,
            git_commands::git_revert_file,
            git_commands::git_revert_hunk,
            git_commands::git_create_checkpoint,
            git_commands::git_restore_checkpoint,
            git_commands::git_inspect_conflicts,
            git_commands::git_pr_feedback,
            git_commands::git_diagnostics,
            git_commands::repo_files,
            git_commands::read_repo_file,
            git_commands::write_repo_file,
            git_commands::delete_repo_file,
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
            browser_commands::browser_get_diagnostics,
            browser_commands::browser_trace_status,
            browser_commands::browser_trace_toggle,
            browser_commands::browser_trace_export,
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

/// Exécute une commande CLI Headless (`kana run`, `kana advisor`, `--help`, `--version`) et renvoie le code de sortie.
pub fn run_cli(cmd: kana_core::CliCommand) -> i32 {
    match cmd {
        kana_core::CliCommand::Gui => {
            run();
            0
        }
        kana_core::CliCommand::Help => {
            println!("{}", kana_core::format_cli_help());
            0
        }
        kana_core::CliCommand::Version => {
            println!("kana {}", env!("CARGO_PKG_VERSION"));
            0
        }
        kana_core::CliCommand::Advisor { task } => {
            let subject = task.as_deref().unwrap_or("Tâche générale sur le dépôt");
            println!("{}", kana_core::advisor_recommendation(subject));
            0
        }
        kana_core::CliCommand::Run {
            prompt,
            agent,
            cwd,
            model,
            sandbox,
            read_only,
            json,
            cross_review,
        } => {
            let rt = match tokio::runtime::Runtime::new() {
                Ok(rt) => rt,
                Err(e) => {
                    eprintln!("impossible d'initialiser le runtime Tokio : {e}");
                    return 1;
                }
            };
            rt.block_on(async move {
                let workdir = cwd
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(agent_spec::project_dir);
                let agents_chain = cross_review.unwrap_or_else(|| vec![agent.clone()]);
                let mut steps_output = Vec::new();
                for (idx, step_agent) in agents_chain.iter().enumerate() {
                    let mut spec = match agent_spec::spec_for(step_agent) {
                        Ok(s) => s,
                        Err(e) => {
                            eprintln!("erreur agent '{step_agent}' : {e}");
                            return 1;
                        }
                    };
                    if sandbox {
                        spec = spec.with_sandbox(if read_only {
                            kana_acp::SandboxPolicy::ReadOnly
                        } else {
                            kana_acp::SandboxPolicy::WorkspaceWrite
                        });
                    }
                    let step_prompt = if agents_chain.len() == 1 {
                        prompt.clone()
                    } else if idx == 0 {
                        format!("[Cross-Review Étape 1/3 · Implémentation]\n{prompt}")
                    } else if idx == 1 {
                        format!(
                            "[Cross-Review Étape 2/3 · Revue critique du Diff]\nRelis le diff produit à l'étape précédente pour « {prompt} » et signale/corrige toute régression."
                        )
                    } else {
                        format!(
                            "[Cross-Review Étape 3/3 · Vérification finale]\nVérifie la compilation, les tests et la conformité finale pour « {prompt} »."
                        )
                    };

                    let (client, mut events) = match kana_acp::AcpClient::spawn(&spec, &workdir).await {
                        Ok(pair) => pair,
                        Err(e) => {
                            eprintln!("impossible de démarrer '{step_agent}' : {e}");
                            return 1;
                        }
                    };
                    if let Some(m) = model.as_deref() {
                        let _ = client.set_model(m).await;
                    }
                    if read_only {
                        let _ = client.set_plan_mode(true).await;
                    }
                    if let Err(e) = client.prompt(&step_prompt).await {
                        eprintln!("erreur lors de l'envoi du prompt à '{step_agent}' : {e}");
                        return 1;
                    }
                    let mut collected = String::new();
                    while let Some(ev) = events.recv().await {
                        match ev {
                            kana_acp::AcpEvent::Message { text } => {
                                if !json {
                                    print!("{text}");
                                }
                                collected.push_str(&text);
                            }
                            kana_acp::AcpEvent::Done { .. } | kana_acp::AcpEvent::Closed => break,
                            kana_acp::AcpEvent::Error { message } => {
                                eprintln!("erreur de '{step_agent}' : {message}");
                                return 1;
                            }
                            _ => {}
                        }
                    }
                    if !json && !collected.ends_with('\n') {
                        println!();
                    }
                    steps_output.push(serde_json::json!({
                        "step": idx + 1,
                        "agent": step_agent,
                        "response": collected,
                    }));
                }
                if json {
                    println!(
                        "{}",
                        serde_json::json!({
                            "ok": true,
                            "cwd": workdir.to_string_lossy(),
                            "steps": steps_output,
                        })
                    );
                }
                0
            })
        }
    }
}
