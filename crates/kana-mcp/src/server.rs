//! Serveur HTTP local qui parle MCP. Il n'écoute que sur 127.0.0.1, exige un jeton et refuse
//! les requêtes venant d'une page web (protection contre un site qui viserait ce port).

use std::{
    io::{self, Read},
    sync::Arc,
    thread,
};

use tiny_http::{Header, Method, Request, Response, Server, StatusCode};

use crate::{rpc::handle, tools::ToolDriver};

const MAX_BODY_BYTES: u64 = 1024 * 1024;

pub struct McpServer {
    port: u16,
}

impl McpServer {
    /// Démarre le serveur sur un port libre. `token` doit accompagner chaque requête
    /// (`Authorization: Bearer <token>`).
    pub fn start(driver: Arc<dyn ToolDriver>, token: String) -> io::Result<Self> {
        let server = Server::http("127.0.0.1:0").map_err(io::Error::other)?;
        let port = server
            .server_addr()
            .to_ip()
            .map(|addr| addr.port())
            .ok_or_else(|| io::Error::other("adresse du serveur inconnue"))?;

        thread::spawn(move || {
            for request in server.incoming_requests() {
                let (driver, token) = (driver.clone(), token.clone());
                // Un appel d'outil peut durer (accord de l'utilisateur) : un fil par requête.
                thread::spawn(move || respond(request, driver.as_ref(), &token));
            }
        });
        Ok(Self { port })
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Adresse à donner aux agents.
    pub fn url(&self) -> String {
        format!("http://127.0.0.1:{}/mcp", self.port)
    }
}

fn header(request: &Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_owned())
}

fn is_local_origin(origin: &str) -> bool {
    let host = origin.split("://").nth(1).unwrap_or(origin);
    let host = host.split(['/', ':']).next().unwrap_or("");
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

fn status(request: Request, code: u16) {
    let _ = request.respond(Response::empty(StatusCode(code)));
}

fn respond(mut request: Request, driver: &dyn ToolDriver, token: &str) {
    // Un navigateur qui appellerait ce port depuis une page web envoie un en-tête Origin.
    if header(&request, "Origin").is_some_and(|origin| !is_local_origin(&origin)) {
        return status(request, 403);
    }
    if header(&request, "Authorization").as_deref() != Some(&format!("Bearer {token}")) {
        return status(request, 401);
    }
    if request.url().split('?').next() != Some("/mcp") {
        return status(request, 404);
    }
    if *request.method() != Method::Post {
        return status(request, 405);
    }

    let mut body = String::new();
    if request.as_reader().take(MAX_BODY_BYTES).read_to_string(&mut body).is_err() {
        return status(request, 400);
    }
    match handle(&body, driver) {
        Some(json) => {
            let content_type = Header::from_bytes("Content-Type", "application/json").expect("en-tête valide");
            let _ = request.respond(Response::from_string(json).with_header(content_type));
        }
        None => status(request, 202),
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpStream,
    };

    use serde_json::{Value, json};

    use super::*;

    struct Echo;
    impl ToolDriver for Echo {
        fn call(&self, name: &str, _: &Value) -> Result<String, String> {
            Ok(format!("appelé : {name}"))
        }
    }

    fn request(port: u16, method: &str, path: &str, headers: &[(&str, &str)], body: &str) -> (u16, String) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
        let mut text = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\nContent-Length: {}\r\n", body.len());
        for (name, value) in headers {
            text.push_str(&format!("{name}: {value}\r\n"));
        }
        text.push_str("\r\n");
        text.push_str(body);
        stream.write_all(text.as_bytes()).unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).unwrap();
        let code = response.split_whitespace().nth(1).unwrap().parse().unwrap();
        let body = response.split("\r\n\r\n").nth(1).unwrap_or("").to_owned();
        (code, body)
    }

    fn server() -> McpServer {
        McpServer::start(Arc::new(Echo), "secret".into()).unwrap()
    }

    const CALL: &str = r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"browser_snapshot"}}"#;
    const AUTH: (&str, &str) = ("Authorization", "Bearer secret");

    #[test]
    fn answers_an_authenticated_tool_call() {
        let s = server();
        let (code, body) = request(s.port(), "POST", "/mcp", &[AUTH], CALL);
        assert_eq!(code, 200);
        let reply: Value = serde_json::from_str(&body).unwrap();
        assert_eq!(reply["result"]["content"][0]["text"], json!("appelé : browser_snapshot"));
    }

    #[test]
    fn refuses_a_missing_or_wrong_token() {
        let s = server();
        assert_eq!(request(s.port(), "POST", "/mcp", &[], CALL).0, 401);
        assert_eq!(request(s.port(), "POST", "/mcp", &[("Authorization", "Bearer faux")], CALL).0, 401);
    }

    #[test]
    fn refuses_requests_coming_from_a_web_page() {
        let s = server();
        let (code, _) = request(s.port(), "POST", "/mcp", &[AUTH, ("Origin", "https://evil.example")], CALL);
        assert_eq!(code, 403);
        let (code, _) = request(s.port(), "POST", "/mcp", &[AUTH, ("Origin", "http://localhost:3000")], CALL);
        assert_eq!(code, 200);
    }

    #[test]
    fn only_posts_to_mcp_are_served() {
        let s = server();
        assert_eq!(request(s.port(), "GET", "/mcp", &[AUTH], "").0, 405);
        assert_eq!(request(s.port(), "POST", "/autre", &[AUTH], CALL).0, 404);
    }

    #[test]
    fn notifications_are_accepted_without_a_body() {
        let s = server();
        let (code, body) = request(s.port(), "POST", "/mcp", &[AUTH], r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#);
        assert_eq!(code, 202);
        assert!(body.is_empty());
    }

    #[test]
    fn local_origins_are_recognised() {
        assert!(is_local_origin("http://localhost:1420"));
        assert!(is_local_origin("http://127.0.0.1"));
        assert!(!is_local_origin("https://example.com"));
        assert!(!is_local_origin("https://localhost.evil.com"));
    }
}
