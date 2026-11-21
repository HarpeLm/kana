//! Serveurs MCP que Kana propose à un agent à l'ouverture de sa session.

use serde_json::{Value, json};

/// Protocole de transport d'un serveur MCP vers l'agent ACP.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum McpTransport {
    Http,
    Sse,
    Stdio,
}

/// Un serveur MCP joignable par HTTP, SSE ou stdio, avec ses en-têtes (OAuth/Bearer) ou variables d'environnement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct McpServerConfig {
    pub name: String,
    pub transport: McpTransport,
    pub url: String,
    pub headers: Vec<(String, String)>,
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
}

impl McpServerConfig {
    pub fn http(name: &str, url: &str) -> Self {
        Self {
            name: name.into(),
            transport: McpTransport::Http,
            url: url.into(),
            headers: Vec::new(),
            command: String::new(),
            args: Vec::new(),
            env: Vec::new(),
        }
    }

    pub fn sse(name: &str, url: &str) -> Self {
        Self {
            name: name.into(),
            transport: McpTransport::Sse,
            url: url.into(),
            headers: Vec::new(),
            command: String::new(),
            args: Vec::new(),
            env: Vec::new(),
        }
    }

    pub fn stdio(name: &str, command: &str, args: Vec<String>) -> Self {
        Self {
            name: name.into(),
            transport: McpTransport::Stdio,
            url: String::new(),
            headers: Vec::new(),
            command: command.into(),
            args,
            env: Vec::new(),
        }
    }

    pub fn with_header(mut self, name: &str, value: &str) -> Self {
        self.headers.push((name.into(), value.into()));
        self
    }

    pub fn with_bearer_token(self, token: &str) -> Self {
        let trimmed = token.trim();
        if trimmed.is_empty() {
            return self;
        }
        self.with_header("Authorization", &format!("Bearer {trimmed}"))
    }

    pub fn with_env(mut self, name: &str, value: &str) -> Self {
        self.env.push((name.into(), value.into()));
        self
    }

    /// Le serveur dans le format de `session/new` / `session/load`.
    pub(crate) fn to_acp(&self) -> Value {
        match self.transport {
            McpTransport::Stdio => {
                let env: Vec<Value> = self
                    .env
                    .iter()
                    .map(|(name, value)| json!({ "name": name, "value": value }))
                    .collect();
                json!({
                    "name": self.name,
                    "command": self.command,
                    "args": self.args,
                    "env": env,
                })
            }
            McpTransport::Http | McpTransport::Sse => {
                let kind = match self.transport {
                    McpTransport::Http => "http",
                    McpTransport::Sse => "sse",
                    McpTransport::Stdio => unreachable!(),
                };
                let headers: Vec<Value> = self
                    .headers
                    .iter()
                    .map(|(name, value)| json!({ "name": name, "value": value }))
                    .collect();
                json!({ "type": kind, "name": self.name, "url": self.url, "headers": headers })
            }
        }
    }
}

/// L'agent a annoncé dans `initialize` qu'il sait se connecter à un serveur MCP par HTTP.
pub(crate) fn supports_http(initialize_result: &Value) -> bool {
    initialize_result["agentCapabilities"]["mcpCapabilities"]["http"] == true
}

/// L'agent a annoncé dans `initialize` qu'il sait se connecter à un serveur MCP par SSE.
pub(crate) fn supports_sse(initialize_result: &Value) -> bool {
    initialize_result["agentCapabilities"]["mcpCapabilities"]["sse"] == true
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
    fn sse_server_with_bearer_token_is_described_for_session_new() {
        let server = McpServerConfig::sse("linear", "https://mcp.linear.app/sse")
            .with_bearer_token("oauth-tok");
        let acp = server.to_acp();
        assert_eq!(acp["type"], "sse");
        assert_eq!(acp["name"], "linear");
        assert_eq!(acp["url"], "https://mcp.linear.app/sse");
        assert_eq!(acp["headers"][0]["name"], "Authorization");
        assert_eq!(acp["headers"][0]["value"], "Bearer oauth-tok");
    }

    #[test]
    fn stdio_server_emits_command_args_and_env() {
        let server = McpServerConfig::stdio("fs", "npx", vec!["-y".into(), "@mcp/fs".into()])
            .with_env("ROOT", "/tmp/repo");
        let acp = server.to_acp();
        assert!(acp.get("type").is_none());
        assert_eq!(acp["name"], "fs");
        assert_eq!(acp["command"], "npx");
        assert_eq!(acp["args"], json!(["-y", "@mcp/fs"]));
        assert_eq!(acp["env"], json!([{ "name": "ROOT", "value": "/tmp/repo" }]));
    }

    #[test]
    fn reads_the_http_and_sse_capabilities() {
        let http_yes = json!({ "agentCapabilities": { "mcpCapabilities": { "http": true } } });
        let sse_only = json!({ "agentCapabilities": { "mcpCapabilities": { "http": false, "sse": true } } });
        assert!(supports_http(&http_yes));
        assert!(!supports_sse(&http_yes));
        assert!(!supports_http(&sse_only));
        assert!(supports_sse(&sse_only));
        assert!(!supports_http(&json!({})));
        assert!(!supports_sse(&json!({})));
    }
}
