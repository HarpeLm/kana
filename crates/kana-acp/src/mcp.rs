//! Serveurs MCP que Kana propose à un agent à l'ouverture de sa session.

use serde_json::{Value, json};

/// Un serveur MCP joignable par HTTP, avec ses en-têtes (le jeton, par exemple).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpServerConfig {
    pub name: String,
    pub url: String,
    pub headers: Vec<(String, String)>,
}

impl McpServerConfig {
    pub fn http(name: &str, url: &str) -> Self {
        Self { name: name.into(), url: url.into(), headers: Vec::new() }
    }

    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }

    /// Le serveur dans le format de `session/new`.
    pub(crate) fn to_acp(&self) -> Value {
        let headers: Vec<Value> = self
            .headers
            .iter()
            .map(|(name, value)| json!({ "name": name, "value": value }))
            .collect();
        json!({ "type": "http", "name": self.name, "url": self.url, "headers": headers })
    }
}

/// L'agent annoncé dans `initialize` qu'il sait se connecter à un serveur MCP par HTTP.
pub(crate) fn supports_http(initialize_result: &Value) -> bool {
    initialize_result["agentCapabilities"]["mcpCapabilities"]["http"] == true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn http_server_is_described_for_session_new() {
        let server = McpServerConfig::http("kana-browser", "http://127.0.0.1:1/mcp")
            .with_header("Authorization", "Bearer abc");
        let acp = server.to_acp();
        assert_eq!(acp["type"], "http");
        assert_eq!(acp["name"], "kana-browser");
        assert_eq!(acp["url"], "http://127.0.0.1:1/mcp");
        assert_eq!(acp["headers"][0]["name"], "Authorization");
        assert_eq!(acp["headers"][0]["value"], "Bearer abc");
    }

    #[test]
    fn reads_the_http_capability() {
        let yes = json!({ "agentCapabilities": { "mcpCapabilities": { "http": true } } });
        let no = json!({ "agentCapabilities": { "mcpCapabilities": { "http": false, "sse": true } } });
        assert!(supports_http(&yes));
        assert!(!supports_http(&no));
        assert!(!supports_http(&json!({})));
    }
}
