//! Messages JSON-RPC 2.0 du protocole Agent Client Protocol (une ligne JSON par message).

use std::path::Path;

use serde_json::{Value, json};

pub const PROTOCOL_VERSION: u64 = 1;

pub fn request(id: u64, method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
}

pub fn notification(method: &str, params: Value) -> Value {
    json!({ "jsonrpc": "2.0", "method": method, "params": params })
}

pub fn response(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn error_response(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// Kana ne propose ni lecture/écriture de fichiers ni terminal à l'agent pour l'instant.
pub fn initialize_params() -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "clientCapabilities": {
            "fs": { "readTextFile": false, "writeTextFile": false },
            "terminal": false
        },
        "clientInfo": { "name": "kana", "title": "Kana", "version": env!("CARGO_PKG_VERSION") }
    })
}

/// `mcp_servers` : les serveurs MCP déjà au format ACP, que l'agent branchera à sa session.
pub fn new_session_params(cwd: &Path, mcp_servers: Vec<Value>) -> Value {
    json!({ "cwd": cwd.to_string_lossy(), "mcpServers": mcp_servers })
}

pub fn prompt_params(session_id: &str, text: &str) -> Value {
    json!({ "sessionId": session_id, "prompt": [{ "type": "text", "text": text }] })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_has_jsonrpc_envelope() {
        let msg = request(7, "session/new", json!({}));
        assert_eq!(msg["jsonrpc"], "2.0");
        assert_eq!(msg["id"], 7);
        assert_eq!(msg["method"], "session/new");
    }

    #[test]
    fn prompt_wraps_text_in_a_content_block() {
        let params = prompt_params("s1", "salut");
        assert_eq!(params["sessionId"], "s1");
        assert_eq!(params["prompt"][0]["type"], "text");
        assert_eq!(params["prompt"][0]["text"], "salut");
    }

    #[test]
    fn new_session_carries_the_mcp_servers() {
        let params = new_session_params(Path::new("/tmp"), vec![json!({ "name": "x" })]);
        assert_eq!(params["cwd"], "/tmp");
        assert_eq!(params["mcpServers"][0]["name"], "x");
        assert!(new_session_params(Path::new("/tmp"), vec![])["mcpServers"].as_array().unwrap().is_empty());
    }

    #[test]
    fn notification_has_no_id() {
        assert!(notification("session/cancel", json!({})).get("id").is_none());
    }
}
