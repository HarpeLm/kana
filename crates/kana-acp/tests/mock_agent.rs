//! Tests de bout en bout avec un faux agent écrit en shell.
//! Les identifiants JSON-RPC du client sont déterministes : 1 = initialize, 2 = session/new, 3 = prompt.

use kana_acp::{AcpClient, AcpEvent, AgentSpec, McpServerConfig};
use tokio::sync::mpsc::UnboundedReceiver;

fn shell_agent(script: &str) -> AgentSpec {
    AgentSpec::new("sh", &["-c", script])
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
# L'agent reste en vie tant que le client est là : sinon sa sortie (Closed) peut devancer la fin du tour (Done).
cat > /dev/null
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
    let spec = AgentSpec::new("kana-agent-inexistant", &[]);
    let result = AcpClient::spawn(&spec, &std::env::temp_dir()).await;
    assert!(matches!(result, Err(kana_acp::AcpError::Spawn(_))));
}

const NOT_LOGGED_IN: &str = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"authMethods":[{"id":"chatgpt","name":"ChatGPT","description":"Compte ChatGPT"}]}}'
read line; echo '{"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"Authentication required"}}'
"#;

#[tokio::test]
async fn unauthenticated_agent_lists_its_login_methods() {
    let result = AcpClient::spawn(&shell_agent(NOT_LOGGED_IN), &std::env::temp_dir()).await;
    let Err(kana_acp::AcpError::AuthRequired(methods)) = result else {
        panic!("attendu : AuthRequired");
    };
    assert_eq!(methods.len(), 1);
    assert_eq!(methods[0].id, "chatgpt");
}

#[tokio::test]
async fn authenticate_runs_before_the_session_is_created() {
    // initialize = 1, authenticate = 2, session/new = 3.
    let script = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'
read line
case "$line" in *'"methodId":"chatgpt"'*) echo '{"jsonrpc":"2.0","id":2,"result":{}}';; esac
read line; echo '{"jsonrpc":"2.0","id":3,"result":{"sessionId":"apres-login"}}'
"#;
    let (client, _events) =
        AcpClient::spawn_authenticated(&shell_agent(script), &std::env::temp_dir(), "chatgpt")
            .await
            .unwrap();
    assert_eq!(client.session_id(), "apres-login");
}

#[tokio::test]
async fn env_variables_reach_the_agent() {
    let script = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'
read line; echo '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"'$KANA_TEST_KEY'"}}'
"#;
    let spec = shell_agent(script).with_env("KANA_TEST_KEY", "secret-123");
    let (client, _events) = AcpClient::spawn(&spec, &std::env::temp_dir()).await.unwrap();
    assert_eq!(client.session_id(), "secret-123");
}

/// L'agent annonce (ou non) le support HTTP, puis répond avec un identifiant de session qui dit
/// s'il a reçu le serveur MCP dans `session/new`.
fn mcp_probe_script(http: bool) -> String {
    format!(
        r#"
read line; echo '{{"jsonrpc":"2.0","id":1,"result":{{"protocolVersion":1,"agentCapabilities":{{"mcpCapabilities":{{"http":{http}}}}}}}}}'
read line
# serde_json trie les clés : « headers » (donc le jeton) peut précéder « name ».
case "$line" in *kana-browser*Bearer*|*Bearer*kana-browser*) sid=avec-mcp;; *) sid=sans-mcp;; esac
echo '{{"jsonrpc":"2.0","id":2,"result":{{"sessionId":"'$sid'"}}}}'
"#
    )
}

fn browser_server() -> Vec<McpServerConfig> {
    vec![McpServerConfig::http("kana-browser", "http://127.0.0.1:9/mcp").with_header("Authorization", "Bearer jeton")]
}

#[tokio::test]
async fn mcp_server_is_offered_to_an_agent_that_supports_http() {
    let (client, _events) = AcpClient::spawn_with_mcp(
        &shell_agent(&mcp_probe_script(true)),
        &std::env::temp_dir(),
        &browser_server(),
    )
    .await
    .unwrap();
    assert_eq!(client.session_id(), "avec-mcp");
}

#[tokio::test]
async fn mcp_server_is_not_sent_to_an_agent_without_http_support() {
    let (client, _events) = AcpClient::spawn_with_mcp(
        &shell_agent(&mcp_probe_script(false)),
        &std::env::temp_dir(),
        &browser_server(),
    )
    .await
    .unwrap();
    assert_eq!(client.session_id(), "sans-mcp");
}

#[tokio::test]
async fn resumes_session_with_load_and_suppresses_replayed_history() {
    // initialize = 1, session/load = 2, session/prompt = 3.
    let script = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true}}}'
read line
case "$line" in *'"method":"session/load"'*'"sessionId":"old-s1"'*|*'"sessionId":"old-s1"'*'"method":"session/load"'*)
  echo '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"old-s1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Ancien"}}}}'
  echo '{"jsonrpc":"2.0","id":2,"result":{}}'
  ;;
esac
read line
echo '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"old-s1","update":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"Nouveau"}}}}'
echo '{"jsonrpc":"2.0","id":3,"result":{"stopReason":"end_turn"}}'
cat > /dev/null
"#;
    let (client, mut events) = AcpClient::spawn_or_resume(
        &shell_agent(script),
        &std::env::temp_dir(),
        &[],
        Some("old-s1"),
    )
    .await
    .unwrap();
    assert!(client.resumed());
    assert_eq!(client.session_id(), "old-s1");

    client.prompt("suite").await.unwrap();

    assert_eq!(next(&mut events).await, AcpEvent::Message { text: "Nouveau".into() });
    assert_eq!(next(&mut events).await, AcpEvent::Done { stop_reason: "end_turn".into() });
}

#[tokio::test]
async fn falls_back_to_session_new_when_load_session_fails() {
    // initialize = 1, session/load = 2 (échec), session/new = 3.
    let script = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1,"agentCapabilities":{"loadSession":true}}}'
read line; echo '{"jsonrpc":"2.0","id":2,"error":{"code":-32002,"message":"Session not found"}}'
read line
case "$line" in *'"method":"session/new"'*) echo '{"jsonrpc":"2.0","id":3,"result":{"sessionId":"neuve"}}';; esac
"#;
    let (client, _events) = AcpClient::spawn_or_resume(
        &shell_agent(script),
        &std::env::temp_dir(),
        &[],
        Some("old-s1"),
    )
    .await
    .unwrap();
    assert!(!client.resumed());
    assert_eq!(client.session_id(), "neuve");
}

#[tokio::test]
async fn skips_session_load_when_capability_is_absent() {
    // Sans loadSession, l'agent reçoit directement session/new sur id=2.
    let script = r#"
read line; echo '{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}'
read line
case "$line" in *'"method":"session/new"'*) echo '{"jsonrpc":"2.0","id":2,"result":{"sessionId":"neuve"}}';; esac
"#;
    let (client, _events) = AcpClient::spawn_or_resume(
        &shell_agent(script),
        &std::env::temp_dir(),
        &[],
        Some("old-s1"),
    )
    .await
    .unwrap();
    assert!(!client.resumed());
    assert_eq!(client.session_id(), "neuve");
}
