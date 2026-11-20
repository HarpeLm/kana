//! Lecture de la sortie de l'agent : réponses, notifications et requêtes de l'agent.

use std::sync::Arc;

use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, BufReader},
    process::ChildStdout,
    sync::oneshot,
};

use crate::{client::Shared, error::AcpError, event::AcpEvent, protocol};

pub(crate) async fn read_loop(stdout: ChildStdout, shared: Arc<Shared>) {
    let mut lines = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = lines.next_line().await {
        match serde_json::from_str::<Value>(&line) {
            Ok(message) => dispatch(&shared, message).await,
            Err(_) => tracing::debug!("ligne non JSON ignorée : {line}"),
        }
    }
    let waiting: Vec<_> = shared.pending.lock().await.drain().collect();
    for (_, sender) in waiting {
        let _ = sender.send(Err(AcpError::Closed));
    }
    let _ = shared.events.send(AcpEvent::Closed);
}

async fn dispatch(shared: &Arc<Shared>, message: Value) {
    let id = message.get("id").filter(|v| !v.is_null()).cloned();
    let method = message.get("method").and_then(Value::as_str).map(str::to_owned);
    match (id, method) {
        (Some(id), Some(method)) => on_agent_request(shared, id, &method, &message["params"]).await,
        (Some(id), None) => on_response(shared, &id, &message).await,
        (None, Some(method)) => on_notification(shared, &method, &message["params"]),
        (None, None) => {}
    }
}

async fn on_response(shared: &Shared, id: &Value, message: &Value) {
    let Some(id) = id.as_u64() else { return };
    let Some(sender) = shared.pending.lock().await.remove(&id) else { return };
    let reply = match message.get("error") {
        Some(error) => Err(AcpError::Rpc {
            code: error["code"].as_i64().unwrap_or(-1),
            message: error["message"].as_str().unwrap_or("erreur inconnue").to_owned(),
        }),
        None => Ok(message["result"].clone()),
    };
    let _ = sender.send(reply);
}

fn on_notification(shared: &Shared, method: &str, params: &Value) {
    if method == "session/update"
        && let Some(event) = AcpEvent::from_update(&params["update"])
    {
        let _ = shared.events.send(event);
    }
}

async fn on_agent_request(shared: &Arc<Shared>, id: Value, method: &str, params: &Value) {
    if method != "session/request_permission" {
        let reply = protocol::error_response(&id, -32601, "méthode non prise en charge");
        let _ = shared.send(&reply).await;
        return;
    }

    // L'utilisateur peut mettre longtemps à répondre : on n'attend pas dans la boucle de lecture.
    let key = id.to_string();
    let (sender, receiver) = oneshot::channel();
    shared.permissions.lock().await.insert(key.clone(), sender);
    let _ = shared.events.send(AcpEvent::from_permission_request(key, params));

    let shared = shared.clone();
    tokio::spawn(async move {
        let outcome = match receiver.await {
            Ok(Some(option_id)) => json!({ "outcome": "selected", "optionId": option_id }),
            _ => json!({ "outcome": "cancelled" }),
        };
        let _ = shared.send(&protocol::response(&id, json!({ "outcome": outcome }))).await;
    });
}
