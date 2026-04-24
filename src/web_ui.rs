use crate::config::AppConfig;
use crate::ui_app::{PublishRequest, UiApp};
use anyhow::Result;
use mq_bridge::models::{Endpoint, EndpointType, HttpConfig, Route};
use mq_bridge::{CanonicalMessage, Handled, HandlerError, msg};
use schemars::schema_for;
use std::path::{Component, Path, PathBuf};

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

fn query_param(msg: &CanonicalMessage, key: &str) -> Option<String> {
    let query = msg.metadata.get("http_query")?;
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix(&format!("{key}=")))
        .map(ToString::to_string)
}

#[derive(Clone)]
struct WebUiHttpHandler {
    app: UiApp,
}

impl WebUiHttpHandler {
    fn handle_static_asset(&self, request_path: &str) -> Result<Handled, HandlerError> {
        let Some(file_path) = resolve_static_asset_path(request_path) else {
            return Ok(Handled::Publish(msg!("Not Found").with_status_code("404")));
        };

        match std::fs::read(&file_path) {
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
            ("GET", "/config") => self.handle_get_config().await,
            ("GET", "/consumer-status") => self.handle_consumer_status(&msg).await,
            ("POST", "/consumer-start") => self.handle_consumer_start(&msg).await,
            ("POST", "/consumer-stop") => self.handle_consumer_stop(&msg).await,
            ("GET", "/messages") => self.handle_get_messages(&msg).await,
            ("POST", "/config") => self.handle_update_config(msg).await,
            ("POST", "/publish") => self.handle_publish(msg).await,
            ("GET", "/runtime-status") => self.handle_runtime_status().await,
            ("GET", "/metrics") => Ok(Handled::Publish(
                msg!(self.app.render_metrics()).with_content_type("text/plain; version=0.0.4"),
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

    async fn handle_get_config(&self) -> Result<Handled, HandlerError> {
        let current_config = self.app.get_config().await;
        Ok(Handled::Publish(
            CanonicalMessage::from_type(&current_config)
                .map_err(|e| HandlerError::NonRetryable(e.into()))?
                .with_content_type("application/json"),
        ))
    }

    async fn handle_consumer_status(
        &self,
        msg: &CanonicalMessage,
    ) -> Result<Handled, HandlerError> {
        let name = query_param(msg, "consumer").unwrap_or_default();

        if let Some(status) = self.app.consumer_status(&name).await {
            Ok(Handled::Publish(
                CanonicalMessage::from_type(&status)
                    .map_err(|e| HandlerError::NonRetryable(e.into()))?
                    .with_content_type("application/json"),
            ))
        } else {
            Ok(Handled::Publish(
                msg!("Consumer not found").with_status_code("404"),
            ))
        }
    }

    async fn handle_consumer_start(&self, msg: &CanonicalMessage) -> Result<Handled, HandlerError> {
        let name = query_param(msg, "consumer").unwrap_or_default();

        if self
            .app
            .start_consumer(&name)
            .await
            .map_err(HandlerError::NonRetryable)?
        {
            Ok(Handled::Publish(msg!("Started")))
        } else {
            Ok(Handled::Publish(
                msg!("Consumer not found").with_status_code("404"),
            ))
        }
    }

    async fn handle_consumer_stop(&self, msg: &CanonicalMessage) -> Result<Handled, HandlerError> {
        let name = query_param(msg, "consumer").unwrap_or_default();
        let _ = self.app.stop_consumer(&name).await;
        Ok(Handled::Publish(msg!("Stopped")))
    }

    async fn handle_get_messages(&self, msg: &CanonicalMessage) -> Result<Handled, HandlerError> {
        let target_consumer = query_param(msg, "consumer");
        let grouped_messages = self.app.get_messages(target_consumer.as_deref()).await;

        Ok(Handled::Publish(
            CanonicalMessage::from_type(&grouped_messages)
                .map_err(|e| HandlerError::NonRetryable(e.into()))?
                .with_content_type("application/json")
                .with_metadata_kv("Cache-Control", "no-cache, no-store, must-revalidate"),
        ))
    }

    async fn handle_publish(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
        let request: PublishRequest =
            serde_json::from_slice(&msg.payload).unwrap_or(PublishRequest {
                name: String::new(),
                payload: String::new(),
                metadata: Default::default(),
            });

        match self.app.publish(request).await {
            Ok(Some(response)) => Ok(Handled::Publish(
                CanonicalMessage::from_type(&response)
                    .map_err(|e| HandlerError::NonRetryable(e.into()))?
                    .with_content_type("application/json"),
            )),
            Ok(None) => Ok(Handled::Publish(
                msg!("Publisher not found").with_status_code("404"),
            )),
            Err(e) => Ok(Handled::Publish(
                msg!(e.to_string()).with_status_code("500"),
            )),
        }
    }

    async fn handle_runtime_status(&self) -> Result<Handled, HandlerError> {
        let status = self.app.runtime_status().await;
        Ok(Handled::Publish(
            CanonicalMessage::from_type(&status)
                .map_err(|e| HandlerError::NonRetryable(e.into()))?
                .with_content_type("application/json")
                .with_metadata_kv("Cache-Control", "no-cache, no-store, must-revalidate"),
        ))
    }

    async fn handle_update_config(&self, msg: CanonicalMessage) -> Result<Handled, HandlerError> {
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

        match self.app.update_config(new_config).await {
            Ok(()) => Ok(Handled::Publish(
                CanonicalMessage::from("Configuration updated").with_status_code("200"),
            )),
            Err(e) => {
                tracing::error!("{}", e);
                Ok(Handled::Publish(
                    CanonicalMessage::from(e.to_string()).with_status_code("500"),
                ))
            }
        }
    }
}

/// Start Web UI
pub async fn start_web_server(
    bind_addr: String,
    initial_config: AppConfig,
    metrics_handle: metrics_exporter_prometheus::PrometheusHandle,
    config_file_path: String,
) -> Result<(), anyhow::Error> {
    let bind_addr = bind_addr.to_string();
    let app = UiApp::new(initial_config, metrics_handle, config_file_path);

    let input = Endpoint {
        endpoint_type: EndpointType::Http(HttpConfig {
            url: bind_addr,
            workers: Some(100),
            ..Default::default()
        }),
        ..Default::default()
    };

    let output = Endpoint {
        endpoint_type: EndpointType::Response(Default::default()),
        ..Default::default()
    };

    let web_handler = WebUiHttpHandler { app };
    let mut web_route = Route::new(input, output).with_handler(move |msg| {
        let handler = web_handler.clone();
        async move { handler.handle(msg).await }
    });
    web_route.options.concurrency = 100;

    let handle = web_route.run("web_ui").await;
    let handle = handle.expect("Failed to start Web UI");
    std::future::pending::<()>().await;
    let _ = handle.join().await;

    Ok(())
}
