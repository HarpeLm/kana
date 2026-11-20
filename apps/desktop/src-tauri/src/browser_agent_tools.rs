//! Les outils de navigation exécutés sur la vue active (voir `browser_agent`).

use std::{thread, time::Duration};

use kana_mcp::ToolDriver;
use serde_json::Value;
use tauri::Webview;

use crate::{
    browser::parse_web_url,
    browser_agent::{BrowserAgent, debug_log},
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
            other => Err(format!("Unknown tool {other}.")),
        }
    }
}

impl ToolDriver for BrowserAgent {
    fn note(&self, event: &str) {
        debug_log(event);
    }

    fn call(&self, name: &str, arguments: &Value) -> Result<String, String> {
        let result = self.run(name, arguments);
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
}
