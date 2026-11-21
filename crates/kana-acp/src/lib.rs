//! Client Agent Client Protocol (ACP) : lance un agent de code et dialogue avec lui en JSON-RPC.

mod agents;
mod auth;
mod client;
mod error;
mod event;
mod mcp;
mod models;
mod protocol;
mod reader;

pub use agents::{
    AgentSpec, ExecutionTarget, SandboxPolicy, api_key_env, bwrap_args, effective_command, preset,
    seatbelt_profile,
};
pub use auth::AuthMethod;
pub use client::AcpClient;
pub use error::AcpError;
pub use event::{AcpEvent, AvailableCommand, PermissionOption, PlanEntry};
pub use mcp::McpServerConfig;
pub use models::{AgentModels, EffortInfo, ModelInfo, ModesInfo};
