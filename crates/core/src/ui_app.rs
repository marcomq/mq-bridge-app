use crate::config::{AppConfig, ConsumerConfig, RouteConfig};
use anyhow::{Result, anyhow};
use chrono;
use metrics_exporter_prometheus::PrometheusHandle;
use mq_bridge::models::{Endpoint, EndpointType, MemoryConfig, Route};
use mq_bridge::route::RouteHandle;
use mq_bridge::{CanonicalMessage, Handled, Publisher, Sent, unregister_publisher};
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct UiApp {
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
pub struct RuntimeStatusResponse {
    pub active_consumers: Vec<String>,
    pub active_routes: Vec<String>,
    pub route_throughput: HashMap<String, f64>,
}

#[derive(serde::Serialize)]
pub struct ConsumerStatusResponse {
    pub running: bool,
    pub status: mq_bridge::traits::EndpointStatus,
}

#[derive(serde::Deserialize)]
pub struct PublishRequest {
    pub name: String,
    pub payload: String,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

#[derive(serde::Serialize)]
pub struct PublishResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
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

impl UiApp {
    pub fn new(
        initial_config: AppConfig,
        metrics_handle: PrometheusHandle,
        config_file_path: String,
    ) -> Self {
        Self {
            config: Arc::new(RwLock::new(initial_config)),
            metrics_handle,
            config_file_path: Arc::new(config_file_path),
            ui_handles: Arc::new(RwLock::new(HashMap::new())),
            throughput_samples: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn get_config(&self) -> AppConfig {
        self.config.read().await.clone()
    }

    pub fn render_metrics(&self) -> String {
        self.metrics_handle.render()
    }

    pub async fn consumer_status(&self, name: &str) -> Option<ConsumerStatusResponse> {
        let is_running = self.ui_handles.read().await.contains_key(name);
        let config = self.config.read().await;
        let consumer_config = config.consumers.iter().find(|c| c.name == name);

        consumer_config
            .map(|c| {
                let name = name.to_string();
                async move {
                    let status = if is_running {
                        mq_bridge::traits::EndpointStatus {
                            healthy: true,
                            target: name.clone(),
                            ..Default::default()
                        }
                    } else if matches!(c.endpoint.endpoint_type, EndpointType::Http(_)) {
                        mq_bridge::traits::EndpointStatus {
                            healthy: false,
                            target: name.clone(),
                            ..Default::default()
                        }
                    } else {
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

                    ConsumerStatusResponse {
                        running: is_running,
                        status,
                    }
                }
            })?
            .await
            .into()
    }

    pub async fn start_consumer(&self, name: &str) -> Result<bool> {
        let consumer_config = {
            let config = self.config.read().await;
            config.consumers.iter().find(|c| c.name == name).cloned()
        };

        if let Some(consumer) = consumer_config {
            self.start_ui_collector_routes(&[consumer]).await?;
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
        let endpoint = {
            let config = self.config.read().await;
            config
                .publishers
                .iter()
                .find(|p| p.name == request.name)
                .map(|p| p.endpoint.clone())
        };

        let publisher = if let Some(endpoint) = endpoint {
            unregister_publisher(&request.name);
            Publisher::new(endpoint).await.ok()
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
        let active_consumers: Vec<String> = self.ui_handles.read().await.keys().cloned().collect();

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

        let mut active_consumers = active_consumers;
        active_consumers.sort();
        let mut active_routes = active_routes;
        active_routes.sort();

        RuntimeStatusResponse {
            active_consumers,
            active_routes,
            route_throughput,
        }
    }

    pub async fn update_config(&self, mut new_config: AppConfig) -> Result<()> {
        tracing::info!("Received new configuration via Web UI. Reloading...");

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
                c
            })
            .collect();

        for (name, route) in &routes {
            if !route.enabled {
                continue;
            }
            route
                .route
                .check(name, None)
                .map_err(|e| anyhow!("Route {name}: validation failed: {e}"))?;
        }
        for consumer in &consumers {
            let temp_route = Route::new(consumer.endpoint.clone(), Endpoint::null());
            temp_route
                .check(&consumer.name, None)
                .map_err(|e| anyhow!("Consumer {}: validation failed: {}", consumer.name, e))?;
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
            if route.enabled && route.route.is_ref() {
                route.route.register_output_endpoint(None)?;
            }
        }
        for consumer in &consumers {
            let route = Route::new(consumer.endpoint.clone(), Endpoint::null());
            if route.is_ref() {
                route.register_output_endpoint(None)?;
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
                route
                    .route
                    .deploy(name)
                    .await
                    .map_err(|e| anyhow!("Failed to deploy route {name}: {e}"))?;
            }
        }

        Ok(())
    }

    async fn start_ui_collector_routes(&self, consumers: &[ConsumerConfig]) -> Result<()> {
        let mut handles = self.ui_handles.write().await;
        for consumer in consumers {
            if matches!(consumer.endpoint.endpoint_type, EndpointType::Null) {
                continue;
            }
            let name = consumer.name.clone();
            let topic = format!("ui_collector_{name}");
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
            let internal_route_name = format!("ui_collector_route_{name}");
            let handle = route.run(&internal_route_name).await?;
            handles.insert(name, handle);
        }
        Ok(())
    }
}
