//! Les outils de navigation proposés aux agents, et ce qui les exécute.

use serde_json::{Value, json};

/// Ce qui exécute réellement un outil. Renvoie le texte à montrer à l'agent, ou une erreur
/// (que l'agent verra comme un échec de l'outil, pas comme un échec du protocole).
pub trait ToolDriver: Send + Sync {
    fn call(&self, name: &str, arguments: &Value) -> Result<String, String>;

    /// Reçoit une ligne de journal décrivant ce que fait le serveur (pour diagnostiquer un agent
    /// qui ne se connecte pas). Ne fait rien par défaut.
    fn note(&self, _event: &str) {}
}

fn tool(name: &str, description: &str, properties: Value, required: &[&str]) -> Value {
    json!({
        "name": name,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": properties,
            "required": required,
        }
    })
}

/// La liste des outils, au format de `tools/list`. Les descriptions sont en anglais : c'est la
/// langue où les modèles utilisent le mieux leurs outils.
pub fn tool_definitions() -> Vec<Value> {
    let element = json!({ "type": "string", "description": "Element reference from the latest snapshot, like \"e12\"." });
    vec![
        tool(
            "browser_navigate",
            "Open a web address (http or https) in the browser pane of the Kana app.",
            json!({ "url": { "type": "string", "description": "Full address, like https://example.com" } }),
            &["url"],
        ),
        tool(
            "browser_snapshot",
            "Read the current page as text. Interactive elements get references like [e3] that the other tools accept. Take a new snapshot after every action that changes the page: references change.",
            json!({}),
            &[],
        ),
        tool(
            "browser_click",
            "Click a link, button or other element. Clicks that look like a payment, a deletion or a message send ask the user first.",
            json!({ "ref": element }),
            &["ref"],
        ),
        tool(
            "browser_type",
            "Type text into a text field, replacing its content. Never use it for passwords: the user types those.",
            json!({
                "ref": element,
                "text": { "type": "string" },
                "submit": { "type": "boolean", "description": "Press Enter afterwards." }
            }),
            &["ref", "text"],
        ),
        tool(
            "browser_press_key",
            "Press a key on the focused element, like Enter, Escape, Tab or ArrowDown.",
            json!({ "key": { "type": "string" } }),
            &["key"],
        ),
        tool(
            "browser_select_option",
            "Choose an option in a drop-down list, by its value or its visible text.",
            json!({ "ref": element, "value": { "type": "string" } }),
            &["ref", "value"],
        ),
        tool(
            "browser_scroll",
            "Scroll the page.",
            json!({
                "direction": { "type": "string", "enum": ["up", "down", "top", "bottom"] },
                "amount": { "type": "number", "description": "Pixels for up and down; defaults to most of the screen." }
            }),
            &["direction"],
        ),
        tool("browser_back", "Go back to the previous page.", json!({}), &[]),
        tool("browser_forward", "Go forward to the next page.", json!({}), &[]),
        tool("browser_reload", "Reload the current page.", json!({}), &[]),
        tool(
            "browser_wait",
            "Wait for a page to finish updating.",
            json!({ "seconds": { "type": "number", "description": "Between 0.5 and 10." } }),
            &["seconds"],
        ),
        tool(
            "browser_screenshot",
            "Capture a PNG visual screenshot of the current page or a specific element reference so multimodal models can inspect the UI directly.",
            json!({
                "ref": { "type": "string", "description": "Optional element reference like \"e3\" to highlight/crop." },
                "fullPage": { "type": "boolean", "description": "Capture the full document height instead of the current viewport." }
            }),
            &[],
        ),
        tool(
            "browser_console_errors",
            "Read JavaScript console errors, uncaught exceptions, unhandled promise rejections and optional warnings from the active page.",
            json!({
                "includeWarnings": { "type": "boolean", "description": "Also include console.warn entries." },
                "clear": { "type": "boolean", "description": "Clear the buffered console errors after reading." }
            }),
            &[],
        ),
        tool(
            "browser_network_errors",
            "Read failed XHR and fetch network requests (HTTP 4xx/5xx or connection failures) recorded on the active page.",
            json!({
                "clear": { "type": "boolean", "description": "Clear the buffered network failures after reading." }
            }),
            &[],
        ),
        tool(
            "browser_tabs",
            "List, open, select or close browser tabs in the Kana Globe pane.",
            json!({
                "action": { "type": "string", "enum": ["list", "open", "select", "close"] },
                "tabId": { "type": "string", "description": "Tab identifier (like \"b1\") for select or close." },
                "url": { "type": "string", "description": "Address to open when action is \"open\"." }
            }),
            &["action"],
        ),
        tool(
            "browser_upload_file",
            "Attach a local file to an <input type=\"file\"> element on the page. Sensitive paths (.env, SSH keys) are rejected.",
            json!({
                "ref": element,
                "path": { "type": "string", "description": "Absolute or project-relative path to the file to upload." }
            }),
            &["ref", "path"],
        ),
        tool(
            "browser_set_viewport",
            "Emulate a responsive viewport size (desktop, tablet 768px, mobile 390px or custom dimensions) in the Globe pane.",
            json!({
                "preset": { "type": "string", "enum": ["desktop", "tablet", "mobile"] },
                "width": { "type": "number", "description": "Optional custom viewport width in CSS pixels." },
                "height": { "type": "number", "description": "Optional custom viewport height in CSS pixels." }
            }),
            &[],
        ),
        tool(
            "browser_trace",
            "Start, stop, inspect status or export a timestamped Globe verification trace report (HTML proof of session actions and diagnostics).",
            json!({
                "action": { "type": "string", "enum": ["start", "stop", "status", "export"] }
            }),
            &["action"],
        ),
    ]
}

pub fn is_known_tool(name: &str) -> bool {
    tool_definitions().iter().any(|t| t["name"] == name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn includes_all_multimodal_and_devtools_globe_tools() {
        for expected in [
            "browser_screenshot",
            "browser_console_errors",
            "browser_network_errors",
            "browser_tabs",
            "browser_upload_file",
            "browser_set_viewport",
            "browser_trace",
        ] {
            assert!(is_known_tool(expected), "missing tool {expected}");
        }
    }
}
