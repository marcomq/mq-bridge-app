# TODO: mq-bridge-app roadmap / Codex task list

This file is intentionally broader than one implementation task. It should act as a working backlog for Codex sessions and for manual planning.

Important workflow for Codex: for non-trivial changes, do not jump directly to a finished implementation. First inspect the relevant code, propose the intended solution shape, list affected files/components, identify removals/migrations/tradeoffs, and stop for feedback before the main implementation.


## 5. Config persistence and storage direction

### Goal

Move long-lived app state out of browser/localStorage-style storage and into the app config where practical.

Longer-term candidates for config persistence:

- history
- presets
- publishers
- consumers
- message capture preferences
- import settings
- app UI preferences if needed

Avoid storing huge message buffers in durable config by default. Messages are runtime/debug data, not an archive.

Presets and history need to sufficient for all different endpoint types. Just supporting http isn't sufficient. 
We might even store a Hashmap and let javascript parse the values. 
The values later also need to be exportable to asyncApi.

## 6. Improve UX of App Config page

App config currently stores the whole config object in one large form.
This makes the page hard to follow or read. Also, the configurable options are redundant. The other forms already configure most options.
We should keep only the options that are not available in the rest of the app. And we should have those options visible directly, and not
on click on "show advanced".

## 7. Encryption modes for config

### Goal

Document and implement clear config security modes.

Planned modes:

```text
unencrypted
balanced (default)
sensitive
```

Possible interpretation:

- `unencrypted`: config stored plainly.
- `balanced`: non-sensitive config plain, secrets/passwords stored in OS keychain/keystore.
- `sensitive`: full config encrypted with a random key stored in the OS keychain/keystore. Localstore should also avoid storing sensitive data - maybe we should encrypt it with the same random key.

Tasks:

- Define exact behavior for each mode.
- Define migration behavior between modes.
- Decide which fields count as secrets.
- Avoid giving users a false sense of security: encryption is local-at-rest protection, not a full threat model.
- Add this target to `AGENTS.md` or project docs so future agent sessions do not accidentally design around localStorage-only persistence.

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
