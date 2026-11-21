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

/// Empêche la mise en veille de l'ordinateur via `caffeinate` (macOS) tant que la session reste active.
#[derive(Default)]
pub struct KeepAwake(std::sync::Mutex<Option<std::process::Child>>);

impl KeepAwake {
    pub fn set(&self, active: bool) -> Result<bool, String> {
        let mut guard = self
            .0
            .lock()
            .map_err(|_| "verrou KeepAwake corrompu".to_string())?;
        if active {
            if let Some(child) = guard.as_mut() {
                if matches!(child.try_wait(), Ok(None)) {
                    return Ok(true);
                }
                *guard = None;
            }
            if cfg!(target_os = "macos") {
                let pid = std::process::id().to_string();
                let child = std::process::Command::new("caffeinate")
                    .args(["-di", "-w", &pid])
                    .stdin(std::process::Stdio::null())
                    .stdout(std::process::Stdio::null())
                    .stderr(std::process::Stdio::null())
                    .spawn()
                    .map_err(|e| format!("impossible de lancer caffeinate : {e}"))?;
                *guard = Some(child);
                return Ok(true);
            }
            return Ok(false);
        }
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
        Ok(false)
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        let slot = match self.0.get_mut() {
            Ok(slot) => slot,
            Err(poisoned) => poisoned.into_inner(),
        };
        if let Some(mut child) = slot.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keep_awake_toggles_active_and_inactive() {
        let awake = KeepAwake::default();
        let active = awake.set(true).expect("set(true) should succeed");
        if cfg!(target_os = "macos") {
            assert!(active);
            assert_eq!(awake.set(true), Ok(true));
        } else {
            assert!(!active);
        }
        assert_eq!(awake.set(false), Ok(false));
        assert_eq!(awake.set(false), Ok(false));
    }
}
