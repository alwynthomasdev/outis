# Architecture

Outis is an Electron app with three processes:

```
┌──────────────────────┐   IPC (invoke)   ┌───────────────────┐  MessagePort  ┌──────────────────────────┐
│ Window (renderer)    │ ───────────────▶ │ Main process      │ ────────────▶ │ Background worker        │
│ Vue 3 + Naive UI     │ ◀─────────────── │ files, dialogs,   │ ◀──────────── │ (utilityProcess)         │
│ sandboxed, no Node   │   window.outis   │ storage, offline  │               │ parsing, engine, NER     │
└──────────────────────┘                  │ guard             │               │ model (ONNX Runtime)     │
                                          └───────────────────┘               └──────────────────────────┘
```

| Folder                    | What's there                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/core/`               | The anonymisation engine. Plain TypeScript with no Electron or Node APIs, unit tested with Vitest. |
| `src/main/`               | Main process (`index.ts`, `ipc.ts`, `store.ts`, `offline.ts`) and the worker (`worker.ts`).        |
| `src/preload/`            | Exposes the typed `window.outis` API ([`src/shared/api.ts`](../src/shared/api.ts)).                |
| `src/renderer/`           | The UI: views, components and Pinia stores.                                                        |
| `scripts/fetch-model.mjs` | Downloads the NER model into `resources/models/` (build time only).                                |

## Core engine

- `detectors.ts`: rule detectors and `mergeSpans` (overlap resolution).
- `validators.ts`: Luhn, mod-11 (NHS), mod-97 (IBAN), NI number and IPv4 checks.
- `mapper.ts`: makes fakes. Each `(type, value)` gets a PRNG seeded with `HMAC-SHA256(consistencyKey, type|value|attempt)`, and results are cached. A value is re-rolled if its fake equals the original, or collides with another value's fake. Names are mapped word by word, and emails reuse the name mapping.
- `actions.ts`: fake / mask / hash / redact / constant / clear for one value.
- `text.ts`: applies spans to a text and records where each replacement sits in both versions (used by the diff views).
- `ner.ts`: turns the model's word pieces into spans. The model returns no character offsets, so pieces are located in order. It also splits long text into chunks under the model's 512-token limit.
- `paths.ts`, `formats.ts`: JSON path walking and pattern matching; CSV/JSON parse and serialise.
- `engine.ts`: runs rules over a table or JSON document in three passes: names, then other fields, then free-text scans.
- `suggest.ts`: field profiling and rule suggestions.

## How Outis stays offline

Several independent layers each block network access:

1. **DNS**: Chromium starts with `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost"`, so no host name resolves. Background networking, component updates and pings are disabled.
2. **Request filter**: `session.webRequest.onBeforeRequest` cancels every request that isn't `file:`, `data:`, `blob:` or `devtools:`. In development, `localhost` is allowed for the Vite dev server. Blocked requests are logged and shown in Settings → Network guard.
3. **Content Security Policy**: `default-src 'self'`, with no remote scripts, styles, fonts or images.
4. **Window lock-down**: `sandbox`, `contextIsolation`, no `nodeIntegration`, no new windows, no navigation away from the app, and all permission requests denied. Spell-check (which downloads dictionaries) is off.
5. **Worker**: replaces `fetch` and `net.Socket.connect` with functions that throw. transformers.js runs with `allowRemoteModels = false` and reads the model from disk only.
6. **No updater, telemetry or crash reporter.**

The end-to-end test checks that the network guard log is empty after a full run.

## The NER model

[`Xenova/bert-base-NER`](https://huggingface.co/Xenova/bert-base-NER), `onnx/model_quantized.onnx` (int8, ~109 MB). In development it lives in `resources/models/`. Packaged builds ship it in `resources/models` next to the app (electron-builder `extraResources`), outside the asar archive. The worker loads it lazily on first use. The app warms it up in the background at start-up, so the first scan is quick. Without the model, Outis falls back to rules and dictionaries and says so in the status bar.

## Data handling

- Files are read by the main process and parsed in the worker. Nothing is written except where you choose in a save dialog.
- The library and settings (including the consistency key) are JSON files in the app data folder.
- The original→fake mapping is held in memory for the session. It is only written to disk if you export it, after a warning.
