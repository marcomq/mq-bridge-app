We need a rewrite of the UI.
Files that we want to delete later had been moved to ui/src/legacy-delete folder. We can use content from these files, but with following restrictions:
- The application should run on tauri and as web application
- It should be a best practice svelte app and clean enough to act as reference implementation
- Avoid window storage or late function binding, if possible.
- Avoid creating Types in TS. Prefer the automatically generated types in generated/ui-types.ts. Those are single source of truth. Prefer aggregation of those, if these are insufficient.

State should work following:
- Rust server yaml is for persistence and export / import of config
- The svelte state is just for display and reactivity, the single source of truth for the state is localStorage. It should have a last_changed date and the latest cfg should always win. In browser mode, there should be a check every 5s if there had been a cfg update. If localStorage has a newer cfg, use it. When clicking "save", the localStorage should be synced to server and then saved there as yaml.
- Messages and history are generated on server but should not be stored there. They should be stored in localStorage, in a different variable as the config. When there is not enough storage anymore in localStore, remove the oldes history / messages. They can be identified by the id/message_id. It is always in uuidv7 format.


Refactor the TypeScript/Svelte application toward a boring, maintainable Svelte architecture.

Goal:
Create a simple, predictable local-first app structure. Do not invent a second domain model in TypeScript. Rust remains the source of truth for domain/config types, and Rust-generated TypeScript types must be reused.

Core storage/state decisions:
- YAML is only import/export for publisher/consumer configuration.
- localStorage is the persisted app state for the active UI workspace.
- Messages and history are stored in localStorage, not YAML.
- Messages and history are bounded.
- If localStorage is full, delete the oldest messages/history entries until the data fits.
- Messages and history entries already have UUIDv7 IDs.
- Do not store a separate createdAt timestamp for messages/history.
- Use UUIDv7 ordering to remove oldest entries.
- Encryption, if enabled, must be handled inside the storage layer, not inside Svelte components.
- Svelte/TypeScript state is only a reactive snapshot plus temporary UI state.
- Svelte components must not access localStorage directly.

Keep:
- Existing Svelte files and markup where possible.
- Existing CSS where possible.
- Existing form logic where possible.
- Existing menu logic where possible.
- Rust-generated TypeScript types.
- Playwright tests as behavioral regression tests.

Replace/remove:
- Legacy TypeScript state that duplicates persisted app state.
- Duplicated endpoint lists, labels, filters, and options.
- Manually recreated Rust/domain types in TypeScript.
- DOM-derived state where normal Svelte state is appropriate.
- Direct localStorage access from components.
- Unit tests that only lock in legacy implementation details.

Target architecture:
- `src/lib/generated/`: Rust-generated TypeScript types.
- `src/lib/storage/`: all localStorage access, encryption wrapper, load/save/trim logic.
- `src/lib/state/`: thin reactive Svelte stores/snapshots over storage.
- `src/lib/view-model/`: UI-only derived data for Svelte views.
- `src/lib/utils/`: small generic helpers only.

Storage rules:
- Use one clear storage API. Components call storage/state actions, never `localStorage` directly.
- Workspace/preferences/current view/selection may be persisted.
- Messages and history are persisted under bounded localStorage data.
- Runtime data must not make YAML newer or affect YAML export.
- YAML export includes only publisher/consumer config.
- YAML import replaces the publisher/consumer config in the active app state.

Message/history trimming:
- Sort entries by UUIDv7 ID.
- Keep newest entries.
- On quota errors, repeatedly remove the oldest entries and retry.
- Never delete config/preferences because messages/history are too large.
- Do not add `createdAt`; UUIDv7 is the chronological source of truth.

Hard constraints:
- Do not change the ui appearance or behavior. "npm run test:ui" has a screenshot test. This screenshot test nee
- Do not manually recreate Rust domain/config types in TypeScript.
- Do not create a new TypeScript domain model.
- Do not add parallel endpoint definitions.
- Do not add new endpoint arrays unless they are UI-only and derived from existing/generated data.
- Do not refactor Svelte markup, CSS, form logic, or menu logic in this refactoring!
- Legacy files may be read as reference, but do not copy their architecture.
- Prefer boring, explicit code over clever abstractions.

First task:
Analyze only. Do not edit files. Produce the migration map and proposed architecture boundaries and add it to this file. Cleanup this file too.