//! Dialogue en ligne de commande avec un vrai agent ACP.
//! Usage : cargo run -p kana-acp --example chat -- opencode "Dis bonjour en une phrase"

use kana_acp::{AcpClient, AcpEvent, preset};

#[tokio::main]
async fn main() {
    let mut args = std::env::args().skip(1);
    let agent = args.next().unwrap_or_else(|| "opencode".into());
    let text = args.next().unwrap_or_else(|| "Dis bonjour en une phrase".into());

    let spec = preset(&agent).unwrap_or_else(|| panic!("agent inconnu : {agent}"));
    let cwd = std::env::current_dir().unwrap();
    let (client, mut events) = AcpClient::spawn(&spec, &cwd).await.expect("démarrage de l'agent");
    eprintln!("session {}", client.session_id());

    let client = std::sync::Arc::new(client);
    tokio::spawn({
        let client = client.clone();
        async move {
            let _ = client.prompt(&text).await;
        }
    });

    while let Some(event) = events.recv().await {
        match event {
            AcpEvent::Message { text } => print!("{text}"),
            AcpEvent::Thought { text } => eprint!("\x1b[2m{text}\x1b[0m"),
            AcpEvent::Permission { request_id, title, options } => {
                eprintln!("\n[autorisation] {title}");
                let choice = options.iter().find(|o| o.kind.starts_with("allow")).map(|o| o.id.clone());
                client.resolve_permission(&request_id, choice).await;
            }
            AcpEvent::Done { stop_reason } => {
                println!("\n[fin : {stop_reason}]");
                break;
            }
            AcpEvent::Error { message } => {
                eprintln!("\n[erreur] {message}");
                break;
            }
            AcpEvent::Closed => break,
            AcpEvent::ToolCall { .. }
            | AcpEvent::Plan { .. }
            | AcpEvent::AvailableCommands { .. }
            | AcpEvent::TurnUsage { .. }
            | AcpEvent::Context { .. } => {}
        }
    }
}
