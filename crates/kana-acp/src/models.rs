//! Les modèles qu'un agent propose, annoncés à la création de la session.

use serde::Serialize;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
}

/// Le niveau d'effort (de réflexion) que l'agent laisse choisir : une option de configuration de catégorie `thought_level`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EffortInfo {
    pub config_id: String,
    pub current: Option<String>,
    pub options: Vec<ModelInfo>,
}

/// Les modes de travail de l'agent (par exemple « build » et « plan »), annoncés comme option de configuration
/// de catégorie `mode` ou, à l'ancienne, dans `modes`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ModesInfo {
    /// L'option de configuration qui porte le mode ; `None` : ancien protocole (`session/set_mode`).
    pub config_id: Option<String>,
    pub current: Option<String>,
    pub options: Vec<ModelInfo>,
}

impl ModesInfo {
    fn from_session(result: &Value) -> Option<Self> {
        if let Some(option) = result["configOptions"].as_array().and_then(|o| o.iter().find(|o| o["category"] == "mode")) {
            let options: Vec<ModelInfo> = option["options"]
                .as_array()?
                .iter()
                .filter_map(|m| {
                    let id = m["value"].as_str()?.to_owned();
                    Some(ModelInfo { name: m["name"].as_str().unwrap_or(&id).to_owned(), id })
                })
                .collect();
            return Some(Self {
                config_id: option["id"].as_str().map(str::to_owned),
                current: option["currentValue"].as_str().map(str::to_owned),
                options,
            });
        }
        let legacy = &result["modes"];
        let list = legacy["availableModes"].as_array()?;
        Some(Self {
            config_id: None,
            current: legacy["currentModeId"].as_str().map(str::to_owned),
            options: list
                .iter()
                .filter_map(|m| {
                    let id = m["id"].as_str()?.to_owned();
                    Some(ModelInfo { name: m["name"].as_str().unwrap_or(&id).to_owned(), id })
                })
                .collect(),
        })
    }

    /// Le mode « plan » de l'agent, s'il en a un.
    pub fn plan(&self) -> Option<&ModelInfo> {
        self.options.iter().find(|m| m.id.eq_ignore_ascii_case("plan") || m.id.to_ascii_lowercase().ends_with("#plan") || m.name.eq_ignore_ascii_case("plan"))
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
pub struct AgentModels {
    /// Les modes de travail, quand l'agent en propose (dont un mode « plan » en lecture seule).
    pub modes: Option<ModesInfo>,
    /// Le niveau d'effort, quand l'agent en propose.
    pub effort: Option<EffortInfo>,
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
        let mut models = Self::models_from_session(result);
        models.effort = EffortInfo::from_config_options(&result["configOptions"]);
        models.modes = ModesInfo::from_session(result);
        models
    }

    fn models_from_session(result: &Value) -> Self {
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
            return Self { current: legacy["currentModelId"].as_str().map(str::to_owned), available, config_id: None, effort: None, modes: None };
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
            effort: None,
            modes: None,
        })
    }
}

impl EffortInfo {
    fn from_config_options(options: &Value) -> Option<Self> {
        let option = options.as_array()?.iter().find(|o| o["category"] == "thought_level")?;
        let list = option["options"].as_array()?;
        let options: Vec<ModelInfo> = list
            .iter()
            .filter_map(|m| {
                let id = m["value"].as_str()?.to_owned();
                Some(ModelInfo { name: m["name"].as_str().unwrap_or(&id).to_owned(), id })
            })
            .collect();
        if options.is_empty() {
            return None;
        }
        Some(Self {
            config_id: option["id"].as_str()?.to_owned(),
            current: option["currentValue"].as_str().map(str::to_owned),
            options,
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn finds_the_plan_mode() {
        let result = json!({ "configOptions": [
            { "id": "mode", "category": "mode", "currentValue": "build",
              "options": [{ "value": "build", "name": "Build" }, { "value": "plan", "name": "Plan" }] }
        ]});
        let modes = AgentModels::from_session(&result).modes.unwrap();
        assert_eq!(modes.current.as_deref(), Some("build"));
        assert_eq!(modes.plan().unwrap().id, "plan");
        let legacy = json!({ "modes": { "currentModeId": "default", "availableModes": [{ "id": "default" }, { "id": "plan", "name": "Plan" }] } });
        let modes = AgentModels::from_session(&legacy).modes.unwrap();
        assert!(modes.config_id.is_none());
        assert_eq!(modes.plan().unwrap().id, "plan");
        assert!(AgentModels::from_session(&json!({})).modes.is_none());
    }

    #[test]
    fn reads_the_effort_option() {
        let result = json!({ "configOptions": [
            { "id": "model", "category": "model", "currentValue": "a", "options": [{ "value": "a", "name": "A" }] },
            { "id": "effort", "category": "thought_level", "currentValue": "medium",
              "options": [{ "value": "low", "name": "Low" }, { "value": "medium", "name": "Medium" }] }
        ]});
        let effort = AgentModels::from_session(&result).effort.unwrap();
        assert_eq!(effort.config_id, "effort");
        assert_eq!(effort.current.as_deref(), Some("medium"));
        assert_eq!(effort.options.len(), 2);
        assert!(AgentModels::from_session(&json!({})).effort.is_none());
    }

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
