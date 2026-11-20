//! Commandes de lancement des agents compatibles ACP.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSpec {
    pub command: String,
    pub args: Vec<String>,
}

impl AgentSpec {
    fn new(command: &str, args: &[&str]) -> Self {
        Self {
            command: command.into(),
            args: args.iter().map(|a| (*a).into()).collect(),
        }
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
}
