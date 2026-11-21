//! Logique métier de Kana partagée entre les interfaces et le backend Tauri.

pub mod cli;
pub mod limits;
pub mod permission;
pub mod relay;
pub mod schedule;
pub mod thread;
pub mod usage;

pub use cli::{
    BenchEvalReport, CliCommand, PublicBenchSuite, PublicBenchTask, advisor_recommendation,
    format_bench_report, format_cli_help, parse_cli_args, run_public_benchmark_harness,
};
pub use limits::{Problem, ProblemKind, detect_problem, reset_time};
pub use permission::{
    PermissionAuditEntry, PermissionChoice, PermissionEvaluation, PermissionMode, PermissionPolicy,
    PermissionRule, PermissionRuleScope, REDACTED_SECRET, auto_answer, auto_answer_with_rules,
    evaluate_permission, is_allowed_globe_url, is_dangerous_title, is_sensitive_path, prompt_for,
    prompt_for_locale, redact_secrets,
};
pub use relay::{DEFAULT_RELAY_ORDER, RelayConfig, pick_target};
pub use schedule::{
    LAUNCHD_DAEMON_LABEL, ScheduledRunRecord, ScheduledTask, interval_seconds, is_task_due,
    launchd_daemon_plist, launchd_plist, next_run_at, within_budget,
};
pub use thread::{ThreadPhase, ThreadState};
pub use usage::{
    DEFAULT_COOLDOWN_MS, DayUsage, KEEP_DAYS, ProviderProblem, UsageStore, day_key,
    estimate_cost_usd_micros, format_cost_usd, format_tokens,
};
