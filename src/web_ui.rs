use crate::config::AppConfig;
use anyhow::Result;
use chrono;
use metrics_exporter_prometheus::PrometheusHandle;
use mq_bridge::models::{Endpoint, EndpointType, HttpConfig, MemoryConfig, Route};
use mq_bridge::route::RouteHandle;
use mq_bridge::{
    msg, unregister_publisher, CanonicalMessage, Handled, HandlerError, Publisher, Sent,
};
use schemars::schema_for;
use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

/// We are using mq-bridge here, instead of standard actix web server.
/// This is mostly for demonstration purpose, there is no real need
/// or benefit to use mq-bridge here.
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

fn guess_content_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
    {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "txt" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn resolve_static_asset_path(request_path: &str) -> Option<PathBuf> {
    if request_path == "/" || request_path.is_empty() {
        return Some(PathBuf::from("static/index.html"));
    }

    if let Some(relative) = request_path.strip_prefix("/node_modules/") {
        return sanitize_relative_path(relative)
            .map(|path| PathBuf::from("node_modules").join(path));
    }

    let relative = request_path.trim_start_matches('/');
    sanitize_relative_path(relative).map(|path| PathBuf::from("static").join(path))
}

#[derive(Clone)]
struct WebUiHandler {
    config: Arc<RwLock<AppConfig>>,
    metrics_handle: PrometheusHandle,
    config_file_path: Arc<String>,
    ui_handles: Arc<RwLock<HashMap<String, RouteHandle>>>,
    throughput_samples: Arc<RwLock<HashMap<String, RouteMetricSample>>>,
}

#[derive(Clone, Copy)]
struct RouteMetricSample {
    total_messages: f64,
    observed_at: Instant,
}

#[derive(serde::Serialize)]
struct RuntimeStatusResponse {
    active_consumers: Vec<String>,
    active_routes: Vec<String>,
    route_throughput: HashMap<String, f64>,
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

impl WebUiHandler {
    fn handle_static_asset(&self, request_path: &str) -> Result<Handled, HandlerError> {
        let Some(file_path) = resolve_static_asset_path(request_path) else {
            return Ok(Handled::Publish(msg!("Not Found").with_status_code("404")));
        };

        match fs::read(&file_path) {
            Ok(contents) => Ok(Handled::Publish(
                msg!(contents).with_content_type(guess_content_type(&file_path)),
            )),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                Ok(Handled::Publish(msg!("Not Found").with_status_code("404")))
            }
            Err(err) => Err(HandlerError::NonRetryable(err.into())),
        }
    }

    async fn handle(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
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
        let path = raw_path.to_lowercase();

        let result = match (method.as_str(), path.as_str()) {
            ("GET", "/health") => Ok(Handled::Publish(msg!("OK"))),
            ("GET", "/schema.json") => Ok(Handled::Publish({
                let schema = schema_for!(AppConfig);
                CanonicalMessage::from_type(&schema)
                    .map_err(|e| HandlerError::NonRetryable(e.into()))?
                    .with_content_type("application/json")
            })),
            ("GET", "/config") => self.handle_get_config().await.map(Handled::Publish),
            ("GET", "/consumer-status") => self.handle_consumer_status(&msg).await,
            ("POST", "/consumer-start") => self.handle_consumer_start(&msg).await,
            ("POST", "/consumer-stop") => self.handle_consumer_stop(&msg).await,
            ("GET", "/messages") => self.handle_get_messages(&msg).await,
            ("POST", "/config") => self.handle_update_config(msg).await,
            ("POST", "/publish") => self.handle_publish(msg).await,
            ("GET", "/runtime-status") => self.handle_runtime_status().await,
            ("GET", "/metrics") => Ok(Handled::Publish(
                msg!(self.metrics_handle.render()).with_content_type("text/plain; version=0.0.4"),
            )),
            ("GET", _) => self.handle_static_asset(raw_path),
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

    async fn handle_get_config(&self) -> Result<CanonicalMessage, HandlerError> {
        let config_guard = self.config.read().await;
        let current_config = config_guard.clone();

        // We no longer merge with the runtime 'running_map' here.
        // This ensures the UI only sees and sends back the 'clean' configuration,
        // preventing surgical reload from thinking routes have changed due to
        // bridge-internal default values or resolved references.

        CanonicalMessage::from_type(&current_config)
            .map_err(|e| HandlerError::NonRetryable(e.into()))
            .map(|m| m.with_content_type("application/json"))
    }

    async fn handle_consumer_status(
        &self,
        msg: &CanonicalMessage,
    ) -> Result<Handled, HandlerError> {
        let name = msg
            .metadata
            .get("http_query")
            .and_then(|q| q.split('&').find(|p| p.starts_with("consumer=")))
            .map(|p| p.trim_start_matches("consumer=").to_string())
            .unwrap_or_default();

        let is_running = self.ui_handles.read().await.contains_key(&name);
        let config = self.config.read().await;
        let consumer_config = config.consumers.iter().find(|c| c.name == name);

        if let Some(c) = consumer_config {
            let status = if is_running {
                // If the consumer is already running, assume it's healthy.
                // The UI will show "● Connected" if running.
                mq_bridge::traits::EndpointStatus {
                    healthy: true,
                    target: name.clone(),
                    ..Default::default()
                }
            } else if matches!(c.endpoint.endpoint_type, EndpointType::Http(_)) {
                // HTTP consumers are passive listeners. Probing them by creating a
                // fresh consumer can start a shared listener as a side effect, which
                // makes the UI status poll look like a restart loop.
                mq_bridge::traits::EndpointStatus {
                    healthy: false,
                    target: name.clone(),
                    ..Default::default()
                }
            } else {
                // If not running, probe connectivity to show if config is valid and broker reachable.
                match c.endpoint.create_consumer(&name).await {
                    Ok(consumer) => consumer.status().await,
                    Err(e) => mq_bridge::traits::EndpointStatus {
                        healthy: false,
                        target: name.clone(),
                        error: Some(e.to_string()),
                        ..Default::default()
                    },
                }
            };
            let resp = serde_json::json!({
                "running": is_running,
                "status": status
            });
            Ok(Handled::Publish(
                CanonicalMessage::from_type(&resp)
                    .unwrap()
                    .with_content_type("application/json"),
            ))
        } else {
            Ok(Handled::Publish(
                msg!("Consumer not found").with_status_code("404"),
            ))
        }
    }

    async fn handle_consumer_start(&self, msg: &CanonicalMessage) -> Result<Handled, HandlerError> {
        let name = msg
            .metadata
            .get("http_query")
            .and_then(|q| q.split('&').find(|p| p.starts_with("consumer=")))
            .map(|p| p.trim_start_matches("consumer=").to_string())
            .unwrap_or_default();

        let consumer_config = {
            let config = self.config.read().await;
            config.consumers.iter().find(|c| c.name == name).cloned()
        };

        if let Some(c) = consumer_config {
            self.start_ui_collector_routes(&[c])
                .await
                .map_err(HandlerError::NonRetryable)?;
            Ok(Handled::Publish(msg!("Started")))
        } else {
            Ok(Handled::Publish(
                msg!("Consumer not found").with_status_code("404"),
            ))
        }
    }

    async fn handle_consumer_stop(&self, msg: &CanonicalMessage) -> Result<Handled, HandlerError> {
        let name = msg
            .metadata
            .get("http_query")
            .and_then(|q| q.split('&').find(|p| p.starts_with("consumer=")))
            .map(|p| p.trim_start_matches("consumer=").to_string())
            .unwrap_or_default();

        let mut handles = self.ui_handles.write().await;
        if let Some(handle) = handles.remove(&name) {
            handle.stop().await;
        }
        Ok(Handled::Publish(msg!("Stopped")))
    }

    async fn handle_get_messages(&self, msg: &CanonicalMessage) -> Result<Handled, HandlerError> {
        let target_consumer = msg
            .metadata
            .get("http_query")
            .and_then(|q| q.split('&').find(|p| p.starts_with("consumer=")))
            .map(|p| p.trim_start_matches("consumer=").to_string());

        let mut grouped_messages: HashMap<String, VecDeque<serde_json::Value>> = HashMap::new();

        if let Some(consumer_name) = target_consumer {
            let topic = format!("ui_collector_{}", consumer_name);
            // Directly access the shared memory channel and pull available messages
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

        let resp = CanonicalMessage::from_type(&grouped_messages)
            .map_err(|e| HandlerError::NonRetryable(e.into()))?
            .with_content_type("application/json")
            .with_metadata_kv("Cache-Control", "no-cache, no-store, must-revalidate");

        Ok(Handled::Publish(resp))
    }

    async fn handle_publish(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
        let body: serde_json::Value = serde_json::from_slice(&msg.payload).unwrap_or_default();
        let name = body["name"].as_str().unwrap_or_default();
        let payload = body["payload"].as_str().unwrap_or_default();

        let endpoint = {
            let config = self.config.read().await;
            config
                .publishers
                .iter()
                .find(|p| p.name == name)
                .map(|p| p.endpoint.clone())
        };

        let publisher = if let Some(endpoint) = endpoint {
            // Recreate the publisher on each manual UI send so edits in the Definition tab
            // (for example MongoDB format changes) are applied immediately instead of using
            // a stale cached publisher instance from a previous config.
            unregister_publisher(name);
            Publisher::new(endpoint).await.ok()
        } else {
            None
        };

        if let Some(publisher) = publisher {
            let mut canonical = CanonicalMessage::from(payload);
            if let Some(meta) = body["metadata"].as_object() {
                for (k, v) in meta {
                    canonical
                        .metadata
                        .insert(k.clone(), v.as_str().unwrap_or_default().to_string());
                }
            }
            match publisher.send(canonical).await {
                Ok(sent) => {
                    let resp_val = match sent {
                        Sent::Ack => serde_json::json!({ "status": "Ack" }),
                        Sent::Response(m) => serde_json::json!({
                            "status": "Response",
                            "payload": m.get_payload_str(),
                            "metadata": m.metadata
                        }),
                    };
                    Ok(Handled::Publish(
                        CanonicalMessage::from_type(&resp_val)
                            .unwrap()
                            .with_content_type("application/json"),
                    ))
                }
                Err(e) => Ok(Handled::Publish(
                    msg!(format!("Publish error: {}", e)).with_status_code("500"),
                )),
            }
        } else {
            Ok(Handled::Publish(
                msg!("Publisher not found").with_status_code("404"),
            ))
        }
    }

    async fn handle_runtime_status(&self) -> Result<Handled, HandlerError> {
        let active_consumers: Vec<String> = self.ui_handles.read().await.keys().cloned().collect();

        let active_routes: Vec<String> = mq_bridge::list_routes()
            .into_iter()
            .filter(|name| name != "web_ui" && !name.starts_with("ui_collector_route_"))
            .collect();

        let config = self.config.read().await;
        let metrics_enabled_routes: HashSet<String> = config
            .routes
            .iter()
            .filter(|(_, route)| route_has_metrics(route))
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

        let mut active_consumers = active_consumers;
        active_consumers.sort();
        let mut active_routes = active_routes;
        active_routes.sort();

        let resp = RuntimeStatusResponse {
            active_consumers,
            active_routes,
            route_throughput,
        };

        Ok(Handled::Publish(
            CanonicalMessage::from_type(&resp)
                .map_err(|e| HandlerError::NonRetryable(e.into()))?
                .with_content_type("application/json")
                .with_metadata_kv("Cache-Control", "no-cache, no-store, must-revalidate"),
        ))
    }

    async fn handle_update_config(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
        let body = msg.payload;
        let mut new_config: AppConfig = match serde_json::from_slice(&body) {
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

        tracing::info!("Received new configuration via Web UI. Reloading...");

        // Normalize names early to ensure consistent comparison with old_config
        let routes: HashMap<String, Route> = new_config
            .routes
            .drain()
            .map(|(k, v)| (k.trim().replace(' ', "_").to_lowercase(), v))
            .collect();
        let consumers: Vec<crate::config::ConsumerConfig> = new_config
            .consumers
            .drain(..)
            .map(|mut c| {
                c.name = c.name.trim().to_string();
                c
            })
            .collect();

        for (name, route) in &routes {
            if let Err(e) = route.check(name, None) {
                let err_msg = format!("Route {}: validation failed: {}", name, e);
                tracing::error!("{}", err_msg);
                return Ok(Handled::Publish(
                    CanonicalMessage::from(err_msg).with_status_code("500"),
                ));
            }
        }
        for consumer in &consumers {
            let temp_route = Route::new(consumer.endpoint.clone(), Endpoint::null());
            if let Err(e) = temp_route.check(&consumer.name, None) {
                let err_msg = format!("Consumer {}: validation failed: {}", consumer.name, e);
                tracing::error!("{}", err_msg);
                return Ok(Handled::Publish(
                    CanonicalMessage::from(err_msg).with_status_code("500"),
                ));
            }
        }

        let old_config = self.config.read().await.clone();

        // 1. Identify which persistent routes need to be stopped (removed or changed)
        let mut routes_to_stop = Vec::new();
        for name in old_config.routes.keys() {
            if !routes.contains_key(name)
                || serde_json::to_value(&old_config.routes[name]).unwrap()
                    != serde_json::to_value(&routes[name]).unwrap()
            {
                routes_to_stop.push(name.clone());
            }
        }

        // Stop only the necessary routes
        for name in routes_to_stop {
            mq_bridge::stop_route(&name).await;
        }

        // 2. Surgical stop of internal UI collector routes
        {
            let old_consumers_map: HashMap<_, _> = old_config
                .consumers
                .iter()
                .map(|c| (&c.name, &c.endpoint))
                .collect();
            let new_consumers_map: HashMap<_, _> =
                consumers.iter().map(|c| (&c.name, &c.endpoint)).collect();

            let mut handles = self.ui_handles.write().await;
            let mut collectors_to_remove = Vec::new();

            for name in handles.keys() {
                let should_stop = if let (Some(old_ep), Some(new_ep)) =
                    (old_consumers_map.get(name), new_consumers_map.get(name))
                {
                    serde_json::to_value(old_ep).unwrap() != serde_json::to_value(new_ep).unwrap()
                } else {
                    true // removed
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

        {
            let mut config_guard = self.config.write().await;
            new_config.routes = routes.clone();
            new_config.consumers = consumers.clone();

            let config_file = &*self.config_file_path;
            if let Err(e) = new_config.save(config_file) {
                tracing::error!("Failed to save config to '{}': {}", config_file, e);
            } else {
                tracing::info!("Configuration saved to {}", config_file);
            }

            *config_guard = new_config;
        }
        for route in routes.values() {
            if route.is_ref() {
                route.register_output_endpoint(None)?;
            }
        }
        for consumer in &consumers {
            let route = Route::new(consumer.endpoint.clone(), Endpoint::null());
            if route.is_ref() {
                route.register_output_endpoint(None)?;
            }
        }

        // 4. Deploy new or changed persistent routes
        for (name, route) in &routes {
            if matches!(route.input.endpoint_type, EndpointType::Null) {
                continue;
            }

            let should_deploy = if let Some(old_r) = old_config.routes.get(name) {
                serde_json::to_value(old_r).unwrap() != serde_json::to_value(route).unwrap()
            } else {
                true
            };

            if should_deploy {
                if let Err(e) = route.deploy(name).await {
                    let err_msg = format!("Failed to deploy route {}: {}", name, e);
                    return Ok(Handled::Publish(
                        CanonicalMessage::from(err_msg).with_status_code("500"),
                    ));
                }
            }
        }

        Ok(Handled::Publish(
            CanonicalMessage::from("Configuration updated").with_status_code("200"),
        ))
    }

    async fn start_ui_collector_routes(
        &self,
        consumers: &[crate::config::ConsumerConfig],
    ) -> Result<(), anyhow::Error> {
        let mut handles = self.ui_handles.write().await;
        for consumer in consumers {
            if matches!(consumer.endpoint.endpoint_type, EndpointType::Null) {
                continue;
            }
            let name = consumer.name.clone();
            let topic = format!("ui_collector_{}", name);
            let output = Endpoint::new_memory(&topic, 1000);

            let closure_name = name.clone();
            let route = Route::new(consumer.endpoint.clone(), output).with_handler(
                move |msg: CanonicalMessage| {
                    let name = closure_name.clone();
                    async move {
                        let val = serde_json::json!({
                            "time": chrono::Local::now().to_rfc3339(),
                            "metadata": msg.metadata,
                            "payload": msg.get_payload_str()
                        });
                        let mut enriched = CanonicalMessage::from_type(&val)
                            .unwrap_or_else(|_| CanonicalMessage::from(""));
                        enriched.metadata.insert("ui_source".into(), name);
                        Ok(Handled::Publish(enriched))
                    }
                },
            );
            let internal_route_name = format!("ui_collector_route_{}", name);
            let handle = route.run(&internal_route_name).await?;
            handles.insert(name, handle);
        }
        Ok(())
    }
}

/// Start Web UI
pub async fn start_web_server(
    bind_addr: String,
    initial_config: AppConfig,
    metrics_handle: PrometheusHandle,
    config_file_path: String,
) -> Result<(), anyhow::Error> {
    let bind_addr = bind_addr.to_string();

    let ui_handles = Arc::new(RwLock::new(HashMap::new()));

    let web_handler = WebUiHandler {
        config: Arc::new(RwLock::new(initial_config.clone())),
        metrics_handle,
        config_file_path: Arc::new(config_file_path),
        ui_handles,
        throughput_samples: Arc::new(RwLock::new(HashMap::new())),
    };

    let input = Endpoint {
        endpoint_type: EndpointType::Http(HttpConfig {
            url: bind_addr,
            workers: Some(100), // Increase server workers for concurrent long-polling
            ..Default::default()
        }),
        ..Default::default()
    };

    let output = Endpoint {
        endpoint_type: EndpointType::Response(Default::default()),
        ..Default::default()
    };

    let mut web_route = Route::new(input, output).with_handler(move |msg| {
        let handler = web_handler.clone();
        async move { handler.handle(msg).await }
    });
    web_route.options.concurrency = 100; // Increase route concurrency to handle more parallel requests

    let handle = web_route.run("web_ui").await;
    let handle = handle.expect("Failed to start Web UI");
    // Keep the task alive
    std::future::pending::<()>().await;
    let _ = handle.join().await;

    Ok(())
}
