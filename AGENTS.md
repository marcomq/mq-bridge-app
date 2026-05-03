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
  - Command: `npm run test:unit`
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


## Working style for Codex Agents

For non-trivial implementation or refactoring tasks, do not jump directly to a finished solution.

Use a design-checkpoint workflow:

1. Explore the relevant code.
2. Before implementing, explain the intended solution shape:
   - target architecture
   - data flow
   - files/components likely to change
   - what will be removed or replaced
   - known tradeoffs
3. You may even show code or modify code as unfinished solution, so that the user knows what you want to do.
4. Stop and wait for user feedback before writing the main implementation.
5. After feedback, finalize implementation step. Run the smallest relevant tests/checks. Just check if the test succeeds or fails - only check the test output on test fail.
6. Show the final diff summary.

The checkpoint is about design direction, not about asking permission for every small edit.

## Operational Notes

- Dev backend script: `scripts/dev-backend.mjs`
- Playwright uses a temporary config file in `/tmp` for deterministic test setup.
- CLI defaults auto-enable UI/metrics when no persisted config exists.

## Quick Start

1. Install deps: `npm install`
2. Run app: `npm run dev`
3. Unit tests: `npm run test:unit`
4. UI tests: `npm run test:ui`
