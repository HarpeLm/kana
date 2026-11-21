//! Suivi quotidien, par session et par projet de l'usage des fournisseurs, coûts et cooldowns.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::limits::{Problem, ProblemKind};

/// Cooldown par défaut (1 heure) appliqué quand un message de limite n'annonce pas d'heure de reprise.
pub const DEFAULT_COOLDOWN_MS: i64 = 60 * 60 * 1_000;

/// Nombre maximal de jours conservés dans l'historique d'usage.
pub const KEEP_DAYS: usize = 14;

/// Consommation agrégée (fournisseur, session ou projet).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayUsage {
    pub turns: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub total_tokens: u64,
    #[serde(default)]
    pub cache_read_tokens: u64,
    #[serde(default)]
    pub cache_write_tokens: u64,
    /// Coût estimé en micro-dollars (`1_000_000` = `1.00 $`).
    #[serde(default)]
    pub cost_usd_micros: u64,
}

#[derive(Debug, Clone, Copy)]
struct ModelRatesMicrosPerMillion {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
}

fn model_rates(agent: &str, model_id: Option<&str>) -> ModelRatesMicrosPerMillion {
    let a = agent.trim().to_ascii_lowercase();
    let m = model_id.unwrap_or("").trim().to_ascii_lowercase();

    if m.contains("free") {
        return ModelRatesMicrosPerMillion { input: 0, output: 0, cache_read: 0, cache_write: 0 };
    }
    if a == "claude" || m.contains("claude") {
        if m.contains("haiku") {
            return ModelRatesMicrosPerMillion {
                input: 800_000,
                output: 4_000_000,
                cache_read: 80_000,
                cache_write: 1_000_000,
            };
        }
        if m.contains("opus") {
            return ModelRatesMicrosPerMillion {
                input: 15_000_000,
                output: 75_000_000,
                cache_read: 1_500_000,
                cache_write: 18_750_000,
            };
        }
        return ModelRatesMicrosPerMillion {
            input: 3_000_000,
            output: 15_000_000,
            cache_read: 300_000,
            cache_write: 3_750_000,
        };
    }
    if a == "codex" || m.contains("gpt") || m.contains("codex") || m.contains("o1") || m.contains("o3") || m.contains("o4") {
        if m.contains("mini") || m.contains("nano") {
            return ModelRatesMicrosPerMillion {
                input: 400_000,
                output: 1_600_000,
                cache_read: 100_000,
                cache_write: 400_000,
            };
        }
        if m.contains("o1") || m.contains("o3") || m.contains("o4") {
            return ModelRatesMicrosPerMillion {
                input: 10_000_000,
                output: 40_000_000,
                cache_read: 2_500_000,
                cache_write: 10_000_000,
            };
        }
        return ModelRatesMicrosPerMillion {
            input: 2_500_000,
            output: 10_000_000,
            cache_read: 625_000,
            cache_write: 2_500_000,
        };
    }
    if a == "gemini" || m.contains("gemini") {
        if m.contains("flash") {
            return ModelRatesMicrosPerMillion {
                input: 150_000,
                output: 600_000,
                cache_read: 37_500,
                cache_write: 150_000,
            };
        }
        return ModelRatesMicrosPerMillion {
            input: 1_250_000,
            output: 5_000_000,
            cache_read: 312_500,
            cache_write: 1_250_000,
        };
    }
    if a == "opencode" {
        return ModelRatesMicrosPerMillion {
            input: 500_000,
            output: 1_500_000,
            cache_read: 125_000,
            cache_write: 500_000,
        };
    }
    ModelRatesMicrosPerMillion {
        input: 2_000_000,
        output: 8_000_000,
        cache_read: 500_000,
        cache_write: 2_000_000,
    }
}

/// Estime le coût en micro-dollars (`1_000_000` = `1.00 $`) selon fournisseur/modèle et jetons.
pub fn estimate_cost_usd_micros(
    agent: &str,
    model_id: Option<&str>,
    input_tokens: u64,
    output_tokens: u64,
    cache_read_tokens: u64,
    cache_write_tokens: u64,
) -> u64 {
    let rates = model_rates(agent, model_id);
    let total_scaled: u128 = u128::from(input_tokens) * u128::from(rates.input)
        + u128::from(output_tokens) * u128::from(rates.output)
        + u128::from(cache_read_tokens) * u128::from(rates.cache_read)
        + u128::from(cache_write_tokens) * u128::from(rates.cache_write);
    ((total_scaled + 500_000) / 1_000_000) as u64
}

/// Formate un coût en micro-dollars sous forme lisible (`$0.00`, `$0.0042`, `$1.25`).
pub fn format_cost_usd(micros: u64) -> String {
    let usd = (micros as f64) / 1_000_000.0;
    if micros == 0 {
        "$0.00".into()
    } else if usd < 0.01 {
        format!("${usd:.4}")
    } else {
        format!("${usd:.2}")
    }
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

/// Stockage en mémoire/sérialisable des compteurs journaliers, sessions, projets et pannes fournisseurs.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct UsageStore {
    #[serde(default)]
    pub days: BTreeMap<String, BTreeMap<String, DayUsage>>,
    #[serde(default)]
    pub sessions: BTreeMap<String, DayUsage>,
    #[serde(default)]
    pub projects: BTreeMap<String, DayUsage>,
    #[serde(default)]
    pub problems: BTreeMap<String, ProviderProblem>,
}

fn add_tokens(
    entry: &mut DayUsage,
    input: u64,
    output: u64,
    total: u64,
    cache_read: u64,
    cache_write: u64,
    cost_micros: u64,
) {
    entry.input_tokens += input;
    entry.output_tokens += output;
    entry.total_tokens += total;
    entry.cache_read_tokens += cache_read;
    entry.cache_write_tokens += cache_write;
    entry.cost_usd_micros += cost_micros;
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

    /// Incrémente le nombre de tours en associant éventuellement session et projet.
    pub fn record_turn_in(
        &mut self,
        day: &str,
        agent: &str,
        thread_id: Option<&str>,
        project_path: Option<&str>,
    ) {
        self.record_turn(day, agent);
        if let Some(tid) = thread_id.filter(|s| !s.is_empty()) {
            self.sessions.entry(tid.to_string()).or_default().turns += 1;
        }
        if let Some(proj) = project_path.filter(|s| !s.is_empty() && *s != "none") {
            self.projects.entry(proj.to_string()).or_default().turns += 1;
        }
    }

    /// Ajoute les jetons consommés sur un tour pour `agent` au jour `day` (`YYYY-MM-DD`).
    pub fn record_tokens(&mut self, day: &str, agent: &str, input: u64, output: u64, total: u64) {
        self.record_tokens_detailed(day, agent, None, input, output, total, 0, 0, None, None);
    }

    /// Ajoute les jetons (y compris cache read/write) et le coût estimé par jour, session et projet.
    #[allow(clippy::too_many_arguments)]
    pub fn record_tokens_detailed(
        &mut self,
        day: &str,
        agent: &str,
        model_id: Option<&str>,
        input: u64,
        output: u64,
        total: u64,
        cache_read: u64,
        cache_write: u64,
        thread_id: Option<&str>,
        project_path: Option<&str>,
    ) {
        let cost = estimate_cost_usd_micros(agent, model_id, input, output, cache_read, cache_write);
        add_tokens(self.entry_mut(day, agent), input, output, total, cache_read, cache_write, cost);
        if let Some(tid) = thread_id.filter(|s| !s.is_empty()) {
            let entry = self.sessions.entry(tid.to_string()).or_default();
            add_tokens(entry, input, output, total, cache_read, cache_write, cost);
        }
        if let Some(proj) = project_path.filter(|s| !s.is_empty() && *s != "none") {
            let entry = self.projects.entry(proj.to_string()).or_default();
            add_tokens(entry, input, output, total, cache_read, cache_write, cost);
        }
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

    /// Retourne la consommation cumulée d'une session (`thread_id`).
    pub fn usage_for_session(&self, thread_id: &str) -> DayUsage {
        self.sessions.get(thread_id).copied().unwrap_or_default()
    }

    /// Retourne la consommation cumulée d'un projet (`project_path`).
    pub fn usage_for_project(&self, project_path: &str) -> DayUsage {
        self.projects.get(project_path).copied().unwrap_or_default()
    }

    /// Somme des coûts estimés pour un jour donné (en micro-dollars).
    pub fn total_cost_for_day_micros(&self, day: &str) -> u64 {
        self.days
            .get(day)
            .map(|by_agent| by_agent.values().map(|u| u.cost_usd_micros).sum())
            .unwrap_or(0)
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

        let expected_cost = estimate_cost_usd_micros("claude", None, 100, 50, 0, 0)
            + estimate_cost_usd_micros("claude", None, 20, 30, 0, 0);
        assert_eq!(
            store.usage_for_day("2026-11-21", "claude"),
            DayUsage {
                turns: 1,
                input_tokens: 120,
                output_tokens: 80,
                total_tokens: 200,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                cost_usd_micros: expected_cost,
            }
        );
        assert_eq!(store.usage_for_day("2026-11-21", "codex"), DayUsage::default());
    }

    #[test]
    fn computes_costs_with_cache_tokens_by_session_project_and_day() {
        let mut store = UsageStore::default();
        // Claude Sonnet par défaut : $3/M input, $15/M output, $0.30/M cache_read, $3.75/M cache_write
        let cost = estimate_cost_usd_micros("claude", Some("claude-sonnet-4"), 1_000_000, 100_000, 1_000_000, 200_000);
        // 3_000_000 + 1_500_000 + 300_000 + 750_000 = 5_550_000 micros = $5.55
        assert_eq!(cost, 5_550_000);
        assert_eq!(format_cost_usd(cost), "$5.55");
        assert_eq!(format_cost_usd(3_500), "$0.0035");
        assert_eq!(format_cost_usd(0), "$0.00");

        store.record_tokens_detailed(
            "2026-11-21",
            "claude",
            Some("claude-sonnet-4"),
            1_000_000,
            100_000,
            1_100_000,
            1_000_000,
            200_000,
            Some("c1"),
            Some("/tmp/kana"),
        );
        store.record_turn_in("2026-11-21", "claude", Some("c1"), Some("/tmp/kana"));

        let session = store.usage_for_session("c1");
        assert_eq!(session.turns, 1);
        assert_eq!(session.cache_read_tokens, 1_000_000);
        assert_eq!(session.cache_write_tokens, 200_000);
        assert_eq!(session.cost_usd_micros, 5_550_000);
        assert_eq!(store.usage_for_project("/tmp/kana"), session);
        assert_eq!(store.total_cost_for_day_micros("2026-11-21"), 5_550_000);

        // Modèle gratuit : coût nul
        assert_eq!(estimate_cost_usd_micros("opencode", Some("opencode/alpha:free"), 10_000, 5_000, 0, 0), 0);
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
    fn serializes_and_deserializes_json_roundtrip_and_legacy_day_usage() {
        let mut store = UsageStore::default();
        store.record_turn("2026-11-21", "claude");
        store.record_tokens("2026-11-21", "claude", 10, 20, 30);
        let json = store.to_json().unwrap();
        assert_eq!(UsageStore::from_json(&json), store);
        assert_eq!(UsageStore::from_json("invalid"), UsageStore::default());

        let legacy = r#"{"days":{"2026-11-21":{"claude":{"turns":2,"inputTokens":100,"outputTokens":40,"totalTokens":140}}},"problems":{}}"#;
        let parsed = UsageStore::from_json(legacy);
        let day = parsed.usage_for_day("2026-11-21", "claude");
        assert_eq!(day.turns, 2);
        assert_eq!(day.cache_read_tokens, 0);
        assert_eq!(day.cost_usd_micros, 0);
    }
}
