use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Une conversation de la barre latérale, telle qu'elle est rangée en base.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredConversation {
    pub id: String,
    pub title: String,
    pub project: String,
    pub agent_id: String,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub unread: bool,
    #[serde(default)]
    pub archived: bool,
    /// Dernière ouverture (ms).
    #[serde(default)]
    pub opened_at: Option<i64>,
    /// Dossier de travail (worktree git) propre à cette conversation.
    #[serde(default)]
    pub worktree: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    /// Conversation dont celle-ci est une bifurcation.
    #[serde(default)]
    pub forked_from: Option<String>,
    /// Résumé de la conversation d'origine, à glisser dans le premier message d'une bifurcation.
    #[serde(default)]
    pub fork_context: Option<String>,
}

/// Un message d'une conversation.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredMessage {
    pub id: String,
    pub role: String,
    pub text: String,
    #[serde(default)]
    pub thought: String,
    /// Les outils appelés, en JSON : leur forme appartient à l'interface.
    #[serde(default)]
    pub tools: Value,
    #[serde(default)]
    pub started_at: Option<i64>,
    #[serde(default)]
    pub ended_at: Option<i64>,
}

/// Un projet : un dossier de l'ordinateur où les agents travaillent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredProject {
    pub name: String,
    pub path: String,
    /// Dernière utilisation (ms), pour classer les récents.
    #[serde(default)]
    pub last_used: Option<i64>,
}
