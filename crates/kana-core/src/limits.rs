//! Détection des limites de quota et des erreurs d'authentification des fournisseurs.

use serde::{Deserialize, Serialize};

const MS_PER_SECOND: f64 = 1_000.0;
const MS_PER_MINUTE: f64 = 60_000.0;
const MS_PER_HOUR: f64 = 3_600_000.0;
const MS_PER_DAY: f64 = 86_400_000.0;
const DAY_MS: i64 = 86_400_000;

/// Catégorie d'incident empêchant un fournisseur de répondre.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProblemKind {
    Limit,
    Auth,
}

/// Souci détecté sur un fournisseur (quota/débit ou authentification).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Problem {
    pub kind: ProblemKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub until: Option<i64>,
}

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

fn has_rate_limit(lower: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = lower[start..].find("rate") {
        let abs = start + pos;
        let rest = &lower[abs + 4..];
        if rest.starts_with("limit") {
            return true;
        }
        if let Some(ch) = rest.chars().next()
            && ch != '\n'
            && ch != '\r'
            && rest[ch.len_utf8()..].starts_with("limit")
        {
            return true;
        }
        start = abs + 4;
    }
    false
}

fn has_exceeded_phrase(lower: &str) -> bool {
    let mut start = 0;
    while let Some(pos) = lower[start..].find("exceeded ") {
        let abs = start + pos;
        let after = &lower[abs + "exceeded ".len()..];
        let after_subject = after
            .strip_prefix("your ")
            .or_else(|| after.strip_prefix("the "));
        if let Some(rest) = after_subject {
            let rest = rest.strip_prefix("current ").unwrap_or(rest);
            if rest.starts_with("limit") || rest.starts_with("quota") {
                return true;
            }
        }
        start = abs + 1;
    }
    false
}

fn is_limit_message(lower: &str) -> bool {
    lower.contains("usage limit")
        || has_rate_limit(lower)
        || lower.contains("quota")
        || lower.contains("too many requests")
        || contains_word_ci(lower, "429")
        || lower.contains("limit reached")
        || lower.contains("limit exceeded")
        || has_exceeded_phrase(lower)
        || lower.contains("out of credits")
        || lower.contains("out of usage")
        || lower.contains("insufficient credit")
        || lower.contains("insufficient quota")
        || lower.contains("overloaded")
}

fn is_auth_message(lower: &str) -> bool {
    contains_word_ci(lower, "401")
        || lower.contains("authenticat")
        || lower.contains("invalid token")
        || lower.contains("invalid bearer token")
        || lower.contains("invalid api key")
        || lower.contains("not logged in")
        || lower.contains("login required")
        || lower.contains("unauthorized")
        || lower.contains("unauthorised")
        || lower.contains("connexion requise")
}

fn skip_ws(s: &str) -> &str {
    s.trim_start_matches(|c: char| c.is_ascii_whitespace())
}

fn parse_relative_delay(lower: &str) -> Option<i64> {
    const UNITS: &[(&str, f64)] = &[
        ("seconds", MS_PER_SECOND),
        ("second", MS_PER_SECOND),
        ("secs", MS_PER_SECOND),
        ("sec", MS_PER_SECOND),
        ("s", MS_PER_SECOND),
        ("minutes", MS_PER_MINUTE),
        ("minute", MS_PER_MINUTE),
        ("mins", MS_PER_MINUTE),
        ("min", MS_PER_MINUTE),
        ("m", MS_PER_MINUTE),
        ("hours", MS_PER_HOUR),
        ("hour", MS_PER_HOUR),
        ("hrs", MS_PER_HOUR),
        ("hr", MS_PER_HOUR),
        ("heures", MS_PER_HOUR),
        ("heure", MS_PER_HOUR),
        ("h", MS_PER_HOUR),
        ("jours", MS_PER_DAY),
        ("jour", MS_PER_DAY),
        ("days", MS_PER_DAY),
        ("day", MS_PER_DAY),
        ("d", MS_PER_DAY),
    ];

    for (idx, _) in lower.char_indices() {
        let slice = &lower[idx..];
        let rest = slice
            .strip_prefix("dans")
            .or_else(|| slice.strip_prefix("in"));
        let Some(after_kw) = rest else { continue };
        let after_ws = skip_ws(after_kw);
        if after_ws.len() == after_kw.len() {
            continue;
        }
        let after_about = if let Some(a) = after_ws.strip_prefix("about") {
            let trimmed = skip_ws(a);
            if trimmed.len() < a.len() {
                trimmed
            } else {
                after_ws
            }
        } else {
            after_ws
        };

        let bytes = after_about.as_bytes();
        let mut num_end = 0;
        while num_end < bytes.len() && bytes[num_end].is_ascii_digit() {
            num_end += 1;
        }
        if num_end == 0 {
            continue;
        }
        if num_end + 1 < bytes.len()
            && bytes[num_end] == b'.'
            && bytes[num_end + 1].is_ascii_digit()
        {
            num_end += 1;
            while num_end < bytes.len() && bytes[num_end].is_ascii_digit() {
                num_end += 1;
            }
        }
        let Ok(amount) = after_about[..num_end].parse::<f64>() else {
            continue;
        };
        let unit_part = skip_ws(&after_about[num_end..]);
        let unit_bytes = unit_part.as_bytes();
        for &(unit, factor) in UNITS {
            if unit_part.starts_with(unit) {
                let end = unit.len();
                if end == unit_bytes.len() || !is_word_byte(unit_bytes[end]) {
                    return Some((amount * factor).round() as i64);
                }
            }
        }
    }
    None
}

fn parse_hh_mm(s: &str) -> Option<(u8, u8)> {
    let b = s.as_bytes();
    if b.len() >= 5
        && b[0].is_ascii_digit()
        && b[1].is_ascii_digit()
        && (b[2] == b':' || b[2] == b'h')
        && b[3].is_ascii_digit()
        && b[4].is_ascii_digit()
    {
        let hour = (b[0] - b'0') * 10 + (b[1] - b'0');
        let min = (b[3] - b'0') * 10 + (b[4] - b'0');
        if (hour < 24 || (hour == 24 && min == 0)) && min < 60 {
            return Some((hour, min));
        }
    }
    if b.len() >= 4
        && b[0].is_ascii_digit()
        && (b[1] == b':' || b[1] == b'h')
        && b[2].is_ascii_digit()
        && b[3].is_ascii_digit()
    {
        let hour = b[0] - b'0';
        let min = (b[2] - b'0') * 10 + (b[3] - b'0');
        if min < 60 {
            return Some((hour, min));
        }
    }
    None
}

fn parse_clock_reset(lower: &str, now_ms: i64) -> Option<i64> {
    const KEYWORDS: &[&str] = &[
        "resets",
        "reset",
        "reprise",
        "réinitialisation",
        "available again",
    ];

    for (idx, _) in lower.char_indices() {
        let slice = &lower[idx..];
        let Some(kw) = KEYWORDS.iter().find(|&&k| slice.starts_with(k)) else {
            continue;
        };
        let after = &slice[kw.len()..];
        for (step, (offset, ch)) in after.char_indices().enumerate() {
            if step > 24 {
                break;
            }
            if ch.is_ascii_digit() {
                if let Some((hour, min)) = parse_hh_mm(&after[offset..]) {
                    let day_start = now_ms.div_euclid(DAY_MS) * DAY_MS;
                    let mut at = day_start + i64::from(hour) * 3_600_000 + i64::from(min) * 60_000;
                    if at <= now_ms {
                        at += DAY_MS;
                    }
                    return Some(at);
                }
                break;
            }
        }
    }
    None
}

fn parse_epoch_reset(lower: &str) -> Option<i64> {
    let bytes = lower.as_bytes();
    let mut start = 0;
    while let Some(pos) = lower[start..].find('|') {
        let after = start + pos + 1;
        if after + 10 <= bytes.len()
            && bytes[after..after + 10].iter().all(u8::is_ascii_digit)
            && (after + 10 == bytes.len() || !is_word_byte(bytes[after + 10]))
            && let Ok(secs) = lower[after..after + 10].parse::<i64>()
        {
            return Some(secs * 1_000);
        }
        start = after;
    }
    None
}

/// Heure de reprise annoncée dans un message (« resets at 14:30 », « try again in 5 minutes »…).
pub fn reset_time(message: &str, now_ms: i64) -> Option<i64> {
    let lower = message.to_lowercase();
    if let Some(delay) = parse_relative_delay(&lower) {
        return Some(now_ms + delay);
    }
    if let Some(clock) = parse_clock_reset(&lower, now_ms) {
        return Some(clock);
    }
    parse_epoch_reset(&lower)
}

/// Reconnaît, dans un message d'erreur d'un agent, une limite atteinte ou une connexion refusée.
pub fn detect_problem(message: &str, now_ms: i64) -> Option<Problem> {
    let lower = message.to_lowercase();
    if is_limit_message(&lower) {
        return Some(Problem {
            kind: ProblemKind::Limit,
            until: reset_time(message, now_ms),
        });
    }
    if is_auth_message(&lower) {
        return Some(Problem {
            kind: ProblemKind::Auth,
            until: None,
        });
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_limit_with_relative_reset() {
        let now = 1_700_000_000_000;
        let problem = detect_problem("Rate limit exceeded. Try again in 5 minutes.", now).unwrap();
        assert_eq!(problem.kind, ProblemKind::Limit);
        assert_eq!(problem.until, Some(now + 5 * 60_000));
    }

    #[test]
    fn detects_limit_with_french_fractional_hours() {
        let now = 1_700_000_000_000;
        let problem = detect_problem("Quota épuisé, réessayez dans 1.5 heures.", now).unwrap();
        assert_eq!(problem.kind, ProblemKind::Limit);
        assert_eq!(problem.until, Some(now + 5_400_000));
    }

    #[test]
    fn detects_limit_with_clock_reset_same_day_or_next_day() {
        // 10:00:00 UTC on a clean day boundary
        let day_start = 20_000 * DAY_MS;
        let now = day_start + 10 * 3_600_000;

        let later = reset_time("Resets at 14:30 UTC", now);
        assert_eq!(later, Some(day_start + 14 * 3_600_000 + 30 * 60_000));

        let next_day = reset_time("Réinitialisation à 08h15", now);
        assert_eq!(next_day, Some(day_start + DAY_MS + 8 * 3_600_000 + 15 * 60_000));
    }

    #[test]
    fn detects_limit_with_epoch_suffix() {
        let problem = detect_problem("Claude AI usage limit reached|1712345678", 1_700_000_000_000).unwrap();
        assert_eq!(problem.kind, ProblemKind::Limit);
        assert_eq!(problem.until, Some(1_712_345_678_000));
    }

    #[test]
    fn detects_various_limit_phrases() {
        assert_eq!(detect_problem("HTTP 429 Too Many Requests", 0).unwrap().kind, ProblemKind::Limit);
        assert_eq!(detect_problem("You exceeded your current quota", 0).unwrap().kind, ProblemKind::Limit);
        assert_eq!(detect_problem("Out of credits", 0).unwrap().kind, ProblemKind::Limit);
        assert_eq!(detect_problem("Server overloaded", 0).unwrap().kind, ProblemKind::Limit);
        assert_eq!(detect_problem("rate-limit hit", 0).unwrap().kind, ProblemKind::Limit);
    }

    #[test]
    fn detects_auth_problems_and_ignores_unrelated_errors() {
        assert_eq!(
            detect_problem("401 Unauthorized: invalid api key", 0),
            Some(Problem { kind: ProblemKind::Auth, until: None })
        );
        assert_eq!(
            detect_problem("Connexion requise pour continuer", 0),
            Some(Problem { kind: ProblemKind::Auth, until: None })
        );
        assert_eq!(detect_problem("Syntax error on line 42", 0), None);
        assert_eq!(detect_problem("Error code 14290", 0), None);
    }
}
