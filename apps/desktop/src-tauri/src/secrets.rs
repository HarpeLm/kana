//! Clés d'API stockées dans le Trousseau du système, jamais dans un fichier.

use keyring::{Entry, Error};

const SERVICE: &str = "kana";

fn entry(agent_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("{agent_id}-api-key")).map_err(|e| e.to_string())
}

pub fn get_api_key(agent_id: &str) -> Option<String> {
    entry(agent_id).ok()?.get_password().ok()
}

pub fn set_api_key(agent_id: &str, key: &str) -> Result<(), String> {
    entry(agent_id)?.set_password(key).map_err(|e| e.to_string())
}

/// Supprime la clé ; ne fait rien si elle n'existe pas.
pub fn delete_api_key(agent_id: &str) -> Result<(), String> {
    match entry(agent_id)?.delete_credential() {
        Ok(()) | Err(Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
