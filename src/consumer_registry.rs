//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use mq_bridge::models::Endpoint;
use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};
use tracing::debug;

#[derive(Clone, Debug)]
pub struct ConsumerDefinition {
    pub endpoint: Endpoint,
    pub description: String,
}

static CONSUMER_DEFINITION_REGISTRY: OnceLock<RwLock<HashMap<String, ConsumerDefinition>>> =
    OnceLock::new();

/// Registers a named consumer definition.
pub fn register_consumer_definition(name: &str, def: ConsumerDefinition) {
    let registry = CONSUMER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let mut writer = registry
        .write()
        .expect("Consumer definition registry lock poisoned");
    if writer.insert(name.to_string(), def).is_some() {
        debug!(
            "Overwriting a registered consumer definition named '{}'",
            name
        );
    }
}

/// Retrieves a registered consumer definition by name.
pub fn get_consumer_definition(name: &str) -> Option<ConsumerDefinition> {
    let registry = CONSUMER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let reader = registry
        .read()
        .expect("Consumer definition registry lock poisoned");
    reader.get(name).cloned()
}

/// Returns a list of all registered consumer definition names.
pub fn list_consumer_definitions() -> Vec<String> {
    let registry = CONSUMER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let reader = registry
        .read()
        .expect("Consumer definition registry lock poisoned");
    reader.keys().cloned().collect()
}

/// Unregisters a named consumer definition.
pub fn unregister_consumer_definition(name: &str) -> Option<ConsumerDefinition> {
    let registry = CONSUMER_DEFINITION_REGISTRY.get_or_init(|| RwLock::new(HashMap::new()));
    let mut writer = registry
        .write()
        .expect("Consumer definition registry lock poisoned");
    writer.remove(name)
}
