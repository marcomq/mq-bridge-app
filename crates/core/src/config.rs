use std::{
    collections::{HashMap, HashSet},
    path::{Path, PathBuf},
};

use anyhow::Result;
use config::Config;
use mq_bridge::{
    Route,
    models::{Endpoint, EndpointType, Middleware, SecretExtractor},
};
use schemars::JsonSchema;

fn default_log_level() -> String {
    "info".to_string()
}

fn default_route_enabled() -> bool {
    true
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
    #[serde(default)]
    pub routes: HashMap<String, RouteConfig>,
    #[serde(default)]
    pub consumers: Vec<ConsumerConfig>,
    #[serde(default)]
    pub publishers: Vec<PublisherClient>,
    #[serde(default)]
    pub presets: HashMap<String, Vec<PublisherPreset>>,
    #[serde(default, alias = "envVars")]
    pub env_vars: HashMap<String, String>,
    /// If true, secrets will be extracted to .env file upon saving.
    #[serde(default)]
    pub extract_secrets: bool,
    /// The default tab to show in the UI upon loading.
    #[serde(default)]
    pub default_tab: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct PublisherPreset {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub method: String,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub payload: String,
    #[serde(default)]
    pub headers: Vec<PublisherPresetHeader>,
    #[serde(default)]
    pub group: Option<String>,
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
    pub name: String,
    pub endpoint: Endpoint,
    #[serde(default)]
    pub comment: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub response: Option<ConsumerResponseConfig>,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone, Default)]
pub struct ConsumerResponseConfig {
    #[serde(default)]
    pub headers: HashMap<String, String>,
    #[serde(default)]
    pub payload: String,
}

#[derive(Debug, serde::Deserialize, serde::Serialize, JsonSchema, Clone)]
pub struct PublisherClient {
    pub name: String,
    pub endpoint: Endpoint,
    #[serde(default)]
    pub comment: String,
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
                let format = if template_path.ends_with(".json") {
                    config::FileFormat::Json
                } else {
                    config::FileFormat::Yaml
                };
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
        let format = if persistent_file.ends_with(".json") {
            config::FileFormat::Json
        } else {
            config::FileFormat::Yaml
        };
        builder = builder.add_source(source_from_str(&content, format)?);

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

    let config: AppConfig = settings.try_deserialize()?;
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
    pub fn save(&self, path: &str) -> Result<()> {
        let env_store = EnvFileSecretStore::new(".env");
        self.save_with_secret_store(path, &env_store)
    }

    pub fn save_with_secret_store(&self, path: &str, secret_store: &dyn SecretStore) -> Result<()> {
        let mut config_to_save = self.clone();

        // Sanitize route names to ensure compatibility with environment variables
        let sanitized_routes: HashMap<String, RouteConfig> = config_to_save
            .routes
            .drain()
            .map(|(k, v)| (k.trim().replace(' ', "_").to_lowercase(), v))
            .collect();
        config_to_save.routes = sanitized_routes;

        for consumer in &mut config_to_save.consumers {
            consumer.name = consumer.name.trim().to_string();
        }

        for pub_client in &mut config_to_save.publishers {
            pub_client.name = pub_client.name.trim().to_string();
        }

        if config_to_save.extract_secrets {
            let secrets = config_to_save.extract_secrets();
            secret_store.store(&secrets)?;
        }

        let mut config_value = serde_json::to_value(&config_to_save)?;
        strip_nulls(&mut config_value);

        let yaml = serde_yaml_ng::to_string(&config_value)?;
        if let Some(parent) = Path::new(path).parent()
            && !parent.as_os_str().is_empty()
        {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, yaml)?;
        Ok(())
    }

    fn extract_secrets(&mut self) -> HashMap<String, String> {
        let mut all_secrets = HashMap::new();
        for (name, route) in &mut self.routes {
            let name = name.to_uppercase(); // Names are already sanitized in save()
            let prefix = format!("MQB__ROUTES__{}__", name);
            route.route.extract_secrets(&prefix, &mut all_secrets);
            extract_http_header_secrets_from_route(&mut route.route, &prefix, &mut all_secrets);
        }
        for consumer in &mut self.consumers {
            let name = consumer.name.trim().replace(' ', "_").to_uppercase();
            let prefix = format!("MQB__CONSUMERS__{}__", name);
            consumer.endpoint.extract_secrets(&prefix, &mut all_secrets);
            extract_http_header_secrets_from_endpoint(
                &mut consumer.endpoint,
                &prefix,
                &mut all_secrets,
            );
        }
        for publisher in &mut self.publishers {
            let name = publisher.name.trim().replace(' ', "_").to_uppercase();
            let prefix = format!("MQB__PUBLISHERS__{}__", name);
            publisher
                .endpoint
                .extract_secrets(&prefix, &mut all_secrets);
            extract_http_header_secrets_from_endpoint(
                &mut publisher.endpoint,
                &prefix,
                &mut all_secrets,
            );
        }
        all_secrets
    }

    pub fn referenced_secret_keys(&self) -> SecretReferenceSummary {
        let mut routes = HashMap::new();
        for (name, route_config) in &self.routes {
            let sanitized_name = name.trim().replace(' ', "_").to_lowercase();
            let prefix = format!("MQB__ROUTES__{}__", sanitized_name.to_uppercase());
            let mut route = route_config.route.clone();
            let mut secrets = HashMap::new();
            route.extract_secrets(&prefix, &mut secrets);
            extract_http_header_secrets_from_route(&mut route, &prefix, &mut secrets);
            if !secrets.is_empty() {
                let mut keys: Vec<String> = secrets.into_keys().collect();
                keys.sort();
                routes.insert(sanitized_name, keys);
            }
        }

        let mut consumers = HashMap::new();
        for consumer in &self.consumers {
            let sanitized_name = consumer.name.trim().replace(' ', "_");
            let prefix = format!("MQB__CONSUMERS__{}__", sanitized_name.to_uppercase());
            let mut endpoint = consumer.endpoint.clone();
            let mut secrets = HashMap::new();
            endpoint.extract_secrets(&prefix, &mut secrets);
            extract_http_header_secrets_from_endpoint(&mut endpoint, &prefix, &mut secrets);
            if !secrets.is_empty() {
                let mut keys: Vec<String> = secrets.into_keys().collect();
                keys.sort();
                consumers.insert(sanitized_name, keys);
            }
        }

        let mut publishers = HashMap::new();
        for publisher in &self.publishers {
            let sanitized_name = publisher.name.trim().replace(' ', "_");
            let prefix = format!("MQB__PUBLISHERS__{}__", sanitized_name.to_uppercase());
            let mut endpoint = publisher.endpoint.clone();
            let mut secrets = HashMap::new();
            endpoint.extract_secrets(&prefix, &mut secrets);
            extract_http_header_secrets_from_endpoint(&mut endpoint, &prefix, &mut secrets);
            if !secrets.is_empty() {
                let mut keys: Vec<String> = secrets.into_keys().collect();
                keys.sort();
                publishers.insert(sanitized_name, keys);
            }
        }

        SecretReferenceSummary {
            routes,
            consumers,
            publishers,
        }
    }
}

fn is_sensitive_http_header(key: &str) -> bool {
    matches!(
        key.trim().to_ascii_lowercase().as_str(),
        "authorization" | "x-api-key" | "api-key" | "x-auth-token" | "proxy-authorization"
    )
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

#[allow(unused_imports)]
mod tests {
    use super::*;

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
        let config = config.unwrap();

        assert_eq!(config.log_level, "debug");
        assert_eq!(config.routes.len(), 1);

        let route = &config.routes["kafka_to_nats"];
        assert!(route.enabled);
        if let mq_bridge::models::EndpointType::Kafka(k) = &route.route.input.endpoint_type {
            assert_eq!(k.url, "kafka:9092");
            assert_eq!(k.topic.as_deref(), Some("in_topic"));
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
        dbg!(&config.routes);
        assert_eq!(config.log_level, "trace");
        assert_eq!(config.logger, "json");
        assert_eq!(config.routes.len(), 1);

        let (name, route) = config.routes.iter().next().unwrap();
        assert_eq!(name, "kafka_to_nats_from_env");

        // Assert source
        assert!(route.enabled);
        if let mq_bridge::models::EndpointType::Kafka(k) = &route.route.input.endpoint_type {
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

        let config: AppConfig = serde_yaml_ng::from_str(yaml_config).unwrap();
        let route = &config.routes["paused_route"];
        assert!(!route.enabled);
        assert!(matches!(
            route.route.input.endpoint_type,
            mq_bridge::models::EndpointType::Memory(_)
        ));
    }
}
