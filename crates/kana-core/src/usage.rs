//! Suivi quotidien de l'usage des fournisseurs et état de santé / cooldowns.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::limits::{Problem, ProblemKind};

/// Cooldown par défaut (1 heure) appliqué quand un message de limite n'annonce pas d'heure de reprise.
pub const DEFAULT_COOLDOWN_MS: i64 = 60 * 60 * 1_000;

/// Nombre maximal de jours conservés dans l'historique d'usage.
pub const KEEP_DAYS: usize = 14;

/// Consommation agrégée d'un fournisseur sur une journée.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    pub turns: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
}

/// Incident enregistré pour un fournisseur donné.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderProblem {
    pub kind: ProblemKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<i64>,
    pub message: String,
    pub at: i64,
}

/// Stockage en mémoire/sérialisable des compteurs journaliers et pannes fournisseurs.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct UsageStore {
    #[serde(default)]
    pub days: BTreeMap<String, BTreeMap<String, DayUsage>>,
    #[serde(default)]
    pub problems: BTreeMap<String, ProviderProblem>,
}

impl UsageStore {
    /// Charge un magasin d'usage depuis JSON (ou renvoie un magasin vide si le JSON est invalide).
    pub fn from_json(raw: &str) -> Self {
        serde_json::from_str(raw).unwrap_or_default()
    }

    /// Sérialise le magasin d'usage en JSON.
    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string(self)
    }

    fn prune_days(&mut self) {
        while self.days.len() > KEEP_DAYS {
            let Some(oldest) = self.days.keys().next().cloned() else {
                break;
            };
            self.days.remove(&oldest);
        }
    }

    fn entry_mut(&mut self, day: &str, agent: &str) -> &mut DayUsage {
        self.days
            .entry(day.to_string())
            .or_default()
            .entry(agent.to_string())
            .or_default()
    }

    /// Incrémente le nombre de tours terminés pour `agent` au jour `day` (`YYYY-MM-DD`).
    pub fn record_turn(&mut self, day: &str, agent: &str) {
        self.entry_mut(day, agent).turns += 1;
        self.prune_days();
    }

    /// Ajoute les jetons consommés sur un tour pour `agent` au jour `day` (`YYYY-MM-DD`).
    pub fn record_tokens(&mut self, day: &str, agent: &str, input: u64, output: u64, total: u64) {
        let entry = self.entry_mut(day, agent);
        entry.input_tokens += input;
        entry.output_tokens += output;
        entry.total_tokens += total;
        self.prune_days();
    }

    /// Retourne la consommation enregistrée pour `agent` au jour `day`.
    pub fn usage_for_day(&self, day: &str, agent: &str) -> DayUsage {
        self.days
            .get(day)
            .and_then(|by_agent| by_agent.get(agent))
            .copied()
            .unwrap_or_default()
    }

    /// Enregistre une panne pour `agent` (cooldown 1 h par défaut pour une limite sans heure connue).
    pub fn mark_problem(&mut self, agent: &str, problem: Problem, message: &str, now_ms: i64) {
        let until = match problem.kind {
            ProblemKind::Limit => Some(problem.until.unwrap_or(now_ms + DEFAULT_COOLDOWN_MS)),
            ProblemKind::Auth => None,
        };
        let truncated: String = message.chars().take(300).collect();
        self.problems.insert(
            agent.to_string(),
            ProviderProblem {
                kind: problem.kind,
                until,
                message: truncated,
                at: now_ms,
            },
        );
    }

    /// Efface l'incident en cours d'un fournisseur.
    pub fn clear_problem(&mut self, agent: &str) {
        self.problems.remove(agent);
    }

    /// Retourne l'incident actif d'un fournisseur à l'instant `now_ms`, ou `None` s'il a expiré.
    pub fn problem_of(&self, agent: &str, now_ms: i64) -> Option<&ProviderProblem> {
        let problem = self.problems.get(agent)?;
        if problem.kind == ProblemKind::Limit
            && let Some(until) = problem.until
            && until <= now_ms
        {
            return None;
        }
        Some(problem)
    }
}

/// Convertit un horodatage en millisecondes UTC en clé journalière `YYYY-MM-DD`.
pub fn day_key(at_ms: i64) -> String {
    let z = at_ms.div_euclid(86_400_000) + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = y + if m <= 2 { 1 } else { 0 };
    format!("{y:04}-{m:02}-{d:02}")
}

/// Formate un nombre de jetons de manière lisible (« 12,3 k », « 1,2 M »).
pub fn format_tokens(n: u64) -> String {
    if n >= 1_000_000 {
        format!("{:.1} M", (n as f64) / 1_000_000.0).replace('.', ",")
    } else if n >= 1_000 {
        format!("{:.1} k", (n as f64) / 1_000.0).replace('.', ",")
    } else {
        n.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn records_turns_and_tokens_per_day() {
        let mut store = UsageStore::default();
        store.record_turn("2026-11-21", "claude");
        store.record_tokens("2026-11-21", "claude", 100, 50, 150);
        store.record_tokens("2026-11-21", "claude", 20, 30, 50);

        assert_eq!(
            store.usage_for_day("2026-11-21", "claude"),
            DayUsage {
                turns: 1,
                input_tokens: 120,
                output_tokens: 80,
                total_tokens: 200,
            }
        );
        assert_eq!(store.usage_for_day("2026-11-21", "codex"), DayUsage::default());
    }

    #[test]
    fn enforces_14_day_retention() {
        let mut store = UsageStore::default();
        for day in 1..=16 {
            let key = format!("2026-11-{day:02}");
            store.record_turn(&key, "claude");
        }
        assert_eq!(store.days.len(), KEEP_DAYS);
        assert!(!store.days.contains_key("2026-11-01"));
        assert!(!store.days.contains_key("2026-11-02"));
        assert!(store.days.contains_key("2026-11-03"));
        assert!(store.days.contains_key("2026-11-16"));
    }

    #[test]
    fn expires_limit_cooldown_after_default_hour_and_respects_explicit_until() {
        let mut store = UsageStore::default();
        let t0 = 1_700_000_000_000;
        store.mark_problem("claude", Problem { kind: ProblemKind::Limit, until: None }, &"x".repeat(400), t0);

        let active = store.problem_of("claude", t0 + DEFAULT_COOLDOWN_MS - 1).unwrap();
        assert_eq!(active.message.len(), 300);
        assert_eq!(active.until, Some(t0 + DEFAULT_COOLDOWN_MS));
        assert_eq!(store.problem_of("claude", t0 + DEFAULT_COOLDOWN_MS), None);

        store.mark_problem(
            "codex",
            Problem { kind: ProblemKind::Auth, until: Some(t0 + 10) },
            "401",
            t0,
        );
        assert!(store.problem_of("codex", t0 + 10_000_000).is_some());
        store.clear_problem("codex");
        assert_eq!(store.problem_of("codex", t0), None);
    }

    #[test]
    fn computes_utc_day_keys_and_formats_tokens() {
        assert_eq!(day_key(0), "1970-01-01");
        // 2024-02-29T12:00:00Z = 19782 days after epoch
        assert_eq!(day_key(19_782 * 86_400_000 + 43_200_000), "2024-02-29");
        assert_eq!(format_tokens(500), "500");
        assert_eq!(format_tokens(12_300), "12,3 k");
        assert_eq!(format_tokens(1_200_000), "1,2 M");
    }

    #[test]
    fn serializes_and_deserializes_json_roundtrip() {
        let mut store = UsageStore::default();
        store.record_turn("2026-11-21", "claude");
        store.record_tokens("2026-11-21", "claude", 10, 20, 30);
        let json = store.to_json().unwrap();
        assert_eq!(UsageStore::from_json(&json), store);
        assert_eq!(UsageStore::from_json("invalid"), UsageStore::default());
    }
}
