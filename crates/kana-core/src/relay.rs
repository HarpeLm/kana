//! Routeur de relais : bascule d'un fournisseur à l'autre quand l'un rencontre un problème.

use serde::{Deserialize, Serialize};

/// Ordre par défaut des fournisseurs du relais.
pub const DEFAULT_RELAY_ORDER: &[&str] = &["claude", "codex", "gemini", "opencode"];

fn default_order() -> Vec<String> {
    DEFAULT_RELAY_ORDER.iter().map(|s| (*s).to_string()).collect()
}

/// Configuration du relais de fournisseurs.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RelayConfig {
    #[serde(default)]
    pub auto: bool,
    #[serde(default = "default_order")]
    pub order: Vec<String>,
    #[serde(default)]
    pub disabled: Vec<String>,
}

impl Default for RelayConfig {
    fn default() -> Self {
        Self {
            auto: false,
            order: default_order(),
            disabled: Vec::new(),
        }
    }
}

impl RelayConfig {
    /// Charge une configuration de relais depuis JSON et complète les fournisseurs manquants.
    pub fn from_json(raw: &str) -> Self {
        serde_json::from_str::<Self>(raw)
            .unwrap_or_default()
            .normalized()
    }

    /// Complète `order` avec les fournisseurs par défaut absents, dans l'ordre standard.
    pub fn normalized(mut self) -> Self {
        for &provider in DEFAULT_RELAY_ORDER {
            if !self.order.iter().any(|p| p == provider) {
                self.order.push(provider.to_string());
            }
        }
        self
    }
}

/// Choisit le prochain fournisseur disponible après `current` dans `relay.order`, en bouclant
/// au début de la liste et en ignorant les fournisseurs désactivés ou en erreur.
pub fn pick_target(
    current: &str,
    relay: &RelayConfig,
    has_problem: impl Fn(&str) -> bool,
) -> Option<String> {
    let (head, tail) = match relay.order.iter().position(|id| id == current) {
        Some(idx) => (&relay.order[idx + 1..], &relay.order[..idx]),
        None => (&relay.order[..], &relay.order[..0]),
    };

    head.iter()
        .chain(tail.iter())
        .find(|id| {
            id.as_str() != current
                && !relay.disabled.iter().any(|d| d == *id)
                && !has_problem(id)
        })
        .cloned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_next_and_wraps_around() {
        let cfg = RelayConfig::default();
        assert_eq!(pick_target("claude", &cfg, |_| false).as_deref(), Some("codex"));
        assert_eq!(pick_target("opencode", &cfg, |_| false).as_deref(), Some("claude"));
    }

    #[test]
    fn skips_disabled_and_broken_providers() {
        let cfg = RelayConfig {
            auto: true,
            order: vec![
                "claude".into(),
                "codex".into(),
                "gemini".into(),
                "opencode".into(),
            ],
            disabled: vec!["codex".into()],
        };
        let target = pick_target("claude", &cfg, |id| id == "gemini");
        assert_eq!(target.as_deref(), Some("opencode"));
    }

    #[test]
    fn returns_none_when_no_healthy_candidate_exists() {
        let cfg = RelayConfig {
            auto: false,
            order: vec!["claude".into(), "codex".into()],
            disabled: vec!["codex".into()],
        };
        assert_eq!(pick_target("claude", &cfg, |_| false), None);

        let all_broken = RelayConfig::default();
        assert_eq!(pick_target("claude", &all_broken, |_| true), None);
    }

    #[test]
    fn picks_from_start_when_current_is_not_in_order() {
        let cfg = RelayConfig::default();
        assert_eq!(pick_target("unknown", &cfg, |id| id == "claude").as_deref(), Some("codex"));
    }

    #[test]
    fn loads_json_and_appends_missing_default_providers() {
        let cfg = RelayConfig::from_json(r#"{"auto":true,"order":["gemini","claude"],"disabled":["opencode"]}"#);
        assert!(cfg.auto);
        assert_eq!(cfg.order, vec!["gemini", "claude", "codex", "opencode"]);
        assert_eq!(cfg.disabled, vec!["opencode"]);
        assert_eq!(RelayConfig::from_json("not json"), RelayConfig::default());
    }
}
