use crate::config::{
    AppConfig, ConfigSecurityMode, ConsumerConfig, ConsumerMessageCaptureConfig,
    ConsumerOutputConfig, ConsumerResponseConfig, EnvFileSecretStore, PublisherClient, SecretStore,
};
use crate::encrypted_config::has_config_master_key;
use anyhow::{Result, anyhow};
use chrono;
use metrics_exporter_prometheus::PrometheusHandle;
use mq_bridge::models::{Endpoint, EndpointType, MemoryConfig, Route, StaticConfig};
use mq_bridge::route::RouteHandle;
use mq_bridge::{
    CanonicalMessage, Handled, HandlerError, Publisher, Sent, msg, unregister_publisher,
};
use schemars::JsonSchema;
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock as StdRwLock;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, LazyLock};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use uuid::Uuid;

fn generate_ephemeral_message_key() -> (String, String) {
    use aes_gcm::aead::{OsRng, rand_core::RngCore};
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let kid = Uuid::new_v4().to_string();
    (hex::encode(bytes), kid)
}

static EPHEMERAL_MESSAGE_KEY: LazyLock<(String, String)> =
    LazyLock::new(generate_ephemeral_message_key);

pub fn storage_security_for_cli(config: &AppConfig) -> StorageSecurityInfoResponse {
    match config.security_mode() {
        ConfigSecurityMode::Unencrypted => StorageSecurityInfoResponse {
            target: "cli".to_string(),
            encrypted: false,
            persistent: true,
            key_source: "none".to_string(),
            key_store_available: false,
            encrypted_config_available: has_config_master_key(),
            persistent_messages_available: false,
            config_encrypted: false,
            messages_encrypted: false,
            messages_persistent: true,
            reason: Some("cli-mode".to_string()),
            message_key_hex: None,
            kid: None,
        },
        ConfigSecurityMode::Balanced => StorageSecurityInfoResponse {
            target: "cli".to_string(),
            encrypted: false,
            persistent: true,
            key_source: "env".to_string(),
            key_store_available: false,
            encrypted_config_available: has_config_master_key(),
            persistent_messages_available: false,
            config_encrypted: false,
            messages_encrypted: false,
            messages_persistent: true,
            reason: Some("cli-mode".to_string()),
            message_key_hex: None,
            kid: None,
        },
        ConfigSecurityMode::EnvTemporaryMessages | ConfigSecurityMode::TemporaryMessages => {
            let (message_key_hex, kid) = &*EPHEMERAL_MESSAGE_KEY;
            StorageSecurityInfoResponse {
                target: "cli".to_string(),
                encrypted: true,
                persistent: false,
                key_source: "ephemeral-process".to_string(),
                key_store_available: false,
                encrypted_config_available: has_config_master_key(),
                persistent_messages_available: false,
                config_encrypted: false,
                messages_encrypted: true,
                messages_persistent: false,
                reason: Some("cli-mode".to_string()),
                message_key_hex: Some(message_key_hex.clone()),
                kid: Some(kid.clone()),
            }
        }
        ConfigSecurityMode::Sensitive | ConfigSecurityMode::Durable => {
            let (message_key_hex, kid) = &*EPHEMERAL_MESSAGE_KEY;
            StorageSecurityInfoResponse {
                target: "cli".to_string(),
                encrypted: true,
                persistent: false,
                key_source: "ephemeral-process".to_string(),
                key_store_available: false,
                encrypted_config_available: has_config_master_key(),
                persistent_messages_available: false,
                config_encrypted: has_config_master_key(),
                messages_encrypted: true,
                messages_persistent: false,
                reason: Some("cli-mode".to_string()),
                message_key_hex: Some(message_key_hex.clone()),
                kid: Some(kid.clone()),
            }
        }
    }
}

type StorageSecurityResolver =
    dyn Fn(&AppConfig) -> StorageSecurityInfoResponse + Send + Sync + 'static;
type StorageSavePrepare = dyn Fn(&AppConfig) -> anyhow::Result<()> + Send + Sync + 'static;
type ConfigRecoveryReset =
    dyn Fn(&AppConfig) -> anyhow::Result<ConfigRecoveryResetResponse> + Send + Sync + 'static;

#[derive(Default)]
pub struct UiAppRuntimeHooks {
    storage_security_resolver: Option<Arc<StorageSecurityResolver>>,
    storage_save_prepare: Option<Arc<StorageSavePrepare>>,
    config_recovery: Option<ConfigRecoveryStatusResponse>,
    config_recovery_reset: Option<Arc<ConfigRecoveryReset>>,
}

impl UiAppRuntimeHooks {
    pub fn for_cli() -> Self {
        Self {
            storage_security_resolver: Some(Arc::new(storage_security_for_cli)),
            ..Self::default()
        }
    }

    pub fn with_storage_security_resolver(
        mut self,
        resolver: Arc<StorageSecurityResolver>,
    ) -> Self {
        self.storage_security_resolver = Some(resolver);
        self
    }

    pub fn with_storage_save_prepare(mut self, prepare: Arc<StorageSavePrepare>) -> Self {
        self.storage_save_prepare = Some(prepare);
        self
    }

    pub fn with_config_recovery(mut self, recovery: Option<ConfigRecoveryStatusResponse>) -> Self {
        self.config_recovery = recovery;
        self
    }

    pub fn with_config_recovery_reset(mut self, reset: Option<Arc<ConfigRecoveryReset>>) -> Self {
        self.config_recovery_reset = reset;
        self
    }
}

#[derive(Clone)]
pub struct UiApp {
    config: Arc<RwLock<AppConfig>>,
    metrics_handle: PrometheusHandle,
    config_file_path: Arc<String>,
    secret_store: Arc<dyn SecretStore>,
    ui_handles: Arc<RwLock<HashMap<String, RouteHandle>>>,
    throughput_samples: Arc<RwLock<HashMap<String, RouteMetricSample>>>,
    consumer_message_sequences: Arc<RwLock<HashMap<String, Arc<AtomicU64>>>>,
    storage_security: Arc<StdRwLock<StorageSecurityInfoResponse>>,
    storage_security_resolver: Option<Arc<StorageSecurityResolver>>,
    storage_save_prepare: Option<Arc<StorageSavePrepare>>,
    config_recovery: Arc<StdRwLock<Option<ConfigRecoveryStatusResponse>>>,
    config_recovery_reset: Option<Arc<ConfigRecoveryReset>>,
    throughput_updater_started: Arc<AtomicBool>,
}

#[derive(Clone, Copy)]
struct RouteMetricSample {
    total_messages: f64,
    observed_at: Instant,
    smoothed_throughput: f64,
}

#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct RuntimeStatusResponse {
    pub active_consumers: Vec<String>,
    pub active_routes: Vec<String>,
    pub route_throughput: HashMap<String, f64>,
    pub consumers: HashMap<String, ConsumerStatusSnapshot>,
}

#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct ConsumerStatusSnapshot {
    pub running: bool,
    pub status: EndpointStatusSnapshot,
    pub throughput: f64,
    pub message_sequence: u64,
    pub capture_enabled: bool,
    pub capture_keep_last: usize,
}

#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct ConsumerStatusResponse {
    pub running: bool,
    pub status: EndpointStatusSnapshot,
}

#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct EndpointStatusSnapshot {
    pub healthy: bool,
    pub target: String,
    pub pending: Option<usize>,
    pub capacity: Option<usize>,
    pub error: Option<String>,
    pub details: serde_json::Value,
}

impl From<mq_bridge::traits::EndpointStatus> for EndpointStatusSnapshot {
    fn from(status: mq_bridge::traits::EndpointStatus) -> Self {
        Self {
            healthy: status.healthy,
            target: status.target,
            pending: status.pending,
            capacity: status.capacity,
            error: status.error,
            details: status.details,
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonSchema)]
pub struct PublishRequest {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub publisher_id: Option<String>,
    pub payload: String,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    #[serde(default)]
    pub endpoint: Option<mq_bridge::models::Endpoint>,
}

#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct PublishResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonSchema)]
pub struct ConfigRecoveryStatusResponse {
    pub mode: Option<String>,
    pub reason: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, JsonSchema)]
pub struct ConfigRecoveryResetResponse {
    pub backup_path: String,
}

trait CanonicalMessageExt {
    fn with_content_type(self, content_type: impl Into<String>) -> Self;
    fn with_status_code(self, status_code: impl Into<String>) -> Self;
}

impl CanonicalMessageExt for CanonicalMessage {
    fn with_content_type(self, content_type: impl Into<String>) -> Self {
        self.with_metadata_kv("Content-Type", content_type)
    }

    fn with_status_code(self, status_code: impl Into<String>) -> Self {
        self.with_metadata_kv("http_status_code", status_code)
    }
}

fn sanitize_relative_path(request_path: &str) -> Option<PathBuf> {
    let mut sanitized = PathBuf::new();

    for component in Path::new(request_path).components() {
        match component {
            Component::Normal(part) => sanitized.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if sanitized.as_os_str().is_empty() {
        None
    } else {
        Some(sanitized)
    }
}

/// The web UI bundle, embedded into the binary at compile time so a single
/// `cargo install`ed executable can serve the UI without shipping a `static/`
/// directory. In debug builds rust-embed reads the files from disk (live edit);
/// in release builds the bytes are baked into the binary.
#[derive(rust_embed::RustEmbed)]
#[folder = "static/"]
struct StaticAssets;

/// Maps an HTTP request path to a key inside the embedded [`StaticAssets`]
/// bundle. Returns `None` for paths that try to escape the asset root.
fn embedded_asset_key(request_path: &str) -> Option<String> {
    if request_path == "/" || request_path.is_empty() {
        return Some("index.html".to_string());
    }

    let relative = request_path.trim_start_matches('/');
    // rust-embed keys are always forward-slash separated.
    sanitize_relative_path(relative).map(|path| path.to_string_lossy().replace('\\', "/"))
}

/// Resolves a `/node_modules/...` request to an on-disk path. This only matters
/// for the dev server; production bundles inline their dependencies, so an
/// installed binary never serves from here.
fn resolve_node_modules_path(request_path: &str) -> Option<PathBuf> {
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let relative = request_path.strip_prefix("/node_modules/")?;
    sanitize_relative_path(relative).map(|path| workspace_root.join("node_modules").join(path))
}

fn query_param(msg: &CanonicalMessage, key: &str) -> Option<String> {
    let query = msg.metadata.get("http_query")?;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix(&format!("{key}=")))
        .and_then(|raw| {
            url::form_urlencoded::parse(format!("{key}={raw}").as_bytes())
                .into_owned()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v)
        })
}

fn header_value<'a>(msg: &'a CanonicalMessage, key: &str) -> Option<&'a str> {
    msg.metadata
        .get(key)
        .or_else(|| msg.metadata.get(&key.to_ascii_lowercase()))
        .map(String::as_str)
}

fn extract_authority(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }

    let after_scheme = if let Some((_, remainder)) = trimmed.split_once("://") {
        remainder
    } else {
        trimmed
    };

    let authority = after_scheme
        .split(['/', '?', '#'])
        .next()
        .unwrap_or_default()
        .trim();

    if authority.is_empty() {
        None
    } else {
        Some(authority)
    }
}

fn is_same_origin_request(msg: &CanonicalMessage) -> bool {
    let Some(host) = header_value(msg, "Host").and_then(extract_authority) else {
        return true;
    };

    for header_name in ["Origin", "Referer"] {
        let Some(header) = header_value(msg, header_name) else {
            continue;
        };
        let Some(authority) = extract_authority(header) else {
            return false;
        };
        if !authority.eq_ignore_ascii_case(host) {
            return false;
        }
    }

    true
}

/// Time constant for throughput smoothing (EMA) in seconds.
/// A value of 2.0s means it will take approximately 9-10s to decay to ~1% of its value.
const THROUGHPUT_TAU: f64 = 0.5;
/// Frequency of throughput calculations.
const THROUGHPUT_UPDATE_INTERVAL: Duration = Duration::from_millis(200);

fn next_route_metric_sample(
    previous: Option<RouteMetricSample>,
    total_messages: f64,
    observed_at: Instant,
) -> RouteMetricSample {
    let smoothed_throughput = if let Some(previous_sample) = previous {
        let elapsed = observed_at
            .duration_since(previous_sample.observed_at)
            .as_secs_f64();
        if elapsed > 0.0 {
            let current_rate = (total_messages - previous_sample.total_messages).max(0.0) / elapsed;

            // Time-weighted alpha: alpha = 1 - exp(-delta_t / tau)
            let alpha = 1.0 - (-elapsed / THROUGHPUT_TAU).exp();
            alpha * current_rate + (1.0 - alpha) * previous_sample.smoothed_throughput
        } else {
            previous_sample.smoothed_throughput
        }
    } else {
        0.0
    };
    RouteMetricSample {
        total_messages,
        observed_at,
        smoothed_throughput, // First observation: we have no previous throughput to smooth, so start at 0.
    }
}

fn consumer_runtime_key(consumer: &ConsumerConfig) -> String {
    let trimmed_id = consumer.id.trim();
    if trimmed_id.is_empty() {
        consumer.name.trim().to_string()
    } else {
        trimmed_id.to_string()
    }
}

fn encode_collector_route_key(consumer_key: &str) -> String {
    let mut encoded = String::with_capacity(consumer_key.len() * 2);
    for byte in consumer_key.as_bytes() {
        encoded.push_str(&format!("{byte:02x}"));
    }
    encoded
}

fn decode_collector_route_key(encoded: &str) -> Option<String> {
    if !encoded.len().is_multiple_of(2) {
        return None;
    }

    let mut bytes = Vec::with_capacity(encoded.len() / 2);
    let mut index = 0;
    while index < encoded.len() {
        let next = index + 2;
        let value = u8::from_str_radix(&encoded[index..next], 16).ok()?;
        bytes.push(value);
        index = next;
    }

    String::from_utf8(bytes).ok()
}

fn collector_route_name(consumer_key: &str) -> String {
    format!(
        "ui_collector_route_{}",
        encode_collector_route_key(consumer_key)
    )
}

fn consumer_matches_lookup(consumer: &ConsumerConfig, lookup: &str) -> bool {
    consumer_runtime_key(consumer) == lookup || consumer.name == lookup
}

fn endpoint_supports_consumer_response(endpoint: &Endpoint) -> bool {
    matches!(
        endpoint.endpoint_type,
        EndpointType::Http(_)
            | EndpointType::Nats(_)
            | EndpointType::Memory(_)
            | EndpointType::Amqp(_)
            | EndpointType::MongoDb(_)
            | EndpointType::Mqtt(_)
            | EndpointType::ZeroMq(_)
            | EndpointType::Kafka(_)
    )
}

fn normalize_consumer_response(
    response: Option<ConsumerResponseConfig>,
) -> Option<ConsumerResponseConfig> {
    response.and_then(|mut response| {
        response.headers.retain(|key, value| {
            let trimmed_key = key.trim();
            let trimmed_value = value.trim();
            !trimmed_key.is_empty() && !trimmed_value.is_empty()
        });

        if response.headers.is_empty() && response.payload.trim().is_empty() {
            None
        } else {
            Some(response)
        }
    })
}

fn normalize_consumer_output(
    output: ConsumerOutputConfig,
    fallback_response: Option<ConsumerResponseConfig>,
) -> ConsumerOutputConfig {
    let normalized_fallback = normalize_consumer_response(fallback_response);

    match output {
        ConsumerOutputConfig::Publisher {
            publisher,
            publisher_id,
        } => {
            let publisher = publisher.trim().to_string();
            ConsumerOutputConfig::Publisher {
                publisher,
                publisher_id,
            }
        }
        ConsumerOutputConfig::Response { response } => ConsumerOutputConfig::Response {
            response: normalize_consumer_response(response).or(normalized_fallback),
        },
        ConsumerOutputConfig::None => {
            if let Some(response) = normalized_fallback {
                ConsumerOutputConfig::Response {
                    response: Some(response),
                }
            } else {
                ConsumerOutputConfig::None
            }
        }
    }
}

fn consumer_output_response_compat(
    output: &ConsumerOutputConfig,
) -> Option<ConsumerResponseConfig> {
    match output {
        ConsumerOutputConfig::Response { response } => {
            normalize_consumer_response(response.clone())
        }
        _ => None,
    }
}

fn normalize_consumer_capture(
    capture: ConsumerMessageCaptureConfig,
) -> ConsumerMessageCaptureConfig {
    ConsumerMessageCaptureConfig {
        enabled: capture.enabled,
        keep_last: capture.keep_last.max(1),
    }
}

#[derive(Clone)]
enum ResolvedConsumerOutput {
    None,
    Publisher {
        endpoint: Arc<Endpoint>,
    },
    Response {
        response: Option<Arc<ConsumerResponseConfig>>,
    },
}

struct CollectorContext {
    source_key: String,
    log_channel: mq_bridge::endpoints::memory::MemoryChannel,
    counter: Arc<AtomicU64>,
    output: ResolvedConsumerOutput,
    capture_enabled: bool,
}

fn resolve_consumer_output(
    consumer: &ConsumerConfig,
    publishers: &[PublisherClient],
) -> std::result::Result<ResolvedConsumerOutput, UpdateConfigError> {
    match &consumer.output {
        ConsumerOutputConfig::None => Ok(ResolvedConsumerOutput::None),
        ConsumerOutputConfig::Response { response } => {
            if !endpoint_supports_consumer_response(&consumer.endpoint) {
                return Err(UpdateConfigError::UnsupportedCustomResponses(format!(
                    "Consumer {}: custom responses are not supported for endpoint type {}",
                    consumer.name,
                    consumer.endpoint.endpoint_type.name()
                )));
            }

            Ok(ResolvedConsumerOutput::Response {
                response: normalize_consumer_response(response.clone()).map(Arc::new),
            })
        }
        ConsumerOutputConfig::Publisher {
            publisher,
            publisher_id,
        } => {
            let publisher_name = publisher.trim();
            let publisher_id = publisher_id
                .as_deref()
                .map(str::trim)
                .filter(|id| !id.is_empty());
            if publisher_name.is_empty() && publisher_id.is_none() {
                return Err(UpdateConfigError::Validation(format!(
                    "Consumer {}: publisher output requires a selected publisher",
                    consumer.name
                )));
            }
            let Some(publisher_config) = publishers.iter().find(|candidate| {
                publisher_id.is_some_and(|id| candidate.id == id)
                    || (!publisher_name.is_empty() && candidate.name == publisher_name)
            }) else {
                return Err(UpdateConfigError::Validation(format!(
                    "Consumer {}: referenced publisher not found: {}",
                    consumer.name,
                    publisher_id.unwrap_or(publisher_name)
                )));
            };

            Ok(ResolvedConsumerOutput::Publisher {
                endpoint: Arc::new(publisher_config.endpoint.clone()),
            })
        }
    }
}

impl UiApp {
    pub fn new(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
    ) -> Self {
        let storage_security = storage_security_for_cli(&initial_config);
        Self::new_internal(
            initial_config,
            metrics_handle,
            config_file_path,
            Arc::new(EnvFileSecretStore::new(".env")),
            storage_security,
            UiAppRuntimeHooks::for_cli(),
        )
    }

    pub fn new_with_secret_store(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
        secret_store: Arc<dyn SecretStore>,
    ) -> Self {
        Self::new_internal(
            initial_config.clone(),
            metrics_handle,
            config_file_path,
            secret_store,
            storage_security_for_cli(&initial_config),
            UiAppRuntimeHooks::for_cli(),
        )
    }

    pub fn new_with_secret_store_and_storage_security(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
        secret_store: Arc<dyn SecretStore>,
        storage_security: StorageSecurityInfoResponse,
    ) -> Self {
        Self::new_internal(
            initial_config,
            metrics_handle,
            config_file_path,
            secret_store,
            storage_security,
            UiAppRuntimeHooks::default(),
        )
    }

    pub fn new_with_secret_store_and_storage_hooks(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
        secret_store: Arc<dyn SecretStore>,
        storage_security: StorageSecurityInfoResponse,
        storage_security_resolver: Arc<StorageSecurityResolver>,
        storage_save_prepare: Arc<StorageSavePrepare>,
    ) -> Self {
        Self::new_internal(
            initial_config,
            metrics_handle,
            config_file_path,
            secret_store,
            storage_security,
            UiAppRuntimeHooks::default()
                .with_storage_security_resolver(storage_security_resolver)
                .with_storage_save_prepare(storage_save_prepare),
        )
    }

    pub fn new_with_secret_store_and_runtime_hooks(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
        secret_store: Arc<dyn SecretStore>,
        storage_security: StorageSecurityInfoResponse,
        runtime_hooks: UiAppRuntimeHooks,
    ) -> Self {
        Self::new_internal(
            initial_config,
            metrics_handle,
            config_file_path,
            secret_store,
            storage_security,
            runtime_hooks,
        )
    }

    fn new_internal(
        mut initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
        secret_store: Arc<dyn SecretStore>,
        storage_security: StorageSecurityInfoResponse,
        runtime_hooks: UiAppRuntimeHooks,
    ) -> Self {
        initial_config.migrate_legacy_security_mode();
        let app = Self {
            config: Arc::new(RwLock::new(initial_config)),
            metrics_handle,
            config_file_path: Arc::new(config_file_path),
            secret_store,
            ui_handles: Arc::new(RwLock::new(HashMap::new())),
            throughput_samples: Arc::new(RwLock::new(HashMap::new())),
            consumer_message_sequences: Arc::new(RwLock::new(HashMap::new())),
            storage_security: Arc::new(StdRwLock::new(storage_security)),
            storage_security_resolver: runtime_hooks.storage_security_resolver,
            storage_save_prepare: runtime_hooks.storage_save_prepare,
            config_recovery: Arc::new(StdRwLock::new(runtime_hooks.config_recovery)),
            config_recovery_reset: runtime_hooks.config_recovery_reset,
            throughput_updater_started: Arc::new(AtomicBool::new(false)),
        };

        app.ensure_throughput_updater();

        app
    }

    /// Spawns a background task to periodically update throughput metrics for all active consumers if not already started.
    fn ensure_throughput_updater(&self) {
        if self.throughput_updater_started.load(Ordering::Relaxed) {
            return;
        }

        if let Ok(handle) = tokio::runtime::Handle::try_current()
            && self
                .throughput_updater_started
                .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
                .is_ok()
        {
            let throughput_samples_arc = Arc::clone(&self.throughput_samples);
            let consumer_message_sequences_arc = Arc::clone(&self.consumer_message_sequences);
            handle.spawn(async move {
                let mut interval = tokio::time::interval(THROUGHPUT_UPDATE_INTERVAL);

                loop {
                    interval.tick().await; // Wait for the next interval tick
                    let now = Instant::now();

                    let consumer_sequences = consumer_message_sequences_arc.read().await.clone();
                    let mut samples = throughput_samples_arc.write().await;

                    for (consumer_key, sequence) in consumer_sequences.iter() {
                        let total_messages = sequence.load(Ordering::Relaxed) as f64;
                        let previous_sample = samples.get(consumer_key).copied();
                        let next_sample =
                            next_route_metric_sample(previous_sample, total_messages, now);
                        samples.insert(consumer_key.clone(), next_sample);
                    }
                }
            });
        }
    }

    pub async fn get_config(&self) -> AppConfig {
        let mut config = self.config.read().await.clone();
        config.migrate_legacy_security_mode();
        config
    }

    pub fn storage_security(&self) -> StorageSecurityInfoResponse {
        self.storage_security
            .read()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub fn config_recovery(&self) -> Option<ConfigRecoveryStatusResponse> {
        self.config_recovery
            .read()
            .unwrap_or_else(|error| error.into_inner())
            .clone()
    }

    pub fn config_file_path(&self) -> &str {
        self.config_file_path.as_str()
    }

    pub async fn handle_ui_message(
        &self,
        msg: CanonicalMessage,
        serve_static_assets: bool,
    ) -> Result<Handled, HandlerError> {
        self.ensure_throughput_updater();

        let method = msg
            .metadata
            .get("http_method")
            .map(|s| s.as_str())
            .unwrap_or("GET")
            .to_uppercase();
        let raw_path = msg
            .metadata
            .get("http_path")
            .map(|s| s.as_str())
            .unwrap_or("/");

        // Strip anything after '#' to allow the UI to send "visible identifiers"
        // that appear in the browser network tab but are ignored for routing.
        let routing_path = raw_path.split('#').next().unwrap_or("/").to_lowercase();
        // Use the original case for parameters if needed, but lowercase for routing
        let path = routing_path.as_str();

        if method == "POST"
            && matches!(
                path,
                "/config"
                    | "/config-recovery/reset"
                    | "/publish"
                    | "/consumer-start"
                    | "/consumer-stop"
            )
            && !is_same_origin_request(&msg)
        {
            return Ok(Handled::Publish(
                msg!("Forbidden")
                    .with_status_code("403")
                    .with_content_type("text/plain; charset=utf-8"),
            ));
        }

        let result = match (method.as_str(), path) {
            ("GET", "/health") => Ok(Handled::Publish(msg!("OK"))),
            ("GET", "/schema.json") => {
                let schema = schemars::schema_for!(AppConfig);
                self.ok_json(&schema, false)
            }
            ("GET", "/config") => self.ok_json(&self.get_config().await, false),
            ("GET", "/config-recovery") => self.ok_json(&self.config_recovery(), true),
            ("GET", "/storage-security") => self.ok_json(&self.storage_security(), true),
            ("GET", "/features") => self.ok_json(&FeatureAvailabilityResponse::detect(), true),
            ("GET", "/consumer-status") => {
                let consumer_key = query_param(&msg, "consumer_id")
                    .or_else(|| query_param(&msg, "consumer"))
                    .unwrap_or_default();
                match self.consumer_status(&consumer_key).await {
                    Some(status) => self.ok_json(&status, false),
                    None => self.err_response(404, format!("Consumer not found: {consumer_key}")),
                }
            }
            ("POST", "/consumer-start") => {
                let consumer_key = query_param(&msg, "consumer_id")
                    .or_else(|| query_param(&msg, "consumer"))
                    .unwrap_or_default();
                match self.start_consumer(&consumer_key).await {
                    Ok(true) => Ok(Handled::Publish(msg!("Started"))),
                    Ok(false) => {
                        self.err_response(404, format!("Consumer not found: {consumer_key}"))
                    }
                    Err(e) => self.err_response(500, e.to_string()),
                }
            }
            ("POST", "/consumer-stop") => {
                let consumer_key = query_param(&msg, "consumer_id")
                    .or_else(|| query_param(&msg, "consumer"))
                    .unwrap_or_default();
                self.stop_consumer(&consumer_key).await;
                Ok(Handled::Publish(msg!("Stopped")))
            }
            ("GET", "/messages") => {
                let consumer =
                    query_param(&msg, "consumer_id").or_else(|| query_param(&msg, "consumer"));
                self.ok_json(&self.get_messages(consumer.as_deref()).await, true)
            }
            ("POST", "/config") => self.handle_update_config_message(msg).await,
            ("POST", "/config-recovery/reset") => self.handle_reset_config_recovery().await,
            ("POST", "/publish") => self.handle_publish_message(msg).await,
            ("GET", "/runtime-status") => self.ok_json(&self.runtime_status().await, true),
            ("GET", "/metrics") => Ok(Handled::Publish(
                CanonicalMessage::from(self.render_metrics())
                    .with_content_type("text/plain; version=0.0.4"),
            )),
            ("GET", _) if serve_static_assets => self.handle_static_asset(raw_path),
            _ => Ok(Handled::Publish(msg!("Not Found").with_status_code("404"))),
        };

        let handled = match result {
            Ok(h) => h,
            Err(e) => Handled::Publish(
                msg!(format!("Internal Server Error: {}", e)).with_status_code("500"),
            ),
        };

        let response = match handled {
            Handled::Ack => msg!("OK"),
            Handled::Publish(m) => m,
        };

        let response = if !response.metadata.contains_key("http_status_code") {
            response.with_status_code("200")
        } else {
            response
        };

        Ok(Handled::Publish(response))
    }

    fn ok_json<T: serde::Serialize>(
        &self,
        value: &T,
        no_cache: bool,
    ) -> Result<Handled, HandlerError> {
        let mut m = CanonicalMessage::from_type(value)
            .map_err(|e| HandlerError::NonRetryable(e.into()))?
            .with_content_type("application/json");
        if no_cache {
            m = m.with_metadata_kv("Cache-Control", "no-cache, no-store, must-revalidate");
        }
        Ok(Handled::Publish(m))
    }

    fn err_response(
        &self,
        status: u16,
        message: impl Into<String>,
    ) -> Result<Handled, HandlerError> {
        let msg_str = message.into();
        self.ok_json(&serde_json::json!({ "error": msg_str }), false)
            .map(|h| match h {
                Handled::Publish(m) => Handled::Publish(m.with_status_code(status.to_string())),
                other => other,
            })
    }

    pub fn render_metrics(&self) -> String {
        self.metrics_handle.render()
    }

    pub async fn consumer_status(&self, consumer_key: &str) -> Option<ConsumerStatusResponse> {
        let config = self.config.read().await;
        let consumer_config = config
            .consumers
            .iter()
            .find(|c| consumer_matches_lookup(c, consumer_key));

        consumer_config
            .map(|c| async move { self.consumer_status_snapshot(c).await })?
            .await
            .map(|snapshot| ConsumerStatusResponse {
                running: snapshot.running,
                status: snapshot.status,
            })
    }

    pub async fn start_consumer(&self, consumer_key: &str) -> Result<bool> {
        let consumer_config = {
            let config = self.config.read().await;
            config
                .consumers
                .iter()
                .find(|c| consumer_matches_lookup(c, consumer_key))
                .cloned()
                .map(|consumer| (consumer, config.publishers.clone()))
        };

        if let Some((consumer, publishers)) = consumer_config {
            self.start_ui_collector_routes(&[(consumer, publishers)])
                .await?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn stop_consumer(&self, consumer_key: &str) -> bool {
        let resolved_consumer_key = {
            let config = self.config.read().await;
            config
                .consumers
                .iter()
                .find(|c| consumer_matches_lookup(c, consumer_key))
                .map(consumer_runtime_key)
        };
        let handle_key = resolved_consumer_key.as_deref().unwrap_or(consumer_key);
        let mut handles = self.ui_handles.write().await;
        if let Some(handle) = handles.remove(handle_key) {
            handle.stop().await;
            true
        } else {
            false
        }
    }

    pub async fn get_messages(
        &self,
        target_consumer: Option<&str>,
    ) -> HashMap<String, VecDeque<serde_json::Value>> {
        let mut grouped_messages: HashMap<String, VecDeque<serde_json::Value>> = HashMap::new();

        if let Some(target_consumer) = target_consumer {
            let consumer_key = {
                let config = self.config.read().await;
                config
                    .consumers
                    .iter()
                    .find(|consumer| consumer_matches_lookup(consumer, target_consumer))
                    .map(consumer_runtime_key)
                    .unwrap_or_else(|| target_consumer.to_string())
            };
            let topic = format!("ui_collector_{consumer_key}");
            let channel = mq_bridge::get_or_create_channel(&MemoryConfig::new(&topic, None));
            while let Ok(batch) = channel.receiver.try_recv() {
                for m in batch {
                    let mut metadata = m.metadata.clone();
                    let source = metadata
                        .remove("ui_source")
                        .unwrap_or_else(|| "unknown".into());

                    if let Some(capture_time_ms) = metadata.remove("ui_capture_time") {
                        let id = fast_uuid_v7::format_uuid(m.message_id).to_string();
                        let time = capture_time_ms
                            .parse::<i64>()
                            .ok()
                            .and_then(chrono::DateTime::from_timestamp_millis)
                            .map(|dt| dt.to_rfc3339())
                            .unwrap_or_default();

                        let response = metadata.remove("ui_response_payload");
                        let response_metadata_str = metadata.remove("ui_response_metadata");
                        let response_metadata: Option<serde_json::Value> =
                            response_metadata_str.and_then(|s| serde_json::from_str(&s).ok());

                        let payload_json: serde_json::Value = serde_json::from_slice(&m.payload)
                            .unwrap_or_else(|_| {
                                serde_json::Value::String(m.get_payload_str().to_string())
                            });

                        grouped_messages
                            .entry(source.clone())
                            .or_default()
                            .push_back(serde_json::json!({
                                "id": id,
                                "time": time,
                                "metadata": metadata,
                                "payload": payload_json,
                                "response": response,
                                "response_metadata": response_metadata
                            }));
                    } else {
                        let body: serde_json::Value =
                            serde_json::from_slice(&m.payload).unwrap_or_default();
                        grouped_messages.entry(source).or_default().push_back(body);
                    }
                }
            }
        }

        grouped_messages
    }

    pub async fn publish(&self, request: PublishRequest) -> Result<Option<PublishResponse>> {
        let PublishRequest {
            name,
            publisher_id,
            payload,
            metadata,
            endpoint,
        } = request;
        let publisher_lookup_key = publisher_id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(str::to_string)
            .or_else(|| {
                let trimmed_name = name.trim();
                (!trimmed_name.is_empty()).then(|| trimmed_name.to_string())
            });
        let endpoint = if let Some(ep) = endpoint {
            Some(ep)
        } else {
            let config = self.config.read().await;
            config
                .publishers
                .iter()
                .find(|publisher| {
                    publisher_lookup_key
                        .as_ref()
                        .is_some_and(|lookup| publisher.id == *lookup || publisher.name == *lookup)
                })
                .map(|p| p.endpoint.clone())
        };

        let publisher = if let Some(endpoint) = endpoint {
            let trimmed_name = name.trim();
            if !trimmed_name.is_empty() {
                unregister_publisher(trimmed_name);
            }
            match tokio::time::timeout(Duration::from_secs(5), Publisher::new(endpoint)).await {
                Ok(Ok(p)) => Some(p),
                Ok(Err(e)) => return Err(anyhow!("Failed to initialize publisher: {e}")),
                Err(_) => return Err(anyhow!("Publisher initialization timed out after 5s")),
            }
        } else {
            None
        };

        if let Some(publisher) = publisher {
            let mut canonical = CanonicalMessage::from(payload);
            for (k, v) in metadata {
                canonical.metadata.insert(k, v);
            }

            let response = match publisher.send(canonical).await {
                Ok(Sent::Ack) => PublishResponse {
                    status: "Ack".to_string(),
                    payload: None,
                    metadata: None,
                },
                Ok(Sent::Response(message)) => PublishResponse {
                    status: "Response".to_string(),
                    payload: Some(message.get_payload_str().to_string()),
                    metadata: Some(message.metadata),
                },
                Err(e) => return Err(anyhow!("Publish error: {e}")),
            };

            Ok(Some(response))
        } else {
            Ok(None)
        }
    }

    async fn handle_reset_config_recovery(&self) -> Result<Handled, HandlerError> {
        let Some(reset_hook) = self.config_recovery_reset.as_ref() else {
            return self.err_response(404, "Config recovery reset is not available");
        };
        if self.config_recovery().is_none() {
            return self.err_response(409, "No config recovery action is pending");
        }

        let current_config = self.get_config().await;
        let result = reset_hook(&current_config).map_err(HandlerError::NonRetryable)?;

        {
            let mut recovery = self
                .config_recovery
                .write()
                .unwrap_or_else(|error| error.into_inner());
            *recovery = None;
        }

        self.ok_json(&result, true)
    }

    pub async fn runtime_status(&self) -> RuntimeStatusResponse {
        let config = self.config.read().await;
        let mut active_consumers: Vec<String> =
            self.ui_handles.read().await.keys().cloned().collect();

        // Consumers may run as internal collector routes even when ui_handles does not currently
        // track them (for example after restarts). Surface those as active consumers too.
        let consumer_route_ids: Vec<String> = mq_bridge::list_routes()
            .into_iter()
            .filter_map(|runtime_id| {
                runtime_id
                    .strip_prefix("ui_collector_route_")
                    .and_then(decode_collector_route_key)
            })
            .collect();
        active_consumers.extend(consumer_route_ids);
        let active_routes: Vec<String> = mq_bridge::list_routes()
            .into_iter() // Filter out internal UI routes
            .filter(|name| name != "web_ui" && !name.starts_with("ui_collector_route_"))
            .collect();

        let samples_guard = self.throughput_samples.read().await;
        let active_consumer_keys: HashSet<String> =
            config.consumers.iter().map(consumer_runtime_key).collect();
        let route_throughput: HashMap<String, f64> = samples_guard
            .iter()
            .filter(|(key, _)| active_consumer_keys.contains(*key))
            .map(|(key, sample)| (key.clone(), sample.smoothed_throughput))
            .collect();

        active_consumers.sort();
        active_consumers.dedup();
        let mut active_routes = active_routes;
        active_routes.sort();

        let consumer_sequences = self.consumer_message_sequences.read().await.clone();
        let mut consumers = HashMap::new();
        for consumer in &config.consumers {
            let consumer_key = consumer_runtime_key(consumer);
            let running = active_consumers.contains(&consumer_key);
            if let Some(snapshot) = self
                .consumer_status_snapshot_with_running(consumer, running)
                .await
            {
                let message_sequence = consumer_sequences
                    .get(&consumer_key)
                    .map(|a| a.load(Ordering::Relaxed))
                    .unwrap_or(0);
                let throughput = samples_guard
                    .get(&consumer_key)
                    .map(|s| s.smoothed_throughput)
                    .unwrap_or(0.0);
                let status_snapshot = ConsumerStatusSnapshot {
                    throughput,
                    message_sequence,
                    capture_enabled: consumer.message_capture.enabled,
                    capture_keep_last: consumer.message_capture.keep_last,
                    ..snapshot
                };
                consumers.insert(consumer_key, status_snapshot);
            }
        }

        RuntimeStatusResponse {
            active_consumers,
            active_routes,
            route_throughput,
            consumers,
        }
    }

    async fn consumer_status_snapshot(
        &self,
        consumer: &ConsumerConfig,
    ) -> Option<ConsumerStatusSnapshot> {
        let running = self
            .ui_handles
            .read()
            .await
            .contains_key(&consumer_runtime_key(consumer));
        self.consumer_status_snapshot_with_running(consumer, running)
            .await
    }

    async fn consumer_status_snapshot_with_running(
        &self,
        consumer: &ConsumerConfig,
        running: bool,
    ) -> Option<ConsumerStatusSnapshot> {
        let name = consumer.name.clone();
        let status = if running {
            mq_bridge::traits::EndpointStatus {
                healthy: true,
                target: name.clone(),
                ..Default::default()
            }
        } else if matches!(consumer.endpoint.endpoint_type, EndpointType::Http(_)) {
            mq_bridge::traits::EndpointStatus {
                healthy: false,
                target: name.clone(),
                ..Default::default()
            }
        } else if name.trim().is_empty() {
            mq_bridge::traits::EndpointStatus {
                healthy: false,
                target: "Unnamed Consumer".to_string(),
                ..Default::default()
            }
        } else {
            let status_future = consumer.endpoint.create_consumer(&name);
            match tokio::time::timeout(Duration::from_secs(2), status_future).await {
                Ok(Ok(endpoint)) => endpoint.status().await,
                Ok(Err(e)) => mq_bridge::traits::EndpointStatus {
                    healthy: false,
                    target: name.clone(),
                    error: Some(format!("Creation failed: {e}")),
                    ..Default::default()
                },
                Err(_) => mq_bridge::traits::EndpointStatus {
                    healthy: false,
                    target: name.clone(),
                    error: Some("Status check timed out".to_string()),
                    ..Default::default()
                },
            }
        };

        Some(ConsumerStatusSnapshot {
            running,
            status: status.into(),
            throughput: 0.0,
            message_sequence: 0,
            capture_enabled: consumer.message_capture.enabled,
            capture_keep_last: consumer.message_capture.keep_last,
        })
    }

    pub async fn update_config(
        &self,
        mut new_config: AppConfig,
    ) -> std::result::Result<(), UpdateConfigError> {
        tracing::info!("Received new configuration via Web UI. Reloading...");
        new_config.migrate_legacy_routes();
        let consumers: Vec<crate::config::ConsumerConfig> = new_config
            .consumers
            .iter()
            .cloned()
            .map(|mut c| {
                c.name = c.name.trim().to_string();
                c.output = normalize_consumer_output(c.output, c.response.clone());
                c.response = consumer_output_response_compat(&c.output);
                c.message_capture = normalize_consumer_capture(c.message_capture);
                c
            })
            .collect();

        for consumer in &consumers {
            let resolved_output = resolve_consumer_output(consumer, &new_config.publishers)?;
            let output_endpoint = match &resolved_output {
                ResolvedConsumerOutput::None => Endpoint::null(),
                ResolvedConsumerOutput::Response { .. } => Endpoint::new_response(),
                ResolvedConsumerOutput::Publisher { endpoint, .. } => (*endpoint).as_ref().clone(),
            };
            let temp_route = Route::new(consumer.endpoint.clone(), output_endpoint);
            let consumer_key = consumer_runtime_key(consumer);
            temp_route.check(&consumer_key, None).map_err(|e| {
                UpdateConfigError::Validation(format!(
                    "Consumer {}: validation failed: {}",
                    if consumer.name.is_empty() {
                        consumer_key.as_str()
                    } else {
                        consumer.name.as_str()
                    },
                    e
                ))
            })?;
        }

        if let Some(prepare) = &self.storage_save_prepare {
            prepare(&new_config).map_err(|error| {
                UpdateConfigError::Other(anyhow!("Failed to prepare encrypted storage: {error}"))
            })?;
        }

        let old_config = self.config.read().await.clone();

        {
            let mut handles = self.ui_handles.write().await;
            let mut collectors_to_remove = Vec::new();

            for consumer_key in handles.keys() {
                let should_stop = if let (Some(old_consumer), Some(new_consumer)) = (
                    old_config
                        .consumers
                        .iter()
                        .find(|consumer| consumer_runtime_key(consumer) == *consumer_key),
                    consumers
                        .iter()
                        .find(|consumer| consumer_runtime_key(consumer) == *consumer_key),
                ) {
                    serde_json::to_value(old_consumer).unwrap()
                        != serde_json::to_value(new_consumer).unwrap()
                } else {
                    true
                };

                if should_stop {
                    collectors_to_remove.push(consumer_key.clone());
                }
            }

            for consumer_key in collectors_to_remove {
                if let Some(handle) = handles.remove(&consumer_key) {
                    handle.stop().await;
                }
            }
        }

        for consumer in &consumers {
            let resolved_output = resolve_consumer_output(consumer, &new_config.publishers)?;
            let output_endpoint = match &resolved_output {
                ResolvedConsumerOutput::None => Endpoint::null(),
                ResolvedConsumerOutput::Response { .. } => Endpoint::new_response(),
                ResolvedConsumerOutput::Publisher { endpoint, .. } => (*endpoint).as_ref().clone(),
            };
            let route = Route::new(consumer.endpoint.clone(), output_endpoint);
            if route.is_ref() {
                route.register_output_endpoint(None).map_err(|e| {
                    UpdateConfigError::RegisterOutputEndpoint(format!(
                        "register_output_endpoint failed: {e}"
                    ))
                })?;
            }
        }
        new_config.consumers = consumers.clone();

        let config_file = &*self.config_file_path;
        new_config
            .save_with_secret_store(config_file, self.secret_store.as_ref())
            .map_err(|e| {
                tracing::error!("Failed to save config to '{}': {}", config_file, e);
                UpdateConfigError::Other(anyhow!("Failed to save configuration: {e}"))
            })?;
        tracing::info!("Configuration saved to {}", config_file);

        if let Some(resolver) = &self.storage_security_resolver {
            let mut storage_security = self
                .storage_security
                .write()
                .unwrap_or_else(|error| error.into_inner());
            *storage_security = resolver(&new_config);
        }

        {
            let mut config_guard = self.config.write().await;
            *config_guard = new_config;
        }

        Ok(())
    }

    fn handle_static_asset(&self, request_path: &str) -> Result<Handled, HandlerError> {
        // Dev server only: serve node_modules from disk.
        if request_path.starts_with("/node_modules/") {
            let Some(file_path) = resolve_node_modules_path(request_path) else {
                return Ok(Handled::Publish(msg!("Not Found").with_status_code("404")));
            };
            return match std::fs::read(&file_path) {
                Ok(contents) => Ok(Handled::Publish(msg!(contents).with_content_type(
                    mq_bridge::endpoints::http::guess_content_type(&file_path.to_string_lossy()),
                ))),
                Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                    Ok(Handled::Publish(msg!("Not Found").with_status_code("404")))
                }
                Err(err) => Err(HandlerError::NonRetryable(err.into())),
            };
        }

        // Everything else is served from the embedded UI bundle.
        let Some(key) = embedded_asset_key(request_path) else {
            return Ok(Handled::Publish(msg!("Not Found").with_status_code("404")));
        };

        match StaticAssets::get(&key) {
            Some(asset) => Ok(Handled::Publish(
                msg!(asset.data.into_owned())
                    .with_content_type(mq_bridge::endpoints::http::guess_content_type(&key)),
            )),
            None => Ok(Handled::Publish(msg!("Not Found").with_status_code("404"))),
        }
    }

    async fn handle_publish_message(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
        let request: PublishRequest = match serde_json::from_slice(&msg.payload) {
            Ok(req) => req,
            Err(e) => {
                return Ok(Handled::Publish(
                    msg!(format!("Json deserialize error: {e}")).with_status_code("400"),
                ));
            }
        };

        let name = request
            .publisher_id
            .clone()
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| request.name.clone());
        match self.publish(request).await {
            Ok(Some(response)) => self.ok_json(&response, false),
            Ok(None) => self.err_response(404, format!("Publisher not found: {name}")),
            Err(e) => self.err_response(500, e.to_string()),
        }
    }

    async fn handle_update_config_message(
        &self,
        msg: CanonicalMessage,
    ) -> Result<Handled, HandlerError> {
        let body = msg.payload;
        let new_config: AppConfig = match serde_json::from_slice(&body) {
            Ok(cfg) => cfg,
            Err(e) => {
                let mut msg_str = format!("Json deserialize error: {}", e);
                if e.line() == 1 {
                    let col = e.column();
                    let idx = col.saturating_sub(1);
                    let len = body.len();
                    let start = idx.saturating_sub(30);
                    let end = (idx + 30).min(len);
                    let snippet = String::from_utf8_lossy(&body[start..end]);
                    msg_str.push_str(&format!("\nAt: ...{}...", snippet));
                }
                tracing::error!("{}", msg_str);
                return Ok(Handled::Publish(
                    CanonicalMessage::from(msg_str).with_status_code("400"),
                ));
            }
        };

        match self.update_config(new_config).await {
            Ok(()) => Ok(Handled::Publish(msg!("Configuration updated"))),
            Err(e) => {
                let status_code = match e {
                    UpdateConfigError::Other(_) => "500",
                    _ => "400",
                };
                Ok(Handled::Publish(
                    msg!(e.to_string()).with_status_code(status_code),
                ))
            }
        }
    }

    async fn start_ui_collector_routes(
        &self,
        consumers: &[(ConsumerConfig, Vec<PublisherClient>)],
    ) -> Result<()> {
        let mut handles = self.ui_handles.write().await;
        for (consumer, publishers) in consumers {
            if matches!(consumer.endpoint.endpoint_type, EndpointType::Null) {
                continue;
            }
            let consumer_key = consumer_runtime_key(consumer);
            let topic = format!("ui_collector_{consumer_key}");
            let capture_enabled = consumer.message_capture.enabled;
            let original_capture_keep_last = consumer.message_capture.keep_last.max(1);
            // Increase channel capacity by 10% to allow for some buffer before dropping messages
            let channel_capacity = (original_capture_keep_last).max(1);

            let log_channel = mq_bridge::get_or_create_channel(&MemoryConfig::new(
                &topic,
                Some(channel_capacity),
            ));
            let sequence_counter = {
                let mut sequences = self.consumer_message_sequences.write().await;
                sequences
                    .entry(consumer_key.clone())
                    .or_insert_with(|| Arc::new(AtomicU64::new(0)))
                    .clone()
            };

            let resolved_output =
                resolve_consumer_output(consumer, publishers).map_err(anyhow::Error::msg)?;
            let output_for_route = match &resolved_output {
                ResolvedConsumerOutput::None => Endpoint::null(),
                ResolvedConsumerOutput::Publisher { endpoint, .. } => (*endpoint).as_ref().clone(),
                // A `Static` output endpoint emits the configured payload as the
                // route response, attaching `metadata` as response headers. This
                // replaces the previous hand-built response message.
                ResolvedConsumerOutput::Response { response } => match response {
                    Some(r) => Endpoint::new(EndpointType::Static(StaticConfig {
                        body: r.payload.clone(),
                        raw: true,
                        metadata: r.headers.clone(),
                    })),
                    None => Endpoint::null(),
                },
            };

            let context = Arc::new(CollectorContext {
                source_key: consumer_key.clone(),
                log_channel,
                counter: sequence_counter,
                output: resolved_output,
                capture_enabled,
            });

            let route = Route::new(consumer.endpoint.clone(), output_for_route)
                .with_options(consumer.options.clone())
                .with_handler(move |msg: CanonicalMessage| {
                    let ctx = Arc::clone(&context);
                    async move {
                        ctx.counter.fetch_add(1, Ordering::Relaxed);

                        if ctx.capture_enabled {
                            let mut enriched = msg.clone();
                            let meta = &mut enriched.metadata;
                            meta.insert("ui_source".into(), ctx.source_key.clone());
                            meta.insert(
                                "ui_capture_time".into(),
                                chrono::Utc::now().timestamp_millis().to_string(),
                            );

                            if let ResolvedConsumerOutput::Response { response: Some(r) } =
                                &ctx.output
                            {
                                meta.insert("ui_response_payload".into(), r.payload.clone());
                                if let Ok(headers) = serde_json::to_string(&r.headers) {
                                    meta.insert("ui_response_metadata".into(), headers);
                                }
                            }

                            // Use non-blocking send to avoid stalling the bridge when the UI capture buffer is full.
                            // If it is full, we drop the oldest entry to maintain "last" semantics.
                            let msgs_to_send = vec![enriched];
                            if let Err(e) = ctx.log_channel.sender.try_send(msgs_to_send) {
                                let msgs = e.into_inner();
                                let _ = ctx.log_channel.receiver.try_recv();
                                let _ = ctx.log_channel.sender.try_send(msgs);
                            }
                        }

                        match &ctx.output {
                            ResolvedConsumerOutput::None => Ok(Handled::Ack),
                            ResolvedConsumerOutput::Publisher { endpoint, .. } => {
                                if matches!(endpoint.endpoint_type, EndpointType::Null) {
                                    Ok(Handled::Ack)
                                } else {
                                    Ok(Handled::Publish(msg))
                                }
                            }
                            ResolvedConsumerOutput::Response { response } => {
                                // The `Static` output endpoint produces the response
                                // (payload + headers); we just trigger it.
                                if response.is_some() {
                                    Ok(Handled::Publish(msg))
                                } else {
                                    Ok(Handled::Ack)
                                }
                            }
                        }
                    }
                });
            let internal_route_name = collector_route_name(&consumer_key);
            let handle = route.run(&internal_route_name).await?;
            handles.insert(consumer_key, handle);
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum UpdateConfigError {
    Validation(String),
    UnsupportedCustomResponses(String),
    RegisterOutputEndpoint(String),
    Other(anyhow::Error),
}

impl std::fmt::Display for UpdateConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message)
            | Self::UnsupportedCustomResponses(message)
            | Self::RegisterOutputEndpoint(message) => write!(f, "{message}"),
            Self::Other(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for UpdateConfigError {}
#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct StorageSecurityInfoResponse {
    pub target: String,
    pub encrypted: bool,
    pub persistent: bool,
    pub key_source: String,
    pub key_store_available: bool,
    pub encrypted_config_available: bool,
    pub persistent_messages_available: bool,
    pub config_encrypted: bool,
    pub messages_encrypted: bool,
    pub messages_persistent: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_key_hex: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kid: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, JsonSchema)]
pub struct FeatureAvailabilityResponse {
    pub ibm_mq: bool,
    pub kafka: bool,
    pub nats: bool,
    pub amqp: bool,
    pub mqtt: bool,
    pub http: bool,
    pub grpc: bool,
    pub zeromq: bool,
    pub mongodb: bool,
    pub aws: bool,
    pub sled: bool,
}

impl FeatureAvailabilityResponse {
    pub fn detect() -> Self {
        Self {
            ibm_mq: cfg!(feature = "ibm-mq"),
            kafka: cfg!(feature = "kafka") || cfg!(feature = "full"),
            nats: cfg!(feature = "nats") || cfg!(feature = "full"),
            amqp: cfg!(feature = "amqp") || cfg!(feature = "full"),
            mqtt: cfg!(feature = "mqtt") || cfg!(feature = "full"),
            http: cfg!(feature = "http") || cfg!(feature = "full"),
            grpc: cfg!(feature = "grpc") || cfg!(feature = "full"),
            zeromq: cfg!(feature = "zeromq") || cfg!(feature = "full"),
            mongodb: cfg!(feature = "mongodb") || cfg!(feature = "full"),
            aws: cfg!(feature = "aws") || cfg!(feature = "full"),
            sled: cfg!(feature = "sled") || cfg!(feature = "full"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::ConfigSecurity;
    use crate::encrypted_config::{
        clear_process_config_master_key, set_process_config_master_key_hex,
        test_config_master_key_lock,
    };
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[derive(Default)]
    struct NoopSecretStore;

    impl SecretStore for NoopSecretStore {
        fn store(&self, _secrets: &HashMap<String, String>) -> anyhow::Result<()> {
            Ok(())
        }
    }

    fn sample_storage_security(config: &AppConfig) -> StorageSecurityInfoResponse {
        match config.security_mode() {
            ConfigSecurityMode::Sensitive => StorageSecurityInfoResponse {
                target: "cli".to_string(),
                encrypted: true,
                persistent: false,
                key_source: "ephemeral-process".to_string(),
                key_store_available: false,
                encrypted_config_available: true,
                persistent_messages_available: false,
                config_encrypted: true,
                messages_encrypted: true,
                messages_persistent: false,
                reason: None,
                message_key_hex: Some("abc".to_string()),
                kid: Some("kid".to_string()),
            },
            _ => StorageSecurityInfoResponse {
                target: "cli".to_string(),
                encrypted: false,
                persistent: true,
                key_source: "none".to_string(),
                key_store_available: false,
                encrypted_config_available: false,
                persistent_messages_available: false,
                config_encrypted: false,
                messages_encrypted: false,
                messages_persistent: true,
                reason: None,
                message_key_hex: None,
                kid: None,
            },
        }
    }

    #[test]
    fn next_route_metric_sample_starts_with_zero_throughput() {
        let now = Instant::now();

        let sample = next_route_metric_sample(None, 42.0, now);

        assert_eq!(sample.total_messages, 42.0);
        assert_eq!(sample.observed_at, now);
        assert_eq!(sample.smoothed_throughput, 0.0);
    }

    #[test]
    fn next_route_metric_sample_applies_ema_to_instantaneous_throughput() {
        let start = Instant::now();
        let previous = RouteMetricSample {
            total_messages: 10.0,
            observed_at: start,
            smoothed_throughput: 4.0,
        };

        let next = next_route_metric_sample(Some(previous), 18.0, start + Duration::from_secs(2));

        // Instantaneous throughput is (18 - 10) / 2 = 4.0, so the EMA stays at 4.0.
        assert_eq!(next.smoothed_throughput, 4.0);
    }

    #[test]
    fn next_route_metric_sample_clamps_negative_throughput_before_smoothing() {
        let start = Instant::now();
        let previous = RouteMetricSample {
            total_messages: 10.0,
            observed_at: start,
            smoothed_throughput: 6.0,
        };

        let next = next_route_metric_sample(Some(previous), 8.0, start + Duration::from_secs(1));

        let expected = 6.0 * (-1.0 / THROUGHPUT_TAU).exp();
        assert!((next.smoothed_throughput - expected).abs() < 1e-9);
    }

    #[tokio::test]
    async fn update_config_runs_storage_hooks_and_refreshes_security() {
        let _guard = test_config_master_key_lock()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let mut initial_config = AppConfig::default();
        initial_config.config_security = Some(ConfigSecurity {
            mode: ConfigSecurityMode::Balanced,
        });

        let temp_path =
            std::env::temp_dir().join(format!("mqb-ui-app-test-{}.yaml", Uuid::new_v4()));
        let prepare_calls = Arc::new(AtomicUsize::new(0));
        let resolver_calls = Arc::new(AtomicUsize::new(0));

        let prepare_counter = Arc::clone(&prepare_calls);
        let resolver_counter = Arc::clone(&resolver_calls);
        let app = UiApp::new_with_secret_store_and_storage_hooks(
            initial_config.clone(),
            metrics_exporter_prometheus::PrometheusBuilder::new()
                .build_recorder()
                .handle(),
            temp_path.to_string_lossy().to_string(),
            Arc::new(NoopSecretStore),
            sample_storage_security(&initial_config),
            Arc::new(move |config| {
                resolver_counter.fetch_add(1, Ordering::SeqCst);
                sample_storage_security(config)
            }),
            Arc::new(move |config| {
                prepare_counter.fetch_add(1, Ordering::SeqCst);
                if matches!(
                    config.security_mode(),
                    ConfigSecurityMode::Sensitive | ConfigSecurityMode::Durable
                ) {
                    set_process_config_master_key_hex(
                        "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"
                            .to_string(),
                    );
                }
                Ok(())
            }),
        );

        let mut next_config = initial_config.clone();
        next_config.config_security = Some(ConfigSecurity {
            mode: ConfigSecurityMode::Sensitive,
        });

        app.update_config(next_config).await.unwrap();

        assert_eq!(prepare_calls.load(Ordering::SeqCst), 1);
        assert_eq!(resolver_calls.load(Ordering::SeqCst), 1);
        assert!(app.storage_security().config_encrypted);

        let _ = std::fs::remove_file(temp_path);
        clear_process_config_master_key();
    }

    #[tokio::test]
    async fn reset_config_recovery_clears_pending_status() {
        let mut initial_config = AppConfig::default();
        initial_config.config_security = Some(ConfigSecurity {
            mode: ConfigSecurityMode::Balanced,
        });

        let app = UiApp::new_with_secret_store_and_runtime_hooks(
            initial_config.clone(),
            metrics_exporter_prometheus::PrometheusBuilder::new()
                .build_recorder()
                .handle(),
            "/tmp/mqb-config.yml".to_string(),
            Arc::new(NoopSecretStore),
            sample_storage_security(&initial_config),
            UiAppRuntimeHooks::default()
                .with_storage_security_resolver(Arc::new(sample_storage_security))
                .with_storage_save_prepare(Arc::new(|_| Ok(())))
                .with_config_recovery(Some(ConfigRecoveryStatusResponse {
                    mode: Some("sensitive".to_string()),
                    reason: "decrypt-failed".to_string(),
                    message: "The encrypted config could not be decrypted.".to_string(),
                    detail: Some("Failed to decrypt sensitive config".to_string()),
                }))
                .with_config_recovery_reset(Some(Arc::new(|_| {
                    Ok(ConfigRecoveryResetResponse {
                        backup_path: "/tmp/mqb-config.yml.recovery.bak".to_string(),
                    })
                }))),
        );

        let handled = app.handle_reset_config_recovery().await.unwrap();
        let Handled::Publish(message) = handled else {
            panic!("expected publish response");
        };
        let payload = message.get_payload_str();

        assert!(payload.contains("backup_path"));
        assert!(app.config_recovery().is_none());
    }

    #[test]
    fn storage_security_for_cli_uses_explicit_temporary_messages_mode() {
        let mut config = AppConfig::default();
        config.config_security = Some(ConfigSecurity {
            mode: ConfigSecurityMode::EnvTemporaryMessages,
        });

        let info = storage_security_for_cli(&config);

        assert_eq!(info.target, "cli");
        assert!(info.encrypted);
        assert!(!info.persistent);
        assert_eq!(info.key_source, "ephemeral-process");
        assert!(!info.config_encrypted);
        assert!(info.messages_encrypted);
        assert!(!info.messages_persistent);
        assert!(info.message_key_hex.is_some());
        assert!(info.kid.is_some());
    }

    #[test]
    fn storage_security_for_cli_reuses_ephemeral_message_key_within_process() {
        let mut config = AppConfig::default();
        config.config_security = Some(ConfigSecurity {
            mode: ConfigSecurityMode::TemporaryMessages,
        });

        let first = storage_security_for_cli(&config);
        let second = storage_security_for_cli(&config);

        assert_eq!(first.message_key_hex, second.message_key_hex);
        assert_eq!(first.kid, second.kid);
    }

    #[test]
    fn storage_security_for_cli_uses_config_master_key_for_sensitive_modes() {
        let _guard = test_config_master_key_lock()
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        clear_process_config_master_key();

        let mut config = AppConfig::default();
        config.config_security = Some(ConfigSecurity {
            mode: ConfigSecurityMode::Sensitive,
        });
        assert!(!storage_security_for_cli(&config).config_encrypted);

        set_process_config_master_key_hex(
            "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff".to_string(),
        );
        assert!(storage_security_for_cli(&config).config_encrypted);

        clear_process_config_master_key();
    }
}
