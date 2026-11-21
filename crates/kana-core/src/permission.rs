//! Moteur de permissions : règles granulaires (`allow` / `ask` / `deny`),
//! protection des chemins sensibles, masquage de secrets et consigne Plan.

use serde::{Deserialize, Serialize};

/// Placeholder utilisé lors du masquage automatique des secrets.
pub const REDACTED_SECRET: &str = "[SECRET MASQUÉ]";

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

/// Décision produite par une règle ou le moteur de permissions.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionPolicy {
    Allow,
    Ask,
    Deny,
}

/// Portée d'application d'une règle de permission.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionRuleScope {
    Tool,
    Command,
    Path,
    Any,
}

fn default_true() -> bool {
    true
}

/// Règle granulaire persistante d'autorisation / confirmation / refus.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionRule {
    pub id: String,
    pub scope: PermissionRuleScope,
    pub pattern: String,
    pub policy: PermissionPolicy,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// Entrée du journal d'audit des décisions de permission.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionAuditEntry {
    pub id: String,
    pub title: String,
    pub decision: PermissionPolicy,
    pub mode: PermissionMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    pub source: String,
    pub at: i64,
}

/// Résultat structuré d'évaluation d'une demande de permission.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PermissionEvaluation {
    pub policy: PermissionPolicy,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rule_id: Option<String>,
    pub source: String,
    pub reason: String,
}

const PLAN_INSTRUCTION: &str = concat!(
    "Mode plan : ne modifie aucun fichier et ne lance aucune commande qui change quoi que ce soit. ",
    "Étudie d'abord le sujet, propose un plan détaillé, puis attends mon accord avant d'agir.\n\n",
);

const PLAN_INSTRUCTION_EN: &str = concat!(
    "Plan mode: do not modify any files and do not run any commands that change anything. ",
    "Study the topic first, propose a detailed plan, and wait for my approval before acting.\n\n",
);

#[derive(Clone, Copy)]
enum DefaultRuleKind {
    Word,
    Phrase,
    Substring,
    SensitivePath,
}

struct DefaultRule {
    id: &'static str,
    pattern: &'static str,
    kind: DefaultRuleKind,
    policy: PermissionPolicy,
    reason: &'static str,
}

const DEFAULT_RULES: &[DefaultRule] = &[
    DefaultRule {
        id: "default-sensitive-path",
        pattern: "sensitive_path",
        kind: DefaultRuleKind::SensitivePath,
        policy: PermissionPolicy::Ask,
        reason: "accès à un fichier sensible (.env, clé SSH, certificat ou credentials)",
    },
    DefaultRule { id: "default-cmd-rm", pattern: "rm", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "commande destructive (rm)" },
    DefaultRule { id: "default-cmd-sudo", pattern: "sudo", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "élévation de privilèges (sudo)" },
    DefaultRule { id: "default-cmd-chmod", pattern: "chmod", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "modification des droits (chmod)" },
    DefaultRule { id: "default-cmd-chown", pattern: "chown", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "modification du propriétaire (chown)" },
    DefaultRule { id: "default-cmd-mkfs", pattern: "mkfs", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "formatage disque (mkfs)" },
    DefaultRule { id: "default-cmd-dd", pattern: "dd", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "écriture disque bas niveau (dd)" },
    DefaultRule { id: "default-cmd-curl", pattern: "curl", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "requête réseau externe (curl)" },
    DefaultRule { id: "default-cmd-wget", pattern: "wget", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "téléchargement réseau (wget)" },
    DefaultRule { id: "default-cmd-ssh", pattern: "ssh", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "connexion distante (ssh)" },
    DefaultRule { id: "default-cmd-scp", pattern: "scp", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "transfert distant (scp)" },
    DefaultRule { id: "default-cmd-kill", pattern: "kill", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "arrêt de processus (kill)" },
    DefaultRule { id: "default-cmd-killall", pattern: "killall", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "arrêt de processus (killall)" },
    DefaultRule { id: "default-cmd-force", pattern: "force", kind: DefaultRuleKind::Word, policy: PermissionPolicy::Ask, reason: "option de forçage (force)" },
    DefaultRule { id: "default-cmd-flag-force", pattern: "--force", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "drapeau --force" },
    DefaultRule { id: "default-cmd-git-push", pattern: "git push", kind: DefaultRuleKind::Phrase, policy: PermissionPolicy::Ask, reason: "publication git push" },
    DefaultRule { id: "default-cmd-git-reset", pattern: "git reset", kind: DefaultRuleKind::Phrase, policy: PermissionPolicy::Ask, reason: "réinitialisation git reset" },
    DefaultRule { id: "default-cmd-git-clean", pattern: "git clean", kind: DefaultRuleKind::Phrase, policy: PermissionPolicy::Ask, reason: "nettoyage git clean" },
    DefaultRule { id: "default-cmd-drop-table", pattern: "drop table", kind: DefaultRuleKind::Phrase, policy: PermissionPolicy::Ask, reason: "suppression SQL DROP TABLE" },
    DefaultRule { id: "default-any-supprim", pattern: "supprim", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "action de suppression" },
    DefaultRule { id: "default-any-delete", pattern: "delete", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "action de suppression (delete)" },
    DefaultRule { id: "default-any-password", pattern: "password", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "accès à un mot de passe" },
    DefaultRule { id: "default-any-mdp", pattern: "mot de passe", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "accès à un mot de passe" },
    DefaultRule { id: "default-any-secret", pattern: "secret", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "accès à un secret" },
    DefaultRule { id: "default-any-token", pattern: "token", kind: DefaultRuleKind::Substring, policy: PermissionPolicy::Ask, reason: "accès à un jeton" },
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

fn has_phrase_ws(lower: &str, phrase: &str) -> bool {
    let parts: Vec<&str> = phrase.split_whitespace().collect();
    if parts.len() < 2 {
        return contains_word_ci(lower, phrase);
    }
    let head = parts[0];
    let tail = parts[1];
    let mut start = 0;
    while let Some(pos) = lower[start..].find(head) {
        let abs = start + pos;
        let left_ok = abs == 0 || !is_word_byte(lower.as_bytes()[abs - 1]);
        let after = &lower[abs + head.len()..];
        let trimmed = after.trim_start_matches(|c: char| c.is_ascii_whitespace());
        if left_ok && trimmed.len() < after.len() && trimmed.starts_with(tail) {
            let tail_end = tail.len();
            if tail_end == trimmed.len() || !is_word_byte(trimmed.as_bytes()[tail_end]) {
                return true;
            }
        }
        start = abs + 1;
    }
    false
}

fn is_sensitive_token(token: &str) -> bool {
    let norm = token.trim().replace('\\', "/").to_lowercase();
    let clean = norm.trim_matches(|c: char| matches!(c, '"' | '\'' | '`' | ',' | ';' | '(' | ')' | '[' | ']' | '<' | '>'));
    if clean.is_empty() {
        return false;
    }
    if clean == ".ssh" || clean.ends_with("/.ssh") || clean.contains("/.ssh/") || clean.starts_with(".ssh/") {
        return true;
    }
    let basename = clean.rsplit('/').next().unwrap_or(clean);
    if basename == ".env" {
        return true;
    }
    if basename.starts_with(".env.") {
        return !matches!(basename, ".env.example" | ".env.sample" | ".env.template");
    }
    if basename == "id_rsa"
        || basename == "id_ed25519"
        || (basename.starts_with("id_rsa.") && !basename.ends_with(".pub"))
        || (basename.starts_with("id_ed25519.") && !basename.ends_with(".pub"))
    {
        return true;
    }
    if (basename.ends_with(".pem") && basename.len() > 4) || (basename.ends_with(".key") && basename.len() > 4) {
        return true;
    }
    basename == "credentials.json"
}

/// Indique si un chemin ou une commande cible un fichier sensible (`.env`, clés SSH, `.pem`, `.key`, `credentials.json`).
pub fn is_sensitive_path(path: &str) -> bool {
    if is_sensitive_token(path) {
        return true;
    }
    path.split(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '`' | ',' | ';' | '=' | '(' | ')'))
        .any(|part| !part.is_empty() && is_sensitive_token(part))
}

fn glob_matches_ci(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let (mut pi, mut ti) = (0usize, 0usize);
    let (mut star_p, mut star_t) = (None, 0usize);
    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star_p = Some(pi);
            pi += 1;
            star_t = ti;
        } else if let Some(sp) = star_p {
            pi = sp + 1;
            star_t += 1;
            ti = star_t;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

fn rule_matches(rule: &PermissionRule, title: &str) -> bool {
    if !rule.enabled {
        return false;
    }
    let pattern = rule.pattern.trim();
    if pattern.is_empty() {
        return false;
    }
    let lower_pat = pattern.to_lowercase();
    let lower_title = title.to_lowercase();

    if pattern.contains('*') || pattern.contains('?') {
        if glob_matches_ci(&lower_pat, &lower_title) {
            return true;
        }
        return title
            .split(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '`' | ',' | ';'))
            .any(|tok| !tok.is_empty() && glob_matches_ci(&lower_pat, tok));
    }

    match rule.scope {
        PermissionRuleScope::Path => title
            .split(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | '`' | ',' | ';'))
            .any(|tok| {
                let norm = tok.replace('\\', "/").to_lowercase();
                let base = norm.rsplit('/').next().unwrap_or(&norm);
                norm == lower_pat
                    || base == lower_pat
                    || norm.ends_with(&format!("/{lower_pat}"))
                    || (lower_pat.ends_with('/') && (norm.contains(&lower_pat) || norm.starts_with(&lower_pat)))
            }) || lower_title.replace('\\', "/").contains(&format!("/{lower_pat}")),
        PermissionRuleScope::Tool | PermissionRuleScope::Command => {
            if !lower_pat.contains(' ') && lower_pat.bytes().all(is_word_byte) {
                contains_word_ci(&lower_title, &lower_pat)
            } else {
                lower_title.contains(&lower_pat)
            }
        }
        PermissionRuleScope::Any => {
            if !lower_pat.contains(' ') && lower_pat.len() <= 4 && lower_pat.bytes().all(is_word_byte) {
                contains_word_ci(&lower_title, &lower_pat)
            } else {
                lower_title.contains(&lower_pat)
            }
        }
    }
}

fn default_rule_matches(rule: &DefaultRule, title: &str, lower: &str) -> bool {
    match rule.kind {
        DefaultRuleKind::SensitivePath => is_sensitive_path(title),
        DefaultRuleKind::Word => contains_word_ci(lower, rule.pattern),
        DefaultRuleKind::Phrase => has_phrase_ws(lower, rule.pattern),
        DefaultRuleKind::Substring => lower.contains(rule.pattern),
    }
}

/// Indique si le titre d'une demande correspond à une action sensible à ne jamais approuver seule.
pub fn is_dangerous_title(title: &str) -> bool {
    let lower = title.to_lowercase();
    DEFAULT_RULES.iter().any(|rule| default_rule_matches(rule, title, &lower))
}

/// Évalue une demande d'autorisation en combinant règles utilisateur et règles de sécurité par défaut.
pub fn evaluate_permission(
    mode: PermissionMode,
    title: &str,
    custom_rules: &[PermissionRule],
) -> PermissionEvaluation {
    // 1. Les règles personnalisées explicites sont prioritaires (`deny` > `ask` > `allow`).
    let mut matched_ask: Option<&PermissionRule> = None;
    let mut matched_allow: Option<&PermissionRule> = None;
    for rule in custom_rules {
        if !rule_matches(rule, title) {
            continue;
        }
        match rule.policy {
            PermissionPolicy::Deny => {
                return PermissionEvaluation {
                    policy: PermissionPolicy::Deny,
                    rule_id: Some(rule.id.clone()),
                    source: "rule".into(),
                    reason: format!("règle personnalisée « {} »", rule.pattern),
                };
            }
            PermissionPolicy::Ask if matched_ask.is_none() => matched_ask = Some(rule),
            PermissionPolicy::Allow if matched_allow.is_none() => matched_allow = Some(rule),
            _ => {}
        }
    }
    if let Some(rule) = matched_ask {
        return PermissionEvaluation {
            policy: PermissionPolicy::Ask,
            rule_id: Some(rule.id.clone()),
            source: "rule".into(),
            reason: format!("règle personnalisée « {} »", rule.pattern),
        };
    }
    if let Some(rule) = matched_allow {
        return PermissionEvaluation {
            policy: PermissionPolicy::Allow,
            rule_id: Some(rule.id.clone()),
            source: "rule".into(),
            reason: format!("règle personnalisée « {} »", rule.pattern),
        };
    }

    // 2. Mode Plan : refuse toute demande d'action.
    if mode == PermissionMode::Plan {
        return PermissionEvaluation {
            policy: PermissionPolicy::Deny,
            rule_id: None,
            source: "mode".into(),
            reason: "mode plan en lecture seule".into(),
        };
    }

    // 3. Protection des fichiers sensibles même en mode `auto` ou `full`.
    let lower = title.to_lowercase();
    if is_sensitive_path(title) {
        return PermissionEvaluation {
            policy: PermissionPolicy::Ask,
            rule_id: Some("default-sensitive-path".into()),
            source: "default_rule".into(),
            reason: "accès à un fichier sensible (.env, clé SSH, certificat ou credentials)".into(),
        };
    }

    // 4. Mode Ask : demande toujours confirmation.
    if mode == PermissionMode::Ask {
        return PermissionEvaluation {
            policy: PermissionPolicy::Ask,
            rule_id: None,
            source: "mode".into(),
            reason: "mode approbation manuelle".into(),
        };
    }

    // 5. Mode Auto : vérifie les règles de danger par défaut.
    if mode == PermissionMode::Auto {
        for rule in DEFAULT_RULES {
            if default_rule_matches(rule, title, &lower) {
                return PermissionEvaluation {
                    policy: rule.policy,
                    rule_id: Some(rule.id.into()),
                    source: "default_rule".into(),
                    reason: rule.reason.into(),
                };
            }
        }
    }

    PermissionEvaluation {
        policy: PermissionPolicy::Allow,
        rule_id: None,
        source: "mode".into(),
        reason: if mode == PermissionMode::Full {
            "accès complet".into()
        } else {
            "action autorisée automatiquement".into()
        },
    }
}

/// Choisit automatiquement une réponse selon `mode` et `custom_rules`, ou `None` s'il faut demander.
pub fn auto_answer_with_rules(
    mode: PermissionMode,
    title: &str,
    options: &[PermissionChoice],
    custom_rules: &[PermissionRule],
) -> Option<String> {
    let evaluation = evaluate_permission(mode, title, custom_rules);
    match evaluation.policy {
        PermissionPolicy::Ask => None,
        PermissionPolicy::Deny => options
            .iter()
            .find(|o| o.kind == "reject_once")
            .or_else(|| options.iter().find(|o| o.kind.starts_with("reject")))
            .map(|o| o.id.clone()),
        PermissionPolicy::Allow => options
            .iter()
            .find(|o| o.kind == "allow_once")
            .or_else(|| options.iter().find(|o| o.kind.starts_with("allow")))
            .map(|o| o.id.clone()),
    }
}

/// Choisit automatiquement une réponse si le mode l'autorise, ou `None` s'il faut demander.
pub fn auto_answer(
    mode: PermissionMode,
    title: &str,
    options: &[PermissionChoice],
) -> Option<String> {
    auto_answer_with_rules(mode, title, options, &[])
}

/// Préfixe le texte envoyé à l'agent avec la consigne de planification en mode `Plan`.
pub fn prompt_for(mode: PermissionMode, text: &str) -> String {
    prompt_for_locale(mode, text, "fr")
}

/// Préfixe le texte envoyé à l'agent avec la consigne de planification localisée (`fr` / `en`).
pub fn prompt_for_locale(mode: PermissionMode, text: &str, locale: &str) -> String {
    match mode {
        PermissionMode::Plan => {
            let prefix = if locale == "en" { PLAN_INSTRUCTION_EN } else { PLAN_INSTRUCTION };
            format!("{prefix}{text}")
        }
        PermissionMode::Ask | PermissionMode::Auto | PermissionMode::Full => text.to_string(),
    }
}

fn is_token_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-')
}

fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn match_private_key_block(rest: &str) -> Option<usize> {
    if !rest.starts_with("-----BEGIN ") {
        return None;
    }
    let header_end = rest.find("PRIVATE KEY-----")?;
    if header_end > 64 || rest[..header_end].contains('\n') {
        return None;
    }
    let after_header = header_end + "PRIVATE KEY-----".len();
    if let Some(end_pos) = rest[after_header..].find("-----END ") {
        let tail = &rest[after_header + end_pos..];
        if let Some(end_marker) = tail.find("PRIVATE KEY-----")
            && end_marker <= 64
        {
            return Some(after_header + end_pos + end_marker + "PRIVATE KEY-----".len());
        }
    }
    Some(rest.len())
}

fn match_bearer_header(bytes: &[u8], i: usize) -> Option<(usize, usize)> {
    if i > 0 && is_ident_char(bytes[i - 1]) {
        return None;
    }
    let rest = bytes.get(i..)?;
    if rest.len() < 9 || !rest[..6].eq_ignore_ascii_case(b"bearer") {
        return None;
    }
    let mut pos = 6;
    let mut ws = 0;
    while pos < rest.len() && matches!(rest[pos], b' ' | b'\t') {
        pos += 1;
        ws += 1;
    }
    if ws == 0 {
        return None;
    }
    let val_start = i + pos;
    if bytes[val_start..].starts_with("[SECRET".as_bytes()) {
        return None;
    }
    let mut val_end = val_start;
    while val_end < bytes.len()
        && !bytes[val_end].is_ascii_whitespace()
        && !matches!(bytes[val_end], b'"' | b'\'' | b'`' | b',' | b';' | b')' | b']' | b'}' | b'>')
    {
        val_end += 1;
    }
    let token = &bytes[val_start..val_end];
    let looks_like_token = token.len() >= 6
        || (token.len() >= 3
            && token
                .iter()
                .any(|b| b.is_ascii_digit() || matches!(b, b'_' | b'-' | b'.' | b'/' | b'+' | b'=')));
    looks_like_token.then_some((val_start, val_end))
}

fn match_api_token_prefix(bytes: &[u8], i: usize) -> Option<usize> {
    if i > 0 && is_token_char(bytes[i - 1]) {
        return None;
    }
    let rest = &bytes[i..];
    let (prefix_len, min_tail, allow_dash, upper_only) = if rest.starts_with(b"github_pat_") {
        (11, 8, false, false)
    } else if rest.starts_with(b"ghp_")
        || rest.starts_with(b"gho_")
        || rest.starts_with(b"ghu_")
        || rest.starts_with(b"ghs_")
        || rest.starts_with(b"ghr_")
    {
        (4, 8, false, false)
    } else if rest.starts_with(b"sk-") {
        (3, 8, true, false)
    } else if rest.starts_with(b"AIza") {
        (4, 8, true, false)
    } else if rest.len() >= 5
        && rest.starts_with(b"xox")
        && matches!(rest[3], b'b' | b'a' | b'p' | b'r' | b's')
        && rest[4] == b'-'
    {
        (5, 6, true, false)
    } else if rest.starts_with(b"AKIA") {
        (4, 10, false, true)
    } else {
        return None;
    };

    let mut pos = prefix_len;
    while pos < rest.len() {
        let b = rest[pos];
        let ok = if upper_only {
            b.is_ascii_uppercase() || b.is_ascii_digit()
        } else {
            b.is_ascii_alphanumeric() || b == b'_' || (allow_dash && b == b'-')
        };
        if !ok {
            break;
        }
        pos += 1;
    }
    if pos - prefix_len < min_tail {
        return None;
    }
    if upper_only && pos < rest.len() && rest[pos].is_ascii_alphanumeric() {
        return None;
    }
    Some(i + pos)
}

fn is_sensitive_key_name(raw_lower: &str) -> bool {
    const SUFFIXES: &[&str] = &[
        "api_key",
        "apikey",
        "client_secret",
        "private_key",
        "secret",
        "token",
        "password",
        "passwd",
    ];
    SUFFIXES.iter().any(|suffix| {
        if raw_lower == *suffix {
            return true;
        }
        if let Some(head) = raw_lower.strip_suffix(suffix) {
            return head.ends_with('_') || (!head.is_empty() && !suffix.contains('_'));
        }
        false
    })
}

fn match_key_value_secret(text: &str, bytes: &[u8], i: usize) -> Option<(usize, usize)> {
    if i > 0 && is_ident_char(bytes[i - 1]) {
        return None;
    }
    let mut pos = i;
    let quote = if matches!(bytes[pos], b'"' | b'\'') {
        let q = bytes[pos];
        pos += 1;
        Some(q)
    } else {
        None
    };
    let key_start = pos;
    while pos < bytes.len() && is_ident_char(bytes[pos]) {
        pos += 1;
    }
    if pos == key_start || pos - key_start > 64 {
        return None;
    }
    let key_lower = text[key_start..pos].to_ascii_lowercase();
    if !is_sensitive_key_name(&key_lower) {
        return None;
    }
    if let Some(q) = quote {
        if pos >= bytes.len() || bytes[pos] != q {
            return None;
        }
        pos += 1;
    }
    while pos < bytes.len() && matches!(bytes[pos], b' ' | b'\t') {
        pos += 1;
    }
    if pos >= bytes.len() || !matches!(bytes[pos], b'=' | b':') {
        return None;
    }
    pos += 1;
    while pos < bytes.len() && matches!(bytes[pos], b' ' | b'\t') {
        pos += 1;
    }
    if pos >= bytes.len() {
        return None;
    }
    if matches!(bytes[pos], b'"' | b'\'') {
        let q = bytes[pos];
        let val_start = pos + 1;
        let mut cursor = val_start;
        while cursor < bytes.len() {
            if bytes[cursor] == b'\\' && cursor + 1 < bytes.len() {
                cursor += 2;
                continue;
            }
            if bytes[cursor] == q {
                let inner = &text[val_start..cursor];
                if inner.is_empty() || inner == REDACTED_SECRET {
                    return None;
                }
                return Some((val_start, cursor));
            }
            if bytes[cursor] == b'\n' || bytes[cursor] == b'\r' {
                return None;
            }
            cursor += 1;
        }
        return None;
    }
    let val_start = pos;
    if text[val_start..].starts_with(REDACTED_SECRET) {
        return None;
    }
    let mut val_end = val_start;
    while val_end < bytes.len()
        && !bytes[val_end].is_ascii_whitespace()
        && !matches!(bytes[val_end], b',' | b';' | b'}' | b']' | b')' | b'"' | b'\'')
    {
        val_end += 1;
    }
    if val_end == val_start {
        return None;
    }
    let raw_val = &text[val_start..val_end];
    if matches!(
        raw_val.to_ascii_lowercase().as_str(),
        "null" | "true" | "false" | "undefined" | "none"
    ) {
        return None;
    }
    Some((val_start, val_end))
}

/// Masque automatiquement les tokens API, en-têtes `Bearer`, clés privées et valeurs de clés sensibles.
pub fn redact_secrets(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;

    while i < bytes.len() {
        if !text.is_char_boundary(i) {
            i += 1;
            continue;
        }
        if bytes[i] == b'-'
            && let Some(len) = match_private_key_block(&text[i..])
        {
            out.push_str(REDACTED_SECRET);
            i += len;
            continue;
        }
        if matches!(bytes[i], b'b' | b'B')
            && let Some((val_start, val_end)) = match_bearer_header(bytes, i)
        {
            out.push_str(&text[i..val_start]);
            out.push_str(REDACTED_SECRET);
            i = val_end;
            continue;
        }
        if let Some(end) = match_api_token_prefix(bytes, i) {
            out.push_str(REDACTED_SECRET);
            i = end;
            continue;
        }
        if (bytes[i].is_ascii_alphabetic() || matches!(bytes[i], b'"' | b'\'' | b'_'))
            && let Some((val_start, val_end)) = match_key_value_secret(text, bytes, i)
        {
            out.push_str(&text[i..val_start]);
            out.push_str(REDACTED_SECRET);
            i = val_end;
            continue;
        }

        let ch = text[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
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
    fn full_mode_allows_everything_once_except_sensitive_paths() {
        let opts = sample_options();
        assert_eq!(
            auto_answer(PermissionMode::Full, "rm -rf build", &opts).as_deref(),
            Some("allow")
        );
        assert_eq!(auto_answer(PermissionMode::Full, "cat .env", &opts), None);
        assert_eq!(auto_answer(PermissionMode::Full, "cat ~/.ssh/id_ed25519", &opts), None);
    }

    #[test]
    fn custom_granular_rules_override_mode_with_deny_priority() {
        let opts = sample_options();
        let rules = vec![
            PermissionRule {
                id: "r1".into(),
                scope: PermissionRuleScope::Command,
                pattern: "npm test".into(),
                policy: PermissionPolicy::Allow,
                enabled: true,
            },
            PermissionRule {
                id: "r2".into(),
                scope: PermissionRuleScope::Path,
                pattern: "*.pem".into(),
                policy: PermissionPolicy::Deny,
                enabled: true,
            },
            PermissionRule {
                id: "r3".into(),
                scope: PermissionRuleScope::Any,
                pattern: "disabled-rule".into(),
                policy: PermissionPolicy::Deny,
                enabled: false,
            },
        ];

        let allow_eval = evaluate_permission(PermissionMode::Ask, "run npm test", &rules);
        assert_eq!(allow_eval.policy, PermissionPolicy::Allow);
        assert_eq!(allow_eval.rule_id.as_deref(), Some("r1"));
        assert_eq!(
            auto_answer_with_rules(PermissionMode::Ask, "run npm test", &opts, &rules).as_deref(),
            Some("allow")
        );

        let deny_eval = evaluate_permission(PermissionMode::Full, "read certs/prod.pem", &rules);
        assert_eq!(deny_eval.policy, PermissionPolicy::Deny);
        assert_eq!(deny_eval.rule_id.as_deref(), Some("r2"));
        assert_eq!(
            auto_answer_with_rules(PermissionMode::Full, "read certs/prod.pem", &opts, &rules).as_deref(),
            Some("deny")
        );

        assert_eq!(
            evaluate_permission(PermissionMode::Auto, "echo disabled-rule", &rules).policy,
            PermissionPolicy::Allow
        );
    }

    #[test]
    fn sensitive_path_detection_protects_secrets_and_allows_examples() {
        for sensitive in [
            ".env",
            "/repo/.env.local",
            "cat .env.production",
            "~/.ssh/id_rsa",
            "/Users/me/.ssh/id_ed25519",
            ".ssh/config",
            "certs/server.pem",
            "keys/dev.key",
            "config/credentials.json",
        ] {
            assert!(is_sensitive_path(sensitive), "expected sensitive: {sensitive}");
        }
        for safe in [
            ".env.example",
            ".env.sample",
            ".env.template",
            "src/.environment",
            "docs/ssh-guide.md",
            "src/main.rs",
        ] {
            assert!(!is_sensitive_path(safe), "expected safe: {safe}");
        }
    }

    #[test]
    fn redacts_tokens_headers_private_keys_and_sensitive_assignments() {
        let input = concat!(
            "openai=sk-proj-abc1234567890xyz ",
            "gh=ghp_1234567890abcdef12 ",
            "pat=github_pat_11ABCDEF1234567890 ",
            "google=AIzaSyDummyKey1234567890 ",
            "slack=xoxb-1234567890-abcdef ",
            "aws=AKIAIOSFODNN7EXAMPLE\n",
            "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig\n",
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\n",
            "{\"api_key\": \"secret-val\", \"client_secret\": \"cs-123\", \"tokens\": 420}\n",
            "PASSWORD=hunter2"
        );
        let masked = redact_secrets(input);
        for leaked in [
            "sk-proj-abc1234567890xyz",
            "ghp_1234567890abcdef12",
            "github_pat_11ABCDEF1234567890",
            "AIzaSyDummyKey1234567890",
            "xoxb-1234567890-abcdef",
            "AKIAIOSFODNN7EXAMPLE",
            "eyJhbGciOiJIUzI1NiJ9.payload.sig",
            "MIIEpAIBAAKCAQEA",
            "secret-val",
            "cs-123",
            "hunter2",
        ] {
            assert!(!masked.contains(leaked), "leaked secret {leaked} in:\n{masked}");
        }
        assert!(masked.contains(REDACTED_SECRET));
        assert!(masked.contains("\"tokens\": 420"));
        assert!(masked.contains("Authorization: Bearer [SECRET MASQUÉ]"));
    }

    #[test]
    fn prompt_for_prepends_plan_instruction_only_in_plan_mode() {
        let plan_prompt = prompt_for(PermissionMode::Plan, "fais x");
        assert!(plan_prompt.starts_with("Mode plan :"));
        assert!(plan_prompt.ends_with("\n\nfais x"));
        assert!(prompt_for_locale(PermissionMode::Plan, "do x", "en").starts_with("Plan mode:"));
        assert_eq!(prompt_for(PermissionMode::Ask, "fais x"), "fais x");
        assert_eq!(prompt_for(PermissionMode::Auto, "fais x"), "fais x");
        assert_eq!(prompt_for(PermissionMode::Full, "fais x"), "fais x");
    }
}
