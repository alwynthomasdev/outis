# Contributing

Thanks for helping improve Outis.

1. Read [docs/development.md](docs/development.md) to set up, run (F5 in VS Code) and test.
2. Create a branch for your change.
3. Before opening a pull request, run:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
4. **Update the documentation in the same pull request**: the relevant page in `docs/`, the README if it's affected, and an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

## Guidelines

- Outis must work with no network access. Don't add anything that downloads at runtime: no CDNs, remote fonts, update checks or telemetry.
- Keep anonymisation logic in `src/core/` (pure TypeScript), and add unit tests for it.
- Fake values must never be real: use reserved or test ranges (see [docs/detectors.md](docs/detectors.md#types)).
- Never commit real personal data, including in tests and samples.
