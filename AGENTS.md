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

Workspace/domain data should live in the workspace config, not in `localStorage`. This includes publishers, consumers, routes, presets, request history, headers, payloads, and configured environment variables. `localStorage` should only keep UI preferences such as theme, layout, selected tab, collapsed panels, and recent workspace references.

Target storage modes:

- `unencrypted`: plain workspace config for debugging, examples, user has no keystore, and manual editing.
- `balanced` default: plain workspace config, but explicit secrets such as passwords, tokens, API keys, and sensitive env values are stored in the OS key store. The config stores only references/placeholders.
- `sensitive`: the complete workspace config is encrypted. A random workspace key is stored in the OS key store. The file contains encrypted data plus metadata only.

Saving should not blindly stop or restart routes. Compare current, saved, and applied runtime state. We should add manual triggers to restart routes or consumers.

When changing persistence code, prefer moving app data toward the central workspace model instead of adding new independent `localStorage` storage.

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
