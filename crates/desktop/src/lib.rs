use anyhow::Context;
use metrics_exporter_prometheus::PrometheusBuilder;
use mq_bridge_app::config::{AppConfig, load_config_at_path};
use mq_bridge_app::mq_bridge::{CanonicalMessage, Handled};
use mq_bridge_app::ui_app::UiApp;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Manager;
use tracing::warn;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::format::FmtSpan;

#[derive(Clone)]
struct DesktopState {
    app: UiApp,
}

#[derive(Deserialize)]
struct DesktopUiRequest {
    method: String,
    path: String,
    #[serde(default)]
    query: String,
    #[serde(default)]
    body_text: String,
}

#[derive(Serialize)]
struct BridgeResponse {
    status: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    content_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body_json: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    headers: HashMap<String, String>,
}

fn handled_to_bridge_response(handled: Handled) -> BridgeResponse {
    let message = match handled {
        Handled::Ack => CanonicalMessage::from("OK"),
        Handled::Publish(message) => message,
    };

    let status = message
        .metadata
        .get("http_status_code")
        .and_then(|value: &String| value.parse::<u16>().ok())
        .unwrap_or(200);
    let content_type = message.metadata.get("Content-Type").cloned();

    let mut headers: HashMap<String, String> = HashMap::new();
    for (key, value) in &message.metadata {
        if key != "http_status_code" && key != "Content-Type" {
            headers.insert(key.clone(), value.clone());
        }
    }

    let body_json = if content_type
        .as_deref()
        .is_some_and(|value: &str| value.starts_with("application/json"))
    {
        serde_json::from_slice::<serde_json::Value>(&message.payload).ok()
    } else {
        None
    };
    let body_text = if body_json.is_none() {
        Some(message.get_payload_str().to_string())
    } else {
        None
    };

    BridgeResponse {
        status,
        content_type,
        body_text,
        body_json,
        headers,
    }
}

#[tauri::command]
async fn execute_ui_request(
    state: tauri::State<'_, DesktopState>,
    request: DesktopUiRequest,
) -> Result<BridgeResponse, String> {
    let mut message = CanonicalMessage::from(request.body_text);
    message
        .metadata
        .insert("http_method".into(), request.method.to_uppercase());
    message.metadata.insert("http_path".into(), request.path);
    if !request.query.is_empty() {
        message.metadata.insert("http_query".into(), request.query);
    }

    state
        .app
        .handle_ui_message(message, false)
        .await
        .map(handled_to_bridge_response)
        .map_err(|e| e.to_string())
}

fn init_logging(config: &AppConfig) {
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(config.log_level.clone()));

    let logger = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_span_events(FmtSpan::CLOSE)
        .with_target(true);
    match config.logger.as_str() {
        "json" => {
            logger.json().init();
        }
        _ => {
            logger.init();
        }
    }
}

async fn deploy_routes(config: &mut AppConfig) -> anyhow::Result<()> {
    if config.routes.is_empty() && config.consumers.is_empty() {
        return Ok(());
    }

    let routes = std::mem::take(&mut config.routes);

    for route in routes.values() {
        if route.enabled && route.route.is_ref() {
            route.route.register_output_endpoint(None)?;
        }
    }

    for (name, route) in routes {
        if !route.enabled {
            continue;
        }
        route.route.deploy(&name).await?;
    }

    Ok(())
}

async fn shutdown_routes() {
    let routes = mq_bridge_app::mq_bridge::list_routes();
    for name in routes {
        mq_bridge_app::mq_bridge::stop_route(&name).await;
    }
}

fn desktop_config_path<R: tauri::Runtime>(
    app: &tauri::App<R>,
) -> anyhow::Result<std::path::PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("Failed to resolve desktop app config directory")?;
    std::fs::create_dir_all(&config_dir).with_context(|| {
        format!(
            "Failed to create config directory '{}'",
            config_dir.display()
        )
    })?;
    Ok(config_dir.join("config.yml"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    tauri::Builder::default()
        .setup(|app| {
            let config_path = desktop_config_path(app)?;
            let (mut config, config_file_path) = load_config_at_path(
                config_path
                    .to_str()
                    .context("Desktop config path contains invalid UTF-8")?
                    .to_string(),
            )
            .context("Failed to load desktop configuration")?;

            if config.extract_secrets {
                warn!(
                    "Desktop app does not use .env-based secret extraction. Disabling `extract_secrets` for this session."
                );
                config.extract_secrets = false;
            }

            init_logging(&config);

            let builder = PrometheusBuilder::new();
            let recorder = builder.build_recorder();
            let prometheus_handle = recorder.handle();
            metrics::set_global_recorder(recorder).context("Failed to install Prometheus recorder")?;

            metrics::describe_gauge!(
                "mq_bridge_app_info",
                "Information about the mq-bridge-app application"
            );
            metrics::gauge!("mq_bridge_app_info", "version" => env!("CARGO_PKG_VERSION"))
                .set(1.0);

            tauri::async_runtime::block_on(async {
                deploy_routes(&mut config)
                    .await
                    .context("Failed to deploy configured routes")
            })?;

            app.manage(DesktopState {
                app: UiApp::new(config, prometheus_handle, config_file_path),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![execute_ui_request])
        .on_window_event(|_, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                tauri::async_runtime::spawn(async {
                    shutdown_routes().await;
                });
            }
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| {
            warn!("error while running tauri application: {error}");
            panic!("error while running tauri application: {error}");
        });
}
