use std::{collections::HashMap, sync::Mutex};

use kana_pty::PtySession;

/// Les terminaux ouverts, par identifiant.
#[derive(Default)]
pub struct Terminals(Mutex<HashMap<String, PtySession>>);

impl Terminals {
    pub fn contains(&self, id: &str) -> bool {
        self.0.lock().unwrap().contains_key(id)
    }

    pub fn insert(&self, id: String, session: PtySession) {
        self.0.lock().unwrap().insert(id, session);
    }

    /// Retire un terminal ; le lâcher arrête son programme.
    pub fn remove(&self, id: &str) {
        self.0.lock().unwrap().remove(id);
    }

    /// Exécute `action` sur un terminal ouvert ; `None` s'il n'existe pas.
    pub fn with<T>(&self, id: &str, action: impl FnOnce(&mut PtySession) -> T) -> Option<T> {
        self.0.lock().unwrap().get_mut(id).map(action)
    }
}
