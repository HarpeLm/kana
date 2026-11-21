//! Commandes Tauri de l'écran Réglages : connexion des agents et clés d'API.

use kana_acp::{AcpClient, AcpError, AgentModels, AuthMethod};
use serde::Serialize;

use crate::{
    agent_spec::{project_dir, spec_for},
    secrets,
};

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum AgentStatus {
    Ready,
    AuthRequired { methods: Vec<AuthMethod> },
}

/// Lance l'agent un instant pour savoir s'il est connecté.
#[tauri::command]
pub async fn check_agent(agent: String) -> Result<AgentStatus, String> {
    let spec = spec_for(&agent)?;
    match AcpClient::spawn(&spec, &project_dir()).await {
        Ok(_) => Ok(AgentStatus::Ready),
        Err(AcpError::AuthRequired(methods)) => Ok(AgentStatus::AuthRequired { methods }),
        Err(error) => Err(error.to_string()),
    }
}

/// Exécute une méthode de connexion de l'agent (souvent une page web à valider).
/// L'agent garde lui-même ses identifiants ; Kana ne voit jamais le mot de passe.
#[tauri::command]
pub async fn login_agent(agent: String, method_id: String) -> Result<(), String> {
    let spec = spec_for(&agent)?;
    AcpClient::spawn_authenticated(&spec, &project_dir(), &method_id)
        .await
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn has_api_key(agent: String) -> bool {
    secrets::get_api_key(&agent).is_some()
}

#[tauri::command]
pub fn set_api_key(agent: String, key: String) -> Result<(), String> {
    if key.trim().is_empty() {
        return Err("la clé est vide".into());
    }
    secrets::set_api_key(&agent, key.trim())
}

#[tauri::command]
pub fn delete_api_key(agent: String) -> Result<(), String> {
    secrets::delete_api_key(&agent)
}

/// Les modèles qu'un agent propose. Lance l'agent un instant : à appeler à l'ouverture du sélecteur,
/// l'interface garde le résultat en mémoire.
#[tauri::command]
pub async fn list_models(agent: String) -> Result<AgentModels, String> {
    let spec = spec_for(&agent)?;
    let dir = project_dir();
    let started = tokio::time::timeout(std::time::Duration::from_secs(45), AcpClient::spawn(&spec, &dir));
    match started.await {
        Ok(Ok((client, _events))) => Ok(client.models().clone()),
        Ok(Err(AcpError::AuthRequired(_))) => Err("connexion requise : ouvre les Réglages".into()),
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err("l'agent met trop de temps à répondre".into()),
    }
}

/// Un titre court pour une conversation, écrit par l'agent à partir de la première demande.
/// Une session à part, dans un dossier neutre : rien n'apparaît dans la conversation.
#[tauri::command]
pub async fn suggest_title(agent: String, request: String) -> Result<String, String> {
    let spec = spec_for(&agent)?;
    let dir = std::env::temp_dir();
    let prompt = format!(
        "Résume cette demande en un titre de 3 à 6 mots, dans la même langue, sans guillemets ni point final. \
         Réponds uniquement par le titre, sans rien d'autre.\n\nDemande : {}",
        request.chars().take(600).collect::<String>()
    );
    let work = async {
        let (client, mut events) = AcpClient::spawn(&spec, &dir).await.map_err(|e| e.to_string())?;
        let collector = tokio::spawn(async move {
            let mut out = String::new();
            while let Some(event) = events.recv().await {
                match event {
                    kana_acp::AcpEvent::Message { text } => out.push_str(&text),
                    kana_acp::AcpEvent::Done { .. } | kana_acp::AcpEvent::Error { .. } | kana_acp::AcpEvent::Closed => break,
                    _ => {}
                }
            }
            out
        });
        client.prompt(&prompt).await.map_err(|e| e.to_string())?;
        collector.await.map_err(|e| e.to_string())
    };
    tokio::time::timeout(std::time::Duration::from_secs(90), work)
        .await
        .map_err(|_| "l'agent met trop de temps à répondre".to_string())?
}

#[tauri::command]
pub fn set_keep_awake(
    awake: tauri::State<'_, crate::state::KeepAwake>,
    active: bool,
) -> Result<bool, String> {
    awake.set(active)
}

pub(crate) fn escape_applescript(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(ch) = chars.next() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\r' => {
                if chars.peek() == Some(&'\n') {
                    chars.next();
                }
                out.push(' ');
            }
            '\n' => out.push(' '),
            _ => out.push(ch),
        }
    }
    out
}

fn notification_script(title: &str, body: &str, sound: bool) -> String {
    let title_esc = escape_applescript(title);
    let body_esc = escape_applescript(body);
    let mut script = format!("display notification \"{body_esc}\" with title \"{title_esc}\"");
    if sound {
        script.push_str(" sound name \"Glass\"");
    }
    script
}

/// Envoie une notification système macOS (avec son optionnel « Glass ») sans bloquer le thread Tauri.
#[tauri::command]
pub fn notify_user(title: String, body: String, sound: bool) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Ok(());
    }
    let script = notification_script(&title, &body, sound);
    let mut child = std::process::Command::new("osascript")
        .args(["-e", &script])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("impossible d'envoyer la notification : {e}"))?;
    // Récolte le processus enfant sans bloquer le thread de commande Tauri.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[tauri::command]
pub fn core_detect_problem(message: String, now_ms: Option<i64>) -> Option<kana_core::Problem> {
    kana_core::detect_problem(&message, now_ms.unwrap_or_else(now_millis))
}

#[tauri::command]
pub fn core_pick_relay_target(
    current: String,
    relay: kana_core::RelayConfig,
    problems: Option<Vec<String>>,
) -> Option<String> {
    let unavailable = problems.unwrap_or_default();
    kana_core::pick_target(&current, &relay, |id| unavailable.iter().any(|p| p == id))
}

#[tauri::command]
pub fn core_auto_answer(
    mode: kana_core::PermissionMode,
    title: String,
    options: Vec<kana_core::PermissionChoice>,
) -> Option<String> {
    kana_core::auto_answer(mode, &title, &options)
}

const HOOK_TIMEOUT_SECS: u64 = 15;

/// Exécute une commande de hook déterministe (PreToolUse, PostToolUse, Stop) avec un délai court.
#[tauri::command]
pub async fn run_hook_command(cwd: Option<String>, command: String) -> Result<String, String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err("commande de hook vide".into());
    }
    let dir = match cwd.as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "none") {
        Some(path) => {
            let p = std::path::PathBuf::from(path);
            if !p.is_dir() {
                return Err(format!("dossier du hook introuvable : {path}"));
            }
            p
        }
        None => project_dir(),
    };

    let mut cmd = if cfg!(target_os = "windows") {
        let mut c = tokio::process::Command::new("cmd");
        c.args(["/C", trimmed]);
        c
    } else {
        let mut c = tokio::process::Command::new("sh");
        c.args(["-c", trimmed]);
        c
    };
    cmd.current_dir(&dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let output = tokio::time::timeout(std::time::Duration::from_secs(HOOK_TIMEOUT_SECS), cmd.output())
        .await
        .map_err(|_| format!("hook expiré après {HOOK_TIMEOUT_SECS} s"))?
        .map_err(|e| format!("impossible de lancer le hook : {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_owned();
    let combined = match (stdout.is_empty(), stderr.is_empty()) {
        (true, true) => String::new(),
        (false, true) => stdout,
        (true, false) => stderr,
        (false, false) => format!("{stdout}\n{stderr}"),
    };
    if !output.status.success() {
        let code = output.status.code().unwrap_or(-1);
        return Err(if combined.is_empty() {
            format!("hook terminé avec le code {code}")
        } else {
            format!("hook terminé avec le code {code} : {combined}")
        });
    }
    Ok(combined)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exposes_core_logic_commands() {
        let now = 1_700_000_000_000;
        let problem = core_detect_problem("Rate limit exceeded in 2 minutes".into(), Some(now)).unwrap();
        assert_eq!(problem.kind, kana_core::ProblemKind::Limit);
        assert_eq!(problem.until, Some(now + 120_000));

        let target = core_pick_relay_target(
            "claude".into(),
            kana_core::RelayConfig::default(),
            Some(vec!["codex".into()]),
        );
        assert_eq!(target.as_deref(), Some("gemini"));

        let opts = vec![
            kana_core::PermissionChoice {
                id: "allow".into(),
                name: "Autoriser".into(),
                kind: "allow_once".into(),
            },
            kana_core::PermissionChoice {
                id: "deny".into(),
                name: "Refuser".into(),
                kind: "reject_once".into(),
            },
        ];
        assert_eq!(
            core_auto_answer(kana_core::PermissionMode::Auto, "ls -la".into(), opts.clone()).as_deref(),
            Some("allow")
        );
        assert_eq!(
            core_auto_answer(kana_core::PermissionMode::Auto, "rm -rf /tmp/x".into(), opts),
            None
        );
    }

    #[test]
    fn escapes_applescript_strings_and_builds_notification_script() {
        assert_eq!(
            escape_applescript("Chemin C:\\a\\\"b\"\nLigne 2\r\nLigne 3\rFin"),
            "Chemin C:\\\\a\\\\\\\"b\\\" Ligne 2 Ligne 3 Fin"
        );
        assert_eq!(
            notification_script("Mon \"fil\"", "Ligne 1\nLigne 2", true),
            "display notification \"Ligne 1 Ligne 2\" with title \"Mon \\\"fil\\\"\" sound name \"Glass\""
        );
        assert_eq!(
            notification_script("Kana", "Terminé", false),
            "display notification \"Terminé\" with title \"Kana\""
        );
    }

    #[test]
    fn runs_hook_commands_and_reports_failures() {
        tauri::async_runtime::block_on(async {
            let dir = std::env::temp_dir().to_string_lossy().into_owned();
            let out = run_hook_command(Some(dir.clone()), "echo hook-ok".into()).await.unwrap();
            assert_eq!(out, "hook-ok");

            let err = run_hook_command(Some(dir), "echo boom >&2 && exit 2".into()).await.unwrap_err();
            assert!(err.contains("boom") && err.contains("2"), "{err}");

            assert!(run_hook_command(None, "   ".into()).await.is_err());
        });
    }
}
