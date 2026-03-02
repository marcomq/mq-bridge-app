use std::{collections::HashMap, path::Path};

use anyhow::Result;
use config::{Config, ConfigError};
use schemars::JsonSchema;

use mq_bridge::{Route, models::SecretExtractor};

fn default_log_level() -> String {
    "info".to_string()
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
    pub routes: HashMap<String, Route>,
    /// If true, secrets will be extracted to .env file upon saving.
    #[serde(default)]
    pub extract_secrets: bool,
}

pub fn load_config(config_path: Option<String>) -> Result<(AppConfig, String), ConfigError> {
    // Attempt to load .env file
    match dotenvy::dotenv() {
        Ok(path) => println!("INFO: Loaded .env file from {:?}", path),
        Err(e) => println!("INFO: No .env file loaded: {}", e),
    }

    // Debug: Print environment variables to verify they are loaded
    for (key, value) in std::env::vars() {
        if key.starts_with("MQB") {
            println!("DEBUG ENV: {}={}", key, value);
        }
    }

    // Determine configuration file path with precedence:
    // 1. --config argument
    // 2. `config.yml` in the current directory if it exists
    // 3. `CONFIG_FILE` environment variable (used for Docker default)
    // 4. Default to `config.yml`
    let source_file = if let Some(path) = config_path.clone() {
        path
    } else if Path::new("config.yml").exists() {
        "config.yml".to_string()
    } else {
        std::env::var("CONFIG_FILE").unwrap_or_else(|_| "config.yml".to_string())
    };

    if !Path::new(&source_file).exists() {
        eprintln!("INFO: Configuration file '{}' not found. Starting with default settings and environment variables. No routes will be active unless defined in environment variables.", source_file);
    } else if config_path.is_none() && source_file != "config.yml" {
        eprintln!("INFO: Using configuration from '{}'", source_file);
    }

    let settings = Config::builder()
        // Start with default values
        .set_default("log_level", "info")?
        // Load from a configuration file, if it exists.
        .add_source(config::File::from(Path::new(&source_file)).required(false))
        // Load from environment variables, which will override file and defaults.
        .add_source(
            config::Environment::default()
                .prefix("MQB")
                .separator("__")
                .ignore_empty(true)
                .try_parsing(true),
        )
        .build()?;

    // Debug: Print the constructed configuration to see how env vars were mapped
    if let Ok(debug_view) = settings.clone().try_deserialize::<serde_json::Value>() {
        println!("DEBUG CONFIG STRUCTURE: {:#?}", debug_view);
    }
    
    let config: AppConfig = settings.try_deserialize()?;
    Ok((config, source_file))
}

impl AppConfig {
    pub fn save(&mut self, path: &str) -> Result<()> {
        // Sanitize route names to ensure compatibility with environment variables
        let sanitized_routes: HashMap<String, Route> = self.routes.drain().map(|(k, v)| {
            (k.trim().replace(' ', "_").to_lowercase(), v)
        }).collect();
        self.routes = sanitized_routes;

        if self.extract_secrets {
            self.extract_secrets_to_env()?;
        }

        let mut config_value = serde_json::to_value(&*self)?;
        strip_nulls(&mut config_value);

        let yaml = serde_yaml_ng::to_string(&config_value)?;
        std::fs::write(path, yaml)?;
        Ok(())
    }

    fn extract_secrets_to_env(&mut self) -> Result<()> {
        let mut all_secrets = HashMap::new();
        for (name, route) in &mut self.routes {
            let name = name.to_uppercase(); // Names are already sanitized in save()
            let prefix = format!("MQB__ROUTES__{}__", name);
            route.extract_secrets(&prefix, &mut all_secrets);
        }

        if !all_secrets.is_empty() {
            let env_path = Path::new(".env");
            let existing_content = if env_path.exists() {
                std::fs::read_to_string(env_path)?
            } else {
                String::new()
            };

            let mut new_lines = Vec::new();
            let mut processed_keys = std::collections::HashSet::new();

            for line in existing_content.lines() {
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with('#') {
                    new_lines.push(line.to_string());
                    continue;
                }

                if let Some((key, _)) = line.split_once('=') {
                    let key = key.trim();
                    if let Some(new_value) = all_secrets.get(key) {
                        new_lines.push(format!("{}={}", key, new_value));
                        processed_keys.insert(key.to_string());
                    } else {
                        new_lines.push(line.to_string());
                    }
                } else {
                    new_lines.push(line.to_string());
                }
            }

            for (key, value) in all_secrets {
                if !processed_keys.contains(&key) {
                    new_lines.push(format!("{}={}", key, value));
                }
            }

            let mut final_content = new_lines.join("\n");
            if !final_content.ends_with('\n') {
                final_content.push('\n');
            }
            std::fs::write(env_path, final_content)?;
        }
        Ok(())
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
        if let mq_bridge::models::EndpointType::Kafka(k) = &route.input.endpoint_type {
            assert_eq!(k.url, "kafka:9092");
            assert_eq!(k.topic.as_deref(), Some("in_topic"));
        }
    }
    #[test]
    fn test_config_from_env_vars() {
        // Set environment variables
        // Clear the var first to avoid interference from other tests
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
                                               // Load config
        let (config, _) = load_config(None).unwrap();

        // Assertions
        dbg!(&config.routes);
        assert_eq!(config.log_level, "trace");
        assert_eq!(config.logger, "json");
        assert_eq!(config.routes.len(), 1);

        let (name, route) = config.routes.iter().next().unwrap();
        assert_eq!(name, "kafka_to_nats_from_env");

        // Assert source
        if let mq_bridge::models::EndpointType::Kafka(k) = &route.input.endpoint_type {
            assert_eq!(k.url, "env-kafka:9092"); // group_id is now optional
            assert_eq!(k.topic.as_deref(), Some("env-in-topic"));
        } else {
            panic!("Expected Kafka source endpoint");
        }
    }
}
