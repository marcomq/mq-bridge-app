# AGENTS.md

## Project Snapshot

`mq-bridge-app` is a Rust + Svelte application.

- Backend/runtime: Rust (`crates/core`, `crates/cli`, `crates/desktop`)
- UI: Svelte 5 + Vite (`ui/src`), utilizing Runes for state management.
- Legacy migration: mostly completed; remaining compatibility shims still exist.

## Current UI Architecture

- Main app bootstrapping: `ui/src/bootstrap.ts`, `ui/src/main.ts`
- Main tabs/components:
  - `ui/src/components/PublishersPanel.svelte`
  - `ui/src/components/ConsumersPanel.svelte`
  - `ui/src/components/RoutesPanel.svelte`
  - `ui/src/components/SettingsPanel.svelte`
- State/stores:
  - `ui/src/lib/stores.ts`
  - `ui/src/lib/runtime-status.ts`
  - Modernized state handling via Svelte 5 `$state` and `$derived` runes.
- Runtime bridge helpers:
  - `ui/src/lib/runtime-window.ts`

## Important Recent Behavior Decisions

1. Consumer tab/save behavior
   - Save keeps the active consumer subtab (no definition/messages flicker).

2. Runtime status indicator
   - Topbar runtime status is sourced from polled runtime state, not stale legacy globals.

## Testing Guidance

- Unit tests:
  - Commands: `npm run test:unit` and `cargo test`
  - Focused suites used often:
    - `tests/unit/consumers-view.test.ts`
    - `tests/unit/publishers-view.test.ts`
    - `tests/unit/routes-view.test.ts`
    - `tests/unit/import-export.test.ts`
    - `tests/unit/bootstrap-runtime-status.test.ts`

- UI/E2E tests:
  - Command: `npm run test:ui`
  - Main spec: `tests/playwright/ui.spec.js`
  - Tests currently reset config before each case via `/config` post.

## Known Active Areas

- Further reduction of legacy/global `window` dependencies.
- Completion of the transition from legacy Svelte stores to Svelte 5 `$state` and `$derived` Runes.
- Remaining migration cleanup from `*-view.ts` controller modules into cleaner component/service boundaries.
- Enhanced real-time monitoring features and throughput visualization.
- Additional consumer traffic E2E coverage can still be expanded.

## Storage direction

Use a workspace-based storage model as the long-term target.

Workspace/domain data should still live in the workspace config where appropriate, but we no longer treat `localStorage` as UI-only state. Local browser/Tauri storage may be used for message history, traces, headers, payloads, and similar cached runtime data, but it should be encrypted at rest when the selected mode calls for it.

Threat model:

- Encrypted local storage is for offline inspection after shutdown, similar to encrypted swap or encrypted temp files.
- It is not meant to defend against malicious JavaScript, XSS, compromised frontend code, or arbitrary code execution inside the running app.

User-facing storage/security modes should stay simple even if the internal implementation uses more detailed key-provider and encryption abstractions.

CLI target modes:

- `unencrypted`: config is plain, secrets may be stored inline, and messages/local storage are plain.
- `env-secrets`: config is plain and sensitive values are extracted to env vars/placeholders. Messages/local storage are plain.
- `env-secrets-temporary-messages`: config is plain, secrets are extracted to env vars/placeholders, and messages/local storage are encrypted with a random process key. Message history is intentionally lost after restart. This is the preferred CLI default.

Tauri target modes:

- `unencrypted`: config is plain, secrets may be stored inline, and messages/local storage are plain.
- `keychain-secrets`: config is plain, sensitive values are stored in the OS key store/keychain, and messages/local storage are plain.
- `encrypted-config-temporary-messages`: config is encrypted with a persistent random key stored in the OS key store/keychain, while messages/local storage are encrypted with a separate random process key and intentionally lost after restart. This is the preferred Tauri default when a usable key store exists.
- `encrypted-config-persistent-messages`: config is encrypted with a persistent random key stored in the OS key store/keychain, and messages/local storage are encrypted with a separate persistent random key stored in the OS key store/keychain. This should be opt-in rather than the default.

Fallbacks:

- Do not assume the OS key store exists or is writable.
- When no usable OS key store is available in Tauri, fall back to modes that are honest about persistence. Temporary encrypted messages with an ephemeral process key are acceptable; fake persistence is not.
- The backend should expose storage/security status to the UI so the UI can explain whether message history is unencrypted, temporary, or persistently encrypted.

Recommended runtime status shape:

```ts
type StorageSecurityInfo = {
  encrypted: boolean;
  persistent: boolean;
  keySource: "none" | "os-key-store" | "ephemeral-process" | "env";
  configEncrypted: boolean;
  messagesEncrypted: boolean;
  messagesPersistent: boolean;
  reason?: "key-store-unavailable" | "key-store-write-failed" | "cli-mode";
};
```

Important behavior:

- If message decryption fails and the message key is ephemeral, clear the old encrypted message storage and continue with empty messages.
- If config decryption fails with a persistent key, show a recoverable error and offer reset or migration options. Do not silently delete config.

Recommended architecture:

- Keep encryption and decryption out of scattered UI call sites.
- Use a small storage/encryption abstraction with a mode enum, backend-exposed `StorageSecurityInfo`, key-provider abstraction, encryptor/decryptor abstraction, and encrypted JSON storage wrapper.
- Message history storage can be more disposable than config storage. Config persistence must be stricter and more conservative.

Encrypted storage format:

- Use an algorithm-pluggable encrypted envelope from the beginning.
- Prefer `nonce` over `iv` in the envelope naming.
- Include version, algorithm id, key id, nonce, and ciphertext.
- Bind ciphertext to its logical storage location with AAD when possible, for example `mq-bridge-app:localStorage:messages` or `mq-bridge-app:config`.

Example:

```ts
type EncryptedEnvelope = {
  v: number;
  alg: "AES-256-GCM" | "AES-256-GCM-SIV" | "XCHACHA20-POLY1305";
  kid: string;
  nonce: string;
  ciphertext: string;
};
```

Algorithm guidance:

- Avoid AES-CBC, unauthenticated AES-CTR, custom crypto constructions, and opaque \"secure localStorage\" libraries.
- If encryption happens in frontend JS, start with AES-256-GCM via WebCrypto using a fresh random 96-bit nonce for each encryption.
- If encryption happens in Rust/backend/Tauri, prefer an AEAD abstraction. AES-256-GCM-SIV is attractive if the crate support is solid; AES-256-GCM is an acceptable first step.
- Keep the envelope algorithm-pluggable either way so key rotation and future algorithm upgrades stay possible.

Saving should not blindly stop or restart routes. Compare current, saved, and applied runtime state. We should add manual triggers to restart routes or consumers.

When changing persistence code, avoid introducing ad hoc storage paths. Reuse the central workspace/config model plus the shared encrypted storage abstraction instead of scattering one-off `localStorage` logic.

## XSS

Make sure we don't print user / network input as html in UI, as we need to be protected against XSS. There also should be a basic protection against CSRF in browser mode.

## Working style for Codex agents

For non-trivial implementation or refactoring tasks, do not jump directly to a complete implementation.

Use a design-checkpoint workflow:

1. Explore the relevant code first. Follow the Codebase navigation guidance below.
2. Before implementing the main change, explain the intended solution shape:
   - target architecture
   - data flow
   - files/components likely to change
   - what will be removed or replaced
   - known tradeoffs or risks
3. For larger changes, provide a small sketch or partial example if it helps clarify the approach. Mark it clearly as unfinished. Do not perform the main implementation yet.
4. Stop and wait for user feedback before writing the main implementation.
5. After feedback, continue with the implementation. Run relevant tests/checks. Prefer checking only whether tests pass or fail; inspect detailed test output only when a test fails.

The checkpoint is about design direction, not about asking permission for every small edit.

## Codebase navigation

Use the `tokensave` MCP, if available, before broad file exploration when you need to understand project structure, symbol relationships, call sites, or likely impact areas. If it is not available, fall back to targeted search and reading only the relevant files.

Prefer tokensave for:
- finding symbols, structs, traits, functions, and modules
- finding callers/callees and related files
- estimating the impact of a change
- locating likely test files
- avoiding repeated grep/read exploration across the repository

After tokensave identifies relevant files or symbols, read the actual source files before editing them. Do not rely on summaries alone for implementation details.

For Rust changes, prefer checking:
- trait definitions and implementations
- feature-gated code paths
- public API usage
- tests and examples affected by the change

Avoid reading many unrelated files when a targeted tokensave query can narrow the scope first.

## UI direction

Prefer small, boring, understandable UI code over clever abstractions.

Avoid adding new UI dependencies unless they clearly reduce complexity.

Keep the visual style minimal and unobtrusive. Prefer simple native-like controls when Web Components introduce event or rendering issues.

When changing forms, preserve keyboard usability and avoid hidden persistence side effects.

## Optional review tools

If the CodeRabbit CLI is installed and authenticated, it may be used for an additional local review of non-trivial diffs before finalizing.

Prefer agent-readable output when used from an AI coding agent:

```sh
cr --agent --type uncommitted
```

Do not make CodeRabbit mandatory. If it is unavailable, unauthenticated, rate-limited, or not useful for the current task, continue with normal local checks.

After running CodeRabbit, summarize only actionable findings and decide whether they should be applied.

## Operational Notes

- Dev backend script: `scripts/dev-backend.mjs`
- Playwright uses a temporary config file in `/tmp` for deterministic test setup.
- CLI defaults auto-enable UI/metrics when no persisted config exists.

## Quick Start

1. Install deps: `npm install`
2. Run app: `npm run dev`
3. Unit tests: `npm run test:unit`
4. UI tests: `npm run test:ui`
