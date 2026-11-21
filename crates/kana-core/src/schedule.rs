//! Logique métier des tâches planifiées : calcul d'échéance, budget max et génération `launchd`.

use serde::{Deserialize, Serialize};

const MINUTE_MS: i64 = 60 * 1_000;
const HOUR_MS: i64 = 60 * MINUTE_MS;
const DAY_MS: i64 = 24 * HOUR_MS;

/// Définition d'une tâche planifiée exécutée périodiquement par Kana ou `launchd`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledTask {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub project_path: String,
    pub agent_id: String,
    pub interval: String,
    pub max_tokens_budget: u64,
    pub enabled: bool,
    pub last_run_at: Option<i64>,
    pub last_status: Option<String>,
}

/// Entrée d'historique d'une exécution planifiée.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledRunRecord {
    pub id: String,
    pub task_id: String,
    pub ran_at: i64,
    pub status: String,
    pub tokens_used: u64,
    pub summary: String,
}

enum ScheduleSpec {
    FixedMs(i64),
    Daily { hour: u32, minute: u32 },
}

fn parse_schedule(interval: &str) -> ScheduleSpec {
    let trimmed = interval.trim();
    if let Some(rest) = trimmed.strip_prefix("daily:")
        && let Some((h, m)) = rest.split_once(':')
        && let (Ok(hour), Ok(minute)) = (h.parse::<u32>(), m.parse::<u32>())
        && hour < 24
        && minute < 60
    {
        return ScheduleSpec::Daily { hour, minute };
    }
    if let Some(mins) = trimmed.strip_suffix('m')
        && let Ok(n) = mins.parse::<i64>()
        && n > 0
    {
        return ScheduleSpec::FixedMs(n * MINUTE_MS);
    }
    if let Some(hours) = trimmed.strip_suffix('h')
        && let Ok(n) = hours.parse::<i64>()
        && n > 0
    {
        return ScheduleSpec::FixedMs(n * HOUR_MS);
    }
    ScheduleSpec::FixedMs(HOUR_MS)
}

/// Calcule l'horodatage (ms UTC) de la prochaine exécution attendue.
/// Supporte `"15m"`, `"1h"`, `"6h"`, `"24h"` et `"daily:HH:MM"`.
pub fn next_run_at(interval: &str, last_run_at: Option<i64>, now_ms: i64) -> i64 {
    match parse_schedule(interval) {
        ScheduleSpec::FixedMs(step_ms) => match last_run_at {
            Some(last) => last + step_ms,
            None => now_ms,
        },
        ScheduleSpec::Daily { hour, minute } => {
            let offset_ms = (i64::from(hour) * 60 + i64::from(minute)) * MINUTE_MS;
            match last_run_at {
                Some(last) => {
                    let day_start = last - last.rem_euclid(DAY_MS);
                    let candidate = day_start + offset_ms;
                    if last < candidate {
                        candidate
                    } else {
                        candidate + DAY_MS
                    }
                }
                None => {
                    let day_start = now_ms - now_ms.rem_euclid(DAY_MS);
                    let today = day_start + offset_ms;
                    if now_ms <= today {
                        today
                    } else {
                        today + DAY_MS
                    }
                }
            }
        }
    }
}

/// Indique si une tâche planifiée est active et arrivée à échéance à l'instant `now_ms`.
pub fn is_task_due(task: &ScheduledTask, now_ms: i64) -> bool {
    task.enabled && next_run_at(&task.interval, task.last_run_at, now_ms) <= now_ms
}

/// Vérifie que la consommation de jetons respecte le budget maximal autorisé.
pub fn within_budget(tokens_used: u64, max_budget: u64) -> bool {
    tokens_used <= max_budget
}

/// Durée en secondes correspondante pour un `StartInterval` macOS `launchd`.
pub fn interval_seconds(interval: &str) -> u32 {
    match parse_schedule(interval) {
        ScheduleSpec::FixedMs(ms) => (ms / 1_000).clamp(1, i64::from(u32::MAX)) as u32,
        ScheduleSpec::Daily { .. } => 86_400,
    }
}

fn escape_xml(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for ch in raw.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(ch),
        }
    }
    out
}

/// Étiquette système macOS `launchd` du daemon Kana exécutant les tâches planifiées en arrière-plan.
pub const LAUNCHD_DAEMON_LABEL: &str = "dev.kana.daemon";

/// Génère un fichier `.plist` macOS `LaunchAgents` complet pour le daemon Kana (`kana daemon --once`).
pub fn launchd_daemon_plist(binary_path: &str, home_dir: &str, interval_secs: u32) -> String {
    let label = escape_xml(LAUNCHD_DAEMON_LABEL);
    let binary = escape_xml(binary_path);
    let home = home_dir.trim_end_matches('/');
    let stdout_path = escape_xml(&format!("{home}/.kana/daemon.log"));
    let stderr_path = escape_xml(&format!("{home}/.kana/daemon.err.log"));
    let interval = interval_secs.max(60);
    let path_env = escape_xml("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin");
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\">\n\
         <dict>\n\
         \t<key>Label</key>\n\
         \t<string>{label}</string>\n\
         \t<key>ProgramArguments</key>\n\
         \t<array>\n\
         \t\t<string>{binary}</string>\n\
         \t\t<string>daemon</string>\n\
         \t\t<string>--once</string>\n\
         \t</array>\n\
         \t<key>StartInterval</key>\n\
         \t<integer>{interval}</integer>\n\
         \t<key>RunAtLoad</key>\n\
         \t<true/>\n\
         \t<key>StandardOutPath</key>\n\
         \t<string>{stdout_path}</string>\n\
         \t<key>StandardErrorPath</key>\n\
         \t<string>{stderr_path}</string>\n\
         \t<key>EnvironmentVariables</key>\n\
         \t<dict>\n\
         \t\t<key>PATH</key>\n\
         \t\t<string>{path_env}</string>\n\
         \t</dict>\n\
         </dict>\n\
         </plist>\n"
    )
}

/// Génère un fichier `.plist` macOS `LaunchAgents` valide avec échappement XML propre.
pub fn launchd_plist(label: &str, program: &str, interval_secs: u32) -> String {
    let label = escape_xml(label);
    let program = escape_xml(program);
    let interval = interval_secs.max(1);
    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n\
         <plist version=\"1.0\">\n\
         <dict>\n\
         \t<key>Label</key>\n\
         \t<string>{label}</string>\n\
         \t<key>ProgramArguments</key>\n\
         \t<array>\n\
         \t\t<string>{program}</string>\n\
         \t</array>\n\
         \t<key>StartInterval</key>\n\
         \t<integer>{interval}</integer>\n\
         \t<key>RunAtLoad</key>\n\
         \t<true/>\n\
         </dict>\n\
         </plist>\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_task(interval: &str) -> ScheduledTask {
        ScheduledTask {
            id: "t1".into(),
            title: "Veille CI".into(),
            prompt: "Vérifie les builds".into(),
            project_path: "/tmp/kana".into(),
            agent_id: "claude".into(),
            interval: interval.into(),
            max_tokens_budget: 50_000,
            enabled: true,
            last_run_at: None,
            last_status: None,
        }
    }

    #[test]
    fn computes_next_run_for_fixed_intervals() {
        let base = 1_700_000_000_000;
        assert_eq!(next_run_at("15m", None, base), base);
        assert_eq!(next_run_at("15m", Some(base), base + 1_000), base + 15 * MINUTE_MS);
        assert_eq!(next_run_at("1h", Some(base), base + 1_000), base + HOUR_MS);
        assert_eq!(next_run_at("6h", Some(base), base + 1_000), base + 6 * HOUR_MS);
        assert_eq!(next_run_at("24h", Some(base), base + 1_000), base + DAY_MS);
    }

    #[test]
    fn computes_next_run_for_daily_schedule() {
        // 2026-11-21 00:00:00 UTC en multiple exact de DAY_MS
        let day_start = 20_778 * DAY_MS;
        let at_08_00 = day_start + 8 * HOUR_MS;
        let at_09_00 = day_start + 9 * HOUR_MS;
        let at_10_00 = day_start + 10 * HOUR_MS;

        assert_eq!(next_run_at("daily:09:00", None, at_08_00), at_09_00);
        assert_eq!(next_run_at("daily:09:00", None, at_09_00), at_09_00);
        assert_eq!(next_run_at("daily:09:00", None, at_10_00), at_09_00 + DAY_MS);

        // Exécutée la veille à 09:00 -> prochaine échéance aujourd'hui à 09:00.
        let yesterday_09_00 = at_09_00 - DAY_MS;
        assert_eq!(next_run_at("daily:09:00", Some(yesterday_09_00), at_10_00), at_09_00);
        // Exécutée tôt ce matin à 07:00 -> attend 09:00 aujourd'hui.
        assert_eq!(next_run_at("daily:09:00", Some(day_start + 7 * HOUR_MS), at_08_00), at_09_00);
    }

    #[test]
    fn evaluates_due_state_and_pause() {
        let now = 20_778 * DAY_MS + 10 * HOUR_MS;
        let mut task = sample_task("15m");
        assert!(is_task_due(&task, now));

        task.last_run_at = Some(now - 5 * MINUTE_MS);
        assert!(!is_task_due(&task, now));

        task.last_run_at = Some(now - 15 * MINUTE_MS);
        assert!(is_task_due(&task, now));

        task.enabled = false;
        assert!(!is_task_due(&task, now));
    }

    #[test]
    fn checks_token_budget_bounds() {
        assert!(within_budget(0, 25_000));
        assert!(within_budget(25_000, 25_000));
        assert!(!within_budget(25_001, 25_000));
    }

    #[test]
    fn generates_xml_escaped_launchd_plist() {
        let plist = launchd_plist(
            "com.kana.task&1<test>",
            "/Applications/Kana & Co/bin/kana \"cli\" 'v1'",
            900,
        );
        assert!(plist.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(plist.contains("<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\""));
        assert!(plist.contains("<string>com.kana.task&amp;1&lt;test&gt;</string>"));
        assert!(plist.contains("<string>/Applications/Kana &amp; Co/bin/kana &quot;cli&quot; &apos;v1&apos;</string>"));
        assert!(plist.contains("<integer>900</integer>"));
        assert!(plist.contains("<key>RunAtLoad</key>"));
    }

    #[test]
    fn generates_launchd_daemon_plist_with_logs_env_and_min_interval() {
        let plist = launchd_daemon_plist(
            "/Applications/Kana & Dev.app/Contents/MacOS/Kana",
            "/Users/alice&bob/",
            15,
        );
        assert!(plist.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(plist.contains("<key>Label</key>\n\t<string>dev.kana.daemon</string>"));
        assert!(plist.contains("<string>/Applications/Kana &amp; Dev.app/Contents/MacOS/Kana</string>"));
        assert!(plist.contains("<string>daemon</string>\n\t\t<string>--once</string>"));
        assert!(plist.contains("<key>StartInterval</key>\n\t<integer>60</integer>"));
        assert!(plist.contains("<key>RunAtLoad</key>\n\t<true/>"));
        assert!(plist.contains("<string>/Users/alice&amp;bob/.kana/daemon.log</string>"));
        assert!(plist.contains("<string>/Users/alice&amp;bob/.kana/daemon.err.log</string>"));
        assert!(plist.contains("<key>EnvironmentVariables</key>"));
        assert!(plist.contains("/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"));

        let plist_300 = launchd_daemon_plist("/usr/local/bin/kana", "/Users/alice", 300);
        assert!(plist_300.contains("<integer>300</integer>"));
    }

    #[test]
    fn serializes_task_and_run_record_in_camel_case() {
        let task = sample_task("1h");
        let json = serde_json::to_value(&task).unwrap();
        assert_eq!(json["maxTokensBudget"], 50_000);
        assert_eq!(json["agentId"], "claude");

        let run = ScheduledRunRecord {
            id: "r1".into(),
            task_id: "t1".into(),
            ran_at: 1234,
            status: "ok".into(),
            tokens_used: 1500,
            summary: "RAS".into(),
        };
        let run_json = serde_json::to_value(&run).unwrap();
        assert_eq!(run_json["taskId"], "t1");
        assert_eq!(run_json["tokensUsed"], 1500);
    }
}
