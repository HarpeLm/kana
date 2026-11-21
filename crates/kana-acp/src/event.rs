//! Événements que le client ACP remonte à l'interface.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PermissionOption {
    pub id: String,
    pub name: String,
    pub kind: String,
}

/// Une étape du plan que l'agent annonce.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PlanEntry {
    pub content: String,
    /// `pending`, `in_progress` ou `completed`.
    pub status: String,
}

/// Une commande slash annoncée par l'agent (`available_commands_update`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct AvailableCommand {
    pub name: String,
    pub description: String,
    pub hint: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AcpEvent {
    /// Morceau de la réponse de l'agent.
    Message { text: String },
    /// Morceau de réflexion de l'agent.
    Thought { text: String },
    /// Création ou mise à jour d'un appel d'outil.
    ToolCall {
        id: String,
        title: Option<String>,
        status: Option<String>,
        /// Ce que l'outil reçoit en paramètre (adresse, élément…), tel que l'agent l'annonce.
        raw_input: Option<Value>,
        /// Résultat de l'outil, en texte, quand l'agent le donne.
        output: Option<String>,
    },
    /// Les jetons que le dernier tour a consommés (annoncés avec la fin du tour).
    TurnUsage {
        input_tokens: u64,
        output_tokens: u64,
        total_tokens: u64,
        cache_read_tokens: u64,
        cache_write_tokens: u64,
    },
    /// L'occupation de la fenêtre de contexte de l'agent : `used` jetons sur `size`.
    Context { used: u64, size: u64 },
    /// Le plan complet de l'agent : chaque mise à jour remplace la précédente.
    Plan { entries: Vec<PlanEntry> },
    /// Les commandes slash proposées par l'agent (`available_commands_update`).
    AvailableCommands { commands: Vec<AvailableCommand> },
    /// L'agent demande l'autorisation d'agir ; répondre avec `resolve_permission`.
    Permission {
        request_id: String,
        title: String,
        options: Vec<PermissionOption>,
    },
    /// Fin du tour de l'agent.
    Done { stop_reason: String },
    Error { message: String },
    /// Le processus de l'agent s'est arrêté.
    Closed,
}

fn string_of(value: &Value) -> Option<String> {
    value.as_str().map(str::to_owned)
}

/// Le texte qu'un outil a produit : `rawOutput` (texte ou objet) sinon le contenu annoncé.
fn tool_output(update: &Value) -> Option<String> {
    let raw = &update["rawOutput"];
    let from_raw = match raw {
        Value::String(text) => Some(text.clone()),
        Value::Object(_) => ["output", "stdout", "text"].iter().find_map(|key| string_of(&raw[key])),
        _ => None,
    };
    let text = from_raw.or_else(|| {
        let parts: Vec<String> = update["content"]
            .as_array()?
            .iter()
            .filter_map(|item| string_of(&item["content"]["text"]))
            .collect();
        (!parts.is_empty()).then(|| parts.join("\n"))
    })?;
    (!text.trim().is_empty()).then_some(text)
}

impl AcpEvent {
    /// Convertit le contenu d'une notification `session/update`.
    /// Renvoie `None` pour les mises à jour que Kana n'affiche pas encore.
    pub fn from_update(update: &Value) -> Option<Self> {
        let text = || string_of(&update["content"]["text"]);
        match update["sessionUpdate"].as_str()? {
            "agent_message_chunk" => text().map(|text| Self::Message { text }),
            "agent_thought_chunk" => text().map(|text| Self::Thought { text }),
            "tool_call" | "tool_call_update" => Some(Self::ToolCall {
                id: string_of(&update["toolCallId"])?,
                title: string_of(&update["title"]),
                status: string_of(&update["status"]),
                raw_input: update.get("rawInput").filter(|v| !v.is_null()).cloned(),
                output: tool_output(update),
            }),
            "usage_update" => Some(Self::Context {
                used: update["used"].as_u64()?,
                size: update["size"].as_u64()?,
            }),
            "plan" => Some(Self::Plan {
                entries: update["entries"]
                    .as_array()?
                    .iter()
                    .filter_map(|e| {
                        Some(PlanEntry {
                            content: string_of(&e["content"])?,
                            status: string_of(&e["status"]).unwrap_or_else(|| "pending".into()),
                        })
                    })
                    .collect(),
            }),
            "available_commands_update" => Some(Self::AvailableCommands {
                commands: update["availableCommands"]
                    .as_array()?
                    .iter()
                    .filter_map(|c| {
                        let name = string_of(&c["name"])?.trim_start_matches('/').trim().to_owned();
                        if name.is_empty() {
                            return None;
                        }
                        Some(AvailableCommand {
                            name,
                            description: string_of(&c["description"]).unwrap_or_default(),
                            hint: string_of(&c["input"]["hint"]),
                        })
                    })
                    .collect(),
            }),
            _ => None,
        }
    }

    /// La consommation d'un tour, lue dans le résultat de `session/prompt` (`usage`), si l'agent la donne.
    pub fn turn_usage(result: &Value) -> Option<Self> {
        let usage = result.get("usage")?;
        let input = usage["inputTokens"].as_u64().unwrap_or(0);
        let output = usage["outputTokens"].as_u64().unwrap_or(0);
        let cache_read = usage["cacheReadTokens"]
            .as_u64()
            .or_else(|| usage["cacheReadInputTokens"].as_u64())
            .or_else(|| usage["cachedTokens"].as_u64())
            .or_else(|| usage["cache_read_tokens"].as_u64())
            .unwrap_or(0);
        let cache_write = usage["cacheWriteTokens"]
            .as_u64()
            .or_else(|| usage["cacheCreationInputTokens"].as_u64())
            .or_else(|| usage["cacheWriteInputTokens"].as_u64())
            .or_else(|| usage["cache_write_tokens"].as_u64())
            .unwrap_or(0);
        let total = usage["totalTokens"].as_u64().unwrap_or(input + output);
        (total > 0 || cache_read > 0 || cache_write > 0).then_some(Self::TurnUsage {
            input_tokens: input,
            output_tokens: output,
            total_tokens: total,
            cache_read_tokens: cache_read,
            cache_write_tokens: cache_write,
        })
    }

    /// Convertit les paramètres d'une requête `session/request_permission`.
    pub fn from_permission_request(request_id: String, params: &Value) -> Self {
        let options = params["options"]
            .as_array()
            .map(|list| {
                list.iter()
                    .filter_map(|o| {
                        Some(PermissionOption {
                            id: string_of(&o["optionId"])?,
                            name: string_of(&o["name"]).unwrap_or_default(),
                            kind: string_of(&o["kind"]).unwrap_or_default(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        Self::Permission {
            request_id,
            title: string_of(&params["toolCall"]["title"]).unwrap_or_else(|| "Action demandée".into()),
            options,
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn message_chunk_becomes_message() {
        let update = json!({
            "sessionUpdate": "agent_message_chunk",
            "content": { "type": "text", "text": "Bonjour" }
        });
        assert_eq!(
            AcpEvent::from_update(&update),
            Some(AcpEvent::Message { text: "Bonjour".into() })
        );
    }

    #[test]
    fn tool_call_update_keeps_optional_fields() {
        let update = json!({
            "sessionUpdate": "tool_call_update",
            "toolCallId": "t1",
            "status": "completed"
        });
        assert_eq!(
            AcpEvent::from_update(&update),
            Some(AcpEvent::ToolCall {
                id: "t1".into(),
                title: None,
                status: Some("completed".into()),
                raw_input: None,
                output: None
            })
        );
    }

    #[test]
    fn tool_output_comes_from_raw_output_or_content() {
        let raw = json!({ "sessionUpdate": "tool_call_update", "toolCallId": "t", "rawOutput": { "output": "ok" } });
        let content = json!({
            "sessionUpdate": "tool_call_update",
            "toolCallId": "t",
            "content": [{ "type": "content", "content": { "type": "text", "text": "fait" } }]
        });
        let output = |update| match AcpEvent::from_update(&update) {
            Some(AcpEvent::ToolCall { output, .. }) => output,
            _ => None,
        };
        assert_eq!(output(raw), Some("ok".into()));
        assert_eq!(output(content), Some("fait".into()));
    }

    #[test]
    fn plan_updates_list_their_entries() {
        let update = json!({
            "sessionUpdate": "plan",
            "entries": [
                { "content": "Lire le code", "status": "completed", "priority": "high" },
                { "content": "Écrire le test" }
            ]
        });
        assert_eq!(
            AcpEvent::from_update(&update),
            Some(AcpEvent::Plan {
                entries: vec![
                    PlanEntry { content: "Lire le code".into(), status: "completed".into() },
                    PlanEntry { content: "Écrire le test".into(), status: "pending".into() },
                ]
            })
        );
    }

    #[test]
    fn usage_is_read_from_updates_and_turn_results() {
        let update = json!({ "sessionUpdate": "usage_update", "used": 29598, "size": 1048576 });
        assert_eq!(AcpEvent::from_update(&update), Some(AcpEvent::Context { used: 29598, size: 1048576 }));
        let result = json!({ "stopReason": "end_turn", "usage": { "inputTokens": 100, "outputTokens": 20 } });
        assert_eq!(
            AcpEvent::turn_usage(&result),
            Some(AcpEvent::TurnUsage {
                input_tokens: 100,
                output_tokens: 20,
                total_tokens: 120,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
            })
        );
        let cached = json!({
            "stopReason": "end_turn",
            "usage": { "inputTokens": 100, "outputTokens": 20, "cacheReadInputTokens": 400, "cacheCreationInputTokens": 50 }
        });
        assert_eq!(
            AcpEvent::turn_usage(&cached),
            Some(AcpEvent::TurnUsage {
                input_tokens: 100,
                output_tokens: 20,
                total_tokens: 120,
                cache_read_tokens: 400,
                cache_write_tokens: 50,
            })
        );
        assert_eq!(AcpEvent::turn_usage(&json!({ "stopReason": "end_turn" })), None);
    }

    #[test]
    fn unknown_updates_are_ignored() {
        assert_eq!(AcpEvent::from_update(&json!({ "sessionUpdate": "future_update" })), None);
        assert_eq!(AcpEvent::from_update(&json!({ "sessionUpdate": "available_commands_update" })), None);
        assert_eq!(AcpEvent::from_update(&json!({})), None);
    }

    #[test]
    fn available_commands_update_lists_slash_commands() {
        let update = json!({
            "sessionUpdate": "available_commands_update",
            "availableCommands": [
                { "name": "web", "description": "Chercher sur le web", "input": { "hint": "requête" } },
                { "name": "/test", "description": "Lancer les tests" }
            ]
        });
        assert_eq!(
            AcpEvent::from_update(&update),
            Some(AcpEvent::AvailableCommands {
                commands: vec![
                    AvailableCommand {
                        name: "web".into(),
                        description: "Chercher sur le web".into(),
                        hint: Some("requête".into()),
                    },
                    AvailableCommand {
                        name: "test".into(),
                        description: "Lancer les tests".into(),
                        hint: None,
                    },
                ]
            })
        );
    }

    #[test]
    fn permission_request_lists_options() {
        let params = json!({
            "toolCall": { "title": "Écrire main.rs" },
            "options": [
                { "optionId": "allow", "name": "Autoriser", "kind": "allow_once" },
                { "optionId": "deny", "name": "Refuser", "kind": "reject_once" }
            ]
        });
        let AcpEvent::Permission { request_id, title, options } =
            AcpEvent::from_permission_request("9".into(), &params)
        else {
            panic!("attendu : Permission");
        };
        assert_eq!(request_id, "9");
        assert_eq!(title, "Écrire main.rs");
        assert_eq!(options.len(), 2);
        assert_eq!(options[0].id, "allow");
    }
}
