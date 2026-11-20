use std::{collections::HashMap, sync::Arc};

use kana_acp::AcpClient;
use tokio::sync::Mutex;

/// Un agent ACP lancé par fil de conversation.
#[derive(Default)]
pub struct AgentSessions(Mutex<HashMap<String, Arc<AcpClient>>>);

impl AgentSessions {
    pub async fn get(&self, thread_id: &str) -> Option<Arc<AcpClient>> {
        self.0.lock().await.get(thread_id).cloned()
    }

    pub async fn insert(&self, thread_id: String, client: Arc<AcpClient>) {
        self.0.lock().await.insert(thread_id, client);
    }

    pub async fn remove(&self, thread_id: &str) {
        self.0.lock().await.remove(thread_id);
    }
}
