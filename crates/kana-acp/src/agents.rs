//! Commandes de lancement des agents compatibles ACP.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSpec {
    pub command: String,
    pub args: Vec<String>,
    /// Variables d'environnement ajoutées au processus (clés d'API, par exemple).
    #[serde(default)]
    pub env: Vec<(String, String)>,
}

impl AgentSpec {
    pub fn new(command: &str, args: &[&str]) -> Self {
        Self {
            command: command.into(),
            args: args.iter().map(|a| (*a).into()).collect(),
            env: Vec::new(),
        }
    }

    pub fn with_env(mut self, name: &str, value: &str) -> Self {
        self.env.push((name.into(), value.into()));
        self
    }
}

/// Variable d'environnement où l'agent lit sa clé d'API, si il en accepte une.
pub fn api_key_env(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "claude" => Some("ANTHROPIC_API_KEY"),
        "codex" => Some("OPENAI_API_KEY"),
        "gemini" => Some("GEMINI_API_KEY"),
        _ => None,
    }
}

/// Commande par défaut d'un agent connu (`opencode`, `codex`, `claude`, `gemini`).
/// Codex et Claude passent par les adaptateurs ACP publiés par Zed.
pub fn preset(agent_id: &str) -> Option<AgentSpec> {
    match agent_id {
        "opencode" => Some(AgentSpec::new("opencode", &["acp"])),
        "codex" => Some(AgentSpec::new("npx", &["-y", "@zed-industries/codex-acp"])),
        "claude" => Some(AgentSpec::new("npx", &["-y", "@zed-industries/claude-agent-acp"])),
        "gemini" => Some(AgentSpec::new("npx", &["-y", "@google/gemini-cli", "--experimental-acp"])),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_agents_have_a_preset() {
        for id in ["opencode", "codex", "claude", "gemini"] {
            assert!(preset(id).is_some(), "{id}");
        }
    }

    #[test]
    fn unknown_agent_has_no_preset() {
        assert_eq!(preset("inconnu"), None);
    }

    #[test]
    fn api_key_variables_match_each_provider() {
        assert_eq!(api_key_env("codex"), Some("OPENAI_API_KEY"));
        assert_eq!(api_key_env("opencode"), None);
    }

    #[test]
    fn with_env_appends_a_variable() {
        let spec = AgentSpec::new("x", &[]).with_env("A", "1");
        assert_eq!(spec.env, vec![("A".to_string(), "1".to_string())]);
    }
}
