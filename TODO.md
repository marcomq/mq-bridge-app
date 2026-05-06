# TODO: mq-bridge-app roadmap / Codex task list

This file is intentionally broader than one implementation task. It should act as a working backlog for Codex sessions and for manual planning.

Important workflow for Codex: for non-trivial changes, do not jump directly to a finished implementation. First inspect the relevant code, propose the intended solution shape, list affected files/components, identify removals/migrations/tradeoffs, and stop for feedback before the main implementation.


## 1. Simplify the app model: Consumer + Output instead of Routes

### Goal

Remove or de-emphasize the separate `Routes` concept in the main UI. A bridge/route should be represented as a Consumer with an Output configured to use a Publisher.

The primary objects should be:

- `Publisher`: sends messages to a configured endpoint.
- `Consumer`: receives messages from a configured endpoint and can optionally output/forward them.
- `Output`: is part of the consumer and describes what a Consumer does after receiving a message.

Conceptually:

```text
Old Route = Consumer + Output: Publisher
```

### Product decisions

`Routes` currently overlaps too much with Consumer once message inspection exists. Do not add a separate `Trace` UI for routes. Use `Messages` consistently.

All Publishers should be reusable and referenceable as Consumer Output targets. Remove the distinction between normal Publishers and `ref publishers` if possible.

This should also simplify `copy to`, because there is no longer a need to choose between routes, ref publishers, or special target types.

### Consumer Output

Add an `Output` section to the Consumer configuration.

Potential output modes:

```text
None
Publisher
Response (optional, only if still needed for request-response transports)
```

The most important mode is:

```text
Output: Response
```
It is the default for new consumers that support reply/response. The content should look mostly the same as "Response" looks now.

When `Output: Publisher` is selected, show a Publisher selector.

Possible behavior:

- If exactly one Publisher exists, preselect it.
- If a recently used Publisher exists, consider preselecting it.
- Avoid silently forwarding messages without an explicit Consumer start/action.

### Consumer start vs Messages capture

Keep the existing Consumer `Start` button if it still fits, but clarify its meaning:

```text
Start = start the Consumer runtime / begin consuming from input
```

But this start button should not necessarily belong to the `Messages` panel.

Messages need a separate enable/disable control:

```text
Capture messages: on / off
```

When message capture is disabled, the Consumer can still run and forward messages to the configured Output. In that mode it behaves like the old Route concept.

There should still be a stop button reachable from "messages". It shouldn't be necessary to navigate to stop message flow.

## 2. Messages model and retention

### Goal

Use `Messages` as the single concept for inspected runtime data. Do not introduce a separate `Trace` concept.

Messages should be useful for debugging what was actually received and what was actually sent/forwarded.


Messages should also be captured not only with request headers and body, but also with response headers and body. This is mostly relevant in case that we don't only have a configured response, but another publisher as "output".

### Bounded message buffer

Messages must always be bounded. Never store an unbounded number of messages in memory.

Suggested controls:

```text
Capture messages: on/off
Clear
Keep last: 10 / 100 / 500 / custom
Max payload preview size
```

Possible defaults:

```text
Consumer inspect default: capture enabled, keep last 100
Forwarding/default route-like mode: capture disabled or keep last small
```

### Message contents

Do not reduce Messages to metadata-only records. For debugging, the user wants to verify real payloads.

A message entry may include:

- received payload/body
- received headers/properties
- output target
- output payload/body
- output headers/properties
- output status
- response/error
- timestamps

Payload storage can be bounded/truncated for safety, but the feature should be designed around inspecting real message contents.

## 3. Remove/refactor Routes

### Goal

Avoid a third top-level object that duplicates Consumer behavior.

Potential new main navigation:

```text
Publishers
Consumers
Config
```

Optional later additions:

```text
Presets / Collections
Imports
```

### Migration / compatibility

If Routes already exist in persisted config, migrate them conceptually to Consumers with Output configured.

Old:

```text
Route {
  input: ...
  output: ...
}
```

New:

```text
Consumer {
  input: ...
  output: Publisher(...)
  messages: disabled or enabled depending on previous behavior
}
```

If full migration is too large for the first step, keep compatibility internally but hide/de-emphasize Routes in the UI.

## 4. Simplify `copy to`

### Goal

Make `copy to` direct and lightweight.

Because all Publishers are reusable output targets, `copy to` should no longer need a heavy dialog for choosing between route/ref-publisher/publisher concepts.

Possible direct actions:

```text
Copy message to Publisher
Create Publisher from message
Use this Publisher as Consumer Output
```

If there is only one natural target type, avoid showing a dialog.

## 5. Presets / Collections / saved snapshots

### Goal

Clarify how reusable configurations are stored and reused.

Presets should probably become complete snapshots with a clear name and description. Avoid partial “apply URL” behavior unless it is very explicit and safe.

Potential tasks:

- Add or verify `description` field for presets.
- Make presets easy to compare later, but do not overbuild this now.
- Keep preset application predictable: applying a preset should not silently merge complex URL parts unless the UI clearly explains it.
- Consider whether Publishers and Consumers themselves are the main saved objects, with presets becoming less central.

## 6. Config persistence and storage direction

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
- `sensitive`: full config encrypted with a random key stored in the OS keychain/keystore.

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

## 10. Authentication and header extraction / storage middleware

### Goal

Explore whether missing scripting/authentication features can be partly covered by extractor/storage middleware.

Potential idea:

- Extract a value from response headers/body.
- Store it in a variable/secret store.
- Reuse it in later Publisher/Consumer configs.

This could cover many token/session workflows without implementing a full scripting engine immediately.

Tasks:

- Define a minimal variable model.
- Decide whether extracted values are normal variables or secrets.
- Decide where values are stored under each encryption mode.
- Consider UI support for header/body extractors.

## 11. Scripting / pre-send / post-receive hooks

### Goal

Keep scripting as a possible future feature, but do not let it block the core app.

Possible hook points:

```text
pre-send
post-receive
before-forward
after-forward
```

Considerations:

- Security/sandboxing.
- Language/runtime choice.
- Whether this belongs in Rust, JS, or an embedded scripting language.
- Whether extractor/storage middleware is enough for most cases.

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
- Header extractor and variable storage.
- Optional scripting hooks.
- Tauri packaging/release cleanup.
- App icon/logo polish.
