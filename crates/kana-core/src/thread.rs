//! Machine à états d'un fil de conversation et de sa file d'attente de messages.

use serde::{Deserialize, Serialize};

/// Phase courante d'exécution d'un fil de conversation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThreadPhase {
    #[default]
    Idle,
    Running,
    AwaitingPermission,
    Failed,
}

/// État d'un fil : phase courante, file d'attente, permissions en suspens et dernière erreur.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ThreadState {
    #[serde(default)]
    pub phase: ThreadPhase,
    #[serde(default)]
    pub queued: Vec<String>,
    #[serde(default)]
    pub pending_permissions: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
}

impl ThreadState {
    /// Indique si l'agent est occupé (en cours d'exécution ou en attente d'autorisation).
    pub fn is_busy(&self) -> bool {
        matches!(self.phase, ThreadPhase::Running | ThreadPhase::AwaitingPermission)
    }

    /// Ajoute un message non vide en fin de file d'attente.
    pub fn enqueue(&mut self, text: &str) -> bool {
        if text.trim().is_empty() {
            return false;
        }
        self.queued.push(text.to_string());
        true
    }

    /// Retire et renvoie le message en file d'attente à l'indice `index`.
    pub fn remove_queued(&mut self, index: usize) -> Option<String> {
        if index >= self.queued.len() {
            return None;
        }
        Some(self.queued.remove(index))
    }

    /// Remonte le message à l'indice `index` en tête de file pour un envoi prioritaire (*steering*).
    pub fn prioritize_queued(&mut self, index: usize) -> bool {
        if index == 0 || index >= self.queued.len() {
            return false;
        }
        self.queued[..=index].rotate_right(1);
        true
    }

    /// Dépile le prochain message en attente si le fil n'est plus occupé.
    pub fn take_next_queued(&mut self) -> Option<String> {
        if self.is_busy() || self.queued.is_empty() {
            return None;
        }
        Some(self.queued.remove(0))
    }

    /// Démarre un nouveau tour d'agent.
    pub fn start_turn(&mut self) {
        self.phase = ThreadPhase::Running;
        self.last_error = None;
        self.pending_permissions.clear();
    }

    /// Enregistre une demande d'autorisation en attente et bascule en `AwaitingPermission`.
    pub fn request_permission(&mut self, request_id: impl Into<String>) {
        let id = request_id.into();
        if !self.pending_permissions.iter().any(|existing| existing == &id) {
            self.pending_permissions.push(id);
        }
        self.phase = ThreadPhase::AwaitingPermission;
    }

    /// Résout une demande d'autorisation et repasse en `Running` s'il n'en reste plus.
    pub fn resolve_permission(&mut self, request_id: &str) {
        self.pending_permissions.retain(|id| id != request_id);
        if self.pending_permissions.is_empty() && self.phase == ThreadPhase::AwaitingPermission {
            self.phase = ThreadPhase::Running;
        }
    }

    /// Clôt normalement le tour en cours et ramène le fil à `Idle`.
    pub fn finish_turn(&mut self) {
        self.phase = ThreadPhase::Idle;
        self.pending_permissions.clear();
        self.last_error = None;
    }

    /// Clôt le tour sur une erreur et bascule le fil en `Failed`.
    pub fn fail_turn(&mut self, message: impl Into<String>) {
        self.phase = ThreadPhase::Failed;
        self.pending_permissions.clear();
        self.last_error = Some(message.into());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manages_queue_removal_and_prioritization() {
        let mut state = ThreadState::default();
        assert!(!state.enqueue("   "));
        assert!(state.enqueue("premier"));
        assert!(state.enqueue("deuxième"));
        assert!(state.enqueue("troisième"));

        assert!(!state.prioritize_queued(0));
        assert!(!state.prioritize_queued(99));
        assert!(state.prioritize_queued(2));
        assert_eq!(state.queued, vec!["troisième", "premier", "deuxième"]);

        assert_eq!(state.remove_queued(1).as_deref(), Some("premier"));
        assert_eq!(state.remove_queued(99), None);
        assert_eq!(state.queued, vec!["troisième", "deuxième"]);
    }

    #[test]
    fn transitions_across_idle_running_permission_and_failed_phases() {
        let mut state = ThreadState::default();
        assert_eq!(state.phase, ThreadPhase::Idle);
        assert!(!state.is_busy());

        state.start_turn();
        assert_eq!(state.phase, ThreadPhase::Running);
        assert!(state.is_busy());

        state.request_permission("req-1");
        state.request_permission("req-2");
        assert_eq!(state.phase, ThreadPhase::AwaitingPermission);
        assert!(state.is_busy());

        state.resolve_permission("req-1");
        assert_eq!(state.phase, ThreadPhase::AwaitingPermission);
        state.resolve_permission("req-2");
        assert_eq!(state.phase, ThreadPhase::Running);

        state.fail_turn("network error");
        assert_eq!(state.phase, ThreadPhase::Failed);
        assert!(!state.is_busy());
        assert_eq!(state.last_error.as_deref(), Some("network error"));

        state.start_turn();
        assert_eq!(state.phase, ThreadPhase::Running);
        assert_eq!(state.last_error, None);

        state.finish_turn();
        assert_eq!(state.phase, ThreadPhase::Idle);
        assert!(!state.is_busy());
    }
}
