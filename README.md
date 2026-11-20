<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Kana icon" />
</p>

<h1 align="center">Kana</h1>
 
# Kana

Poste de pilotage desktop natif (Rust + Tauri) unifiant les agents de code (Claude Code, Codex, Gemini CLI, OpenCode) via ACP, avec gestion de worktrees Git et relais automatique en cas de limite de quota.

## Architecture

- `crates/kana-core` : logique métier, machine à états et routeur de failover
- `crates/kana-acp` : client ACP générique (gestion des sous-processus et streaming JSON-RPC)
- `crates/kana-git` : gestion des worktrees et génération de diffs
- `crates/kana-db` : persistance SQLite et historique canonique
- `apps/desktop` : application Tauri v2
