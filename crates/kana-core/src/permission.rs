//! Moteur de permissions : modes d'approbation, détection d'actions sensibles et consigne Plan.

use serde::{Deserialize, Serialize};

/// Mode de traitement des demandes d'autorisation des agents.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    #[default]
    Ask,
    Plan,
    Auto,
    Full,
}

/// Option proposée par un agent dans une demande d'autorisation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PermissionChoice {
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub kind: String,
}

const PLAN_INSTRUCTION: &str = concat!(
    "Mode plan : ne modifie aucun fichier et ne lance aucune commande qui change quoi que ce soit. ",
    "Étudie d'abord le sujet, propose un plan détaillé, puis attends mon accord avant d'agir.\n\n",
);

const DANGEROUS_WORDS: &[&str] = &[
    "rm", "sudo", "chmod", "chown", "mkfs", "dd", "curl", "wget", "ssh", "scp", "kill", "killall",
    "force",
];

fn is_word_byte(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn contains_word_ci(lower: &str, word: &str) -> bool {
    let bytes = lower.as_bytes();
    let mut start = 0;
    while let Some(pos) = lower[start..].find(word) {
        let abs = start + pos;
        let end = abs + word.len();
        let left_ok = abs == 0 || !is_word_byte(bytes[abs - 1]);
        let right_ok = end == bytes.len() || !is_word_byte(bytes[end]);
        if left_ok && right_ok {
            return true;
        }
        start = abs + 1;
    }
    false
}

fn has_prefix_ws_keyword(lower: &str, head: &str, tails: &[&str]) -> bool {
    let mut start = 0;
    while let Some(pos) = lower[start..].find(head) {
        let after = &lower[start + pos + head.len()..];
        let trimmed = after.trim_start_matches(|c: char| c.is_ascii_whitespace());
        if trimmed.len() < after.len() && tails.iter().any(|t| trimmed.starts_with(t)) {
            return true;
        }
        start += pos + 1;
    }
    false
}

fn has_env_token(lower: &str) -> bool {
    let bytes = lower.as_bytes();
    let mut start = 0;
    while let Some(pos) = lower[start..].find(".env") {
        let end = start + pos + ".env".len();
        if end == bytes.len() || !is_word_byte(bytes[end]) {
            return true;
        }
        start += pos + 1;
    }
    false
}

/// Indique si le titre d'une demande correspond à une action sensible à ne jamais approuver seule.
pub fn is_dangerous_title(title: &str) -> bool {
    let lower = title.to_lowercase();
    DANGEROUS_WORDS.iter().any(|w| contains_word_ci(&lower, w))
        || has_prefix_ws_keyword(&lower, "git", &["push", "reset", "clean"])
        || has_prefix_ws_keyword(&lower, "drop", &["table"])
        || has_env_token(&lower)
        || lower.contains("--force")
        || lower.contains("supprim")
        || lower.contains("delete")
        || lower.contains("password")
        || lower.contains("mot de passe")
        || lower.contains("secret")
        || lower.contains("token")
}

/// Choisit automatiquement une réponse si le mode l'autorise, ou `None` s'il faut demander.
pub fn auto_answer(
    mode: PermissionMode,
    title: &str,
    options: &[PermissionChoice],
) -> Option<String> {
    match mode {
        PermissionMode::Plan => options
            .iter()
            .find(|o| o.kind == "reject_once")
            .or_else(|| options.iter().find(|o| o.kind.starts_with("reject")))
            .map(|o| o.id.clone()),
        PermissionMode::Ask => None,
        PermissionMode::Auto if is_dangerous_title(title) => None,
        PermissionMode::Auto | PermissionMode::Full => options
            .iter()
            .find(|o| o.kind == "allow_once")
            .map(|o| o.id.clone()),
    }
}

/// Préfixe le texte envoyé à l'agent avec la consigne de planification en mode `Plan`.
pub fn prompt_for(mode: PermissionMode, text: &str) -> String {
    match mode {
        PermissionMode::Plan => format!("{PLAN_INSTRUCTION}{text}"),
        PermissionMode::Ask | PermissionMode::Auto | PermissionMode::Full => text.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_options() -> Vec<PermissionChoice> {
        vec![
            PermissionChoice {
                id: "allow".into(),
                name: "Autoriser".into(),
                kind: "allow_once".into(),
            },
            PermissionChoice {
                id: "deny".into(),
                name: "Refuser".into(),
                kind: "reject_once".into(),
            },
        ]
    }

    #[test]
    fn ask_mode_always_prompts_user() {
        assert_eq!(auto_answer(PermissionMode::Ask, "ls -la", &sample_options()), None);
    }

    #[test]
    fn plan_mode_rejects_automatically() {
        let opts = sample_options();
        assert_eq!(auto_answer(PermissionMode::Plan, "edit file", &opts).as_deref(), Some("deny"));
        assert_eq!(auto_answer(PermissionMode::Plan, "edit file", &opts[..1]), None);

        let reject_always = vec![PermissionChoice {
            id: "deny-all".into(),
            name: "Toujours refuser".into(),
            kind: "reject_always".into(),
        }];
        assert_eq!(
            auto_answer(PermissionMode::Plan, "edit file", &reject_always).as_deref(),
            Some("deny-all")
        );
    }

    #[test]
    fn auto_mode_allows_safe_actions_and_blocks_dangerous_ones() {
        let opts = sample_options();
        assert_eq!(auto_answer(PermissionMode::Auto, "ls -la", &opts).as_deref(), Some("allow"));
        assert_eq!(auto_answer(PermissionMode::Auto, "format code", &opts).as_deref(), Some("allow"));
        assert_eq!(auto_answer(PermissionMode::Auto, "read .environment", &opts).as_deref(), Some("allow"));

        for dangerous in [
            "rm -rf build",
            "git push origin main",
            "git   reset --hard",
            "cat .env",
            "DROP TABLE users",
            "Afficher le mot de passe",
            "Supprimer le fichier",
            "curl https://example.com",
        ] {
            assert!(is_dangerous_title(dangerous), "expected dangerous: {dangerous}");
            assert_eq!(auto_answer(PermissionMode::Auto, dangerous, &opts), None);
        }
    }

    #[test]
    fn full_mode_allows_everything_once() {
        assert_eq!(
            auto_answer(PermissionMode::Full, "rm -rf build", &sample_options()).as_deref(),
            Some("allow")
        );
    }

    #[test]
    fn prompt_for_prepends_plan_instruction_only_in_plan_mode() {
        let plan_prompt = prompt_for(PermissionMode::Plan, "fais x");
        assert!(plan_prompt.starts_with("Mode plan :"));
        assert!(plan_prompt.ends_with("\n\nfais x"));
        assert_eq!(prompt_for(PermissionMode::Ask, "fais x"), "fais x");
        assert_eq!(prompt_for(PermissionMode::Auto, "fais x"), "fais x");
        assert_eq!(prompt_for(PermissionMode::Full, "fais x"), "fais x");
    }
}
