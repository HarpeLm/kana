//! Serveur HTTP/JSON autonome Kana Cloud (`kana serve`) + interface Web/Mobile + client Tauri Cloud.

use std::{
    collections::HashMap,
    future::Future,
    path::PathBuf,
    pin::Pin,
    sync::{Arc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

use crate::{agent_spec, load_cli_shared_context};

const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
const MAX_STORED_JOBS: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudHealth {
    pub ok: bool,
    pub version: String,
    pub auth_required: bool,
    pub active_jobs: usize,
    pub uptime_secs: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudJob {
    pub id: String,
    pub prompt: String,
    pub agent: String,
    pub mode: String,
    pub cwd: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub output: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunJobRequest {
    prompt: String,
    #[serde(default)]
    agent: Option<String>,
    #[serde(default)]
    mode: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
}

pub type JobFuture = Pin<Box<dyn Future<Output = Result<String, String>> + Send>>;
pub type JobRunner = Arc<dyn Fn(CloudJob) -> JobFuture + Send + Sync>;

pub struct CloudState {
    pub token: Option<String>,
    pub default_cwd: PathBuf,
    pub started_at: Instant,
    pub jobs: Mutex<Vec<CloudJob>>,
    pub runner: JobRunner,
}

impl CloudState {
    pub fn new(token: Option<String>, default_cwd: PathBuf, runner: JobRunner) -> Self {
        let clean_token = token.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
        Self {
            token: clean_token,
            default_cwd,
            started_at: Instant::now(),
            jobs: Mutex::new(Vec::new()),
            runner,
        }
    }

    fn auth_required(&self) -> bool {
        self.token.is_some()
    }

    fn is_authorized(&self, headers: &HashMap<String, String>, query_token: Option<&str>) -> bool {
        let Some(expected) = self.token.as_deref() else {
            return true;
        };
        if let Some(auth) = headers.get("authorization")
            && let Some(bearer) = auth.strip_prefix("Bearer ").or_else(|| auth.strip_prefix("bearer "))
            && bearer.trim() == expected
        {
            return true;
        }
        if let Some(qt) = query_token
            && qt.trim() == expected
        {
            return true;
        }
        false
    }

    fn health(&self) -> CloudHealth {
        let active_jobs = self
            .jobs
            .lock()
            .map(|list| list.iter().filter(|j| j.status == "queued" || j.status == "running").count())
            .unwrap_or(0);
        CloudHealth {
            ok: true,
            version: env!("CARGO_PKG_VERSION").to_string(),
            auth_required: self.auth_required(),
            active_jobs,
            uptime_secs: self.started_at.elapsed().as_secs(),
        }
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn generate_job_id() -> String {
    let mut bytes = [0u8; 4];
    let _ = getrandom::fill(&mut bytes);
    let rand_hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("job-{}-{rand_hex}", now_millis())
}

/// Exécuteur ACP headless par défaut pour les jobs soumis au serveur Kana Cloud.
pub fn default_acp_job_runner(default_cwd: PathBuf) -> JobRunner {
    Arc::new(move |job: CloudJob| {
        let fallback_cwd = default_cwd.clone();
        Box::pin(async move {
            let workdir = job
                .cwd
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(PathBuf::from)
                .unwrap_or(fallback_cwd);
            let shared_ctx = load_cli_shared_context(&agent_spec::default_cwd(), &workdir);
            let read_only = job.mode == "plan";
            let effective_mode = if read_only {
                kana_core::PermissionMode::Plan
            } else {
                kana_core::PermissionMode::Auto
            };
            let agents_chain: Vec<String> = if job.mode == "cross-review" {
                vec!["claude".into(), "codex".into(), "gemini".into()]
            } else {
                vec![job.agent.clone()]
            };

            let mut outputs = Vec::new();
            for (idx, step_agent) in agents_chain.iter().enumerate() {
                let spec = agent_spec::spec_for(step_agent)?;
                let base_prompt = if agents_chain.len() == 1 {
                    job.prompt.clone()
                } else if idx == 0 {
                    format!("[Cross-Review Étape 1/3 · Implémentation]\n{}", job.prompt)
                } else if idx == 1 {
                    format!(
                        "[Cross-Review Étape 2/3 · Revue critique du Diff]\nRelis le diff pour « {} » et signale/corrige toute régression.",
                        job.prompt
                    )
                } else {
                    format!(
                        "[Cross-Review Étape 3/3 · Vérification finale]\nVérifie la compilation et les tests pour « {} ».",
                        job.prompt
                    )
                };
                let full_prompt = if shared_ctx.memory_preface.is_empty() {
                    base_prompt
                } else {
                    format!("{}{}", shared_ctx.memory_preface, base_prompt)
                };

                let (client, mut events) =
                    kana_acp::AcpClient::spawn_with_mcp(&spec, &workdir, &shared_ctx.mcp_servers)
                        .await
                        .map_err(|e| format!("impossible de démarrer '{step_agent}' : {e}"))?;
                if read_only {
                    let _ = client.set_plan_mode(true).await;
                }
                client
                    .prompt(&full_prompt)
                    .await
                    .map_err(|e| format!("erreur d'envoi du prompt à '{step_agent}' : {e}"))?;

                let mut step_out = String::new();
                while let Some(ev) = events.recv().await {
                    match ev {
                        kana_acp::AcpEvent::Message { text } => step_out.push_str(&text),
                        kana_acp::AcpEvent::Permission {
                            request_id,
                            title,
                            options,
                        } => {
                            let choices: Vec<kana_core::PermissionChoice> = options
                                .iter()
                                .map(|o| kana_core::PermissionChoice {
                                    id: o.id.clone(),
                                    name: o.name.clone(),
                                    kind: o.kind.clone(),
                                })
                                .collect();
                            let answer = kana_core::auto_answer_with_rules(
                                effective_mode,
                                &title,
                                &choices,
                                &shared_ctx.rules,
                            );
                            client.resolve_permission(&request_id, answer).await;
                        }
                        kana_acp::AcpEvent::Done { .. } | kana_acp::AcpEvent::Closed => break,
                        kana_acp::AcpEvent::Error { message } => {
                            return Err(format!("erreur de '{step_agent}' : {message}"));
                        }
                        _ => {}
                    }
                }
                outputs.push(if agents_chain.len() > 1 {
                    format!("### Étape {} ({step_agent})\n{}", idx + 1, step_out.trim())
                } else {
                    step_out.trim().to_string()
                });
            }
            Ok(outputs.join("\n\n"))
        })
    })
}

/// Démarre le serveur Kana Cloud sur `host:port`.
pub async fn run_cloud_server(
    host: String,
    port: u16,
    token: Option<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let bind_addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&bind_addr)
        .await
        .map_err(|e| format!("impossible d'écouter sur {bind_addr} : {e}"))?;
    let default_cwd = cwd
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(agent_spec::project_dir);
    let state = Arc::new(CloudState::new(
        token,
        default_cwd.clone(),
        default_acp_job_runner(default_cwd),
    ));
    println!("Kana Cloud actif sur http://{bind_addr}");
    if state.auth_required() {
        println!("Authentification Bearer activée pour /api/*");
    } else {
        println!("Attention : aucun token configuré (--token ou KANA_CLOUD_TOKEN).");
    }
    serve_on_listener(listener, state).await
}

/// Boucle d'acceptation HTTP sur un `TcpListener` déjà lié (utilisée aussi dans les tests unitaires).
pub async fn serve_on_listener(listener: TcpListener, state: Arc<CloudState>) -> Result<(), String> {
    loop {
        let (stream, _) = listener
            .accept()
            .await
            .map_err(|e| format!("erreur d'acceptation TCP : {e}"))?;
        let state_clone = Arc::clone(&state);
        tokio::spawn(async move {
            let _ = handle_connection(stream, state_clone).await;
        });
    }
}

struct ParsedRequest {
    method: String,
    path: String,
    query: HashMap<String, String>,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

async fn read_http_request(stream: &mut TcpStream) -> Result<ParsedRequest, String> {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    let header_end = loop {
        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            break pos + 4;
        }
        if buf.len() > 64 * 1024 {
            return Err("en-têtes HTTP trop volumineux".into());
        }
        let n = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut chunk))
            .await
            .map_err(|_| "délai de lecture HTTP expiré".to_string())?
            .map_err(|e| format!("erreur de lecture TCP : {e}"))?;
        if n == 0 {
            return Err("connexion fermée prématurément".into());
        }
        buf.extend_from_slice(&chunk[..n]);
    };

    let header_str = String::from_utf8_lossy(&buf[..header_end - 4]);
    let mut lines = header_str.split("\r\n");
    let request_line = lines.next().ok_or_else(|| "requête HTTP vide".to_string())?;
    let mut parts = request_line.split_whitespace();
    let method = parts
        .next()
        .ok_or_else(|| "méthode HTTP manquante".to_string())?
        .to_uppercase();
    let raw_target = parts
        .next()
        .ok_or_else(|| "cible HTTP manquante".to_string())?;

    let (path, query_str) = match raw_target.split_once('?') {
        Some((p, q)) => (p.to_string(), Some(q)),
        None => (raw_target.to_string(), None),
    };

    let mut query = HashMap::new();
    if let Some(q) = query_str {
        for pair in q.split('&') {
            if let Some((k, v)) = pair.split_once('=') {
                query.insert(k.to_string(), v.to_string());
            } else if !pair.is_empty() {
                query.insert(pair.to_string(), String::new());
            }
        }
    }

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let content_length: usize = headers
        .get("content-length")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err("corps de requête trop volumineux".into());
    }

    let mut body = buf[header_end..].to_vec();
    while body.len() < content_length {
        let remaining = content_length - body.len();
        let to_read = remaining.min(chunk.len());
        let n = tokio::time::timeout(Duration::from_secs(10), stream.read(&mut chunk[..to_read]))
            .await
            .map_err(|_| "délai de lecture du corps expiré".to_string())?
            .map_err(|e| format!("erreur de lecture du corps : {e}"))?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..n]);
    }
    body.truncate(content_length);

    Ok(ParsedRequest {
        method,
        path,
        query,
        headers,
        body,
    })
}

async fn write_http_response(
    stream: &mut TcpStream,
    status: u16,
    reason: &str,
    content_type: &str,
    body: &[u8],
) -> Result<(), String> {
    let header = format!(
        "HTTP/1.1 {status} {reason}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {}\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Access-Control-Allow-Headers: Authorization, Content-Type\r\n\
         Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
         Connection: close\r\n\r\n",
        body.len()
    );
    stream
        .write_all(header.as_bytes())
        .await
        .map_err(|e| format!("erreur d'écriture en-têtes : {e}"))?;
    stream
        .write_all(body)
        .await
        .map_err(|e| format!("erreur d'écriture corps : {e}"))?;
    let _ = stream.shutdown().await;
    Ok(())
}

async fn write_json(stream: &mut TcpStream, status: u16, reason: &str, value: &impl Serialize) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).unwrap_or_else(|_| b"{}".to_vec());
    write_http_response(stream, status, reason, "application/json; charset=utf-8", &bytes).await
}

async fn handle_connection(mut stream: TcpStream, state: Arc<CloudState>) -> Result<(), String> {
    let req = match read_http_request(&mut stream).await {
        Ok(r) => r,
        Err(msg) => {
            return write_json(&mut stream, 400, "Bad Request", &serde_json::json!({ "error": msg })).await;
        }
    };

    if req.method == "OPTIONS" {
        return write_http_response(&mut stream, 204, "No Content", "text/plain", b"").await;
    }

    if req.method == "GET" && (req.path == "/" || req.path == "/index.html") {
        let html = companion_web_html(state.auth_required());
        return write_http_response(&mut stream, 200, "OK", "text/html; charset=utf-8", html.as_bytes()).await;
    }

    if req.method == "GET" && req.path == "/api/health" {
        let health = state.health();
        return write_json(&mut stream, 200, "OK", &health).await;
    }

    if req.path.starts_with("/api/") {
        if !state.is_authorized(&req.headers, req.query.get("token").map(String::as_str)) {
            return write_json(
                &mut stream,
                401,
                "Unauthorized",
                &serde_json::json!({ "error": "unauthorized" }),
            )
            .await;
        }

        if req.method == "GET" && req.path == "/api/jobs" {
            let list = state.jobs.lock().map(|j| j.clone()).unwrap_or_default();
            return write_json(&mut stream, 200, "OK", &list).await;
        }

        if req.method == "GET"
            && let Some(job_id) = req.path.strip_prefix("/api/jobs/")
            && !job_id.is_empty()
        {
            let found = state
                .jobs
                .lock()
                .ok()
                .and_then(|list| list.iter().find(|j| j.id == job_id).cloned());
            return match found {
                Some(job) => write_json(&mut stream, 200, "OK", &job).await,
                None => {
                    write_json(
                        &mut stream,
                        404,
                        "Not Found",
                        &serde_json::json!({ "error": "job not found" }),
                    )
                    .await
                }
            };
        }

        if req.method == "POST" && req.path == "/api/run" {
            let parsed: RunJobRequest = match serde_json::from_slice(&req.body) {
                Ok(v) => v,
                Err(e) => {
                    return write_json(
                        &mut stream,
                        400,
                        "Bad Request",
                        &serde_json::json!({ "error": format!("JSON invalide : {e}") }),
                    )
                    .await;
                }
            };
            let clean_prompt = parsed.prompt.trim().to_string();
            if clean_prompt.is_empty() {
                return write_json(
                    &mut stream,
                    400,
                    "Bad Request",
                    &serde_json::json!({ "error": "le prompt est vide" }),
                )
                .await;
            }
            let agent = parsed
                .agent
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .unwrap_or("claude")
                .to_lowercase();
            let mode = match parsed.mode.as_deref().map(str::trim).unwrap_or("auto") {
                "plan" => "plan".to_string(),
                "cross-review" => "cross-review".to_string(),
                _ => "auto".to_string(),
            };
            let job = CloudJob {
                id: generate_job_id(),
                prompt: clean_prompt,
                agent,
                mode,
                cwd: parsed
                    .cwd
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| Some(state.default_cwd.to_string_lossy().into_owned())),
                status: "queued".into(),
                created_at: now_millis(),
                finished_at: None,
                output: String::new(),
                error: None,
            };
            if let Ok(mut list) = state.jobs.lock() {
                list.insert(0, job.clone());
                list.truncate(MAX_STORED_JOBS);
            }

            let state_bg = Arc::clone(&state);
            let job_bg = job.clone();
            tokio::spawn(async move {
                if let Ok(mut list) = state_bg.jobs.lock()
                    && let Some(item) = list.iter_mut().find(|j| j.id == job_bg.id)
                {
                    item.status = "running".into();
                }
                let result = (state_bg.runner)(job_bg.clone()).await;
                if let Ok(mut list) = state_bg.jobs.lock()
                    && let Some(item) = list.iter_mut().find(|j| j.id == job_bg.id)
                {
                    item.finished_at = Some(now_millis());
                    match result {
                        Ok(out) => {
                            item.status = "done".into();
                            item.output = out;
                        }
                        Err(err) => {
                            item.status = "error".into();
                            item.error = Some(err);
                        }
                    }
                }
            });

            return write_json(&mut stream, 202, "Accepted", &job).await;
        }
    }

    write_json(
        &mut stream,
        404,
        "Not Found",
        &serde_json::json!({ "error": "route not found" }),
    )
    .await
}

fn companion_web_html(auth_required: bool) -> String {
    let auth_hint = if auth_required {
        "Authentification Bearer requise"
    } else {
        "Accès libre (configurez --token en production)"
    };
    format!(
        r#"<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Kana Cloud — Compagnon Web &amp; Mobile</title>
  <style>
    :root {{ color-scheme: dark; }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #181817; color: #ecebe4; line-height: 1.45;
      padding: 16px; max-width: 760px; margin-inline: auto;
    }}
    header {{ display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }}
    h1 {{ font-size: 18px; margin: 0; }}
    .sub {{ font-size: 12.5px; color: #8c8b83; margin: 2px 0 0; }}
    .badge {{ font-size: 12px; padding: 4px 10px; border-radius: 999px; background: #243828; color: #8ce09b; }}
    .badge.err {{ background: #3d2324; color: #f48b87; }}
    .card {{ background: #21211f; border: 1px solid #343430; border-radius: 14px; padding: 14px; margin-bottom: 14px; }}
    label {{ display: block; font-size: 12px; color: #9a9992; margin-bottom: 6px; }}
    input, select, textarea {{
      width: 100%; background: #181817; color: #ecebe4; border: 1px solid #363632;
      border-radius: 9px; padding: 9px 11px; font-size: 14px; outline: none;
    }}
    input:focus, select:focus, textarea:focus {{ border-color: #55554f; }}
    .row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }}
    @media (max-width: 520px) {{ .row {{ grid-template-columns: 1fr; }} }}
    button {{
      background: #d97757; color: #181817; border: 0; border-radius: 9px;
      padding: 9px 14px; font-size: 13.5px; font-weight: 600; cursor: pointer;
    }}
    button.sec {{ background: #2f2f2c; color: #ecebe4; font-weight: 500; }}
    .actions {{ display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 12px; }}
    .job {{ border-top: 1px solid #2f2f2c; padding: 10px 0; }}
    .job:first-child {{ border-top: 0; padding-top: 0; }}
    .job-head {{ display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; color: #9a9992; }}
    .status {{ padding: 2px 8px; border-radius: 999px; font-size: 11px; background: #2f2f2c; color: #dcdbd3; }}
    .status.done {{ background: #243828; color: #8ce09b; }}
    .status.running, .status.queued {{ background: #223042; color: #8ab4f8; }}
    .status.error {{ background: #3d2324; color: #f48b87; }}
    pre {{ white-space: pre-wrap; word-break: break-word; background: #181817; padding: 10px; border-radius: 8px; font-size: 12px; margin: 8px 0 0; }}
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Kana Cloud</h1>
      <p class="sub">Compagnon Web &amp; Mobile · {auth_hint}</p>
    </div>
    <span id="healthBadge" class="badge">Connexion…</span>
  </header>

  <section class="card">
    <label for="tokenInput">Jeton Bearer (enregistré localement sur cet appareil)</label>
    <div style="display:flex;gap:8px;">
      <input id="tokenInput" type="password" placeholder="Coller le token Kana Cloud…" />
      <button id="saveTokenBtn" type="button" class="sec">Enregistrer</button>
    </div>
  </section>

  <form id="runForm" class="card">
    <label for="promptInput">Nouvelle tâche agent</label>
    <textarea id="promptInput" rows="3" placeholder="Ex. Analyse les erreurs CI et propose un correctif…"></textarea>
    <div class="row">
      <div>
        <label for="agentSelect">Agent</label>
        <select id="agentSelect">
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>
      <div>
        <label for="modeSelect">Mode</label>
        <select id="modeSelect">
          <option value="auto">Auto (exécution)</option>
          <option value="plan">Plan (lecture seule)</option>
          <option value="cross-review">Cross-Review (3 agents)</option>
        </select>
      </div>
    </div>
    <div class="actions">
      <span id="formMsg" class="sub"></span>
      <button type="submit">Lancer sur Kana Cloud</button>
    </div>
  </form>

  <section class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <strong style="font-size:14px;">Jobs récents</strong>
      <button id="refreshBtn" type="button" class="sec" style="padding:5px 10px;font-size:12px;">Actualiser</button>
    </div>
    <div id="jobsList" class="sub">Aucun job pour l'instant.</div>
  </section>

  <script>
    const params = new URLSearchParams(location.search);
    if (params.get("token")) localStorage.setItem("kana-cloud-token", params.get("token"));
    const tokenInput = document.getElementById("tokenInput");
    tokenInput.value = localStorage.getItem("kana-cloud-token") || "";
    const authHeaders = () => {{
      const t = tokenInput.value.trim();
      return t ? {{ "Authorization": "Bearer " + t }} : {{}};
    }};
    document.getElementById("saveTokenBtn").onclick = () => {{
      localStorage.setItem("kana-cloud-token", tokenInput.value.trim());
      loadJobs();
    }};
    async function loadHealth() {{
      const badge = document.getElementById("healthBadge");
      try {{
        const res = await fetch("/api/health");
        const data = await res.json();
        badge.textContent = data.ok ? `En ligne · ${{data.activeJobs}} actif(s)` : "Hors ligne";
        badge.className = data.ok ? "badge" : "badge err";
      }} catch {{
        badge.textContent = "Injoignable";
        badge.className = "badge err";
      }}
    }}
    async function loadJobs() {{
      const listEl = document.getElementById("jobsList");
      try {{
        const res = await fetch("/api/jobs", {{ headers: authHeaders() }});
        if (res.status === 401) {{
          listEl.textContent = "Token Bearer manquant ou invalide.";
          return;
        }}
        const jobs = await res.json();
        if (!Array.isArray(jobs) || jobs.length === 0) {{
          listEl.textContent = "Aucun job pour l'instant.";
          return;
        }}
        listEl.innerHTML = jobs.map((j) => `
          <div class="job">
            <div class="job-head">
              <span><strong>${{j.agent}}</strong> · ${{j.mode}}</span>
              <span class="status ${{j.status}}">${{j.status}}</span>
            </div>
            <div style="margin-top:4px;font-size:13.5px;color:#ecebe4;">${{escapeHtml(j.prompt)}}</div>
            ${{j.output ? `<pre>${{escapeHtml(j.output)}}</pre>` : ""}}
            ${{j.error ? `<pre style="color:#f48b87;">${{escapeHtml(j.error)}}</pre>` : ""}}
          </div>
        `).join("");
      }} catch (e) {{
        listEl.textContent = "Erreur de chargement : " + e;
      }}
    }}
    function escapeHtml(s) {{
      return String(s).replace(/[&<>"]/g, (c) => ({{ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }}[c]));
    }}
    document.getElementById("runForm").onsubmit = async (e) => {{
      e.preventDefault();
      const prompt = document.getElementById("promptInput").value.trim();
      if (!prompt) return;
      const msg = document.getElementById("formMsg");
      msg.textContent = "Envoi…";
      try {{
        const res = await fetch("/api/run", {{
          method: "POST",
          headers: {{ "Content-Type": "application/json", ...authHeaders() }},
          body: JSON.stringify({{
            prompt,
            agent: document.getElementById("agentSelect").value,
            mode: document.getElementById("modeSelect").value,
          }}),
        }});
        const data = await res.json();
        if (!res.ok) {{
          msg.textContent = data.error || "Erreur HTTP " + res.status;
          return;
        }}
        document.getElementById("promptInput").value = "";
        msg.textContent = "Job soumis (" + data.id + ")";
        loadHealth();
        loadJobs();
      }} catch (err) {{
        msg.textContent = "Échec d'envoi : " + err;
      }}
    }};
    document.getElementById("refreshBtn").onclick = () => {{ loadHealth(); loadJobs(); }};
    loadHealth();
    loadJobs();
    setInterval(() => {{ loadHealth(); loadJobs(); }}, 5000);
  </script>
</body>
</html>
"#
    )
}

fn normalize_base_url(url: &str) -> Result<String, String> {
    let trimmed = url.trim().trim_end_matches('/');
    if !trimmed.starts_with("http://") && !trimmed.starts_with("https://") {
        return Err("l'URL Kana Cloud doit commencer par http:// ou https://".into());
    }
    Ok(trimmed.to_string())
}

async fn http_request_plain(
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cloud_server_handles_web_ui_health_auth_and_jobs() {
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let addr = listener.local_addr().unwrap();
            let base_url = format!("http://{addr}");

            let mock_runner: JobRunner = Arc::new(|job: CloudJob| {
                Box::pin(async move { Ok(format!("Exécuté par {} : {}", job.agent, job.prompt)) })
            });
            let state = Arc::new(CloudState::new(
                Some("secret-token-42".into()),
                std::env::temp_dir(),
                mock_runner,
            ));

            let server_task = tokio::spawn(serve_on_listener(listener, state));

            // 1. GET / renvoie l'interface Web/Mobile HTML
            let (status_ui, html) = http_request_plain(&format!("{base_url}/"), "GET", None, None)
                .await
                .unwrap();
            assert_eq!(status_ui, 200);
            assert!(html.contains("Kana Cloud"));
            assert!(html.contains("Compagnon Web"));

            // 2. GET /api/health accessible sans token
            let health = cloud_health_check(base_url.clone(), None).await.unwrap();
            assert!(health.ok);
            assert!(health.auth_required);

            // 3. Sans Bearer token -> 401 Unauthorized
            let unauth_jobs = cloud_list_jobs(base_url.clone(), None).await;
            assert!(unauth_jobs.is_err());
            assert!(unauth_jobs.unwrap_err().contains("401"));

            let unauth_run = cloud_submit_job(
                base_url.clone(),
                Some("wrong-token".into()),
                "claude".into(),
                "Test".into(),
                None,
            )
            .await;
            assert!(unauth_run.is_err());
            assert!(unauth_run.unwrap_err().contains("401"));

            // 4. Avec Bearer token valide -> POST /api/run puis GET /api/jobs
            let submitted = cloud_submit_job(
                base_url.clone(),
                Some("secret-token-42".into()),
                "codex".into(),
                "Corrige les tests".into(),
                None,
            )
            .await
            .unwrap();
            assert_eq!(submitted.agent, "codex");
            assert_eq!(submitted.prompt, "Corrige les tests");

            // Attendre brièvement la fin du mock runner
            tokio::time::sleep(Duration::from_millis(50)).await;
            let jobs = cloud_list_jobs(base_url.clone(), Some("secret-token-42".into()))
                .await
                .unwrap();
            assert_eq!(jobs.len(), 1);
            assert_eq!(jobs[0].id, submitted.id);
            assert_eq!(jobs[0].status, "done");
            assert_eq!(jobs[0].output, "Exécuté par codex : Corrige les tests");

            server_task.abort();
        });
    }
}
