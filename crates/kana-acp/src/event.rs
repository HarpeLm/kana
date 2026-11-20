//! Événements que le client ACP remonte à l'interface.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PermissionOption {
    pub id: String,
    pub name: String,
    pub kind: String,
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
    },
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
            }),
            _ => None,
        }
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
                status: Some("completed".into())
            })
        );
    }

    #[test]
    fn unknown_updates_are_ignored() {
        assert_eq!(AcpEvent::from_update(&json!({ "sessionUpdate": "plan" })), None);
        assert_eq!(AcpEvent::from_update(&json!({})), None);
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
