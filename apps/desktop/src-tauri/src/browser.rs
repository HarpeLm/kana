//! Règles du navigateur intégré : quelles adresses on accepte, et comment on nomme ses vues.

use tauri::Url;

/// Seules les pages web sont ouvertes : jamais `file:`, `javascript:`, `data:` ni les schémas
/// propres à l'app, qui donneraient à une page l'accès à des fichiers ou aux commandes de Kana.
pub fn parse_web_url(input: &str) -> Result<Url, String> {
    let url = Url::parse(input.trim()).map_err(|e| format!("adresse invalide : {e}"))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        other => Err(format!("schéma refusé : {other}")),
    }
}

/// Une navigation (clic sur un lien, redirection) est permise vers une page web ou `about:blank`.
pub fn is_allowed_navigation(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https") || url.as_str() == "about:blank"
}

/// Nom de la vue native d'un onglet.
pub fn webview_label(tab_id: &str) -> String {
    format!("browser-{tab_id}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_web_addresses() {
        assert!(parse_web_url("https://example.com/page?q=1").is_ok());
        assert!(parse_web_url("  http://localhost:3000 ").is_ok());
    }

    #[test]
    fn refuses_dangerous_schemes() {
        for bad in ["file:///etc/passwd", "javascript:alert(1)", "data:text/html,x", "tauri://localhost", "ftp://x.org"] {
            assert!(parse_web_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn refuses_text_that_is_not_an_address() {
        assert!(parse_web_url("pas une adresse").is_err());
        assert!(parse_web_url("").is_err());
    }

    #[test]
    fn navigation_stays_on_the_web() {
        let web = Url::parse("https://example.com").unwrap();
        let blank = Url::parse("about:blank").unwrap();
        let local = Url::parse("file:///tmp/x").unwrap();
        assert!(is_allowed_navigation(&web));
        assert!(is_allowed_navigation(&blank));
        assert!(!is_allowed_navigation(&local));
    }

    #[test]
    fn labels_are_prefixed() {
        assert_eq!(webview_label("b1"), "browser-b1");
    }
}
