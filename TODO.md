# TODO: mq-bridge-app roadmap / Codex task list

This file is intentionally broader than one implementation task. It should act as a working backlog for Codex sessions and for manual planning.

Important workflow for Codex: for non-trivial changes, do not jump directly to a finished implementation. First inspect the relevant code, propose the intended solution shape, list affected files/components, identify removals/migrations/tradeoffs, and stop for feedback before the main implementation.


## 7. Storage and encryption modes

### Goal

Document and implement clear storage/security behavior for config and cached message artifacts.

Important distinction:

- Encrypted `localStorage` is for encryption at rest of offline artifacts after shutdown.
- It is not intended as a defense against malicious JavaScript, XSS, compromised frontend code, or code execution inside the running app.

Keep the user-facing modes simple. Do not expose a large internal matrix even if the implementation uses richer key-provider and encryption abstractions.

CLI target:

1. `unencrypted`
   - Config is plain.
   - Sensitive values may be stored directly.
   - Messages and local storage are plain.

2. `env-secrets`
   - Config is plain.
   - Sensitive values are extracted to env vars or placeholders.
   - Messages and local storage are plain.

3. `env-secrets-temporary-messages`
   - Config is plain.
   - Sensitive values are extracted to env vars or placeholders.
   - Messages and local storage are encrypted with a random process key.
   - Message history is intentionally lost after restart.
   - This should probably be the CLI default.

Tauri target:

1. `unencrypted`
   - Config is plain.
   - Sensitive values may be stored directly.
   - Messages and local storage are plain.

2. `keychain-secrets`
   - Config is plain.
   - Sensitive values are stored in the OS key store or keychain.
   - Messages and local storage are plain.

3. `encrypted-config-temporary-messages`
   - Config is encrypted using a persistent random key stored in the OS key store or keychain.
   - Sensitive values may live in the key store or inside the encrypted config depending on the final implementation.
   - Messages and local storage are encrypted with a separate random process key.
   - Message history is intentionally cleared after restart.
   - This should probably be the Tauri default if a key store is available.

4. `encrypted-config-persistent-messages`
   - Config is encrypted using a persistent random key stored in the OS key store or keychain.
   - Messages and local storage are encrypted with a separate persistent random key stored in the OS key store or keychain.
   - Message history survives restart.
   - This should be opt-in, not the default.

Fallback behavior:

- Do not assume the OS key store is always available, especially on Linux, headless, or minimal systems.
- If Tauri has no usable key store, only offer or fall back to:
  - `unencrypted`
  - temporary encrypted messages with an ephemeral process key
- Do not silently pretend message history is persistent if it is not.
- The backend should expose storage/security status to the UI so the UI can explain whether message history is persistent or temporary.

Suggested runtime status shape:

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

- If message decryption fails and the message key is ephemeral:
  - clear old encrypted message storage
  - continue with empty messages
  - do not fail the whole app
- If config decryption fails with a persistent key:
  - show a recoverable error
  - offer a reset or migration path
  - do not silently delete config

Storage design:

- Keep an algorithm-pluggable encrypted envelope from the beginning.
- Prefer `nonce` over `iv` in naming.
- Include version, algorithm id, key id, nonce, and ciphertext.
- Use AAD where possible to bind ciphertext to a logical storage slot such as:
  - `mq-bridge-app:localStorage:messages`
  - `mq-bridge-app:config`

Example envelope:

```ts
type EncryptedEnvelope = {
  v: number;
  alg: "AES-256-GCM" | "AES-256-GCM-SIV" | "XCHACHA20-POLY1305";
  kid: string;
  nonce: string;
  ciphertext: string;
};
```

Algorithm direction:

- Avoid AES-CBC, AES-CTR without authentication, custom crypto constructions, and opaque \"secure localStorage\" helpers.
- If encryption happens in frontend JS:
  - start with AES-256-GCM via WebCrypto
  - use a fresh random 96-bit nonce for every encryption
- If encryption happens in Rust/Tauri/backend:
  - prefer an AEAD abstraction
  - AES-256-GCM-SIV is attractive if crate support is solid
  - AES-256-GCM is acceptable as the first implementation
- Keep the envelope pluggable so future algorithm upgrades and key rotation stay possible.

Recommended architecture:

- `StorageMode` / `SecurityMode` enum
- backend-exposed `StorageSecurityInfo`
- `KeyProvider` abstraction
  - `NoKeyProvider`
  - `EnvKeyProvider` / `EnvSecretProvider`
  - `OsKeyStoreProvider`
  - `EphemeralProcessKeyProvider`
- `Encryptor` / `Decryptor` abstraction with an algorithm registry
- `EncryptedJsonStorage` wrapper
  - `setJson(key, value)`
  - `getJson(key)`
  - `clearNamespace(namespace)`
- `MessageHistoryStore`
  - uses encrypted local storage depending on mode
  - auto-clears on ephemeral decrypt failure
- `ConfigStore`
  - handles encrypted vs plain config
  - is stricter than message history because config is not disposable

Documentation and UI copy:

- Explain clearly that encrypted message history is about not leaving readable broker payloads, traces, headers, and captured data on disk after shutdown.
- Make it explicit that this is not a runtime code-execution or XSS defense.

Suggested copy:

- \"Message history is encrypted at rest to avoid leaving readable broker payloads in local browser storage after shutdown. This does not protect against code running inside the app.\"
- \"Messages are encrypted during the current session and cleared after restart.\"
- \"Messages are encrypted and can be restored after restart using a key stored in the OS key store.\"
- \"No OS key store is available. Message history can only be stored temporarily and will be cleared after restart.\"

Tasks:

- Define exact migration behavior from the current `config_security.mode` model to the expanded CLI and Tauri mode sets.
- Decide which fields count as secrets versus encrypted-but-cacheable data.
- Add a shared encrypted storage abstraction instead of scattering crypto calls across UI code.
- Expose storage/security status from backend startup to the UI.
- Implement temporary encrypted message history first, then persistent encrypted history.
- Implement encrypted config for Tauri with a recoverable failure path.
- Keep defaults simple:
  - CLI default: env secrets + temporary encrypted messages
  - Tauri default with key store: encrypted config + temporary encrypted messages
  - Tauri default without key store: temporary encrypted messages fallback
  - persistent encrypted message history should be opt-in

## 8. Binary payloads, hex view, and whitespace display

### Goal

Support realistic message inspection for text and binary payloads.

Potential features:

- Detect or allow choosing text vs binary payload.
- Hex view for binary payloads.
- Optional whitespace visualization for text payloads.
- Copy as text / copy as hex.
- Send binary payloads from Publisher.
- Receive and inspect binary payloads in Consumer Messages.

Keep payload preview bounded to avoid memory issues.

## 9. Import model: AsyncAPI / OpenAPI

### Goal

Make imports understandable and useful without overcomplicating the first UI.

Current direction:

- Multiple import buttons are acceptable for now if they improve first impression/screenshots.
- Later, consider one import entry point with clear supported formats/help text.

Tasks:

- Decide whether AsyncAPI and OpenAPI imports create Publishers, Consumers, or both.
- Make import preview explicit before writing config.
- Avoid importing unclear partial configs silently.
- Keep room for future Kafka/NATS/RabbitMQ-specific import behavior.


## 12. UI structure and naming

### Goal

Keep the UI simple and understandable for a Postman-like messaging app.

Preferred direction after removing Routes:

```text
Publishers
Consumers
Config
```

Potential later sections:

```text
Imports
Presets / Collections
```

Naming decisions:

- Use `Messages`, not `Trace`.
- Use `Output`, not `Response`, for Consumer forwarding behavior.
- Keep `Response` only for protocols or modes where a real response/reply exists.
- Consider `Capture messages` for the Messages on/off control.

## 13. Testing and quality

### Goal

After each non-trivial refactor, run relevant checks but avoid excessive output reading unless tests fail.

Potential checks:

```text
cargo test
cargo check
npm test
npm run build
npm run tauri build (only when needed)
```

Codex instruction:

- Run the relevant checks.
- First inspect whether the command succeeded or failed.
- Only inspect detailed output when it failed.
- Provide a concise final diff summary.

## 14. Codex implementation strategy

For the Consumer/Output/Routes refactor, Codex should proceed in phases.

### Phase 1: Exploration only

Inspect current code paths for:

- Routes
- Consumers
- Publishers
- ref publishers
- `copy to`
- persisted config
- Messages UI/runtime
- Consumer start/stop behavior

Then stop and report:

- Current architecture.
- Proposed target architecture.
- Files/components likely to change.
- Migration/compatibility approach.
- Risks/tradeoffs.

### Phase 2: Minimal model/UI refactor

Implement the smallest coherent version:

- Add Consumer Output config.
- Allow selecting Publisher as Output.
- Keep Messages separate from Consumer start.
- Ensure message capture can be disabled.
- Make all Publishers referenceable.

### Phase 3: Route removal/de-emphasis

- Hide or remove Routes from top-level UI.
- Migrate or compatibility-wrap existing Routes.
- Simplify navigation.

### Phase 4: Copy-to simplification

- Remove unnecessary dialog complexity.
- Use direct copy/create/use-as-output actions.

## 15. Open questions

- Should the first implementation fully remove Routes, or only hide them from the UI?
- Should Consumer Output default to `None`, or should Publisher be preselected when possible?
- Should message capture default to enabled for debugging, or disabled for route-like forwarding?
- How should existing persisted Routes be migrated?
- Does `Reply / Response` remain as a separate Output mode, or can it be handled by Publisher output as well?
- Should Messages contain output result details inline, or should each message open a detail view with input/output sections?
- Should binary payload display be implemented before or after the Consumer/Output refactor?
- Which items belong in `AGENTS.md` as long-term design direction?

## 16. Parking lot / add later

Use this section for additional ideas before turning them into concrete tasks.

- Multiple endpoints / endpoint groups.
- Better AsyncAPI/OpenAPI import preview.
- Config encryption polish.
- Hex payload and whitespace visualization.
- Tauri packaging/release cleanup.
- App icon/logo polish.
