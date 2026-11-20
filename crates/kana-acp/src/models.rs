//! Les modèles qu'un agent propose, annoncés à la création de la session.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct AgentModels {
    /// Le modèle utilisé par défaut.
    pub current: Option<String>,
    pub available: Vec<ModelInfo>,
    /// Quand l'agent annonce ses modèles comme une option de configuration (`configOptions`),
    /// l'identifiant de cette option : le modèle se change alors avec `session/set_config_option`.
    pub config_id: Option<String>,
}

impl AgentModels {
    /// Lit la réponse de `session/new` : la liste `models`, ou à défaut l'option de configuration
    /// de catégorie `model`. Vide quand l'agent ne propose pas de choix de modèle.
    pub fn from_session(result: &Value) -> Self {
        let legacy = &result["models"];
        if let Some(list) = legacy["availableModels"].as_array() {
            let available = list
                .iter()
                .filter_map(|m| {
                    let id = m["modelId"].as_str()?.to_owned();
                    let name = m["name"].as_str().unwrap_or(&id).to_owned();
                    Some(ModelInfo { id, name })
                })
                .collect();
            return Self { current: legacy["currentModelId"].as_str().map(str::to_owned), available, config_id: None };
        }
        Self::from_config_options(&result["configOptions"]).unwrap_or_default()
    }

    fn from_config_options(options: &Value) -> Option<Self> {
        let option = options.as_array()?.iter().find(|o| o["category"] == "model")?;
        let mut available = Vec::new();
        for entry in option["options"].as_array()? {
            // Les options peuvent être groupées : { group, options: [...] }.
            let group = entry["options"].as_array().map(Vec::as_slice).unwrap_or(std::slice::from_ref(entry));
            for m in group {
                if let Some(id) = m["value"].as_str() {
                    available.push(ModelInfo { id: id.to_owned(), name: m["name"].as_str().unwrap_or(id).to_owned() });
                }
            }
        }
        Some(Self {
            current: option["currentValue"].as_str().map(str::to_owned),
            available,
            config_id: option["id"].as_str().map(str::to_owned),
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn reads_the_models_of_a_new_session() {
        let result = json!({
            "sessionId": "s",
            "models": {
                "currentModelId": "a/x",
                "availableModels": [{ "modelId": "a/x", "name": "X" }, { "modelId": "b/y" }]
            }
        });
        let models = AgentModels::from_session(&result);
        assert_eq!(models.current.as_deref(), Some("a/x"));
        assert_eq!(models.available.len(), 2);
        assert_eq!(models.available[1], ModelInfo { id: "b/y".into(), name: "b/y".into() });
    }

    #[test]
    fn reads_the_model_config_option_flat_or_grouped() {
        let flat = json!({ "configOptions": [
            { "id": "mode", "category": "mode", "options": [] },
            { "id": "model", "category": "model", "currentValue": "m1",
              "options": [{ "value": "m1", "name": "Un" }, { "value": "m2", "name": "Deux" }] }
        ]});
        let models = AgentModels::from_session(&flat);
        assert_eq!(models.config_id.as_deref(), Some("model"));
        assert_eq!(models.current.as_deref(), Some("m1"));
        assert_eq!(models.available.len(), 2);

        let grouped = json!({ "configOptions": [
            { "id": "model", "category": "model", "currentValue": "a",
              "options": [{ "group": "g", "options": [{ "value": "a", "name": "A" }, { "value": "b", "name": "B" }] }] }
        ]});
        assert_eq!(AgentModels::from_session(&grouped).available.len(), 2);
    }

    #[test]
    fn an_agent_without_models_gives_an_empty_list() {
        assert_eq!(AgentModels::from_session(&json!({ "sessionId": "s" })), AgentModels::default());
    }
}
