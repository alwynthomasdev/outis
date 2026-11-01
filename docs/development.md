# Development

## Setup

Requirements: Node.js 22+ (developed on Node 26), npm, Git. Windows, macOS or Linux.

```bash
git clone https://github.com/alwynthomasdev/outis.git
cd outis
npm install
npm run fetch-model     # once: downloads the NER model (~110 MB) into resources/models
```

The app works without the model (rules only), but free-text detection of names, places and organisations needs it.

## Run and debug

**VS Code: press F5.** The default configuration, **Run Outis (debug)**, starts the app with debuggers attached to:

- the **main process** (breakpoints in `src/main`, `src/core`),
- the **window** (breakpoints in `src/renderer`, including `.vue` files),
- the **background worker** on port 9230 (breakpoints in `src/main/worker.ts` and `src/core` code it runs).

The window reloads when you change renderer files. After changing main-process or worker code, restart the debug session (Ctrl+Shift+F5).

If F5 doesn't pick the right configuration, choose **Run Outis (debug)** in the Run and Debug panel first. Install the recommended extensions when VS Code asks (Vue, ESLint, Prettier, Vitest).

The launch configuration clears `ELECTRON_RUN_AS_NODE`. If you start the app from a shell where that variable is set (some VS Code terminals do this), Electron runs as plain Node and fails with `bad option`. Unset it first.

Without VS Code:

```bash
npm run dev
```

## Tests

```bash
npm test             # unit tests (Vitest), src/**/*.test.ts
npm run test:e2e     # builds, then drives the real app with Playwright (e2e/)
npm run lint
npm run typecheck
```

- **Debug tests (current file)** and **Debug all tests** are in the Run and Debug panel.
- The e2e test uses a temporary profile, mocks the file dialog, opens `samples/customers.csv` and `samples/orders.json`, runs the text sample, and checks that no network requests were made. Screenshots go to `test-results/`.

Sample files for manual testing are in [`samples/`](../samples).

## Project layout

See [architecture.md](architecture.md).

## Building installers

```bash
npm run build:win     # dist/Outis-x.y.z-setup.exe and Outis-x.y.z-portable.exe
npm run build:linux   # AppImage and .deb
npm run build:mac     # .dmg (unsigned)
```

Run `npm run fetch-model` first so the model is included.

## Releasing

Releases are built by GitHub Actions ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) when a version tag is pushed.

1. Move the changes under `## [Unreleased]` in [CHANGELOG.md](../CHANGELOG.md) to a new version section, e.g. `## [0.2.0] - 2026-11-15`.
2. Commit, then bump the version and tag it:
   ```bash
   npm version minor        # or patch / major: updates package.json and creates tag v0.2.0
   git push --follow-tags
   ```
3. The workflow runs the tests, downloads the model, builds the Windows installer and portable exe, and publishes a GitHub Release. The release notes come from the changelog section.

Builds are not code-signed. To add signing later, set `CSC_LINK` / `CSC_KEY_PASSWORD` secrets and pass them to the build step.

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs lint, typecheck, unit tests and a build on every push and pull request, on Windows and Ubuntu. The end-to-end tests run on Windows.

## Documentation rule

Every change to behaviour updates the relevant page in `docs/`, the README if needed, and `CHANGELOG.md`, in the same commit.
