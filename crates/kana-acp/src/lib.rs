//! Client Agent Client Protocol (ACP) : lance un agent de code et dialogue avec lui en JSON-RPC.

mod agents;
mod client;
mod error;
mod event;
mod protocol;
mod reader;

pub use agents::{AgentSpec, preset};
pub use client::AcpClient;
pub use error::AcpError;
pub use event::{AcpEvent, PermissionOption};
