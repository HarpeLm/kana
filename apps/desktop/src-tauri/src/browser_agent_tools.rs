//! Les outils de navigation exécutés sur la vue active (voir `browser_agent`).

use std::{path::Path, thread, time::Duration};

use base64::Engine;
use kana_core::is_sensitive_path;
use kana_mcp::ToolDriver;
use serde_json::{Value, json};
use tauri::{Emitter, Webview};

use crate::{
    browser::parse_web_url,
    browser_agent::{BrowserAgent, build_trace_html, debug_log},
};

fn js_string(value: &str) -> String {
    serde_json::to_string(value).expect("une chaîne se sérialise toujours")
}

/// Les références du script d'aide sont de la forme `e12` : rien d'autre n'entre dans le JavaScript.
fn element_ref(arguments: &Value) -> Result<String, String> {
    let reference = arguments["ref"].as_str().unwrap_or_default();
    let valid = reference.strip_prefix('e').is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()));
    if valid {
        Ok(reference.to_owned())
    } else {
        Err(format!("Invalid element reference \"{reference}\". Use a reference from browser_snapshot, like e12."))
    }
}

fn text_arg<'a>(arguments: &'a Value, key: &str) -> Result<&'a str, String> {
    arguments[key].as_str().ok_or_else(|| format!("Missing argument \"{key}\"."))
}

fn mime_for_path(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".pdf") {
        "application/pdf"
    } else if lower.ends_with(".json") {
        "application/json"
    } else if lower.ends_with(".csv") {
        "text/csv"
    } else if lower.ends_with(".txt") || lower.ends_with(".md") {
        "text/plain"
    } else if lower.ends_with(".html") || lower.ends_with(".htm") {
        "text/html"
    } else {
        "application/octet-stream"
    }
}

fn resolve_viewport_dimensions(arguments: &Value) -> Result<(String, Option<u32>, Option<u32>), String> {
    let preset = arguments["preset"].as_str().unwrap_or("desktop");
    let custom_w = arguments["width"].as_u64().map(|w| w.clamp(240, 3840) as u32);
    let custom_h = arguments["height"].as_u64().map(|h| h.clamp(240, 3840) as u32);
    match preset {
        "desktop" => Ok(("desktop".to_owned(), custom_w, custom_h)),
        "tablet" => Ok(("tablet".to_owned(), Some(custom_w.unwrap_or(768)), Some(custom_h.unwrap_or(1024)))),
        "mobile" => Ok(("mobile".to_owned(), Some(custom_w.unwrap_or(390)), Some(custom_h.unwrap_or(844)))),
        other => Err(format!("Unsupported viewport preset \"{other}\". Use desktop, tablet or mobile.")),
    }
}

fn format_console_entries(entries: &[Value]) -> String {
    if entries.is_empty() {
        return "No JavaScript console errors recorded.".into();
    }
    entries
        .iter()
        .map(|e| {
            format!(
                "[{}] {} ({})",
                e["level"].as_str().unwrap_or("error").to_uppercase(),
                e["message"].as_str().unwrap_or(""),
                e["source"].as_str().unwrap_or("")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn format_network_entries(entries: &[Value]) -> String {
    if entries.is_empty() {
        return "No failed network requests (4xx/5xx) recorded.".into();
    }
    entries
        .iter()
        .map(|e| {
            format!(
                "{} {} -> {} {} ({} ms)",
                e["method"].as_str().unwrap_or("GET"),
                e["url"].as_str().unwrap_or(""),
                e["status"].as_i64().unwrap_or(0),
                e["statusText"].as_str().unwrap_or(""),
                e["durationMs"].as_i64().unwrap_or(0),
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

impl BrowserAgent {
    fn navigate(&self, arguments: &Value) -> Result<String, String> {
        let url = parse_web_url(text_arg(arguments, "url")?)?;
        self.authorize_host(url.host_str().unwrap_or_default())?;
        let webview = self.webview()?;
        webview.navigate(url).map_err(|e| e.to_string())?;
        self.wait_loaded(&webview);
        Ok(format!("Navigated. {}", self.page_summary(&webview)))
    }

    fn snapshot(&self, webview: &Webview) -> Result<String, String> {
        let page = self.helper(webview, "snapshot()")?;
        Ok(format!(
            "Page: {}\nURL: {}\n\n{}",
            page["title"].as_str().unwrap_or(""),
            page["url"].as_str().unwrap_or(""),
            page["text"].as_str().unwrap_or("")
        ))
    }

    fn click(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let reference = element_ref(arguments)?;
        let target = self.helper(webview, &format!("describe({})", js_string(&reference)))?;
        let label = target["label"].as_str().unwrap_or_default().to_owned();
        if target["risky"] == true {
            self.authorize_action(&Self::host_of(webview), &format!("Cliquer sur « {label} »"))?;
        }
        self.helper(webview, &format!("click({})", js_string(&reference)))?;
        thread::sleep(Duration::from_millis(600));
        Ok(format!("Clicked [{reference}] \"{label}\". {}", self.page_summary(webview)))
    }

    fn type_text(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let reference = element_ref(arguments)?;
        let text = text_arg(arguments, "text")?;
        let submit = arguments["submit"].as_bool().unwrap_or(false);
        let target = self.helper(webview, &format!("describe({})", js_string(&reference)))?;
        if target["password"] == true {
            return Err("This is a password field: the user must fill it in.".into());
        }
        if submit && target["risky"] == true {
            let label = target["label"].as_str().unwrap_or_default();
            self.authorize_action(&Self::host_of(webview), &format!("Saisir du texte et valider dans « {label} »"))?;
        }
        self.helper(webview, &format!("type({}, {}, {submit})", js_string(&reference), js_string(text)))?;
        if submit {
            thread::sleep(Duration::from_millis(600));
        }
        Ok(format!("Typed into [{reference}]. {}", self.page_summary(webview)))
    }

    fn history(&self, webview: &Webview, script: &str) -> Result<String, String> {
        webview.eval(script).map_err(|e| e.to_string())?;
        self.wait_loaded(webview);
        Ok(self.page_summary(webview))
    }

    fn on_page(&self, name: &str, arguments: &Value) -> Result<String, String> {
        let webview = self.webview()?;
        self.authorize_host(&Self::host_of(&webview))?;
        match name {
            "browser_snapshot" => self.snapshot(&webview),
            "browser_click" => self.click(&webview, arguments),
            "browser_type" => self.type_text(&webview, arguments),
            "browser_press_key" => {
                self.helper(&webview, &format!("press({})", js_string(text_arg(arguments, "key")?)))?;
                Ok("Key pressed.".into())
            }
            "browser_select_option" => {
                let reference = element_ref(arguments)?;
                let value = text_arg(arguments, "value")?;
                self.helper(&webview, &format!("select({}, {})", js_string(&reference), js_string(value)))?;
                Ok(format!("Selected \"{value}\" in [{reference}]."))
            }
            "browser_scroll" => {
                let direction = text_arg(arguments, "direction")?;
                let amount = arguments["amount"].as_f64().map_or("null".to_owned(), |a| a.to_string());
                self.helper(&webview, &format!("scroll({}, {amount})", js_string(direction)))?;
                Ok("Scrolled.".into())
            }
            "browser_back" => self.history(&webview, "history.back()"),
            "browser_forward" => self.history(&webview, "history.forward()"),
            "browser_reload" => self.history(&webview, "location.reload()"),
            "browser_screenshot" => self.screenshot(&webview, arguments),
            "browser_console_errors" => self.console_errors(&webview, arguments),
            "browser_network_errors" => self.network_errors(&webview, arguments),
            "browser_upload_file" => self.upload_file(&webview, arguments),
            "browser_set_viewport" => self.set_viewport(&webview, arguments),
            other => Err(format!("Unknown tool {other}.")),
        }
    }

    fn screenshot(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let reference = match arguments.get("ref").and_then(Value::as_str) {
            Some(r) if !r.is_empty() => {
                let checked = element_ref(arguments)?;
                js_string(&checked)
            }
            _ => "null".to_owned(),
        };
        let full_page = arguments["fullPage"].as_bool().unwrap_or(false);
        let shot = self.helper(webview, &format!("screenshot({reference}, {full_page})"))?;
        let base64_data = shot["data"].as_str().unwrap_or_default();
        let width = shot["width"].as_u64().unwrap_or(1280);
        let height = shot["height"].as_u64().unwrap_or(720);
        let title = shot["title"].as_str().unwrap_or("");
        let url = shot["url"].as_str().unwrap_or("");

        // Enregistre une copie PNG locale pour traçabilité / artéfact si possible.
        let mut saved_note = String::new();
        if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(base64_data) {
            let file_path = std::env::temp_dir().join("kana-globe-screenshot.png");
            if std::fs::write(&file_path, bytes).is_ok() {
                saved_note = format!(" Saved to {}", file_path.display());
            }
        }

        let summary = format!("Screenshot ({width}x{height}) of \"{title}\" ({url}).{saved_note}");
        Ok(json!({
            "__kana_image": {
                "data": base64_data,
                "mimeType": "image/png",
                "text": summary,
            }
        })
        .to_string())
    }

    fn console_errors(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let include_warnings = arguments["includeWarnings"].as_bool().unwrap_or(false);
        let clear = arguments["clear"].as_bool().unwrap_or(false);
        let reply = self.helper(webview, &format!("consoleErrors({include_warnings}, {clear})"))?;
        let entries = reply["entries"].as_array().cloned().unwrap_or_default();
        Ok(format_console_entries(&entries))
    }

    fn network_errors(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let clear = arguments["clear"].as_bool().unwrap_or(false);
        let reply = self.helper(webview, &format!("networkErrors({clear})"))?;
        let entries = reply["entries"].as_array().cloned().unwrap_or_default();
        Ok(format_network_entries(&entries))
    }

    fn upload_file(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let reference = element_ref(arguments)?;
        let path_str = text_arg(arguments, "path")?;
        if is_sensitive_path(path_str) {
            return Err(format!("Refusing to upload sensitive file \"{path_str}\"."));
        }
        let path = Path::new(path_str);
        let bytes = std::fs::read(path).map_err(|e| format!("Cannot read \"{path_str}\": {e}"))?;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload.bin");
        let mime_type = mime_for_path(file_name);
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        self.helper(
            webview,
            &format!(
                "upload({}, {}, {}, {})",
                js_string(&reference),
                js_string(file_name),
                js_string(mime_type),
                js_string(&encoded)
            ),
        )?;
        Ok(format!("Uploaded \"{file_name}\" ({} bytes) into [{reference}].", bytes.len()))
    }

    fn set_viewport(&self, webview: &Webview, arguments: &Value) -> Result<String, String> {
        let (preset, width, height) = resolve_viewport_dimensions(arguments)?;
        let w_arg = width.map_or("null".to_owned(), |w| w.to_string());
        let h_arg = height.map_or("null".to_owned(), |h| h.to_string());
        let reply = self.helper(
            webview,
            &format!("setViewport({w_arg}, {h_arg}, {})", js_string(&preset)),
        )?;
        let _ = self.app.emit(
            "browser-viewport",
            json!({
                "preset": preset,
                "width": reply["width"],
                "height": reply["height"],
            }),
        );
        Ok(format!(
            "Viewport set to {} ({}x{}).",
            preset,
            reply["width"].as_u64().unwrap_or(0),
            reply["height"].as_u64().unwrap_or(0)
        ))
    }

    fn tabs_tool(&self, arguments: &Value) -> Result<String, String> {
        let action = text_arg(arguments, "action")?;
        let state = self.state();
        match action {
            "list" => {
                let tabs = state.tabs();
                let active = state.active_tab().unwrap_or_default();
                if tabs.is_empty() {
                    return Ok("No browser tabs currently open.".into());
                }
                let lines = tabs
                    .iter()
                    .map(|t| {
                        let marker = if t.id == active { "*" } else { " " };
                        format!("{marker} [{}] {} ({})", t.id, t.title, t.url)
                    })
                    .collect::<Vec<_>>()
                    .join("\n");
                Ok(lines)
            }
            "open" => {
                let raw_url = arguments["url"].as_str().unwrap_or("https://duckduckgo.com");
                let url = parse_web_url(raw_url)?;
                self.authorize_host(url.host_str().unwrap_or_default())?;
                let _ = self.app.emit("browser-agent-open", ());
                let _ = self.app.emit(
                    "browser-new-tab",
                    json!({ "id": "agent", "url": url.to_string() }),
                );
                thread::sleep(Duration::from_millis(350));
                Ok(format!("Opened new tab on {url}."))
            }
            "select" => {
                let tab_id = text_arg(arguments, "tabId")?;
                state.set_active(tab_id.to_owned());
                let _ = self.app.emit("browser-select-tab", json!({ "id": tab_id }));
                thread::sleep(Duration::from_millis(150));
                Ok(format!("Selected tab [{tab_id}]."))
            }
            "close" => {
                let tab_id = text_arg(arguments, "tabId")?;
                state.remove_tab(tab_id);
                let _ = self.app.emit("browser-close-tab", json!({ "id": tab_id }));
                Ok(format!("Closed tab [{tab_id}]."))
            }
            other => Err(format!("Unsupported browser_tabs action \"{other}\".")),
        }
    }

    fn trace_tool(&self, arguments: &Value) -> Result<String, String> {
        let action = text_arg(arguments, "action")?;
        let state = self.state();
        match action {
            "start" => {
                let status = state.trace_start(true);
                let _ = self.app.emit("browser-trace-updated", &status);
                Ok("Globe session trace started.".into())
            }
            "stop" => {
                let status = state.trace_stop();
                let _ = self.app.emit("browser-trace-updated", &status);
                Ok(format!("Globe session trace stopped ({} actions recorded).", status.entries.len()))
            }
            "status" => {
                let status = state.trace_status();
                Ok(format!(
                    "Trace recording: {} ({} actions recorded).",
                    status.recording,
                    status.entries.len()
                ))
            }
            "export" => {
                let status = state.trace_status();
                let html = build_trace_html(
                    &status.entries,
                    "Captured via MCP browser_trace export.",
                    "Captured via MCP browser_trace export.",
                );
                let path = std::env::temp_dir().join("kana-globe-trace.html");
                let _ = std::fs::write(&path, &html);
                Ok(format!(
                    "Globe verification trace exported ({} actions) to {}.\n\n{}",
                    status.entries.len(),
                    path.display(),
                    html
                ))
            }
            other => Err(format!("Unsupported browser_trace action \"{other}\".")),
        }
    }
}

impl ToolDriver for BrowserAgent {
    fn note(&self, event: &str) {
        debug_log(event);
    }

    fn call(&self, name: &str, arguments: &Value) -> Result<String, String> {
        // L'interface affiche « un agent pilote cette page » tant que ces signaux arrivent.
        let _ = self.app.emit("browser-agent-active", name);
        let result = self.run(name, arguments);
        if name != "browser_trace" {
            let target = arguments["url"]
                .as_str()
                .or_else(|| arguments["ref"].as_str())
                .or_else(|| arguments["preset"].as_str())
                .or_else(|| arguments["action"].as_str())
                .unwrap_or("-");
            let (url, title) = self
                .state()
                .active_tab()
                .and_then(|id| self.state().tabs().into_iter().find(|t| t.id == id))
                .map_or((String::new(), String::new()), |t| (t.url, t.title));
            let status = if result.is_ok() { "ok" } else { "error" };
            self.state().record_trace(name, target, &url, &title, status);
            let _ = self.app.emit("browser-trace-updated", self.state().trace_status());
        }
        debug_log(&match &result {
            Ok(text) => format!("outil {name} : ok ({} caractères)", text.len()),
            Err(error) => format!("outil {name} : erreur : {error}"),
        });
        result
    }
}

impl BrowserAgent {
    fn run(&self, name: &str, arguments: &Value) -> Result<String, String> {
        match name {
            "browser_navigate" => self.navigate(arguments),
            "browser_tabs" => self.tabs_tool(arguments),
            "browser_trace" => self.trace_tool(arguments),
            "browser_wait" => {
                let seconds = arguments["seconds"].as_f64().unwrap_or(1.0).clamp(0.5, 10.0);
                thread::sleep(Duration::from_secs_f64(seconds));
                Ok(format!("Waited {seconds} s."))
            }
            _ => self.on_page(name, arguments),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn element_references_must_look_like_e_and_digits() {
        assert_eq!(element_ref(&json!({ "ref": "e12" })).unwrap(), "e12");
        for bad in ["", "e", "12", "e1; alert(1)", "e1 ", "E1", "e-1"] {
            assert!(element_ref(&json!({ "ref": bad })).is_err(), "{bad}");
        }
        assert!(element_ref(&json!({})).is_err());
    }

    #[test]
    fn strings_are_escaped_for_javascript() {
        assert_eq!(js_string(r#"a"b\n"#), r#""a\"b\\n""#);
        assert_eq!(js_string("</script>"), "\"</script>\"");
    }

    #[test]
    fn text_arguments_are_required() {
        assert!(text_arg(&json!({ "url": "x" }), "url").is_ok());
        assert!(text_arg(&json!({}), "url").is_err());
    }

    #[test]
    fn resolves_responsive_viewport_presets() {
        let (preset, w, h) = resolve_viewport_dimensions(&json!({ "preset": "mobile" })).unwrap();
        assert_eq!(preset, "mobile");
        assert_eq!(w, Some(390));
        assert_eq!(h, Some(844));

        let (preset, w, h) = resolve_viewport_dimensions(&json!({ "preset": "tablet" })).unwrap();
        assert_eq!(preset, "tablet");
        assert_eq!(w, Some(768));
        assert_eq!(h, Some(1024));

        let (preset, w, h) = resolve_viewport_dimensions(&json!({ "preset": "desktop", "width": 1440 })).unwrap();
        assert_eq!(preset, "desktop");
        assert_eq!(w, Some(1440));
        assert_eq!(h, None);

        assert!(resolve_viewport_dimensions(&json!({ "preset": "watch" })).is_err());
    }

    #[test]
    fn formats_console_and_network_error_reports() {
        let console = format_console_entries(&[json!({
            "level": "error",
            "message": "TypeError: x is undefined",
            "source": "http://localhost:3000/app.js:42"
        })]);
        assert!(console.contains("[ERROR] TypeError: x is undefined"));
        assert!(format_console_entries(&[]).contains("No JavaScript console errors"));

        let net = format_network_entries(&[json!({
            "method": "POST",
            "url": "http://localhost:3000/api/login",
            "status": 502,
            "statusText": "Bad Gateway",
            "durationMs": 84
        })]);
        assert!(net.contains("POST http://localhost:3000/api/login -> 502 Bad Gateway (84 ms)"));
        assert!(format_network_entries(&[]).contains("No failed network requests"));
    }

    #[test]
    fn detects_mime_type_and_rejects_sensitive_upload_paths() {
        assert_eq!(mime_for_path("avatar.png"), "image/png");
        assert_eq!(mime_for_path("report.pdf"), "application/pdf");
        assert!(is_sensitive_path("/Users/alice/.env"));
        assert!(is_sensitive_path("/Users/alice/.ssh/id_ed25519"));
        assert!(!is_sensitive_path("/tmp/fixture.png"));
    }
}
