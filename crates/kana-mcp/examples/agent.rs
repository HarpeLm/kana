//! Essai de bout en bout, sans interface : un vrai agent utilise les outils du serveur MCP, avec une
//! page simulée à la place du navigateur.
//! Usage : [KANA_CWD=dossier] cargo run -p kana-mcp --example agent -- opencode "Va sur example.com et donne le titre"

use std::{sync::Arc, time::Duration};

use kana_acp::{AcpClient, AcpEvent, McpServerConfig, preset};
use kana_mcp::{McpServer, ToolDriver};
use serde_json::Value;

struct FakeBrowser;

impl ToolDriver for FakeBrowser {
    fn note(&self, event: &str) {
        eprintln!("[mcp] {event}");
    }

    fn call(&self, name: &str, arguments: &Value) -> Result<String, String> {
        eprintln!("[outil] {name} {arguments}");
        Ok(match name {
            "browser_navigate" => "Navigated. Page: Example Domain (https://example.com/)".into(),
            "browser_snapshot" => "Page: Example Domain\nURL: https://example.com/\n\n# Example Domain\nThis domain is for use in illustrative examples in documents.\n[e1] link \"More information...\" -> https://www.iana.org/domains/example\n[scroll 0/0px]".into(),
            _ => "ok".into(),
        })
    }
}

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let agent = args.next().unwrap_or_else(|| "opencode".into());
    let prompt = args.next().unwrap_or_else(|| "Va sur example.com puis donne-moi le titre de la page.".into());

    let server = McpServer::start(Arc::new(FakeBrowser), "test".into()).expect("serveur MCP");
    eprintln!("[serveur] {}", server.url());
    let config = McpServerConfig::http("kana-browser", &server.url()).with_header("Authorization", "Bearer test");

    let spec = preset(&agent).unwrap_or_else(|| panic!("agent inconnu : {agent}"));
    // KANA_CWD permet d'essayer un autre dossier de travail (un très gros dossier ralentit certains agents).
    let cwd = std::env::var_os("KANA_CWD").map(std::path::PathBuf::from).unwrap_or_else(std::env::temp_dir);
    let (client, mut events) = AcpClient::spawn_with_mcp(&spec, &cwd, &[config]).await.expect("agent");
    let client = Arc::new(client);
    tokio::spawn({
        let client = client.clone();
        async move {
            let _ = client.prompt(&prompt).await;
        }
    });

    let started = std::time::Instant::now();
    loop {
        match tokio::time::timeout(Duration::from_secs(120), events.recv()).await {
            Err(_) => return eprintln!("[délai dépassé après 120 s sans événement]"),
            Ok(None) => return,
            Ok(Some(event)) => {
                let t = started.elapsed().as_secs_f32();
                match event {
                    AcpEvent::Message { text } => print!("{text}"),
                    AcpEvent::Thought { .. } => eprintln!("[{t:.1}s réflexion]"),
                    AcpEvent::ToolCall { id, title, status, raw_input, output } => eprintln!("[{t:.1}s outil {id} {title:?} {status:?} {raw_input:?} -> {output:?}]"),
                    AcpEvent::Permission { request_id, title, options } => {
                        eprintln!("[{t:.1}s autorisation demandée : {title}]");
                        let allow = options.iter().find(|o| o.kind.starts_with("allow")).map(|o| o.id.clone());
                        client.resolve_permission(&request_id, allow).await;
                    }
                    AcpEvent::Done { stop_reason } => return println!("\n[{t:.1}s fin : {stop_reason}]"),
                    AcpEvent::Error { message } => return eprintln!("[erreur] {message}"),
                    AcpEvent::Plan { entries } => eprintln!("[{t:.1}s plan : {} étapes]", entries.len()),
                    AcpEvent::AvailableCommands { commands } => eprintln!("[{t:.1}s commandes : {}]", commands.len()),
                    AcpEvent::TurnUsage { total_tokens, .. } => eprintln!("[{t:.1}s jetons du tour : {total_tokens}]"),
                    AcpEvent::Context { used, size } => eprintln!("[{t:.1}s contexte : {used}/{size}]"),
                    AcpEvent::Closed => return,
                }
            }
        }
    }
}
