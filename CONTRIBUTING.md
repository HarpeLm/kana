# Contributing to Kana

Thank you for wanting to help! This guide explains how to propose a change.

## Before you start

- Search the [issues](https://github.com/HarpeLm/kana/issues): the topic may already exist.
- For a big change, open an issue first to discuss it: it saves wasted work.
- By contributing, you agree that your work is published under the project's dual MIT / Apache-2.0 license.
- Be kind: see the [code of conduct](CODE_OF_CONDUCT.md).

## Setting up

You need [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 22, git and the [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/HarpeLm/kana.git
cd kana/apps/desktop
npm install
npm run tauri dev
```

To work on the interface alone, without Tauri (simulated agent): `npm run dev`, then open http://localhost:1420.

## What lives where

- `apps/desktop/src`: the interface (React, Tailwind). Pure logic lives in `src/lib`.
- `apps/desktop/src-tauri`: the Tauri commands, which connect the interface to the crates.
- `crates/`: the Rust core (`kana-acp`, `kana-git`, `kana-db`, `kana-mcp`, `kana-pty`, `kana-core`).

## Tests

Everything must pass before you open a pull request; the tests also run on every push with GitHub Actions.

```bash
cargo test --workspace         # Rust
cd apps/desktop
npx tsc --noEmit               # types
npm test                       # interface logic (Vitest)
npm run test:e2e               # screens in the browser (Playwright)
```

- Fixed a bug: add a test that failed before the fix.
- New feature: add at least one test of its logic (a `*.test.ts` next to the code, or a Rust test).
- A change you can see on screen: if possible, a test in `apps/desktop/e2e`.

## Proposing a change

1. Create a branch from `main`.
2. Make small commits, one per file or per idea, with a clear message, for example `fix(desktop): stop long lines from scrolling the chat sideways`.
3. Check that the tests pass.
4. Open a pull request and fill in the template: what the change does, why, and how you checked it.

## Style

- Rust: `cargo fmt`, and no new `cargo clippy` warnings.
- Interface: user-facing text is in French for now, components stay short, and logic goes in `src/lib` rather than in components.
- No new dependency without a reason: explain it in the pull request.
