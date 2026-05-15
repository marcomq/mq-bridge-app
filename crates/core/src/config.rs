use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

use crate::encrypted_config::{
    config_file_format_from_path, encode_sensitive_config_file, maybe_decrypt_config_source,
};
use anyhow::Result;
use config::Config;
use mq_bridge::{
    Route,
    models::{Endpoint, EndpointType, Middleware, SecretExtractor},
};
use schemars::JsonSchema;
use uuid::Uuid;

fn default_log_level() -> String {
    "info".to_string()
}

fn default_route_enabled() -> bool {
    true
}

fn default_consumer_capture_enabled() -> bool {
    true
}

fn default_consumer_capture_keep_last() -> usize {
    100
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn default_route_migrated_capture() -> ConsumerMessageCaptureConfig {
    ConsumerMessageCaptureConfig {
        enabled: false,
        keep_last: default_consumer_capture_keep_last(),
    }
}

fn generate_config_id() -> String {
    Uuid::now_v7().to_string()
}

#[derive(
    Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Copy, PartialEq, Eq, Default,
)]
#[serde(rename_all = "snake_case")]
pub enum ConfigSecurityMode {
    Unencrypted,
    #[default]
    Balanced,
    EnvTemporaryMessages,
    TemporaryMessages,
    Sensitive,
    Durable,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct ConfigSecurity {
    /// Configuration security.
    /// balanced: Extract secrets to the target secret store and keep message history plain.
    /// env_temporary_messages: Extract secrets to env or placeholders and encrypt message history temporarily.
    /// temporary_messages: Keep config plain and encrypt message history temporarily.
    /// sensitive: Encrypt config and encrypt message history temporarily.
    /// durable: Encrypt config and keep encrypted message history between restarts when supported.
    #[serde(default)]
    pub mode: ConfigSecurityMode,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct AppConfig {
    #[serde(default = "default_log_level")]
    pub log_level: String,
    #[serde(default)]
    pub logger: String,
    /// Optional url of the ui endpoint. For example "0.0.0.0:9090".
    #[serde(default)]
    pub ui_addr: String,
    /// Optional url of a standalone metrics endpoint. For example "0.0.0.0:9091".
    /// If set, a standalone metrics server will be started on this address.
    /// If it matches `ui_addr`, the standalone server is skipped as the UI handles it.
    #[serde(default)]
    pub metrics_addr: String,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub routes: HashMap<String, RouteConfig>,
    #[serde(default)]
    pub consumers: Vec<ConsumerConfig>,
    #[serde(default)]
    pub publishers: Vec<PublisherClient>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub history: HashMap<String, serde_json::Value>,
    #[serde(default, alias = "envVars")]
    pub env_vars: HashMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub config_security: Option<ConfigSecurity>,
    /// Legacy compatibility flag. Prefer config_security.mode instead.
    #[serde(default, skip_serializing_if = "is_false")]
    pub extract_secrets: bool,
    /// The default tab to show in the UI upon loading.
    #[serde(default)]
    pub default_tab: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct PublisherPreset {
    // Presets mirror request-bar state so they can be reused across non-HTTP endpoints too.
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub payload: String,
    #[serde(default)]
    pub headers: Vec<PublisherPresetHeader>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(default)]
    pub request_fields: HashMap<String, String>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct PublisherPresetHeader {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub value: String,
    #[serde(default = "default_route_enabled")]
    pub enabled: bool,
}

#[derive(Debug, serde::Serialize, serde::Deserialize, JsonSchema, Clone, Default)]
pub struct SecretReferenceSummary {
    #[serde(default)]
    pub routes: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub consumers: HashMap<String, Vec<String>>,
    #[serde(default)]
    pub publishers: HashMap<String, Vec<String>>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone)]
pub struct RouteConfig {
    #[serde(default = "default_route_enabled")]
    pub enabled: bool,
    #[serde(flatten)]
    pub route: Route,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone)]
pub struct ConsumerConfig {
    #[serde(default = "generate_config_id")]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub endpoint: Endpoint,
    #[serde(default)]
    pub comment: String,
    // TODO: remove, as already implemented in output
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<ConsumerResponseConfig>,
    #[serde(default, skip_serializing_if = "consumer_output_is_none")]
    pub output: ConsumerOutputConfig,
    #[serde(default)]
    pub message_capture: ConsumerMessageCaptureConfig,
    #[serde(flatten, default)]
    pub options: mq_bridge::models::RouteOptions,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct ConsumerResponseConfig {
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub payload: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum ConsumerOutputConfig {
    #[default]
    None,
    Publisher {
        publisher: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        publisher_id: Option<String>,
    },
    Response {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        response: Option<ConsumerResponseConfig>,
    },
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone)]
pub struct ConsumerMessageCaptureConfig {
    #[serde(default = "default_consumer_capture_enabled")]
    pub enabled: bool,
    #[serde(default = "default_consumer_capture_keep_last", alias = "keepLast")]
    pub keep_last: usize,
}

impl Default for ConsumerMessageCaptureConfig {
    fn default() -> Self {
        Self {
            enabled: default_consumer_capture_enabled(),
            keep_last: default_consumer_capture_keep_last(),
        }
    }
}

fn consumer_output_is_none(output: &ConsumerOutputConfig) -> bool {
    matches!(output, ConsumerOutputConfig::None)
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone)]
pub struct PublisherClient {
    #[serde(default = "generate_config_id")]
    pub id: String,
    #[serde(default)]
    pub name: String,
    pub endpoint: Endpoint,
    #[serde(default)]
    pub comment: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub payload: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub headers: Vec<PublisherPresetHeader>,
    #[serde(default, alias = "sortOrder", skip_serializing_if = "Option::is_none")]
    pub sort_order: Option<i32>,
    #[serde(default, alias = "presets", skip_serializing)]
    pub legacy_presets: Vec<PublisherPreset>,
}

fn next_unique_name(base: &str, existing: &HashSet<String>) -> String {
    if !existing.contains(base) {
        return base.to_string();
    }

    let mut index = 1;
    loop {
        let candidate = format!("{base}_{index}");
        if !existing.contains(&candidate) {
            return candidate;
        }
        index += 1;
    }
}

fn endpoint_value(endpoint: &Endpoint) -> serde_json::Value {
    serde_json::to_value(endpoint).unwrap_or(serde_json::Value::Null)
}

fn endpoint_type_name_from_value(value: &serde_json::Value) -> String {
    value
        .as_object()
        .and_then(|object| {
            object
                .keys()
                .find(|key| key.as_str() != "middlewares")
                .cloned()
        })
        .unwrap_or_else(|| "http".to_string())
}

fn apply_legacy_preset_to_endpoint(endpoint: &Endpoint, preset: &PublisherPreset) -> Endpoint {
    let mut value = endpoint_value(endpoint);
    let endpoint_type = preset
        .endpoint_type
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| endpoint_type_name_from_value(&value));
    let request_fields = &preset.request_fields;

    if let Some(endpoint_object) = value.as_object_mut() {
        let endpoint_config = endpoint_object
            .entry(endpoint_type.clone())
            .or_insert_with(|| serde_json::json!({}));

        if !endpoint_config.is_object() {
            *endpoint_config = serde_json::json!({});
        }

        if let Some(endpoint_config_object) = endpoint_config.as_object_mut() {
            if endpoint_type == "http" {
                let raw_url = request_fields
                    .get("url")
                    .cloned()
                    .or_else(|| preset.url.clone())
                    .unwrap_or_default();
                if !raw_url.trim().is_empty() {
                    if let Ok(parsed) = url::Url::parse(&raw_url) {
                        endpoint_config_object.insert(
                            "url".to_string(),
                            serde_json::Value::String(parsed.origin().ascii_serialization()),
                        );
                        endpoint_config_object.insert(
                            "path".to_string(),
                            serde_json::Value::String(format!(
                                "{}{}",
                                parsed.path(),
                                parsed
                                    .query()
                                    .map(|query| format!("?{query}"))
                                    .unwrap_or_default()
                            )),
                        );
                    } else if let Some((base, path)) = raw_url.split_once('/') {
                        endpoint_config_object.insert(
                            "url".to_string(),
                            serde_json::Value::String(base.to_string()),
                        );
                        endpoint_config_object.insert(
                            "path".to_string(),
                            serde_json::Value::String(format!("/{path}")),
                        );
                    } else {
                        endpoint_config_object.insert(
                            "url".to_string(),
                            serde_json::Value::String(raw_url.clone()),
                        );
                    }
                }

                endpoint_config_object.insert(
                    "method".to_string(),
                    serde_json::Value::String(
                        preset
                            .method
                            .clone()
                            .unwrap_or_else(|| "POST".to_string())
                            .to_uppercase(),
                    ),
                );
                endpoint_config_object.insert(
                    "custom_headers".to_string(),
                    serde_json::Value::Object(
                        preset
                            .headers
                            .iter()
                            .filter(|header| header.enabled && !header.key.trim().is_empty())
                            .map(|header| {
                                (
                                    header.key.trim().to_string(),
                                    serde_json::Value::String(header.value.clone()),
                                )
                            })
                            .collect(),
                    ),
                );
            } else {
                for (key, value) in request_fields {
                    endpoint_config_object
                        .insert(key.clone(), serde_json::Value::String(value.clone()));
                }
            }
        }
    }

    serde_json::from_value(value).unwrap_or_else(|_| endpoint.clone())
}

fn migrate_legacy_publisher_presets(publishers: &mut Vec<PublisherClient>) {
    let mut existing_names = publishers
        .iter()
        .map(|publisher| publisher.name.clone())
        .collect::<HashSet<_>>();
    let snapshot = publishers.clone();
    let mut migrated = Vec::new();

    for publisher in &snapshot {
        for preset in &publisher.legacy_presets {
            let base_name = if preset.name.trim().is_empty() {
                publisher.name.clone()
            } else {
                format!("{} - {}", publisher.name, preset.name.trim())
            };
            let next_name = next_unique_name(&base_name, &existing_names);
            existing_names.insert(next_name.clone());
            migrated.push(PublisherClient {
                id: generate_config_id(),
                name: next_name,
                endpoint: apply_legacy_preset_to_endpoint(&publisher.endpoint, preset),
                comment: publisher.comment.clone(),
                payload: preset.payload.clone(),
                headers: preset.headers.clone(),
                sort_order: None,
                legacy_presets: Vec::new(),
            });
        }
    }

    publishers
        .iter_mut()
        .for_each(|publisher| publisher.legacy_presets.clear());
    publishers.extend(migrated);
}

pub trait SecretStore: Send + Sync {
    fn store(&self, secrets: &HashMap<String, String>) -> Result<()>;
}

#[derive(Debug, Clone)]
pub struct EnvFileSecretStore {
    path: PathBuf,
}

impl EnvFileSecretStore {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }
}

impl SecretStore for EnvFileSecretStore {
    fn store(&self, secrets: &HashMap<String, String>) -> Result<()> {
        if secrets.is_empty() {
            return Ok(());
        }

        let existing_content = if self.path.exists() {
            std::fs::read_to_string(&self.path)?
        } else {
            String::new()
        };

        let mut new_lines = Vec::new();
        let mut processed_keys = HashSet::new();

        for line in existing_content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                new_lines.push(line.to_string());
                continue;
            }

            if let Some((key, _)) = line.split_once('=') {
                let key = key.trim();
                if let Some(new_value) = secrets.get(key) {
                    new_lines.push(format!("{}={}", key, new_value));
                    processed_keys.insert(key.to_string());
                } else {
                    new_lines.push(line.to_string());
                }
            } else {
                new_lines.push(line.to_string());
            }
        }

        for (key, value) in secrets {
            if !processed_keys.contains(key) {
                new_lines.push(format!("{}={}", key, value));
            }
        }

        let mut final_content = new_lines.join("\n");
        if !final_content.ends_with('\n') {
            final_content.push('\n');
        }
        std::fs::write(&self.path, final_content)?;
        Ok(())
    }
}

fn expand_variables(content: &str) -> Result<String, anyhow::Error> {
    Ok(shellexpand::env(content)?.to_string())
}

// New helper function to create a config source from a string.
// It expands environment variables and assumes a given format.
fn source_from_str(
    content: &str,
    format: config::FileFormat,
) -> Result<config::File<config::FileSourceString, config::FileFormat>, anyhow::Error> {
    let expanded = expand_variables(content)?;
    // Using `required(false)` means an empty or whitespace-only string won't cause an error.
    Ok(config::File::from_str(&expanded, format).required(false))
}

fn load_config_internal(
    config_path: Option<String>,
    init_config_path: Option<String>,
    init_config_str: Option<String>,
    config_str: Option<String>,
    load_dotenv: bool,
    use_env_overrides: bool,
) -> Result<(AppConfig, String), anyhow::Error> {
    if load_dotenv {
        match dotenvy::dotenv() {
            Ok(path) => println!("INFO: Loaded .env file from {:?}", path),
            Err(e) => println!("DEBUG: No .env file loaded: {}", e),
        }
    }

    let persistent_file = if use_env_overrides {
        config_path.unwrap_or_else(|| {
            std::env::var("CONFIG_FILE").unwrap_or_else(|_| "config.yml".to_string())
        })
    } else {
        config_path.unwrap_or_else(|| "config.yml".to_string())
    };

    let init_config_path = if use_env_overrides {
        init_config_path.or_else(|| std::env::var("INIT_CONFIG_FILE").ok())
    } else {
        init_config_path
    };
    let init_config_str = if use_env_overrides {
        init_config_str.or_else(|| std::env::var("INIT_CONFIG_STRING").ok())
    } else {
        init_config_str
    };
    let config_str = if use_env_overrides {
        config_str.or_else(|| std::env::var("CONFIG_STRING").ok())
    } else {
        config_str
    };

    let mut builder = Config::builder().set_default("log_level", "info")?;

    // --- Configuration Loading Hierarchy ---
    // The `config` crate merges sources, with later sources overriding earlier ones.
    // 1. Initialization sources (if main config file doesn't exist)
    // 2. Main config file
    // 3. Override config string
    // 4. Environment variables

    let persistent_file_exists = Path::new(&persistent_file).exists();

    if !persistent_file_exists {
        // Try to initialize. Precedence: init_config_path > init_config_str
        if let Some(template_path) = &init_config_path {
            if Path::new(template_path).exists() {
                eprintln!(
                    "INFO: Main config '{}' not found. Initializing from template file '{}'.",
                    persistent_file, template_path
                );
                let content = std::fs::read_to_string(template_path)?;
                let format = config_file_format_from_path(template_path);
                builder = builder.add_source(source_from_str(&content, format)?);
            } else {
                eprintln!(
                    "WARN: Template file '{}' not found. It will be ignored.",
                    template_path
                );
            }
        } else if let Some(init_str) = &init_config_str {
            eprintln!(
                "INFO: Main config '{}' not found. Initializing from string (assuming YAML format).",
                persistent_file
            );
            builder = builder.add_source(source_from_str(init_str, config::FileFormat::Yaml)?);
        } else {
            eprintln!(
                "INFO: Main config '{}' not found. Starting with default settings.",
                persistent_file
            );
        }
    } else {
        // Main config file exists, load it.
        eprintln!("INFO: Loading configuration from '{}'.", persistent_file);
        let content = std::fs::read_to_string(&persistent_file)?;
        let format = config_file_format_from_path(&persistent_file);
        let effective_content = maybe_decrypt_config_source(&content, format)?.unwrap_or(content);
        builder = builder.add_source(source_from_str(&effective_content, format)?);

        if init_config_path.is_some() || init_config_str.is_some() {
            eprintln!(
                "INFO: Main config '{}' found. Ignoring initialization options.",
                persistent_file
            );
        }
    }

    // Add override string if present. This will override file/init sources.
    if let Some(override_str) = &config_str {
        eprintln!("INFO: Applying configuration override from string (assuming YAML format).");
        builder = builder.add_source(source_from_str(override_str, config::FileFormat::Yaml)?);
    }

    let builder = if use_env_overrides {
        builder.add_source(
            config::Environment::default()
                .prefix("MQB")
                .separator("__")
                .ignore_empty(true)
                .try_parsing(true),
        )
    } else {
        builder
    };

    let settings = builder.build()?;

    settings.clone().try_deserialize::<serde_json::Value>()?;

    let mut config: AppConfig = settings.try_deserialize()?;
    config.migrate_legacy_routes();
    Ok((config, persistent_file))
}

pub fn load_config(
    config_path: Option<String>,
    init_config_path: Option<String>,
    init_config_str: Option<String>,
    config_str: Option<String>,
) -> Result<(AppConfig, String), anyhow::Error> {
    load_config_internal(
        config_path,
        init_config_path,
        init_config_str,
        config_str,
        true,
        true,
    )
}

pub fn load_config_at_path(
    config_path: impl Into<String>,
) -> Result<(AppConfig, String), anyhow::Error> {
    load_config_internal(Some(config_path.into()), None, None, None, false, false)
}

impl AppConfig {
    pub fn ensure_entity_ids(&mut self) {
        let mut known_ids = HashSet::new();
        for publisher in &mut self.publishers {
            if publisher.id.trim().is_empty() || !known_ids.insert(publisher.id.clone()) {
                publisher.id = generate_config_id();
                known_ids.insert(publisher.id.clone());
            }
        }

        known_ids.clear();
        for consumer in &mut self.consumers {
            if consumer.id.trim().is_empty() || !known_ids.insert(consumer.id.clone()) {
                consumer.id = generate_config_id();
                known_ids.insert(consumer.id.clone());
            }
        }
    }

    fn normalize_consumer_publisher_outputs(&mut self) {
        let publishers_by_id: HashMap<String, String> = self
            .publishers
            .iter()
            .map(|publisher| (publisher.id.clone(), publisher.name.clone()))
            .collect();
        let publisher_ids_by_name: HashMap<String, String> = self
            .publishers
            .iter()
            .map(|publisher| (publisher.name.clone(), publisher.id.clone()))
            .collect();

        for consumer in &mut self.consumers {
            if let ConsumerOutputConfig::Publisher {
                publisher,
                publisher_id,
            } = &mut consumer.output
            {
                let trimmed_name = publisher.trim().to_string();
                let resolved_by_id = publisher_id
                    .as_ref()
                    .and_then(|id| publishers_by_id.get(id).cloned());

                if let Some(name) = resolved_by_id {
                    *publisher = name;
                    continue;
                }

                if let Some(id) = publisher_ids_by_name.get(&trimmed_name) {
                    *publisher = trimmed_name;
                    *publisher_id = Some(id.clone());
                } else {
                    *publisher = trimmed_name;
                    *publisher_id = None;
                }
            }
        }
    }

    fn uses_encrypted_config_mode(mode: ConfigSecurityMode) -> bool {
        matches!(
            mode,
            ConfigSecurityMode::Sensitive | ConfigSecurityMode::Durable
        )
    }

    fn security_mode_label(mode: ConfigSecurityMode) -> &'static str {
        match mode {
            ConfigSecurityMode::Unencrypted => "unencrypted",
            ConfigSecurityMode::Balanced => "balanced",
            ConfigSecurityMode::EnvTemporaryMessages => "env_temporary_messages",
            ConfigSecurityMode::TemporaryMessages => "temporary_messages",
            ConfigSecurityMode::Sensitive => "sensitive",
            ConfigSecurityMode::Durable => "durable",
        }
    }

    pub fn security_mode(&self) -> ConfigSecurityMode {
        self.config_security
            .as_ref()
            .map(|security| security.mode)
            .unwrap_or_else(|| {
                if self.extract_secrets {
                    ConfigSecurityMode::Balanced
                } else {
                    ConfigSecurityMode::Unencrypted
                }
            })
    }

    pub fn migrate_legacy_security_mode(&mut self) {
        let mode = self.security_mode();
        self.config_security = Some(ConfigSecurity { mode });
        // Keep the legacy flag read-compatible, but normalize runtime state onto
        // config_security.mode so the UI and save path have a single source of truth.
        self.extract_secrets = false;
    }

    pub fn migrate_legacy_consumer_response(&mut self) {
        for consumer in &mut self.consumers {
            if matches!(consumer.output, ConsumerOutputConfig::None)
                && let Some(response) = consumer.response.take()
            {
                consumer.output = ConsumerOutputConfig::Response {
                    response: Some(response),
                };
            }
        }
    }

    pub fn migrate_legacy_routes(&mut self) {
        self.migrate_legacy_security_mode();
        self.migrate_legacy_consumer_response();
        migrate_legacy_publisher_presets(&mut self.publishers);

        if self.default_tab.trim() == "routes" {
            self.default_tab = "consumers".to_string();
        }

        if !self.routes.is_empty() {
            let mut existing_publisher_names: HashSet<String> = self
                .publishers
                .iter()
                .map(|publisher| publisher.name.clone())
                .collect();
            let mut existing_consumer_names: HashSet<String> = self
                .consumers
                .iter()
                .map(|consumer| consumer.name.clone())
                .collect();
            let mut routes = std::mem::take(&mut self.routes);

            for (route_name, route_config) in routes.drain() {
                let normalized_route_name = route_name.trim().to_string();
                let output =
                    if matches!(route_config.route.output.endpoint_type, EndpointType::Null) {
                        ConsumerOutputConfig::None
                    } else if let Some(existing) = self.publishers.iter().find(|publisher| {
                        endpoint_value(&publisher.endpoint)
                            == endpoint_value(&route_config.route.output)
                    }) {
                        ConsumerOutputConfig::Publisher {
                            publisher: existing.name.clone(),
                            publisher_id: Some(existing.id.clone()),
                        }
                    } else {
                        let publisher_name = next_unique_name(
                            &format!("{normalized_route_name}_publisher"),
                            &existing_publisher_names,
                        );
                        existing_publisher_names.insert(publisher_name.clone());
                        let publisher = PublisherClient {
                            id: generate_config_id(),
                            name: publisher_name.clone(),
                            endpoint: route_config.route.output.clone(),
                            comment: String::new(),
                            payload: String::new(),
                            headers: Vec::new(),
                            sort_order: None,
                            legacy_presets: Vec::new(),
                        };
                        let publisher_id = publisher.id.clone();
                        self.publishers.push(publisher);
                        ConsumerOutputConfig::Publisher {
                            publisher: publisher_name,
                            publisher_id: Some(publisher_id),
                        }
                    };

                let consumer_name =
                    next_unique_name(&normalized_route_name, &existing_consumer_names);
                existing_consumer_names.insert(consumer_name.clone());
                self.consumers.push(ConsumerConfig {
                    id: generate_config_id(),
                    name: consumer_name,
                    endpoint: route_config.route.input,
                    comment: String::new(),
                    response: None,
                    output,
                    message_capture: default_route_migrated_capture(),
                    options: route_config.route.options,
                });
            }
        }

        self.ensure_entity_ids();
        self.normalize_consumer_publisher_outputs();
    }

    pub fn save(&self, path: &str) -> Result<()> {
        let env_store = EnvFileSecretStore::new(".env");
        self.save_with_secret_store(path, &env_store)
    }

    pub fn save_with_secret_store(&self, path: &str, secret_store: &dyn SecretStore) -> Result<()> {
        let mut config_to_save = self.clone();
        config_to_save.migrate_legacy_routes();

        let trimmed_routes: HashMap<String, RouteConfig> = config_to_save
            .routes
            .drain()
            .map(|(k, v)| (k.trim().to_string(), v))
            .collect();
        config_to_save.routes = trimmed_routes;

        for consumer in &mut config_to_save.consumers {
            consumer.name = consumer.name.trim().to_string();
        }

        for pub_client in &mut config_to_save.publishers {
            pub_client.name = pub_client.name.trim().to_string();
        }

        let mode = config_to_save.security_mode();
        if matches!(
            mode,
            ConfigSecurityMode::Balanced | ConfigSecurityMode::EnvTemporaryMessages
        ) {
            // Extract secrets from config_to_save (modifies it) and store them externally.
            let secrets_to_store = config_to_save.extract_secrets();
            secret_store.store(&secrets_to_store)?;
        }
        config_to_save.config_security = Some(ConfigSecurity { mode });
        config_to_save.extract_secrets = false;

        let mut config_value = serde_json::to_value(&config_to_save)?;
        strip_nulls(&mut config_value);
        if let Some(parent) = Path::new(path).parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }

        let format = config_file_format_from_path(path);
        let output = if Self::uses_encrypted_config_mode(mode) {
            let plaintext = match format {
                config::FileFormat::Json => serde_json::to_string_pretty(&config_value)?,
                _ => serde_yaml_ng::to_string(&config_value)?,
            };
            encode_sensitive_config_file(&plaintext, format, Self::security_mode_label(mode))?
        } else {
            match format {
                config::FileFormat::Json => serde_json::to_string_pretty(&config_value)?,
                _ => serde_yaml_ng::to_string(&config_value)?,
            }
        };
        std::fs::write(path, output)?;
        Ok(())
    }

    fn extract_secrets_to_all(
        name: &str,
        id: &str,
        entity_type: &str,
        endpoint: &mut Endpoint,
        all_secrets: &mut HashMap<String, String>,
    ) {
        let mut endpoint_secrets = HashMap::new();
        let temp_prefix = "SECRET__";
        extract_all_secrets_from_endpoint(endpoint, temp_prefix, &mut endpoint_secrets);

        if !endpoint_secrets.is_empty() {
            let name_part = sanitize_name_for_env(name);
            let id_part = sanitize_id_for_env(id);

            for (k, v) in endpoint_secrets {
                let suffix = k.strip_prefix(temp_prefix).unwrap();
                all_secrets.insert(
                    format!("MQB__{}__{}{}", entity_type, name_part, suffix),
                    v.clone(),
                );
                all_secrets.insert(format!("MQB__{}__{}{}", entity_type, id_part, suffix), v);
            }
        }
    }

    fn extract_secrets(&mut self) -> HashMap<String, String> {
        let mut all_secrets = HashMap::new();
        for (name, route) in &mut self.routes {
            let prefix = format!("MQB__ROUTES__{}__", sanitize_name_for_env(name));
            route.route.extract_secrets(&prefix, &mut all_secrets);
            extract_http_header_secrets_from_route(&mut route.route, &prefix, &mut all_secrets);
        }
        for consumer in &mut self.consumers {
            Self::extract_secrets_to_all(
                &consumer.name,
                &consumer.id,
                "CONSUMERS",
                &mut consumer.endpoint,
                &mut all_secrets,
            );
        }
        for publisher in &mut self.publishers {
            Self::extract_secrets_to_all(
                &publisher.name,
                &publisher.id,
                "PUBLISHERS",
                &mut publisher.endpoint,
                &mut all_secrets,
            );
        }
        all_secrets
    }

    pub fn referenced_secret_keys(&self) -> SecretReferenceSummary {
        let mut routes = HashMap::new();
        for (name, route_config) in &self.routes {
            let prefix = format!("MQB__ROUTES__{}__", sanitize_name_for_env(name));
            let mut route = route_config.route.clone();
            let mut secrets = HashMap::new();
            route.extract_secrets(&prefix, &mut secrets);
            extract_http_header_secrets_from_route(&mut route, &prefix, &mut secrets);
            if !secrets.is_empty() {
                let mut keys: Vec<String> = secrets.into_keys().collect();
                keys.sort();
                routes.insert(name.clone(), keys);
            }
        }

        let mut consumers = HashMap::new();
        for consumer in &self.consumers {
            let keys = self.get_referenced_keys_for_entity(
                &consumer.name,
                &consumer.id,
                "CONSUMERS",
                &consumer.endpoint,
            );
            if !keys.is_empty() {
                consumers.insert(consumer.name.clone(), keys);
            }
        }

        let mut publishers = HashMap::new();
        for publisher in &self.publishers {
            let keys = self.get_referenced_keys_for_entity(
                &publisher.name,
                &publisher.id,
                "PUBLISHERS",
                &publisher.endpoint,
            );
            if !keys.is_empty() {
                publishers.insert(publisher.name.clone(), keys);
            }
        }

        SecretReferenceSummary {
            routes,
            consumers,
            publishers,
        }
    }

    fn get_referenced_keys_for_entity(
        &self,
        name: &str,
        id: &str,
        entity_type: &str,
        endpoint: &Endpoint,
    ) -> Vec<String> {
        let mut endpoint = endpoint.clone();
        let mut endpoint_secrets = HashMap::new();
        let temp_prefix = "SECRET__";
        extract_all_secrets_from_endpoint(&mut endpoint, temp_prefix, &mut endpoint_secrets);

        let name_part = sanitize_name_for_env(name);
        let id_part = sanitize_id_for_env(id);
        let mut keys = Vec::new();
        for k in endpoint_secrets.keys() {
            let suffix = k.strip_prefix(temp_prefix).unwrap();
            keys.push(format!("MQB__{}__{}{}", entity_type, name_part, suffix));
            keys.push(format!("MQB__{}__{}{}", entity_type, id_part, suffix));
        }
        keys.sort();
        keys
    }
}

fn is_sensitive_http_header(key: &str) -> bool {
    matches!(
        key.trim().to_ascii_lowercase().as_str(),
        "authorization" | "x-api-key" | "api-key" | "x-auth-token" | "proxy-authorization"
    )
}

fn sanitize_name_for_env(name: &str) -> String {
    name.trim().replace(' ', "_").to_uppercase()
}

fn sanitize_id_for_env(id: &str) -> String {
    id.trim().replace('-', "_").to_uppercase()
}

fn extract_all_secrets_from_endpoint(
    endpoint: &mut Endpoint,
    prefix: &str,
    secrets: &mut HashMap<String, String>,
) {
    endpoint.extract_secrets(prefix, secrets);
    extract_http_header_secrets_from_endpoint(endpoint, prefix, secrets);
}

fn extract_http_header_secrets_from_route(
    route: &mut Route,
    prefix: &str,
    secrets: &mut HashMap<String, String>,
) {
    extract_http_header_secrets_from_endpoint(
        &mut route.input,
        &format!("{}__INPUT", prefix),
        secrets,
    );
    extract_http_header_secrets_from_endpoint(
        &mut route.output,
        &format!("{}__OUTPUT", prefix),
        secrets,
    );
}

fn extract_http_header_secrets_from_endpoint(
    endpoint: &mut Endpoint,
    prefix: &str,
    secrets: &mut HashMap<String, String>,
) {
    for (index, middleware) in endpoint.middlewares.iter_mut().enumerate() {
        if let Middleware::Dlq(cfg) = middleware {
            extract_http_header_secrets_from_endpoint(
                &mut cfg.endpoint,
                &format!("{}__MIDDLEWARES__{}__DLQ__ENDPOINT", prefix, index),
                secrets,
            );
        }
    }

    match &mut endpoint.endpoint_type {
        EndpointType::Http(cfg) => {
            let keys: Vec<String> = cfg.custom_headers.keys().cloned().collect();
            for key in keys {
                if !is_sensitive_http_header(&key) {
                    continue;
                }
                if let Some(value) = cfg.custom_headers.remove(&key) {
                    secrets.insert(
                        format!(
                            "{}__HTTP__CUSTOM_HEADERS__{}",
                            prefix,
                            key.trim().replace('-', "_").to_uppercase()
                        ),
                        value,
                    );
                }
            }
        }
        EndpointType::Fanout(endpoints) => {
            for (index, nested) in endpoints.iter_mut().enumerate() {
                extract_http_header_secrets_from_endpoint(
                    nested,
                    &format!("{}__FANOUT__{}", prefix, index),
                    secrets,
                );
            }
        }
        EndpointType::Switch(cfg) => {
            for (case_name, nested) in &mut cfg.cases {
                extract_http_header_secrets_from_endpoint(
                    nested,
                    &format!("{}__SWITCH__CASES__{}", prefix, case_name.to_uppercase()),
                    secrets,
                );
            }
            if let Some(default) = &mut cfg.default {
                extract_http_header_secrets_from_endpoint(
                    default,
                    &format!("{}__SWITCH__DEFAULT", prefix),
                    secrets,
                );
            }
        }
        EndpointType::Reader(nested) => {
            extract_http_header_secrets_from_endpoint(
                nested,
                &format!("{}__READER", prefix),
                secrets,
            );
        }
        _ => {}
    }
}

fn strip_nulls(v: &mut serde_json::Value) {
    match v {
        serde_json::Value::Object(map) => {
            map.retain(|_, v| !v.is_null());
            for v in map.values_mut() {
                strip_nulls(v);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                strip_nulls(v);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct RecordingSecretStore {
        stored: Mutex<Vec<HashMap<String, String>>>,
    }

    impl SecretStore for RecordingSecretStore {
        fn store(&self, secrets: &HashMap<String, String>) -> Result<()> {
            self.stored.lock().unwrap().push(secrets.clone());
            Ok(())
        }
    }

    fn sample_security_config(mode: &str) -> AppConfig {
        serde_yaml_ng::from_str(&format!(
            r#"
config_security:
  mode: {mode}
publishers:
  - name: "orders_http"
    endpoint:
      http:
        url: "https://example.test/orders"
        custom_headers:
          authorization: "Bearer token"
"#
        ))
        .unwrap()
    }

    #[test]
    fn test_config_deserialization() {
        let yaml_config = r#"
log_level: debug
logger: plain
routes:
  kafka_to_nats:
    input:
      kafka:
        brokers: "kafka:9092"
        group_id: "bridge_group"
        topic: "in_topic"
    output:
      nats:
        url: "nats://nats:4222"
        subject: "out_subject"
"#;

        let config: Result<AppConfig, _> = serde_yaml_ng::from_str(yaml_config);
        dbg!(&config);
        assert!(config.is_ok());
        let mut config = config.unwrap();
        config.migrate_legacy_routes();

        assert_eq!(config.log_level, "debug");
        assert!(config.routes.is_empty());
        assert_eq!(config.publishers.len(), 1);
        assert_eq!(config.consumers.len(), 1);

        let consumer = &config.consumers[0];
        if let mq_bridge::models::EndpointType::Kafka(k) = &consumer.endpoint.endpoint_type {
            assert_eq!(k.url, "kafka:9092");
            assert_eq!(k.topic.as_deref(), Some("in_topic"));
        }
        match &consumer.output {
            ConsumerOutputConfig::Publisher {
                publisher,
                publisher_id,
            } => {
                assert_eq!(publisher, "kafka_to_nats_publisher");
                assert_eq!(
                    publisher_id.as_deref(),
                    Some(config.publishers[0].id.as_str())
                );
            }
            other => panic!("expected publisher output, got {other:?}"),
        }
    }
    #[test]
    fn test_config_from_env_vars() {
        // Set environment variables
        // Clear the var first to avoid interference from other tests
        unsafe {
            std::env::remove_var("MQB__LOG_LEVEL");
            std::env::set_var("MQB__LOG_LEVEL", "trace");
            std::env::set_var("MQB__LOGGER", "json");

            // Route 0: Kafka to NATS
            std::env::set_var(
                "MQB__ROUTES__KAFKA_TO_NATS_FROM_ENV__INPUT__KAFKA__BROKERS",
                "env-kafka:9092",
            );
            // Source
            std::env::set_var(
                "MQB__ROUTES__KAFKA_TO_NATS_FROM_ENV__INPUT__KAFKA__GROUP_ID",
                "env-group",
            );
            std::env::set_var(
                "MQB__ROUTES__KAFKA_TO_NATS_FROM_ENV__INPUT__KAFKA__TOPIC",
                "env-in-topic",
            );
            // Sink
            std::env::set_var(
                "MQB__ROUTES__KAFKA_TO_NATS_FROM_ENV__OUTPUT__NATS__URL",
                "nats://env-nats:4222",
            );
            std::env::set_var(
                "MQB__ROUTES__KAFKA_TO_NATS_FROM_ENV__OUTPUT__NATS__SUBJECT",
                "env-out-subject",
            );

            std::env::set_var("CONFIG_FILE", "_"); // ignore existing config.yaml
        }
        // Load config
        let (config, _) = load_config(None, None, None, None).unwrap();

        // Assertions
        assert_eq!(config.log_level, "trace");
        assert_eq!(config.logger, "json");
        assert!(config.routes.is_empty());
        assert_eq!(config.publishers.len(), 1);
        assert_eq!(config.consumers.len(), 1);

        let consumer = &config.consumers[0];
        assert_eq!(consumer.name, "kafka_to_nats_from_env");
        if let mq_bridge::models::EndpointType::Kafka(k) = &consumer.endpoint.endpoint_type {
            assert_eq!(k.url, "env-kafka:9092"); // group_id is now optional
            assert_eq!(k.topic.as_deref(), Some("env-in-topic"));
        } else {
            panic!("Expected Kafka source endpoint");
        }
    }

    #[test]
    fn test_config_deserializes_disabled_route() {
        let yaml_config = r#"
routes:
  paused_route:
    enabled: false
    input:
      memory:
        topic: "in_topic"
    output:
      memory:
        topic: "out_topic"
"#;

        let mut config: AppConfig = serde_yaml_ng::from_str(yaml_config).unwrap();
        config.migrate_legacy_routes();
        assert!(config.routes.is_empty());
        let consumer = &config.consumers[0];
        assert_eq!(consumer.name, "paused_route");
        assert!(!consumer.message_capture.enabled);
        assert!(matches!(
            consumer.endpoint.endpoint_type,
            mq_bridge::models::EndpointType::Memory(_)
        ));
    }

    #[test]
    fn test_route_migration_reuses_matching_publishers() {
        let yaml_config = r#"
publishers:
  - name: "existing_pub"
    endpoint:
      memory:
        topic: "shared"
routes:
  route_alpha:
    input:
      memory:
        topic: "in"
    output:
      memory:
        topic: "shared"
"#;

        let mut config: AppConfig = serde_yaml_ng::from_str(yaml_config).unwrap();
        config.migrate_legacy_routes();
        assert!(config.routes.is_empty());
        assert_eq!(config.publishers.len(), 1);
        assert_eq!(config.consumers.len(), 1);
        match &config.consumers[0].output {
            ConsumerOutputConfig::Publisher { publisher, .. } => {
                assert_eq!(publisher, "existing_pub");
            }
            other => panic!("expected publisher output, got {other:?}"),
        }
    }

    #[test]
    fn test_consumer_output_deserializes_response_and_publisher_modes() {
        let yaml_config = r#"
consumers:
  - name: "reply_consumer"
    endpoint:
      http:
        url: "0.0.0.0:8080"
    message_capture:
      enabled: false
      keep_last: 25
    output:
      mode: response
      response:
        headers:
          content-type: "application/json"
        payload: "{\"ok\":true}"
  - name: "forward_consumer"
    endpoint:
      memory:
        topic: "orders"
    output:
      mode: publisher
      publisher: "orders_pub"
"#;

        let mut config: AppConfig = serde_yaml_ng::from_str(yaml_config).unwrap();
        config.migrate_legacy_routes();
        assert_eq!(config.consumers.len(), 2);

        match &config.consumers[0].output {
            ConsumerOutputConfig::Response { response } => {
                let response = response.clone().expect("response payload");
                assert_eq!(response.payload, "{\"ok\":true}");
                assert_eq!(
                    response.headers.get("content-type").map(String::as_str),
                    Some("application/json")
                );
            }
            other => panic!("expected response output, got {other:?}"),
        }
        assert!(!config.consumers[0].message_capture.enabled);
        assert_eq!(config.consumers[0].message_capture.keep_last, 25);

        match &config.consumers[1].output {
            ConsumerOutputConfig::Publisher { publisher, .. } => {
                assert_eq!(publisher, "orders_pub");
            }
            other => panic!("expected publisher output, got {other:?}"),
        }
        assert!(config.consumers[1].message_capture.enabled);
        assert_eq!(config.consumers[1].message_capture.keep_last, 100);
    }

    #[test]
    fn test_legacy_consumer_response_migrates_to_output() {
        let yaml_config = r#"
consumers:
  - name: "reply_consumer"
    endpoint:
      http:
        url: "0.0.0.0:8080"
    response:
      headers:
        content-type: "application/json"
      payload: "{\"ok\":true}"
"#;

        let mut config: AppConfig = serde_yaml_ng::from_str(yaml_config).unwrap();
        config.migrate_legacy_routes();

        assert_eq!(config.consumers.len(), 1);
        assert!(config.consumers[0].response.is_none());
        match &config.consumers[0].output {
            ConsumerOutputConfig::Response { response } => {
                let response = response.clone().expect("response payload");
                assert_eq!(response.payload, "{\"ok\":true}");
                assert_eq!(
                    response.headers.get("content-type").map(String::as_str),
                    Some("application/json")
                );
            }
            other => panic!("expected response output, got {other:?}"),
        }
    }

    #[test]
    fn test_legacy_extract_secrets_migrates_to_security_mode() {
        let yaml_config = r#"
extract_secrets: true
publishers: []
consumers: []
"#;

        let mut config: AppConfig = serde_yaml_ng::from_str(yaml_config).unwrap();
        config.migrate_legacy_routes();

        assert_eq!(config.security_mode(), ConfigSecurityMode::Balanced);
        assert_eq!(
            config
                .config_security
                .as_ref()
                .map(|security| security.mode),
            Some(ConfigSecurityMode::Balanced)
        );
        assert!(!config.extract_secrets);
    }

    #[test]
    fn test_save_unencrypted_keeps_inline_secrets() {
        let config = sample_security_config("unencrypted");
        let secret_store = RecordingSecretStore::default();
        let path = std::env::temp_dir().join("mqb-config-unencrypted.yml");

        config
            .save_with_secret_store(path.to_str().unwrap(), &secret_store)
            .unwrap();

        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("mode: unencrypted"));
        assert!(saved.contains("Bearer token"));
        assert!(secret_store.stored.lock().unwrap().is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_save_balanced_extracts_and_stores_secrets() {
        let config = sample_security_config("balanced");
        let secret_store = RecordingSecretStore::default();
        let path = std::env::temp_dir().join("mqb-config-balanced.yml");

        config
            .save_with_secret_store(path.to_str().unwrap(), &secret_store)
            .unwrap();

        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("mode: balanced"));
        assert!(!saved.contains("Bearer token"));
        assert!(!saved.contains("extract_secrets"));
        assert_eq!(secret_store.stored.lock().unwrap().len(), 1);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_save_env_temporary_messages_extracts_and_stores_secrets() {
        let config = sample_security_config("env_temporary_messages");
        let secret_store = RecordingSecretStore::default();
        let path = std::env::temp_dir().join("mqb-config-env-temporary-messages.yml");

        config
            .save_with_secret_store(path.to_str().unwrap(), &secret_store)
            .unwrap();

        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("mode: env_temporary_messages"));
        assert!(!saved.contains("Bearer token"));
        assert_eq!(secret_store.stored.lock().unwrap().len(), 1);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_save_temporary_messages_keeps_inline_secrets() {
        let config = sample_security_config("temporary_messages");
        let secret_store = RecordingSecretStore::default();
        let path = std::env::temp_dir().join("mqb-config-temporary-messages.yml");

        config
            .save_with_secret_store(path.to_str().unwrap(), &secret_store)
            .unwrap();

        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("mode: temporary_messages"));
        assert!(saved.contains("Bearer token"));
        assert!(secret_store.stored.lock().unwrap().is_empty());

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn test_save_durable_encrypts_without_storing_secrets() {
        let config = sample_security_config("durable");
        let secret_store = RecordingSecretStore::default();
        let path = std::env::temp_dir().join("mqb-config-durable.yml");
        let _guard = crate::encrypted_config::test_config_master_key_lock()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        unsafe {
            std::env::set_var(
                crate::encrypted_config::CONFIG_MASTER_KEY_ENV,
                "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
            );
        }

        config
            .save_with_secret_store(path.to_str().unwrap(), &secret_store)
            .unwrap();

        let saved = std::fs::read_to_string(&path).unwrap();
        assert!(saved.contains("mode: durable"));
        assert!(saved.contains("encrypted_config"));
        assert!(!saved.contains("Bearer token"));
        assert!(secret_store.stored.lock().unwrap().is_empty());

        let _ = std::fs::remove_file(path);
        unsafe {
            std::env::remove_var(crate::encrypted_config::CONFIG_MASTER_KEY_ENV);
        }
    }
}
