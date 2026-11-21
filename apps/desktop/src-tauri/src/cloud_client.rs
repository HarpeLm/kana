//! Client HTTP/HTTPS et commandes Tauri pour communiquer avec un serveur Kana Cloud distant.

use std::time::Duration;

use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

use crate::cloud_server::{CloudHealth, CloudJob};

fn normalize_base_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim().trim_end_matches('/');
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("l'URL Kana Cloud doit commencer par http:// ou https://".into());
    }
    Ok(trimmed.to_string())
}

pub(crate) async fn http_request_plain(
    full_url: &str,
    method: &str,
    token: Option<&str>,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let without_scheme = full_url
        .strip_prefix("http://")
        .ok_or_else(|| "URL http:// invalide".to_string())?;
    let (authority, path) = match without_scheme.split_once('/') {
        Some((host_port, rest)) => (host_port, format!("/{rest}")),
        None => (without_scheme, "/".to_string()),
    };
    let addr = if authority.contains(':') {
        authority.to_string()
    } else {
        format!("{authority}:80")
    };

    let mut stream = tokio::time::timeout(Duration::from_secs(8), TcpStream::connect(&addr))
        .await
        .map_err(|_| format!("délai de connexion dépassé vers {addr}"))?
        .map_err(|e| format!("impossible de joindre {addr} : {e}"))?;

    let body_bytes = body.unwrap_or("").as_bytes();
    let mut req = format!(
        "{method} {path} HTTP/1.1\r\nHost: {authority}\r\nAccept: application/json\r\nConnection: close\r\n"
    );
    if let Some(t) = token.map(str::trim).filter(|t| !t.is_empty()) {
        req.push_str(&format!("Authorization: Bearer {t}\r\n"));
    }
    if body.is_some() {
        req.push_str("Content-Type: application/json\r\n");
        req.push_str(&format!("Content-Length: {}\r\n", body_bytes.len()));
    }
    req.push_str("\r\n");

    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| format!("erreur d'envoi HTTP : {e}"))?;
    if !body_bytes.is_empty() {
        stream
            .write_all(body_bytes)
            .await
            .map_err(|e| format!("erreur d'envoi du corps HTTP : {e}"))?;
    }

    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(8), stream.read_to_end(&mut raw))
        .await
        .map_err(|_| "délai de réponse HTTP dépassé".to_string())?
        .map_err(|e| format!("erreur de lecture HTTP : {e}"))?;

    let split = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or_else(|| "réponse HTTP malformée".to_string())?;
    let head = String::from_utf8_lossy(&raw[..split]);
    let status: u16 = head
        .lines()
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse::<u16>().ok())
        .ok_or_else(|| "code de statut HTTP illisible".to_string())?;
    let resp_body = String::from_utf8_lossy(&raw[split + 4..]).to_string();
    Ok((status, resp_body))
}

async fn http_request_via_curl(
    full_url: &str,
    method: &str,
    token: Option<&str>,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let mut cmd = tokio::process::Command::new("curl");
    cmd.args(["-sS", "--max-time", "8", "-X", method, "-w", "\n%{http_code}"]);
    if let Some(t) = token.map(str::trim).filter(|t| !t.is_empty()) {
        cmd.args(["-H", &format!("Authorization: Bearer {t}")]);
    }
    if let Some(payload) = body {
        cmd.args(["-H", "Content-Type: application/json", "-d", payload]);
    }
    cmd.arg(full_url)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true);

    let out = cmd
        .output()
        .await
        .map_err(|e| format!("impossible d'appeler curl : {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "échec de la requête HTTPS vers Kana Cloud".into()
        } else {
            stderr
        });
    }
    let text = String::from_utf8_lossy(&out.stdout);
    let (resp_body, code_str) = text
        .rsplit_once('\n')
        .ok_or_else(|| "réponse curl incomplète".to_string())?;
    let status = code_str
        .trim()
        .parse::<u16>()
        .map_err(|_| format!("code HTTP invalide : {code_str}"))?;
    Ok((status, resp_body.to_string()))
}

async fn cloud_http_request(
    base_url: &str,
    path: &str,
    method: &str,
    token: Option<&str>,
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let base = normalize_base_url(base_url)?;
    let full_url = format!("{base}{path}");
    if full_url.starts_with("http://") {
        http_request_plain(&full_url, method, token, body).await
    } else {
        http_request_via_curl(&full_url, method, token, body).await
    }
}

/// Vérifie la santé d'un serveur Kana Cloud distant (`GET /api/health`).
#[tauri::command]
pub async fn cloud_health_check(url: String, token: Option<String>) -> Result<CloudHealth, String> {
    let (status, body) = cloud_http_request(&url, "/api/health", "GET", token.as_deref(), None).await?;
    if !(200..300).contains(&status) {
        return Err(format!("Kana Cloud a répondu HTTP {status} : {body}"));
    }
    serde_json::from_str::<CloudHealth>(&body)
        .map_err(|e| format!("réponse /api/health invalide : {e}"))
}

/// Soumet un job agent à un serveur Kana Cloud distant (`POST /api/run`).
#[tauri::command]
pub async fn cloud_submit_job(
    url: String,
    token: Option<String>,
    agent: String,
    prompt: String,
    cwd: Option<String>,
) -> Result<CloudJob, String> {
    let payload = serde_json::json!({
        "agent": agent,
        "prompt": prompt,
        "cwd": cwd,
    })
    .to_string();
    let (status, body) =
        cloud_http_request(&url, "/api/run", "POST", token.as_deref(), Some(&payload)).await?;
    if !(200..300).contains(&status) {
        return Err(format!("échec de soumission Cloud (HTTP {status}) : {body}"));
    }
    serde_json::from_str::<CloudJob>(&body)
        .map_err(|e| format!("réponse /api/run invalide : {e}"))
}

/// Liste les jobs récents d'un serveur Kana Cloud distant (`GET /api/jobs`).
#[tauri::command]
pub async fn cloud_list_jobs(url: String, token: Option<String>) -> Result<Vec<CloudJob>, String> {
    let (status, body) = cloud_http_request(&url, "/api/jobs", "GET", token.as_deref(), None).await?;
    if !(200..300).contains(&status) {
        return Err(format!("échec de lecture des jobs Cloud (HTTP {status}) : {body}"));
    }
    serde_json::from_str::<Vec<CloudJob>>(&body)
        .map_err(|e| format!("réponse /api/jobs invalide : {e}"))
}
