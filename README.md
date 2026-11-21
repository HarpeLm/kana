<p align="center">
  <img src="assets/icon.png" width="128" height="128" alt="Kana icon" />
</p>

<h1 align="center">Kana</h1>

<p align="center">
  <strong>The cockpit for your coding agents.</strong><br />
  Claude Code, Codex, Gemini CLI and OpenCode in a single native, fast desktop app.
</p>

<p align="center">
  <a href="https://github.com/HarpeLm/kana/actions/workflows/ci.yml"><img alt="Tests" src="https://github.com/HarpeLm/kana/actions/workflows/ci.yml/badge.svg" /></a>
  <img alt="Rust" src="https://img.shields.io/badge/Rust-2024-b7410e?logo=rust&logoColor=white" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-v2-24c8db?logo=tauri&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT%20%2F%20Apache--2.0-blue" />
</p>

<p align="center">
  <img src="assets/screenshot.png" alt="Kana: a conversation on the left, an editable artifact on the right" width="900" />
</p>
<p align="center"><sub>Preview in the browser with the simulated agent: a conversation, and an artifact you fix right on the page. (The interface is currently in French.)</sub></p>

## Why Kana

Every coding agent has its own terminal, settings and limits. Kana puts them behind a single protocol, the [Agent Client Protocol](https://agentclientprotocol.com) (ACP), and adds what they all lack: a separate working folder for each conversation, a browser the agents can drive with your approval, pages ("artifacts") you can review and fix by hand, and an automatic relay when a provider hits its limit.

## What Kana can do

**Conversations**
- Several providers, one place: pick the agent, the model and the **effort level**, and switch provider mid-conversation (the new agent gets a summary).
- Four permission modes: ask for approval, **plan** (read-only, enforced by Kana), automatic, full access.
- Readable answers: collapsible commands with their duration, folded reasoning, links to local files (`App.tsx:42` opens at the right line), attached images sent as real images.
- Conversation titles written by the agent, `/compact` with the number of tokens saved, a gauge of each model's real context window.
- Retry, edit a message in place, copy, and **fork** a conversation from any message.

**One working folder per conversation**
- Each conversation works in its own git *worktree*: several agents, no conflicts.
- Session panel: branch, commits, changed files, a file-by-file **diff**, pull request creation with confirmation, merge or discard the work.
- Cleanup of orphaned worktrees and branches, without ever losing work.

**Artifacts**
- An artifact is a self-contained HTML page in `artefacts/`: a plan, a checklist, a dashboard, a mock-up…
- A **gallery** with previews, search, sorting and a list view; artifacts also show up in the global search, with a preview.
- A **visual editor**: click a text to edit it, delete, add or **drag a line to move it** (numbering follows), undo and redo; saving is automatic.
- **Comment on a passage**: highlight a sentence, say what is wrong, and the agent only edits that spot.

**Quota Relay**
- Detects reached limits and refused connections, and offers (or automatically does) to carry on with another provider, passing along a summary of the conversation.
- Usage tracking per provider and per day.

**And more**
- **Globe**: a built-in browser the agents use (MCP tools) with your approval, with persistent sessions.
- Terminal, file editor (highlighting, search, saving), drag and drop of files and folders.
- Global search (conversations, projects, artifacts), a Claude Code-style sidebar with folders, sections and pinning.
- API keys kept in the macOS Keychain.

## Architecture

| Folder | Role |
| --- | --- |
| `apps/desktop` | The app: Tauri v2, React 19 + Tailwind v4 interface |
| `crates/kana-acp` | Generic ACP client: subprocesses, JSON-RPC, event stream, models, effort, modes |
| `crates/kana-core` | Business logic, state machine and failover router between providers |
| `crates/kana-git` | Worktrees, branches, diffs, files, pull requests |
| `crates/kana-db` | SQLite persistence of conversations and history |
| `crates/kana-mcp` | MCP server that gives agents control of the Globe |
| `crates/kana-pty` | Built-in terminals |

## Running Kana

Requirements: [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 22, git, the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your system, and at least one agent installed (OpenCode, Claude Code, Codex or Gemini CLI). Each agent is signed in from **Settings** (shown as "Réglages" in the French interface).

```bash
git clone https://github.com/HarpeLm/kana.git
cd kana/apps/desktop
npm install
npm run tauri dev
```

To try the interface alone, without Tauri (simulated agent):

```bash
npm run dev    # then open http://localhost:1420
```

Build the app:

```bash
npm run tauri build
```

## Tests

```bash
cargo test --workspace      # Rust
cd apps/desktop
npm test                    # interface logic (Vitest)
npm run test:e2e            # screens in the browser (Playwright)
```

All of this runs on every push with GitHub Actions.

## Contributing

Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md). Please also read the [code of conduct](CODE_OF_CONDUCT.md). To report a security vulnerability, see [SECURITY.md](SECURITY.md).

## License

Kana is distributed under your choice of the [Apache 2.0](LICENSE-APACHE) or [MIT](LICENSE-MIT) license.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in Kana is published under this dual license, without any additional terms or conditions.
