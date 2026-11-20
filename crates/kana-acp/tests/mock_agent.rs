//! Tests de bout en bout avec un faux agent écrit en shell.
//! Les identifiants JSON-RPC du client sont déterministes : 1 = initialize, 2 = session/new, 3 = prompt.

use kana_acp::{AcpClient, AcpEvent, AgentSpec};
use tokio::sync::mpsc::UnboundedReceiver;

fn shell_agent(script: &str) -> AgentSpec {
    AgentSpec { command: "sh".into(), args: vec!["-c".into(), script.into()] }
}

const HANDSHAKE: &str = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'
read line; echo '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"s1"}}'
read line
"#;

async fn next(events: &mut UnboundedReceiver<AcpEvent>) -> AcpEvent {
    tokio::time::timeout(std::time::Duration::from_secs(5), events.recv())
        .await
        .expect("délai dépassé")
        .expect("flux fermé")
}

#[tokio::test]
async fn prompt_streams_message_then_done() {
    let script = format!(
        r#"{HANDSHAKE}
echo '{{"jsonrpc":"2.0","method":"session/update","params":{{"sessionId":"s1","update":{{"sessionUpdate":"agent_message_chunk","content":{{"type":"text","text":"Salut"}}}}}}}}'
echo '{{"jsonrpc":"2.0","id":3,"result":{{"stopReason":"end_turn"}}}}'
"#
    );
    let (client, mut events) = AcpClient::spawn(&shell_agent(&script), &std::env::temp_dir())
        .await
        .unwrap();
    assert_eq!(client.session_id(), "s1");

    client.prompt("bonjour").await.unwrap();

    assert_eq!(next(&mut events).await, AcpEvent::Message { text: "Salut".into() });
    assert_eq!(next(&mut events).await, AcpEvent::Done { stop_reason: "end_turn".into() });
}

#[tokio::test]
async fn permission_request_waits_for_the_user() {
    // L'agent ne termine son tour qu'après avoir reçu la réponse à sa demande.
    let script = format!(
        r#"{HANDSHAKE}
echo '{{"jsonrpc":"2.0","id":99,"method":"session/request_permission","params":{{"sessionId":"s1","toolCall":{{"title":"Écrire main.rs"}},"options":[{{"optionId":"allow","name":"Autoriser","kind":"allow_once"}}]}}}}'
read answer
case "$answer" in *'"optionId":"allow"'*) reason=end_turn;; *) reason=refusal;; esac
echo '{{"jsonrpc":"2.0","id":3,"result":{{"stopReason":"'$reason'"}}}}'
"#
    );
    let (client, mut events) = AcpClient::spawn(&shell_agent(&script), &std::env::temp_dir())
        .await
        .unwrap();
    let client = std::sync::Arc::new(client);
    let running = tokio::spawn({
        let client = client.clone();
        async move { client.prompt("écris").await }
    });

    let AcpEvent::Permission { request_id, title, .. } = next(&mut events).await else {
        panic!("attendu : Permission");
    };
    assert_eq!(title, "Écrire main.rs");
    assert!(client.resolve_permission(&request_id, Some("allow".into())).await);

    assert_eq!(running.await.unwrap().unwrap(), "end_turn");
}

#[tokio::test]
async fn agent_exit_is_reported() {
    let (client, mut events) = AcpClient::spawn(
        &shell_agent(&format!("{HANDSHAKE}\nexit 0")),
        &std::env::temp_dir(),
    )
    .await
    .unwrap();

    assert!(client.prompt("bonjour").await.is_err());
    // L'erreur du tour et la fermeture arrivent dans un ordre indéterminé.
    let first = next(&mut events).await;
    let second = next(&mut events).await;
    let has_error = [&first, &second].iter().any(|e| matches!(e, AcpEvent::Error { .. }));
    let has_closed = [&first, &second].contains(&&AcpEvent::Closed);
    assert!(has_error && has_closed, "{first:?} / {second:?}");
}

#[tokio::test]
async fn missing_binary_gives_a_spawn_error() {
    let spec = AgentSpec { command: "kana-agent-inexistant".into(), args: vec![] };
    let result = AcpClient::spawn(&spec, &std::env::temp_dir()).await;
    assert!(matches!(result, Err(kana_acp::AcpError::Spawn(_))));
}
