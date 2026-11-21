//! Commandes de lancement des agents compatibles ACP.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// Politique de sandboxing OS appliquée aux sous-processus locaux.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum SandboxPolicy {
    #[default]
    None,
    WorkspaceWrite,
    ReadOnly,
}

/// Cible d'exécution d'un agent : local, SSH, conteneur Docker ou DevContainer.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ExecutionTarget {
    #[default]
    Local,
    Ssh {
        host: String,
        #[serde(default)]
        remote_dir: Option<String>,
    },
    Docker {
        container: String,
        #[serde(default)]
        workdir: Option<String>,
    },
    DevContainer {
        folder: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AgentSpec {
    pub command: String,
    pub args: Vec<String>,
    /// Variables d'environnement ajoutées au processus (clés d'API, par exemple).
    #[serde(default)]
    pub env: Vec<(String, String)>,
    /// Politique d'isolation OS (sandbox-exec sur macOS, bwrap sur Linux).
    #[serde(default)]
    pub sandbox: SandboxPolicy,
    /// Cible d'exécution (locale ou distante).
    #[serde(default)]
    pub target: ExecutionTarget,
}

impl AgentSpec {
    pub fn new(command: &str, args: &[&str]) -> Self {
        Self {
            command: command.into(),
            args: args.iter().map(|a| (*a).into()).collect(),
            env: Vec::new(),
            sandbox: SandboxPolicy::default(),
            target: ExecutionTarget::default(),
        }
    }

    pub fn with_env(mut self, name: &str, value: &str) -> Self {
        self.env.push((name.into(), value.into()));
        self
    }

    pub fn with_sandbox(mut self, sandbox: SandboxPolicy) -> Self {
        self.sandbox = sandbox;
        self
    }

    pub fn with_target(mut self, target: ExecutionTarget) -> Self {
        self.target = target;
        self
    }
}

fn escape_sbpl(raw: &str) -> String {
    raw.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Construit un profil macOS Seatbelt (`sandbox-exec -p`) autorisant la lecture,
/// tout en restreignant les écritures à `cwd` (ou en lecture seule stricte).
pub fn seatbelt_profile(cwd: &Path, read_only: bool) -> String {
    let mut profile = String::from(
        "(version 1)\n\
         (allow default)\n\
         (deny file-write*)\n\
         (allow file-write* (literal \"/dev/null\"))\n",
    );
    if !read_only {
        let raw_cwd = cwd.to_string_lossy().into_owned();
        profile.push_str(&format!("(allow file-write* (subpath \"{}\"))\n", escape_sbpl(&raw_cwd)));
        if let Ok(canon) = std::fs::canonicalize(cwd) {
            let canon_str = canon.to_string_lossy().into_owned();
            if canon_str != raw_cwd {
                profile.push_str(&format!(
                    "(allow file-write* (subpath \"{}\"))\n",
                    escape_sbpl(&canon_str)
                ));
            }
        }
    }
    profile
}

fn shell_quote(arg: &str) -> String {
    if arg.is_empty() {
        return "''".to_string();
    }
    if arg
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '/' | ':' | '-' | '@' | '=' | ',' | '+'))
    {
        return arg.to_string();
    }
    format!("'{}'", arg.replace('\'', "'\\''"))
}

/// Construit la liste d'arguments `bwrap` (Bubblewrap sur Linux) pour isoler le sous-processus.
pub fn bwrap_args(cwd: &Path, read_only: bool, command: &str, args: &[String]) -> Vec<String> {
    let mut out = vec!["--ro-bind".into(), "/".into(), "/".into()];
    if !read_only {
        let cwd_str = cwd.to_string_lossy().into_owned();
        out.extend(["--bind".into(), cwd_str.clone(), cwd_str]);
    }
    out.extend([
        "--dev".into(),
        "/dev".into(),
        "--proc".into(),
        "/proc".into(),
        "--".into(),
        command.into(),
    ]);
    out.extend(args.iter().cloned());
    out
}

/// Calcule la commande effective `(programme, arguments)` compte tenu de la cible
/// d'exécution (`Local`, `Ssh`, `Docker`, `DevContainer`) et du sandboxing OS.
pub fn effective_command(spec: &AgentSpec, cwd: &Path) -> (String, Vec<String>) {
    match &spec.target {
        ExecutionTarget::Ssh { host, remote_dir } => {
            let cmd = std::iter::once(spec.command.as_str())
                .chain(spec.args.iter().map(String::as_str))
                .map(shell_quote)
                .collect::<Vec<_>>()
                .join(" ");
            let remote_cmd = match remote_dir.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
                Some(dir) => format!("cd {} && {cmd}", shell_quote(dir)),
                None => cmd,
            };
            (
                "ssh".to_string(),
                vec!["-o".into(), "BatchMode=yes".into(), host.clone(), remote_cmd],
            )
        }
        ExecutionTarget::Docker { container, workdir } => {
            let mut args = vec!["exec".to_string(), "-i".to_string()];
            if let Some(dir) = workdir.as_deref().map(str::trim).filter(|d| !d.is_empty()) {
                args.push("-w".into());
                args.push(dir.into());
            }
            args.push(container.clone());
            args.push(spec.command.clone());
            args.extend(spec.args.iter().cloned());
            ("docker".to_string(), args)
        }
        ExecutionTarget::DevContainer { folder } => {
            let mut args = vec![
                "exec".to_string(),
                "--workspace-folder".to_string(),
                folder.clone(),
                spec.command.clone(),
            ];
            args.extend(spec.args.iter().cloned());
            ("devcontainer".to_string(), args)
        }
        ExecutionTarget::Local => {
            let read_only = match spec.sandbox {
                SandboxPolicy::None => return (spec.command.clone(), spec.args.clone()),
                SandboxPolicy::WorkspaceWrite => false,
                SandboxPolicy::ReadOnly => true,
            };
            #[cfg(target_os = "macos")]
            if Path::new("/usr/bin/sandbox-exec").exists() {
                let mut args = vec![
                    "-p".to_string(),
                    seatbelt_profile(cwd, read_only),
                    spec.command.clone(),
                ];
                args.extend(spec.args.iter().cloned());
                return ("/usr/bin/sandbox-exec".to_string(), args);
            }
            #[cfg(target_os = "linux")]
            if Path::new("/usr/bin/bwrap").exists() {
                return (
                    "/usr/bin/bwrap".to_string(),
                    bwrap_args(cwd, read_only, &spec.command, &spec.args),
                );
            }
            let _ = (cwd, read_only);
            (spec.command.clone(), spec.args.clone())
        }
    }
}

/// Variable d'environnement où l'agent lit sa clé d'API, si il en accepte une.
pub fn api_key_env(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "claude" => Some("ANTHROPIC_API_KEY"),
        "codex" => Some("OPENAI_API_KEY"),
        "gemini" => Some("GEMINI_API_KEY"),
        _ => None,
    }
}

/// Commande par défaut d'un agent connu (`opencode`, `codex`, `claude`, `gemini`).
/// Codex et Claude passent par les adaptateurs ACP publiés par Zed.
pub fn preset(agent_id: &str) -> Option<AgentSpec> {
    match agent_id {
        "opencode" => Some(AgentSpec::new("opencode", &["acp"])),
        "codex" => Some(AgentSpec::new("npx", &["-y", "@zed-industries/codex-acp"])),
        "claude" => Some(AgentSpec::new("npx", &["-y", "@zed-industries/claude-agent-acp"])),
        "gemini" => Some(AgentSpec::new("npx", &["-y", "@google/gemini-cli", "--experimental-acp"])),
        _ => None,
    }
}

/// État du cache local d'un adaptateur ACP (évite `npx -y` à chaque démarrage).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AdapterCacheInfo {
    pub agent_id: String,
    pub package: String,
    pub binary: String,
    pub cached: bool,
    pub local_path: Option<String>,
}

/// Dossier où Kana installe et met en cache localement les adaptateurs npm ACP (`~/.kana/adapters`).
pub fn adapter_cache_dir(home: &Path) -> PathBuf {
    home.join(".kana").join("adapters")
}

fn adapter_package_and_binary(agent_id: &str) -> Option<(&'static str, &'static str, &'static [&'static str])> {
    match agent_id {
        "codex" => Some(("@zed-industries/codex-acp", "codex-acp", &[])),
        "claude" => Some(("@zed-industries/claude-agent-acp", "claude-agent-acp", &[])),
        "gemini" => Some(("@google/gemini-cli", "gemini", &["--experimental-acp"])),
        _ => None,
    }
}

/// Inspecte si l'adaptateur ACP de `agent_id` est présent dans le cache local `~/.kana/adapters`.
pub fn inspect_adapter_cache(agent_id: &str, home: &Path) -> Option<AdapterCacheInfo> {
    let (package, binary, _) = adapter_package_and_binary(agent_id)?;
    let bin_dir = adapter_cache_dir(home).join("node_modules").join(".bin");
    let candidate = if cfg!(target_os = "windows") {
        let cmd = bin_dir.join(format!("{binary}.cmd"));
        if cmd.is_file() { cmd } else { bin_dir.join(binary) }
    } else {
        bin_dir.join(binary)
    };
    let cached = candidate.is_file();
    Some(AdapterCacheInfo {
        agent_id: agent_id.to_string(),
        package: package.to_string(),
        binary: binary.to_string(),
        cached,
        local_path: cached.then(|| candidate.to_string_lossy().into_owned()),
    })
}

/// Remplace `npx -y <package>` par le binaire local mis en cache dans `~/.kana/adapters` lorsqu'il est disponible,
/// ou ajoute `--prefer-offline` à `npx` pour privilégier le cache npm local sans latence réseau au démarrage.
pub fn with_cached_adapter(mut spec: AgentSpec, home: &Path) -> AgentSpec {
    if spec.command != "npx" {
        return spec;
    }
    for agent_id in ["codex", "claude", "gemini"] {
        let Some((pkg, _, extra_args)) = adapter_package_and_binary(agent_id) else {
            continue;
        };
        if spec.args.iter().any(|a| a == pkg) {
            if let Some(info) = inspect_adapter_cache(agent_id, home)
                && let Some(local_bin) = info.local_path
            {
                spec.command = local_bin;
                spec.args = extra_args.iter().map(|s| (*s).to_string()).collect();
                return spec;
            }
            if !spec.args.iter().any(|a| a == "--prefer-offline") {
                spec.args.insert(0, "--prefer-offline".to_string());
            }
            break;
        }
    }
    spec
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_agents_have_a_preset() {
        for id in ["opencode", "codex", "claude", "gemini"] {
            assert!(preset(id).is_some(), "{id}");
        }
    }

    #[test]
    fn unknown_agent_has_no_preset() {
        assert_eq!(preset("inconnu"), None);
    }

    #[test]
    fn api_key_variables_match_each_provider() {
        assert_eq!(api_key_env("codex"), Some("OPENAI_API_KEY"));
        assert_eq!(api_key_env("opencode"), None);
    }

    #[test]
    fn with_env_appends_a_variable() {
        let spec = AgentSpec::new("x", &[]).with_env("A", "1");
        assert_eq!(spec.env, vec![("A".to_string(), "1".to_string())]);
    }

    #[test]
    fn seatbelt_profile_switches_between_workspace_write_and_read_only() {
        let cwd = Path::new("/tmp/kana-sandbox-test");
        let rw = seatbelt_profile(cwd, false);
        assert!(rw.contains("(deny file-write*)"));
        assert!(rw.contains("(allow file-write* (subpath \"/tmp/kana-sandbox-test\"))"));

        let ro = seatbelt_profile(cwd, true);
        assert!(ro.contains("(deny file-write*)"));
        assert!(!ro.contains("/tmp/kana-sandbox-test"));
    }

    #[test]
    fn effective_command_wraps_local_sandbox_when_enabled() {
        let cwd = Path::new("/tmp/kana-work");
        let plain = AgentSpec::new("opencode", &["acp"]);
        assert_eq!(
            effective_command(&plain, cwd),
            ("opencode".to_string(), vec!["acp".to_string()])
        );

        let sandboxed = plain.clone().with_sandbox(SandboxPolicy::WorkspaceWrite);
        let (program, args) = effective_command(&sandboxed, cwd);
        if cfg!(target_os = "macos") && Path::new("/usr/bin/sandbox-exec").exists() {
            assert_eq!(program, "/usr/bin/sandbox-exec");
            assert_eq!(args[0], "-p");
            assert!(args[1].contains("/tmp/kana-work"));
            assert_eq!(&args[2..], ["opencode", "acp"]);
        } else if cfg!(target_os = "linux") && Path::new("/usr/bin/bwrap").exists() {
            assert_eq!(program, "/usr/bin/bwrap");
            assert!(args.contains(&"--bind".to_string()));
        }

        let ro_bwrap = bwrap_args(cwd, true, "opencode", &["acp".to_string()]);
        assert_eq!(
            ro_bwrap,
            vec!["--ro-bind", "/", "/", "--dev", "/dev", "--proc", "/proc", "--", "opencode", "acp"]
        );
        let rw_bwrap = bwrap_args(cwd, false, "opencode", &["acp".to_string()]);
        assert_eq!(
            rw_bwrap,
            vec![
                "--ro-bind",
                "/",
                "/",
                "--bind",
                "/tmp/kana-work",
                "/tmp/kana-work",
                "--dev",
                "/dev",
                "--proc",
                "/proc",
                "--",
                "opencode",
                "acp"
            ]
        );
    }

    #[test]
    fn effective_command_builds_ssh_docker_and_devcontainer_targets() {
        let cwd = Path::new("/tmp/local");
        let base = AgentSpec::new("npx", &["-y", "@zed-industries/codex-acp"]);

        let ssh_spec = base.clone().with_target(ExecutionTarget::Ssh {
            host: "dev@example.com".into(),
            remote_dir: Some("/srv/my repo".into()),
        });
        assert_eq!(
            effective_command(&ssh_spec, cwd),
            (
                "ssh".into(),
                vec![
                    "-o".into(),
                    "BatchMode=yes".into(),
                    "dev@example.com".into(),
                    "cd '/srv/my repo' && npx -y @zed-industries/codex-acp".into(),
                ]
            )
        );

        let docker_spec = base.clone().with_target(ExecutionTarget::Docker {
            container: "kana-dev".into(),
            workdir: Some("/workspace".into()),
        });
        assert_eq!(
            effective_command(&docker_spec, cwd),
            (
                "docker".into(),
                vec![
                    "exec".into(),
                    "-i".into(),
                    "-w".into(),
                    "/workspace".into(),
                    "kana-dev".into(),
                    "npx".into(),
                    "-y".into(),
                    "@zed-industries/codex-acp".into(),
                ]
            )
        );

        let dc_spec = base.with_target(ExecutionTarget::DevContainer {
            folder: "/Users/me/proj".into(),
        });
        assert_eq!(
            effective_command(&dc_spec, cwd),
            (
                "devcontainer".into(),
                vec![
                    "exec".into(),
                    "--workspace-folder".into(),
                    "/Users/me/proj".into(),
                    "npx".into(),
                    "-y".into(),
                    "@zed-industries/codex-acp".into(),
                ]
            )
        );
    }

    #[test]
    fn with_cached_adapter_replaces_npx_when_local_binary_is_present() {
        let home = std::env::temp_dir().join(format!("kana-adapter-cache-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let bin_dir = adapter_cache_dir(&home).join("node_modules").join(".bin");
        std::fs::create_dir_all(&bin_dir).unwrap();

        let before = inspect_adapter_cache("claude", &home).unwrap();
        assert!(!before.cached);
        assert!(before.local_path.is_none());

        let unchanged = with_cached_adapter(preset("claude").unwrap(), &home);
        assert_eq!(unchanged.command, "npx");
        assert!(unchanged.args.contains(&"--prefer-offline".to_string()));

        let claude_bin = bin_dir.join("claude-agent-acp");
        std::fs::write(&claude_bin, "#!/bin/sh\n").unwrap();
        let gemini_bin = bin_dir.join("gemini");
        std::fs::write(&gemini_bin, "#!/bin/sh\n").unwrap();

        let after = inspect_adapter_cache("claude", &home).unwrap();
        assert!(after.cached);
        assert_eq!(after.local_path.as_deref(), Some(claude_bin.to_string_lossy().as_ref()));

        let cached_claude = with_cached_adapter(preset("claude").unwrap(), &home);
        assert_eq!(cached_claude.command, claude_bin.to_string_lossy().as_ref());
        assert!(cached_claude.args.is_empty());

        let cached_gemini = with_cached_adapter(preset("gemini").unwrap(), &home);
        assert_eq!(cached_gemini.command, gemini_bin.to_string_lossy().as_ref());
        assert_eq!(cached_gemini.args, vec!["--experimental-acp".to_string()]);

        let _ = std::fs::remove_dir_all(&home);
    }
}
