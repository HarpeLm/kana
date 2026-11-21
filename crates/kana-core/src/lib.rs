//! Logique métier de Kana partagée entre les interfaces et le backend Tauri.

pub mod limits;
pub mod permission;
pub mod relay;
pub mod schedule;
pub mod thread;
pub mod usage;

pub use limits::{Problem, ProblemKind, detect_problem, reset_time};
pub use permission::{
    PermissionAuditEntry, PermissionChoice, PermissionEvaluation, PermissionMode, PermissionPolicy,
    PermissionRule, PermissionRuleScope, REDACTED_SECRET, auto_answer, auto_answer_with_rules,
    evaluate_permission, is_dangerous_title, is_sensitive_path, prompt_for, prompt_for_locale,
    redact_secrets,
};
pub use relay::{DEFAULT_RELAY_ORDER, RelayConfig, pick_target};
pub use schedule::{
    ScheduledRunRecord, ScheduledTask, interval_seconds, is_task_due, launchd_plist, next_run_at,
    within_budget,
};
pub use thread::{ThreadPhase, ThreadState};
pub use usage::{
    DEFAULT_COOLDOWN_MS, DayUsage, KEEP_DAYS, ProviderProblem, UsageStore, day_key,
    estimate_cost_usd_micros, format_cost_usd, format_tokens,
};
