use crate::config::AppConfig;
use anyhow::Result;
use async_trait::async_trait;
use mq_bridge::models::{Endpoint, EndpointType, HttpConfig, Route};
use mq_bridge::traits::Handler;
use mq_bridge::{msg, CanonicalMessage, Handled, HandlerError};
use schemars::schema_for;
use std::sync::{Arc, RwLock};

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

struct WebUiHandler {
    config: Arc<RwLock<AppConfig>>,
}

#[async_trait]
impl Handler for WebUiHandler {
    async fn handle(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
        let method = msg
            .metadata
            .get("http_method")
            .map(|s| s.as_str())
            .unwrap_or("GET")
            .to_uppercase();
        let path = msg
            .metadata
            .get("http_path")
            .map(|s| s.as_str())
            .unwrap_or("/")
            .to_lowercase();

        let response = match (method.as_str(), path.as_str()) {
            ("GET", "/health") => msg!("OK"),
            ("GET", "/favicon.ico") => {
                msg!(include_bytes!("../static/favicon.ico").to_vec()).with_content_type("image/x-icon")
            }
            ("GET", "/favicon.svg") => {
                msg!(include_str!("../static/favicon.svg")).with_content_type("image/svg+xml")
            }
            ("GET", "/schema.json") => {
                let schema = schema_for!(AppConfig);
                CanonicalMessage::from_type(&schema)
                    .map_err(|e| HandlerError::NonRetryable(e.into()))?
                    .with_content_type("application/json")
            }
            ("GET", "/vanilla-schema-forms.js") => {
                msg!(include_str!("../static/vanilla-schema-forms.js"))
                    .with_content_type("text/javascript")
            }
            ("GET", "/custom-form.js") => {
                msg!(include_str!("../static/custom-form.js")).with_content_type("text/javascript")
            }
            ("GET", "/bootstrap.min.css") => {
                msg!(include_str!("../static/bootstrap.min.css")).with_content_type("text/css")
            }
            ("GET", "/") | ("GET", "/index.html") => {
                msg!(include_str!("../static/index.html")).with_content_type("text/html")
            }
            ("GET", "/config") => {
                let config_guard = self.config.read().unwrap();
                let mut current_config = config_guard.clone();
                // Populate active routes status
                current_config.routes = mq_bridge::list_routes()
                    .into_iter()
                    .filter_map(|name| mq_bridge::get_route(&name).map(|route| (name, route)))
                    .collect();
                CanonicalMessage::from_type(&current_config)
                    .map_err(|e| HandlerError::NonRetryable(e.into()))?
                    .with_content_type("application/json")
            }
            ("POST", "/config") => return self.handle_update_config(msg).await,
            _ => msg!("Not Found").with_status_code("404"),
        };

        let response = if !response.metadata.contains_key("http_status_code") {
            response.with_status_code("200")
        } else {
            response
        };

        Ok(Handled::Publish(response))
    }
}

impl WebUiHandler {
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

        let routes = std::mem::take(&mut new_config.routes);
        for (name, route) in &routes {
            if let Err(e) = route.check(name, None) {
                let err_msg = format!("Route {}: validation failed: {}", name, e);
                tracing::error!("{}", err_msg);
                return Ok(Handled::Publish(
                    CanonicalMessage::from(err_msg).with_status_code("500"),
                ));
            }
        }

        let old_routes = mq_bridge::list_routes();
        for name in old_routes {
            if name == "web_ui" {
                continue;
            }
            if !routes.contains_key(&name) {
                mq_bridge::stop_route(&name).await;
            }
        }

        {
            let mut config_guard = self.config.write().unwrap();
            new_config.routes = routes.clone();

            let config_file =
                std::env::var("CONFIG_FILE").unwrap_or_else(|_| "config.yml".to_string());
            match serde_yaml_ng::to_string(&new_config) {
                Ok(yaml) => {
                    if let Err(e) = std::fs::write(&config_file, yaml) {
                        tracing::error!("Failed to write config to {}: {}", config_file, e);
                    } else {
                        tracing::info!("Configuration saved to {}", config_file);
                    }
                }
                Err(e) => tracing::error!("Failed to serialize config: {}", e),
            }

            *config_guard = new_config;
        }

        for (name, route) in &routes {
            if let Err(e) = route.deploy(name).await {
                let err_msg = format!("Failed to deploy route {}: {}", name, e);
                return Ok(Handled::Publish(
                    CanonicalMessage::from(err_msg).with_status_code("500"),
                ));
            }
        }

        Ok(Handled::Publish(
            CanonicalMessage::from("Configuration updated").with_status_code("200"),
        ))
    }
}

/// Start Web UI
pub async fn start_web_server(
    bind_addr: String,
    initial_config: AppConfig,
) -> Result<(), anyhow::Error> {
    let bind_addr = bind_addr.to_string();
    let handler = WebUiHandler {
        config: Arc::new(RwLock::new(initial_config)),
    };

    let input = Endpoint {
        endpoint_type: EndpointType::Http(HttpConfig {
            url: bind_addr,
            ..Default::default()
        }),
        ..Default::default()
    };

    let output = Endpoint {
        endpoint_type: EndpointType::Response(Default::default()),
        ..Default::default()
    };

    let route = Route::new(input, output).with_handler(handler);

    let handle = route.run("web_ui").await;
    let handle = handle.expect("Failed to start Web UI");
    // Keep the task alive
    std::future::pending::<()>().await;
    let _ = handle.join().await;

    Ok(())
}
