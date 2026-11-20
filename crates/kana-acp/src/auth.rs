use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Méthode de connexion annoncée par un agent dans sa réponse à `initialize`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AuthMethod {
    pub id: String,
    pub name: String,
    pub description: String,
}

impl AuthMethod {
    /// Lit `authMethods` dans le résultat de `initialize`.
    pub(crate) fn list_from(initialize_result: &Value) -> Vec<Self> {
        initialize_result["authMethods"]
            .as_array()
            .map(|list| {
                list.iter()
                    .filter_map(|m| {
                        Some(Self {
                            id: m["id"].as_str()?.to_owned(),
                            name: m["name"].as_str().unwrap_or_default().to_owned(),
                            description: m["description"].as_str().unwrap_or_default().to_owned(),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn reads_methods_and_tolerates_missing_fields() {
        let result = json!({ "authMethods": [
            { "id": "chatgpt", "name": "ChatGPT", "description": "Compte ChatGPT" },
            { "id": "bare" },
            { "name": "sans id" }
        ]});
        let methods = AuthMethod::list_from(&result);
        assert_eq!(methods.len(), 2);
        assert_eq!(methods[0].name, "ChatGPT");
        assert_eq!(methods[1].description, "");
    }

    #[test]
    fn no_methods_gives_an_empty_list() {
        assert!(AuthMethod::list_from(&json!({})).is_empty());
    }
}
