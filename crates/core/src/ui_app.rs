use crate::config::{
    AppConfig, ConsumerConfig, ConsumerMessageCaptureConfig, ConsumerOutputConfig,
    ConsumerResponseConfig, EnvFileSecretStore, PublisherClient, RouteConfig, SecretStore,
};
use anyhow::{Result, anyhow};
use chrono;
use metrics_exporter_prometheus::PrometheusHandle;
use mq_bridge::models::{Endpoint, EndpointType, MemoryConfig, Route};
use mq_bridge::route::RouteHandle;
use mq_bridge::{
    CanonicalMessage, Handled, HandlerError, Publisher, Sent, msg, unregister_publisher,
};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct UiApp {
    config: Arc<RwLock<AppConfig>>,
    metrics_handle: PrometheusHandle,
    config_file_path: Arc<String>,
    secret_store: Arc<dyn SecretStore>,
    ui_handles: Arc<RwLock<HashMap<String, RouteHandle>>>,
    throughput_samples: Arc<RwLock<HashMap<String, RouteMetricSample>>>,
    consumer_message_sequences: Arc<RwLock<HashMap<String, u64>>>,
}

#[derive(Clone, Copy)]
struct RouteMetricSample {
    total_messages: f64,
    observed_at: Instant,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RuntimeStatusResponse {
    pub active_consumers: Vec<String>,
    pub active_routes: Vec<String>,
    pub route_throughput: HashMap<String, f64>,
    pub consumers: HashMap<String, ConsumerStatusSnapshot>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConsumerStatusSnapshot {
    pub running: bool,
    pub status: mq_bridge::traits::EndpointStatus,
    pub message_sequence: u64,
    pub capture_enabled: bool,
    pub capture_keep_last: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConsumerStatusResponse {
    pub running: bool,
    pub status: mq_bridge::traits::EndpointStatus,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PublishRequest {
    pub name: String,
    pub payload: String,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    #[serde(default)]
    pub endpoint: Option<mq_bridge::models::Endpoint>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PublishResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
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

fn resolve_static_asset_path(request_path: &str) -> Option<PathBuf> {
    let workspace_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");

    if request_path == "/" || request_path.is_empty() {
        return Some(workspace_root.join("static/index.html"));
    }

    if let Some(relative) = request_path.strip_prefix("/node_modules/") {
        return sanitize_relative_path(relative)
            .map(|path| workspace_root.join("node_modules").join(path));
    }

    let relative = request_path.trim_start_matches('/');
    sanitize_relative_path(relative).map(|path| workspace_root.join("static").join(path))
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

fn extract_label_value(segment: &str, label: &str) -> Option<String> {
    let pattern = format!(r#"{label}=""#);
    let start = segment.find(&pattern)? + pattern.len();
    let remainder = &segment[start..];
    let end = remainder.find('"')?;
    Some(remainder[..end].to_string())
}

fn parse_route_metric_totals(metrics_text: &str) -> HashMap<(String, String), f64> {
    let mut totals = HashMap::new();

    for line in metrics_text.lines() {
        if !line.starts_with("queue_messages_processed_total{") {
            continue;
        }

        let Some(labels_end) = line.find('}') else {
            continue;
        };
        let labels = &line["queue_messages_processed_total{".len()..labels_end];
        let value_str = line[labels_end + 1..].trim();
        let Ok(value) = value_str.parse::<f64>() else {
            continue;
        };

        let Some(route) = extract_label_value(labels, "route") else {
            continue;
        };
        let Some(endpoint) = extract_label_value(labels, "endpoint") else {
            continue;
        };

        totals.insert((route, endpoint), value);
    }

    totals
}

fn route_has_metrics(route: &Route) -> bool {
    let has_metrics = |endpoint: &Endpoint| {
        endpoint
            .middlewares
            .iter()
            .any(|middleware| matches!(middleware, mq_bridge::models::Middleware::Metrics(_)))
    };

    has_metrics(&route.input) || has_metrics(&route.output)
}

fn route_is_active(route_config: &RouteConfig) -> bool {
    route_config.enabled && !matches!(route_config.route.input.endpoint_type, EndpointType::Null)
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
        ConsumerOutputConfig::Publisher { publisher } => {
            let publisher = publisher.trim().to_string();
            ConsumerOutputConfig::Publisher { publisher }
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
        publisher_name: String,
        endpoint: Endpoint,
    },
    Response {
        response: Option<ConsumerResponseConfig>,
    },
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
                response: normalize_consumer_response(response.clone()),
            })
        }
        ConsumerOutputConfig::Publisher { publisher } => {
            let publisher_name = publisher.trim();
            if publisher_name.is_empty() {
                return Err(UpdateConfigError::Validation(format!(
                    "Consumer {}: publisher output requires a selected publisher",
                    consumer.name
                )));
            }
            let Some(publisher_config) = publishers
                .iter()
                .find(|candidate| candidate.name == publisher_name)
            else {
                return Err(UpdateConfigError::Validation(format!(
                    "Consumer {}: referenced publisher not found: {}",
                    consumer.name, publisher_name
                )));
            };

            Ok(ResolvedConsumerOutput::Publisher {
                publisher_name: publisher_name.to_string(),
                endpoint: publisher_config.endpoint.clone(),
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
        Self::new_with_secret_store(
            initial_config,
            metrics_handle,
            config_file_path,
            Arc::new(EnvFileSecretStore::new(".env")),
        )
    }

    pub fn new_with_secret_store(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
        secret_store: Arc<dyn SecretStore>,
    ) -> Self {
        Self {
            config: Arc::new(RwLock::new(initial_config)),
            metrics_handle,
            config_file_path: Arc::new(config_file_path),
            secret_store,
            ui_handles: Arc::new(RwLock::new(HashMap::new())),
            throughput_samples: Arc::new(RwLock::new(HashMap::new())),
            consumer_message_sequences: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_config(&self) -> AppConfig {
        self.config.read().await.clone()
    }

    pub fn config_file_path(&self) -> &str {
        self.config_file_path.as_str()
    }

    pub async fn handle_ui_message(
        &self,
        msg: CanonicalMessage,
        serve_static_assets: bool,
    ) -> Result<Handled, HandlerError> {
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
                "/config" | "/publish" | "/consumer-start" | "/consumer-stop"
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
            ("GET", "/consumer-status") => {
                let name = query_param(&msg, "consumer").unwrap_or_default();
                match self.consumer_status(&name).await {
                    Some(status) => self.ok_json(&status, false),
                    None => self.err_response(404, format!("Consumer not found: {name}")),
                }
            }
            ("POST", "/consumer-start") => {
                let name = query_param(&msg, "consumer").unwrap_or_default();
                match self.start_consumer(&name).await {
                    Ok(true) => Ok(Handled::Publish(msg!("Started"))),
                    Ok(false) => self.err_response(404, format!("Consumer not found: {name}")),
                    Err(e) => self.err_response(500, e.to_string()),
                }
            }
            ("POST", "/consumer-stop") => {
                let name = query_param(&msg, "consumer").unwrap_or_default();
                self.stop_consumer(&name).await;
                Ok(Handled::Publish(msg!("Stopped")))
            }
            ("GET", "/messages") => {
                let consumer = query_param(&msg, "consumer");
                self.ok_json(&self.get_messages(consumer.as_deref()).await, true)
            }
            ("POST", "/config") => self.handle_update_config_message(msg).await,
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
        Ok(Handled::Publish(
            msg!(message.into())
                .with_status_code(status.to_string())
                .with_content_type("text/plain; charset=utf-8"),
        ))
    }

    pub fn render_metrics(&self) -> String {
        self.metrics_handle.render()
    }

    pub async fn consumer_status(&self, name: &str) -> Option<ConsumerStatusResponse> {
        let config = self.config.read().await;
        let consumer_config = config.consumers.iter().find(|c| c.name == name);

        consumer_config
            .map(|c| async move { self.consumer_status_snapshot(c).await })?
            .await
            .map(|snapshot| ConsumerStatusResponse {
                running: snapshot.running,
                status: snapshot.status,
            })
    }

    pub async fn start_consumer(&self, name: &str) -> Result<bool> {
        let consumer_config = {
            let config = self.config.read().await;
            config
                .consumers
                .iter()
                .find(|c| c.name == name)
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

    pub async fn stop_consumer(&self, name: &str) -> bool {
        let mut handles = self.ui_handles.write().await;
        if let Some(handle) = handles.remove(name) {
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

        if let Some(consumer_name) = target_consumer {
            let topic = format!("ui_collector_{consumer_name}");
            let channel = mq_bridge::get_or_create_channel(&MemoryConfig::new(&topic, None));
            while let Ok(batch) = channel.receiver.try_recv() {
                for m in batch {
                    let source = m
                        .metadata
                        .get("ui_source")
                        .cloned()
                        .unwrap_or_else(|| "unknown".into());
                    let body: serde_json::Value =
                        serde_json::from_slice(&m.payload).unwrap_or_default();
                    grouped_messages.entry(source).or_default().push_back(body);
                }
            }
        }

        grouped_messages
    }

    pub async fn publish(&self, request: PublishRequest) -> Result<Option<PublishResponse>> {
        let endpoint = if let Some(ep) = request.endpoint {
            Some(ep)
        } else {
            let config = self.config.read().await;
            config
                .publishers
                .iter()
                .find(|p| p.name == request.name)
                .map(|p| p.endpoint.clone())
        };

        let publisher = if let Some(endpoint) = endpoint {
            unregister_publisher(&request.name);
            match tokio::time::timeout(Duration::from_secs(5), Publisher::new(endpoint)).await {
                Ok(Ok(p)) => Some(p),
                Ok(Err(e)) => return Err(anyhow!("Failed to initialize publisher: {e}")),
                Err(_) => return Err(anyhow!("Publisher initialization timed out after 5s")),
            }
        } else {
            None
        };

        if let Some(publisher) = publisher {
            let mut canonical = CanonicalMessage::from(request.payload);
            for (k, v) in request.metadata {
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

    pub async fn runtime_status(&self) -> RuntimeStatusResponse {
        let mut active_consumers: Vec<String> =
            self.ui_handles.read().await.keys().cloned().collect();

        // Consumers may run as internal collector routes even when ui_handles does not currently
        // track them (for example after restarts). Surface those as active consumers too.
        let consumer_route_names: Vec<String> = mq_bridge::list_routes()
            .into_iter()
            .filter_map(|name| {
                name.strip_prefix("ui_collector_route_")
                    .map(|consumer_name| consumer_name.to_string())
            })
            .collect();
        active_consumers.extend(consumer_route_names);

        let active_routes: Vec<String> = mq_bridge::list_routes()
            .into_iter()
            .filter(|name| name != "web_ui" && !name.starts_with("ui_collector_route_"))
            .collect();

        let config = self.config.read().await;
        let metrics_enabled_routes: HashSet<String> = config
            .routes
            .iter()
            .filter(|(_, route)| route.enabled && route_has_metrics(&route.route))
            .map(|(name, _)| name.clone())
            .collect();
        drop(config);

        let route_totals = parse_route_metric_totals(&self.metrics_handle.render());
        let now = Instant::now();
        let mut samples = self.throughput_samples.write().await;
        let mut route_throughput = HashMap::new();

        for route_name in &metrics_enabled_routes {
            let input_total = route_totals
                .get(&(route_name.clone(), "input".to_string()))
                .copied();
            let output_total = route_totals
                .get(&(route_name.clone(), "output".to_string()))
                .copied();
            let Some(total_messages) = input_total.or(output_total) else {
                route_throughput.insert(route_name.clone(), 0.0);
                continue;
            };

            let throughput = if let Some(previous) = samples.get(route_name) {
                let elapsed = now.duration_since(previous.observed_at).as_secs_f64();
                if elapsed > 0.0 && total_messages >= previous.total_messages {
                    (total_messages - previous.total_messages) / elapsed
                } else {
                    0.0
                }
            } else {
                0.0
            };

            samples.insert(
                route_name.clone(),
                RouteMetricSample {
                    total_messages,
                    observed_at: now,
                },
            );
            route_throughput.insert(route_name.clone(), throughput);
        }

        samples.retain(|route_name, _| metrics_enabled_routes.contains(route_name));

        active_consumers.sort();
        active_consumers.dedup();
        let mut active_routes = active_routes;
        active_routes.sort();

        let consumer_sequences = self.consumer_message_sequences.read().await.clone();
        let config = self.config.read().await;
        let mut consumers = HashMap::new();
        for consumer in &config.consumers {
            if let Some(snapshot) = self.consumer_status_snapshot(consumer).await {
                let message_sequence = consumer_sequences.get(&consumer.name).copied().unwrap_or(0);
                consumers.insert(
                    consumer.name.clone(),
                    ConsumerStatusSnapshot {
                        message_sequence,
                        capture_enabled: consumer.message_capture.enabled,
                        capture_keep_last: consumer.message_capture.keep_last,
                        ..snapshot
                    },
                );
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
        let name = consumer.name.clone();
        let running = self.ui_handles.read().await.contains_key(&name);
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
            status,
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

        let routes: HashMap<String, RouteConfig> = new_config
            .routes
            .drain()
            .map(|(k, v)| (k.trim().replace(' ', "_").to_lowercase(), v))
            .collect();
        let consumers: Vec<crate::config::ConsumerConfig> = new_config
            .consumers
            .drain(..)
            .map(|mut c| {
                c.name = c.name.trim().to_string();
                c.output = normalize_consumer_output(c.output, c.response.clone());
                c.response = consumer_output_response_compat(&c.output);
                c.message_capture = normalize_consumer_capture(c.message_capture);
                c
            })
            .collect();

        for (name, route) in &routes {
            if !route.enabled {
                continue;
            }
            route.route.check(name, None).map_err(|e| {
                UpdateConfigError::Validation(format!("Route {name}: validation failed: {e}"))
            })?;
        }
        for consumer in &consumers {
            let resolved_output = resolve_consumer_output(consumer, &new_config.publishers)?;
            let output_endpoint = match &resolved_output {
                ResolvedConsumerOutput::None => Endpoint::null(),
                ResolvedConsumerOutput::Response { .. } => Endpoint::new_response(),
                ResolvedConsumerOutput::Publisher { endpoint, .. } => endpoint.clone(),
            };
            let temp_route = Route::new(consumer.endpoint.clone(), output_endpoint);
            temp_route.check(&consumer.name, None).map_err(|e| {
                UpdateConfigError::Validation(format!(
                    "Consumer {}: validation failed: {}",
                    consumer.name, e
                ))
            })?;
        }

        let old_config = self.config.read().await.clone();

        let mut routes_to_stop = Vec::new();
        for name in old_config.routes.keys() {
            if !routes.contains_key(name)
                || serde_json::to_value(&old_config.routes[name]).unwrap()
                    != serde_json::to_value(&routes[name]).unwrap()
            {
                routes_to_stop.push(name.clone());
            }
        }

        for name in routes_to_stop {
            mq_bridge::stop_route(&name).await;
        }

        {
            let mut handles = self.ui_handles.write().await;
            let mut collectors_to_remove = Vec::new();

            for name in handles.keys() {
                let should_stop = if let (Some(old_consumer), Some(new_consumer)) = (
                    old_config
                        .consumers
                        .iter()
                        .find(|consumer| &consumer.name == name),
                    consumers.iter().find(|consumer| &consumer.name == name),
                ) {
                    serde_json::to_value(old_consumer).unwrap()
                        != serde_json::to_value(new_consumer).unwrap()
                } else {
                    true
                };

                if should_stop {
                    collectors_to_remove.push(name.clone());
                }
            }

            for name in collectors_to_remove {
                if let Some(handle) = handles.remove(&name) {
                    handle.stop().await;
                }
            }
        }

        for route in routes.values() {
            if route.enabled && route.route.is_ref() {
                route.route.register_output_endpoint(None).map_err(|e| {
                    UpdateConfigError::RegisterOutputEndpoint(format!(
                        "register_output_endpoint failed: {e}"
                    ))
                })?;
            }
        }
        for consumer in &consumers {
            let resolved_output = resolve_consumer_output(consumer, &new_config.publishers)?;
            let output_endpoint = match &resolved_output {
                ResolvedConsumerOutput::None => Endpoint::null(),
                ResolvedConsumerOutput::Response { .. } => Endpoint::new_response(),
                ResolvedConsumerOutput::Publisher { endpoint, .. } => endpoint.clone(),
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

        for (name, route) in &routes {
            if !route_is_active(route) {
                continue;
            }
            let should_deploy = if let Some(old_route) = old_config.routes.get(name) {
                serde_json::to_value(old_route).unwrap() != serde_json::to_value(route).unwrap()
            } else {
                true
            };

            if should_deploy {
                route.route.deploy(name).await.map_err(|e| {
                    UpdateConfigError::DeployRouteFailed(format!(
                        "Failed to deploy route {name}: {e}"
                    ))
                })?;
            }
        }

        new_config.routes = routes.clone();
        new_config.consumers = consumers.clone();

        let config_file = &*self.config_file_path;
        new_config
            .save_with_secret_store(config_file, self.secret_store.as_ref())
            .map_err(|e| {
                tracing::error!("Failed to save config to '{}': {}", config_file, e);
                UpdateConfigError::Other(anyhow!("Failed to save configuration: {e}"))
            })?;
        tracing::info!("Configuration saved to {}", config_file);

        {
            let mut config_guard = self.config.write().await;
            *config_guard = new_config;
        }

        Ok(())
    }

    fn handle_static_asset(&self, request_path: &str) -> Result<Handled, HandlerError> {
        let Some(file_path) = resolve_static_asset_path(request_path) else {
            return Ok(Handled::Publish(msg!("Not Found").with_status_code("404")));
        };

        match std::fs::read(&file_path) {
            Ok(contents) => Ok(Handled::Publish(msg!(contents).with_content_type(
                mq_bridge::endpoints::http::guess_content_type(&file_path.to_string_lossy()),
            ))),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                Ok(Handled::Publish(msg!("Not Found").with_status_code("404")))
            }
            Err(err) => Err(HandlerError::NonRetryable(err.into())),
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

        let name = request.name.clone();
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
            let name = consumer.name.clone();
            let topic = format!("ui_collector_{name}");
            let capture_enabled = consumer.message_capture.enabled;
            let capture_keep_last = consumer.message_capture.keep_last.max(1);
            let log_channel = mq_bridge::get_or_create_channel(&MemoryConfig::new(
                &topic,
                Some(capture_keep_last),
            ));
            let message_sequences = self.consumer_message_sequences.clone();
            let resolved_output =
                resolve_consumer_output(consumer, publishers).map_err(anyhow::Error::msg)?;
            let output = match &resolved_output {
                ResolvedConsumerOutput::None => Endpoint::null(),
                ResolvedConsumerOutput::Publisher { endpoint, .. } => endpoint.clone(),
                ResolvedConsumerOutput::Response { .. } => Endpoint::new_response(),
            };

            let closure_name = name.clone();
            let route =
                Route::new(consumer.endpoint.clone(), output).with_handler(
                    move |msg: CanonicalMessage| {
                        let name = closure_name.clone();
                        let log_channel = log_channel.clone();
                        let message_sequences = message_sequences.clone();
                        let resolved_output = resolved_output.clone();
                        async move {
                            let payload_json: serde_json::Value =
                                serde_json::from_slice(&msg.payload).unwrap_or_else(|_| {
                                    serde_json::Value::String(msg.get_payload_str().to_string())
                                });
                            let id = fast_uuid_v7::format_uuid(msg.message_id).to_string();

                            let val = serde_json::json!({
                                "id": id,
                                "time": chrono::Local::now().to_rfc3339(),
                                "metadata": msg.metadata.clone(),
                                "payload": payload_json
                            });
                            if capture_enabled {
                                let mut enriched = CanonicalMessage::from_type(&val)
                                    .unwrap_or_else(|_| CanonicalMessage::from(""));
                                enriched.metadata.insert("ui_source".into(), name.clone());
                                log_channel.sender.send(vec![enriched]).await.map_err(|e| {
                                    HandlerError::NonRetryable(anyhow!(e.to_string()))
                                })?;
                                {
                                    let mut sequences = message_sequences.write().await;
                                    let next = sequences.entry(name.clone()).or_insert(0);
                                    *next += 1;
                                }
                            }

                            match resolved_output.clone() {
                                ResolvedConsumerOutput::None => Ok(Handled::Ack),
                                ResolvedConsumerOutput::Publisher { publisher_name, .. } => {
                                    let mut forwarded = msg;
                                    forwarded
                                        .metadata
                                        .insert("mqb_consumer_output".into(), publisher_name);
                                    Ok(Handled::Publish(forwarded))
                                }
                                ResolvedConsumerOutput::Response { response } => {
                                    if let Some(response_config) = response {
                                        let mut response =
                                            CanonicalMessage::from(response_config.payload);
                                        response.metadata = response_config.headers;
                                        Ok(Handled::Publish(response))
                                    } else {
                                        Ok(Handled::Ack)
                                    }
                                }
                            }
                        }
                    },
                );
            let internal_route_name = format!("ui_collector_route_{name}");
            let handle = route.run(&internal_route_name).await?;
            handles.insert(name, handle);
        }
        Ok(())
    }
}
#[derive(Debug)]
pub enum UpdateConfigError {
    Validation(String),
    UnsupportedCustomResponses(String),
    RegisterOutputEndpoint(String),
    DeployRouteFailed(String),
    Other(anyhow::Error),
}

impl std::fmt::Display for UpdateConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Validation(message)
            | Self::UnsupportedCustomResponses(message)
            | Self::RegisterOutputEndpoint(message)
            | Self::DeployRouteFailed(message) => write!(f, "{message}"),
            Self::Other(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for UpdateConfigError {}
