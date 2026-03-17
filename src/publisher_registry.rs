//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use mq_bridge::Route;
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use tracing::debug;

static PUBLISHER_DEFINITION_REGISTRY: OnceLock<RwLock<HashMap<String, Route>>> = OnceLock::new();

/// Registers a named publisher definition (a route with `input: null`).
/// This allows dynamic discovery of publishers for tools like MCP.
pub fn register_publisher_definition(name: &str, route: Route) {
    let registry = PUBLISHER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let mut writer = registry
        .write()
        .expect("Publisher definition registry lock poisoned");
    if writer.insert(name.to_string(), route).is_some() {
        debug!(
            "Overwriting a registered publisher definition named '{}'",
            name
        );
    }
}

/// Retrieves a registered publisher definition by name.
pub fn get_publisher_definition(name: &str) -> Option<Route> {
    let registry = PUBLISHER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let reader = registry
        .read()
        .expect("Publisher definition registry lock poisoned");
    reader.get(name).cloned()
}

/// Returns a list of all registered publisher definition names.
pub fn list_publisher_definitions() -> Vec<String> {
    let registry = PUBLISHER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let reader = registry
        .read()
        .expect("Publisher definition registry lock poisoned");
    reader.keys().cloned().collect()
}

/// Unregisters a named publisher definition.
pub fn unregister_publisher_definition(name: &str) -> Option<Route> {
    let registry = PUBLISHER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let mut writer = registry
        .write()
        .expect("Publisher definition registry lock poisoned");
    writer.remove(name)
}
