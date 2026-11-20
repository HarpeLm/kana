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
    ]
}

pub fn is_known_tool(name: &str) -> bool {
    tool_definitions().iter().any(|t| t["name"] == name)
}
