use std::path::{Path, PathBuf};

use kana_acp::{AgentSpec, api_key_env, preset, with_cached_adapter};

use crate::secrets;

/// Construit un `PATH` complet incluant les emplacements développeur usuels sur macOS/Linux
/// (Homebrew, `~/.opencode/bin`, `~/.local/bin`, `~/.cargo/bin`, Volta, nvm), car une app `.app`
/// lancée depuis le Finder ou le Bureau reçoit un `PATH` minimal (`/usr/bin:/bin:/usr/sbin:/sbin`).
pub fn enriched_path() -> String {
    let home = default_cwd();
    let current = std::env::var("PATH").unwrap_or_default();
    build_enriched_path(&home, &current)
}

pub(crate) fn build_enriched_path(home: &Path, current_path: &str) -> String {
    let sep = if cfg!(target_os = "windows") { ';' } else { ':' };
    let mut dirs: Vec<PathBuf> = Vec::new();

    if !cfg!(target_os = "windows") {
        dirs.push(home.join(".opencode").join("bin"));
        dirs.push(home.join(".local").join("bin"));
        dirs.push(home.join(".volta").join("bin"));
        dirs.push(home.join(".cargo").join("bin"));
        dirs.push(home.join(".npm-global").join("bin"));

        // Si nvm est utilisé, ajouter la version Node la plus récente.
        let nvm_dir = home.join(".nvm").join("versions").join("node");
        if let Ok(entries) = std::fs::read_dir(&nvm_dir) {
            let mut versions: Vec<PathBuf> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.path().join("bin"))
                .filter(|p| p.is_dir())
                .collect();
            versions.sort();
            if let Some(latest) = versions.pop() {
                dirs.push(latest);
            }
        }

        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/opt/homebrew/sbin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
    }

    for part in current_path.split(sep).filter(|s| !s.is_empty()) {
        dirs.push(PathBuf::from(part));
    }

    if !cfg!(target_os = "windows") {
        for fallback in ["/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
            dirs.push(PathBuf::from(fallback));
        }
    }

    let mut dedup: Vec<String> = Vec::new();
    for dir in dirs {
        let s = dir.to_string_lossy().into_owned();
        if !s.is_empty() && !dedup.contains(&s) {
            dedup.push(s);
        }
    }
    dedup.join(&sep.to_string())
}

/// Résout un nom d'exécutable (ex. `npx`, `opencode`, `npm`) en chemin absolu à partir de `path_env`.
/// Indispensable quand l'app `.app` est lancée depuis le Finder : `Command::new("npx").env("PATH", ...)`
/// cherche `npx` dans le `PATH` du processus parent avant d'appliquer l'env enfant.
pub fn resolve_command(command: &str, path_env: &str) -> String {
    let p = Path::new(command);
    if p.is_absolute() || command.contains(std::path::MAIN_SEPARATOR) {
        return command.to_string();
    }
    let sep = if cfg!(target_os = "windows") { ';' } else { ':' };
    for dir in path_env.split(sep).filter(|s| !s.is_empty()) {
        let candidate = Path::new(dir).join(command);
        if candidate.is_file() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    command.to_string()
}

/// Commande de lancement d'un agent, avec son adaptateur local en cache (`~/.kana/adapters`),
/// son exécutable résolu dans le `PATH` développeur, et sa clé d'API du Trousseau si elle existe.
pub fn spec_for(agent_id: &str) -> Result<AgentSpec, String> {
    let base = preset(agent_id).ok_or_else(|| format!("agent inconnu : {agent_id}"))?;
    let mut spec = with_cached_adapter(base, &default_cwd());
    let path_env = enriched_path();
    spec.command = resolve_command(&spec.command, &path_env);
    spec = spec.with_env("PATH", &path_env);

    let key = api_key_env(agent_id).zip(secrets::get_api_key(agent_id));
    Ok(match key {
        Some((variable, value)) => spec.with_env(variable, &value),
        None => spec,
    })
}

/// Dossier de départ d'un terminal : le dossier personnel.
pub fn default_cwd() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_else(|| PathBuf::from("/"))
}

/// Dossier de travail des agents : le dépôt où Kana a été lancé. Jamais le dossier personnel :
/// un agent qui s'y installe indexe tout le disque de l'utilisateur et met des minutes à répondre.
/// Sans dépôt, un dossier temporaire neutre.
pub fn project_dir() -> PathBuf {
    std::env::current_dir()
        .ok()
        .and_then(|dir| kana_git::repo_root(&dir).ok())
        .unwrap_or_else(std::env::temp_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enriches_minimal_macos_path_with_homebrew_and_user_bins() {
        let home = PathBuf::from("/Users/testuser");
        let enriched = build_enriched_path(&home, "/usr/bin:/bin");
        assert!(enriched.contains("/opt/homebrew/bin"), "{enriched}");
        assert!(enriched.contains("/Users/testuser/.opencode/bin"), "{enriched}");
        assert!(enriched.contains("/Users/testuser/.local/bin"), "{enriched}");
        assert!(enriched.contains("/usr/bin"), "{enriched}");
    }

    #[test]
    fn resolves_command_in_custom_path() {
        let dir = std::env::temp_dir().join(format!("kana-path-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let fake_bin = dir.join("fake-npx");
        std::fs::write(&fake_bin, "#!/bin/sh\n").unwrap();

        let resolved = resolve_command("fake-npx", &dir.to_string_lossy());
        assert_eq!(resolved, fake_bin.to_string_lossy());

        let missing = resolve_command("definitely-missing-bin", &dir.to_string_lossy());
        assert_eq!(missing, "definitely-missing-bin");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
