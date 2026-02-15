
# Configuration UI Implementation Plan

## Phase 1: Web Server Foundation
- [x] **Basic Web Server**: Create `src/web_ui.rs` with a basic Actix server. Modify `main.rs` to start this server if the configuration is missing.
- [x] **Test Foundation**: Create `tests/web_ui_test.rs` to verify the web server starts and responds to health checks.

## Phase 2: Schema and Frontend
- [x] **Schema & UI**: Add `schemars` dependency. Implement `GET /schema.json` (generating schema for `AppConfig`) and `GET /` (serving HTML with `vanilla-schema-forms`). Fallback to static schema if generation fails.
- [x] **Test UI**: Verify `/schema.json` returns JSON and `/` returns HTML.

## Phase 3: Dynamic Configuration
- [ ] **Dynamic Reloading**: Refactor `main.rs` to use a loop for running the bridge. Implement `POST /config` in `src/web_ui.rs` to update state and trigger a reload.
- [ ] **Test Reloading**: Verify that posting a configuration starts the bridge logic.

## Phase 4: Persistence and Polish
- [ ] **Persistence & Feedback**: Save valid configurations to `config.yml`. Update UI to show status messages.
