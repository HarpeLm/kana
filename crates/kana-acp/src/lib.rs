//! Client Agent Client Protocol (ACP) : lance un agent de code et dialogue avec lui en JSON-RPC.

mod agents;
mod auth;
mod client;
mod error;
mod event;
mod mcp;
mod protocol;
mod reader;

pub use agents::{AgentSpec, api_key_env, preset};
pub use auth::AuthMethod;
pub use client::AcpClient;
pub use error::AcpError;
pub use event::{AcpEvent, PermissionOption};
pub use mcp::McpServerConfig;
