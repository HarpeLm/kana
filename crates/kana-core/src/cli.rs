//! Mode ligne de commande (CLI / Headless) de Kana (`kana run`, `kana advisor`, `--help`, `--version`).

use serde::{Deserialize, Serialize};

/// Commande CLI analysée depuis les arguments du processus.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CliCommand {
    /// Aucun sous-argument CLI : lance l'interface graphique Tauri.
    Gui,
    /// Exécute une tâche en mode headless (`kana run ...`).
    Run {
        prompt: String,
        agent: String,
        cwd: Option<String>,
        model: Option<String>,
        sandbox: bool,
        read_only: bool,
        json: bool,
        cross_review: Option<Vec<String>>,
    },
    /// Conseiller interactif / CLI (`kana advisor [tâche]`).
    Advisor {
        task: Option<String>,
    },
    /// Affiche l'aide CLI (`--help`, `-h`, `help`).
    Help,
    /// Affiche la version (`--version`, `-V`, `version`).
    Version,
}

/// Analyse les arguments passés après le nom de l'exécutable (`std::env::args().skip(1)`).
pub fn parse_cli_args(args: &[String]) -> Result<CliCommand, String> {
    let filtered: Vec<&str> = args
        .iter()
        .map(String::as_str)
        .filter(|arg| !arg.starts_with("-psn_"))
        .collect();

    if filtered.is_empty() {
        return Ok(CliCommand::Gui);
    }

    match filtered[0] {
        "-h" | "--help" | "help" => Ok(CliCommand::Help),
        "-V" | "-v" | "--version" | "version" => Ok(CliCommand::Version),
        "advisor" | "/advisor" => {
            let task = if filtered.len() > 1 {
                let joined = filtered[1..].join(" ").trim().to_string();
                (!joined.is_empty()).then_some(joined)
            } else {
                None
            };
            Ok(CliCommand::Advisor { task })
        }
        "run" => parse_run_args(&filtered[1..]),
        other => Err(format!(
            "sous-commande inconnue : '{other}'. Utilisez `kana --help` pour voir les options disponibles."
        )),
    }
}

fn parse_run_args(args: &[&str]) -> Result<CliCommand, String> {
    let mut agent = String::from("claude");
    let mut cwd: Option<String> = None;
    let mut model: Option<String> = None;
    let mut sandbox = false;
    let mut read_only = false;
    let mut json = false;
    let mut cross_review: Option<Vec<String>> = None;
    let mut prompt_parts: Vec<String> = Vec::new();

    let mut i = 0;
    while i < args.len() {
        match args[i] {
            "-h" | "--help" => return Ok(CliCommand::Help),
            "-a" | "--agent" => {
                i += 1;
                let val = args.get(i).ok_or_else(|| "option `--agent` : valeur manquante".to_string())?;
                if val.trim().is_empty() {
                    return Err("option `--agent` : identifiant d'agent vide".to_string());
                }
                agent = val.trim().to_lowercase();
            }
            "-C" | "--cwd" => {
                i += 1;
                let val = args.get(i).ok_or_else(|| "option `--cwd` : chemin manquant".to_string())?;
                cwd = Some((*val).to_string());
            }
            "-m" | "--model" => {
                i += 1;
                let val = args.get(i).ok_or_else(|| "option `--model` : identifiant manquant".to_string())?;
                model = Some((*val).to_string());
            }
            "--sandbox" => sandbox = true,
            "--read-only" | "--plan" => read_only = true,
            "--json" => json = true,
            "--cross-review" => {
                if let Some(next) = args.get(i + 1)
                    && !next.starts_with('-')
                    && next.contains(',')
                {
                    i += 1;
                    let chain: Vec<String> = next
                        .split(',')
                        .map(|s| s.trim().to_lowercase())
                        .filter(|s| !s.is_empty())
                        .collect();
                    if chain.len() < 2 {
                        return Err("option `--cross-review` : indiquez au moins 2 agents séparés par des virgules".into());
                    }
                    if let Some(first) = chain.first() {
                        agent = first.clone();
                    }
                    cross_review = Some(chain);
                } else {
                    cross_review = Some(vec![
                        "claude".to_string(),
                        "codex".to_string(),
                        "gemini".to_string(),
                    ]);
                }
            }
            "-p" | "--prompt" => {
                i += 1;
                let val = args.get(i).ok_or_else(|| "option `--prompt` : texte manquant".to_string())?;
                prompt_parts.push((*val).to_string());
            }
            "--" => {
                for rest in &args[i + 1..] {
                    prompt_parts.push((*rest).to_string());
                }
                break;
            }
            flag if flag.starts_with('-') => {
                return Err(format!("option inconnue pour `kana run` : '{flag}'"));
            }
            positional => {
                prompt_parts.push(positional.to_string());
            }
        }
        i += 1;
    }

    let prompt = prompt_parts.join(" ").trim().to_string();
    if prompt.is_empty() {
        return Err("aucun prompt fourni à `kana run`. Exemple : `kana run --agent claude \"Corrige les tests\"`".into());
    }

    Ok(CliCommand::Run {
        prompt,
        agent,
        cwd,
        model,
        sandbox,
        read_only,
        json,
        cross_review,
    })
}

/// Génère l'aide complète du mode CLI (`kana --help`).
pub fn format_cli_help() -> String {
    [
        "Kana — Le poste de pilotage de vos agents de code (GUI & CLI Headless)",
        "",
        "UTILISATION :",
        "  kana                                  Lance l'interface graphique Tauri",
        "  kana run [OPTIONS] <PROMPT>           Exécute une tâche agent en mode headless / CI",
        "  kana advisor [TÂCHE]                  Conseiller /advisor : quoi mettre, pour quoi et pourquoi",
        "  kana --help | -h                      Affiche cette aide",
        "  kana --version | -V                   Affiche la version de Kana",
        "",
        "OPTIONS DE `kana run` :",
        "  -a, --agent <ID>                      Agent principal : claude, codex, gemini, opencode (défaut : claude)",
        "  -C, --cwd <CHEMIN>                    Dossier de travail du dépôt",
        "  -m, --model <MODÈLE>                  Modèle spécifique à demander à l'agent",
        "  -p, --prompt <TEXTE>                  Prompt à envoyer à l'agent",
        "      --sandbox                         Active le sandboxing OS (Seatbelt macOS / Bubblewrap Linux)",
        "      --read-only, --plan               Mode lecture seule / planification sans écriture",
        "      --cross-review [A,B,C]            Pipeline multi-fournisseurs (Implémentation → Revue Diff → Vérification)",
        "      --json                            Sortie structurée JSON (idéal pour scripts et CI/CD)",
    ]
    .join("\n")
}

/// Produit une recommandation structurée `/advisor` (« quoi mettre, pour quoi, pourquoi ») pour une tâche donnée.
pub fn advisor_recommendation(task: &str) -> String {
    let lower = task.to_lowercase();
    let (category, primary_agent, mode, pipeline, why_agent, why_env) = if lower.contains("sec")
        || lower.contains("audit")
        || lower.contains("perm")
        || lower.contains("cve")
    {
        (
            "Audit Sécurité & Permissions",
            "claude",
            "plan (lecture seule) + Sandbox OS",
            "claude (Audit) → codex (Contre-audit diff & règles) → gemini (Synthèse risques)",
            "Claude excelle dans l'analyse d'architecture multi-fichiers et la détection de flux sensibles.",
            "Le mode `plan` combiné au Sandbox OS garantit qu'aucun fichier ni secret n'est modifié pendant l'audit.",
        )
    } else if lower.contains("ui")
        || lower.contains("globe")
        || lower.contains("html")
        || lower.contains("css")
        || lower.contains("design")
    {
        (
            "Interface UI / Artéfact & Globe",
            "gemini",
            "auto + Worktree isolé + Vérification Globe",
            "gemini (UI & Artéfact) → claude (Revue accessibilité & architecture) → codex (Tests E2E Playwright)",
            "Gemini dispose d'une compréhension multimodale idéale pour le rendu visuel et le navigateur intégré Globe.",
            "Un worktree isolé permet d'itérer visuellement et de capturer une trace HTML Globe sans polluer `main`.",
        )
    } else if lower.contains("bug")
        || lower.contains("fix")
        || lower.contains("test")
        || lower.contains("ci")
        || lower.contains("erreur")
    {
        (
            "Correction de bug / CI & Tests",
            "codex",
            "auto + Worktree isolé + Sandbox OS",
            "codex (Correctif & test unitaire) → claude (Cross-review régression) → gemini (Validation E2E)",
            "Codex est particulièrement précis pour le débogage chirurgical, les correctifs compilateur et l'écriture de tests.",
            "L'exécution en worktree isolé avec sandbox permet de lancer `cargo test` et `npm test` en toute sécurité.",
        )
    } else {
        (
            "Nouvelle fonctionnalité & Architecture",
            "claude",
            "auto + Worktree isolé + Sandbox OS",
            "claude (Implémentation) → codex (Cross-Review du Diff) → gemini (Vérification & Globe)",
            "Claude gère avec fiabilité la conception multi-fichiers Rust + TypeScript et la cohérence du domaine.",
            "Le worktree Git isolé sépare la fonctionnalité jusqu'à la revue croisée et la validation complète des tests.",
        )
    };

    let subject = if task.trim().is_empty() {
        "Tâche générale sur le dépôt"
    } else {
        task.trim()
    };

    [
        format!("=== Conseiller Kana (/advisor) — « {subject} » ==="),
        format!("1. Qu'est-ce que l'on met en place : {category}"),
        format!("   - Agent principal : {primary_agent}"),
        format!("   - Mode & environnement : {mode}"),
        format!("   - Pipeline Cross-Review : {pipeline}"),
        "2. Pour quoi (Objectif & Livrable) :".to_string(),
        "   - Livrer un changement vérifié par plusieurs fournisseurs indépendants, sans régression ni angle mort.".to_string(),
        "3. Pourquoi cette configuration :".to_string(),
        format!("   - Pourquoi cet agent : {why_agent}"),
        format!("   - Pourquoi cet environnement : {why_env}"),
        "   - Pourquoi le Cross-Review : dissocier l'implémenteur (Étape 1), le relecteur de diff (Étape 2) et le vérificateur (Étape 3) réduit drastiquement les hallucinations et bugs subtils.".to_string(),
    ]
    .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vec_str(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_string()).collect()
    }

    #[test]
    fn empty_args_or_macos_psn_starts_gui() {
        assert_eq!(parse_cli_args(&[]).unwrap(), CliCommand::Gui);
        assert_eq!(parse_cli_args(&vec_str(&["-psn_0_12345"])).unwrap(), CliCommand::Gui);
    }

    #[test]
    fn parses_help_and_version_flags() {
        assert_eq!(parse_cli_args(&vec_str(&["--help"])).unwrap(), CliCommand::Help);
        assert_eq!(parse_cli_args(&vec_str(&["-h"])).unwrap(), CliCommand::Help);
        assert_eq!(parse_cli_args(&vec_str(&["--version"])).unwrap(), CliCommand::Version);
        assert_eq!(parse_cli_args(&vec_str(&["-V"])).unwrap(), CliCommand::Version);
        assert!(format_cli_help().contains("kana run"));
    }

    #[test]
    fn parses_run_command_with_options_and_cross_review() {
        let cmd = parse_cli_args(&vec_str(&[
            "run",
            "--agent",
            "codex",
            "--cwd",
            "/tmp/repo",
            "--model",
            "o3",
            "--sandbox",
            "--read-only",
            "--json",
            "--cross-review",
            "claude,codex,gemini",
            "Corrige le parseur",
        ]))
        .unwrap();

        assert_eq!(
            cmd,
            CliCommand::Run {
                prompt: "Corrige le parseur".into(),
                agent: "claude".into(),
                cwd: Some("/tmp/repo".into()),
                model: Some("o3".into()),
                sandbox: true,
                read_only: true,
                json: true,
                cross_review: Some(vec!["claude".into(), "codex".into(), "gemini".into()]),
            }
        );
    }

    #[test]
    fn parses_advisor_command_and_generates_recommendation() {
        let cmd = parse_cli_args(&vec_str(&["advisor", "audit", "sécurité"])).unwrap();
        assert_eq!(
            cmd,
            CliCommand::Advisor {
                task: Some("audit sécurité".into())
            }
        );
        let rec = advisor_recommendation("audit sécurité");
        assert!(rec.contains("Audit Sécurité & Permissions"));
        assert!(rec.contains("Pourquoi cette configuration"));
    }

    #[test]
    fn rejects_unknown_subcommand_or_missing_prompt() {
        assert!(parse_cli_args(&vec_str(&["unknown"])).is_err());
        assert!(parse_cli_args(&vec_str(&["run", "--sandbox"])).is_err());
    }
}
