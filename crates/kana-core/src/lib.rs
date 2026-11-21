//! Logique métier de Kana partagée entre les interfaces et le backend Tauri.

pub mod limits;
pub mod permission;
pub mod relay;
pub mod schedule;
pub mod thread;
pub mod usage;

pub use limits::{Problem, ProblemKind, detect_problem, reset_time};
pub use permission::{PermissionChoice, PermissionMode, auto_answer, is_dangerous_title, prompt_for};
pub use relay::{DEFAULT_RELAY_ORDER, RelayConfig, pick_target};
pub use schedule::{
    ScheduledRunRecord, ScheduledTask, interval_seconds, is_task_due, launchd_plist, next_run_at,
    within_budget,
};
pub use thread::{ThreadPhase, ThreadState};
pub use usage::{DEFAULT_COOLDOWN_MS, DayUsage, KEEP_DAYS, ProviderProblem, UsageStore, day_key, format_tokens};
