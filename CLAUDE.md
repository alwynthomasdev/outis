# Outis: notes for AI assistants

Offline Electron + Vue 3 + TypeScript app for anonymising PII in CSV/JSON/text. See `docs/architecture.md`.

## Rules

- **Keep documentation current.** Any behaviour or feature change must update the relevant `docs/*.md`, the README if affected, and add an entry under `## [Unreleased]` in `CHANGELOG.md`, in the same commit.
- **Never add network access** (CDNs, remote fonts, update checks, telemetry, runtime downloads). The offline guard in `src/main/offline.ts` and `src/main/worker.ts` must stay.
- Anonymisation logic lives in `src/core/` (pure TS, no Node/Electron APIs) with Vitest tests in `src/core/*.test.ts`.
- Fakes must come from safe ranges (reserved domains, Ofcom drama numbers, QQ NI, 999 NHS, TEST-NET IPs).
- Keep `.vscode/launch.json` working: F5 → "Run Outis (debug)".

## Commands

- `npm run dev`: run the app (or F5)
- `npm test`: unit tests; `npm run test:e2e`: Playwright tests against the built app
- `npm run lint && npm run typecheck`
- `npm run fetch-model`: download the NER model to `resources/models` (gitignored)
- Release: update CHANGELOG, `npm version <patch|minor|major>`, `git push --follow-tags`

If a shell has `ELECTRON_RUN_AS_NODE=1` set (VS Code terminals can), unset it before launching Electron.
