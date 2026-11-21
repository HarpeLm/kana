//! Stockage local de Kana : conversations et messages dans une base SQLite.

mod model;
mod store;

pub use model::{StoredConversation, StoredMessage, StoredMessageHit, StoredProject};
pub use store::{Store, StoreError};
