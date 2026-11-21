# Contribuer à Kana

Merci de vouloir aider ! Ce guide explique comment proposer un changement.

## Avant de commencer

- Cherchez dans les [issues](https://github.com/HarpeLm/kana/issues) : le sujet existe peut-être déjà.
- Pour un changement important, ouvrez d'abord une issue pour en discuter : cela évite du travail perdu.
- En contribuant, vous acceptez que votre travail soit publié sous la double licence MIT / Apache-2.0 du projet.
- Soyez bienveillant : voir le [code de conduite](CODE_OF_CONDUCT.md).

## Mettre en place l'environnement

Il faut [Rust](https://rustup.rs) (stable), [Node.js](https://nodejs.org) 22, git et les [prérequis de Tauri](https://tauri.app/start/prerequisites/).

```bash
git clone https://github.com/HarpeLm/kana.git
cd kana/apps/desktop
npm install
npm run tauri dev
```

Pour travailler sur l'interface seule, sans Tauri (agent simulé) : `npm run dev`, puis http://localhost:1420.

## Où se trouve quoi

- `apps/desktop/src` : l'interface (React, Tailwind). La logique pure est dans `src/lib`.
- `apps/desktop/src-tauri` : les commandes Tauri, qui font le lien avec les crates.
- `crates/` : le cœur en Rust (`kana-acp`, `kana-git`, `kana-db`, `kana-mcp`, `kana-pty`, `kana-core`).

## Les tests

Tout doit passer avant d'ouvrir une pull request ; ils tournent aussi à chaque push avec GitHub Actions.

```bash
cargo test --workspace         # Rust
cd apps/desktop
npx tsc --noEmit               # types
npm test                       # logique de l'interface (Vitest)
npm run test:e2e               # écran dans le navigateur (Playwright)
```

- Un bug corrigé : ajoutez un test qui échouait avant la correction.
- Une fonction nouvelle : ajoutez au moins un test de sa logique (`*.test.ts` à côté du code, ou un test Rust).
- Un changement visible à l'écran : si possible, un test dans `apps/desktop/e2e`.

## Proposer un changement

1. Créez une branche à partir de `main`.
2. Faites de petits commits, un par fichier ou par idée, avec un message clair, par exemple `fix(desktop): stop long lines from scrolling the chat sideways`.
3. Vérifiez que les tests passent.
4. Ouvrez une pull request en remplissant le modèle : ce que le changement fait, pourquoi, et comment vous l'avez vérifié.

## Style

- Rust : `cargo fmt` et pas d'avertissement nouveau de `cargo clippy`.
- Interface : textes en français, composants courts, la logique dans `src/lib` plutôt que dans les composants.
- Pas de dépendance ajoutée sans raison : expliquez-la dans la pull request.
