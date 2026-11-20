//! Serveur MCP local qui donne aux agents des outils pour naviguer dans le navigateur de Kana.

mod rpc;
mod server;
mod tools;

pub use rpc::handle;
pub use server::McpServer;
pub use tools::{ToolDriver, tool_definitions};
