//! Le protocole MCP (JSON-RPC 2.0) : initialisation, liste des outils et appel d'un outil.

use serde_json::{Value, json};

use crate::tools::{ToolDriver, is_known_tool, tool_definitions};

const SERVER_NAME: &str = "kana-browser";
const FALLBACK_PROTOCOL: &str = "2025-06-18";

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn initialize_result(params: &Value) -> Value {
    // On répond avec la version demandée par le client : le protocole qu'on parle n'y change rien.
    let version = params["protocolVersion"].as_str().unwrap_or(FALLBACK_PROTOCOL);
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": SERVER_NAME, "version": env!("CARGO_PKG_VERSION") },
        "instructions": "Tools to browse the web in the Kana app's browser pane. Start with browser_navigate, then browser_snapshot to read the page and get element references."
    })
}

fn call_tool(params: &Value, driver: &dyn ToolDriver) -> Result<Value, (i64, String)> {
    let name = params["name"].as_str().unwrap_or_default();
    if !is_known_tool(name) {
        return Err((-32602, format!("outil inconnu : {name}")));
    }
    let arguments = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
    let (text, is_error) = match driver.call(name, &arguments) {
        Ok(text) => (text, false),
        Err(message) => (message, true),
    };
    Ok(json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }))
}

/// Traite un message JSON-RPC. `None` pour une notification : elle n'appelle aucune réponse.
pub fn handle(body: &str, driver: &dyn ToolDriver) -> Option<String> {
    let Ok(request) = serde_json::from_str::<Value>(body) else {
        return Some(error(Value::Null, -32700, "JSON invalide").to_string());
    };
    let id = request.get("id").filter(|id| !id.is_null())?.clone();
    let params = request.get("params").cloned().unwrap_or(Value::Null);
    let method = request["method"].as_str().unwrap_or_default();
    driver.note(&match params["name"].as_str() {
        Some(tool) if method == "tools/call" => format!("requête {method} {tool}"),
        _ => format!("requête {method}"),
    });

    let result = match method {
        "initialize" => Ok(initialize_result(&params)),
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tool_definitions() })),
        "tools/call" => call_tool(&params, driver),
        other => Err((-32601, format!("méthode inconnue : {other}"))),
    };
    Some(
        match result {
            Ok(result) => json!({ "jsonrpc": "2.0", "id": id, "result": result }),
            Err((code, message)) => error(id, code, &message),
        }
        .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fake;
    impl ToolDriver for Fake {
        fn call(&self, name: &str, arguments: &Value) -> Result<String, String> {
            match name {
                "browser_snapshot" => Ok("page".into()),
                "browser_click" => Err(format!("refusé : {}", arguments["ref"])),
                _ => Ok("ok".into()),
            }
        }
    }

    fn reply(body: &str) -> Value {
        serde_json::from_str(&handle(body, &Fake).expect("une réponse")).unwrap()
    }

    #[test]
    fn initialize_echoes_the_client_version() {
        let r = reply(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}"#);
        assert_eq!(r["id"], 1);
        assert_eq!(r["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(r["result"]["serverInfo"]["name"], "kana-browser");
        assert!(r["result"]["capabilities"]["tools"].is_object());
    }

    #[test]
    fn lists_the_browser_tools() {
        let r = reply(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#);
        let names: Vec<_> = r["result"]["tools"].as_array().unwrap().iter().map(|t| t["name"].as_str().unwrap()).collect();
        for expected in ["browser_navigate", "browser_snapshot", "browser_click", "browser_type"] {
            assert!(names.contains(&expected), "{expected}");
        }
        assert!(r["result"]["tools"][0]["inputSchema"]["type"] == "object");
    }

    #[test]
    fn tool_success_and_failure_are_reported_in_the_result() {
        let ok = reply(r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"browser_snapshot"}}"#);
        assert_eq!(ok["result"]["isError"], false);
        assert_eq!(ok["result"]["content"][0]["text"], "page");

        let failed = reply(r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"browser_click","arguments":{"ref":"e1"}}}"#);
        assert_eq!(failed["result"]["isError"], true);
        assert!(failed["result"]["content"][0]["text"].as_str().unwrap().contains("e1"));
    }

    #[test]
    fn unknown_tool_and_method_are_protocol_errors() {
        let tool = reply(r#"{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"rm_rf"}}"#);
        assert_eq!(tool["error"]["code"], -32602);
        let method = reply(r#"{"jsonrpc":"2.0","id":6,"method":"nope"}"#);
        assert_eq!(method["error"]["code"], -32601);
    }

    #[test]
    fn notifications_get_no_reply() {
        assert!(handle(r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#, &Fake).is_none());
    }

    #[test]
    fn invalid_json_is_a_parse_error() {
        let r: Value = serde_json::from_str(&handle("{pas du json", &Fake).unwrap()).unwrap();
        assert_eq!(r["error"]["code"], -32700);
    }
}
