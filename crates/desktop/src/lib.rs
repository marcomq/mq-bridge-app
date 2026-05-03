use anyhow::Context;
use metrics_exporter_prometheus::PrometheusBuilder;
use mq_bridge_app::config::{AppConfig, SecretReferenceSummary, SecretStore, load_config_at_path};
use mq_bridge_app::mq_bridge::{CanonicalMessage, Handled};
use mq_bridge_app::ui_app::UiApp;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::Manager;
use tracing::warn;
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::format::FmtSpan;

const DESKTOP_SECRET_SERVICE: &str = "com.marcomq.mqbridgeapp";

#[derive(Clone)]
struct DesktopState {
    app: UiApp,
}

#[derive(Debug, Deserialize)]
struct DesktopUiRequest {
    method: String,
    path: String,
    #[serde(default)]
    query: String,
    #[serde(default)]
    body_text: String,
}

#[derive(Serialize)]
struct DesktopSecretStatusItem {
    key: String,
    extracted: bool,
    stored: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize, Default)]
struct DesktopSecretStatusSummary {
    routes: HashMap<String, Vec<DesktopSecretStatusItem>>,
    consumers: HashMap<String, Vec<DesktopSecretStatusItem>>,
    publishers: HashMap<String, Vec<DesktopSecretStatusItem>>,
}

#[derive(Debug, Clone)]
struct DesktopKeyringSecretStore {
    service: String,
    metadata_path: PathBuf,
}

impl DesktopKeyringSecretStore {
    fn new(service: impl Into<String>, metadata_path: impl Into<PathBuf>) -> Self {
        Self {
            service: service.into(),
            metadata_path: metadata_path.into(),
        }
    }
}

impl SecretStore for DesktopKeyringSecretStore {
    fn store(&self, secrets: &HashMap<String, String>) -> anyhow::Result<()> {
        for (key, value) in secrets {
            let entry = keyring::Entry::new(&self.service, key)
                .with_context(|| format!("Failed to open desktop keyring entry for '{key}'"))?;
            entry
                .set_password(value)
                .with_context(|| format!("Failed to store secret '{key}' in desktop keyring"))?;
            let stored_value = entry.get_password().with_context(|| {
                format!("Failed to verify stored secret '{key}' in desktop keyring")
            })?;
            if stored_value != *value {
                anyhow::bail!("Stored secret verification failed for '{key}'");
            }
        }
        write_desktop_secret_metadata(&self.metadata_path, secrets.keys())?;
        Ok(())
    }
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

fn json_response(status: u16, body_json: serde_json::Value) -> BridgeResponse {
    BridgeResponse {
        status,
        content_type: Some("application/json".to_string()),
        body_text: None,
        body_json: Some(body_json),
        headers: HashMap::new(),
    }
}

fn keyring_secret_status(service: &str, key: &str) -> (bool, Option<String>) {
    let entry = match keyring::Entry::new(service, key) {
        Ok(entry) => entry,
        Err(error) => {
            let message = format!("open failed: {error}");
            warn!("failed to open desktop keyring entry for '{key}': {error}");
            return (false, Some(message));
        }
    };

    match entry.get_password() {
        Ok(_) => (true, None),
        Err(keyring::Error::NoEntry) => (false, None),
        Err(error) => {
            let message = error.to_string();
            warn!("failed to verify secret '{key}' in desktop keyring: {error}");
            (false, Some(message))
        }
    }
}

fn read_desktop_secret_metadata(metadata_path: &Path) -> HashSet<String> {
    let Ok(content) = std::fs::read_to_string(metadata_path) else {
        return HashSet::new();
    };
    serde_json::from_str::<Vec<String>>(&content)
        .map(|keys| keys.into_iter().collect())
        .unwrap_or_default()
}

fn write_desktop_secret_metadata<'a>(
    metadata_path: &Path,
    keys: impl IntoIterator<Item = &'a String>,
) -> anyhow::Result<()> {
    let mut keys: Vec<String> = keys.into_iter().cloned().collect();
    keys.sort();
    keys.dedup();
    let content = serde_json::to_string_pretty(&keys)?;
    std::fs::write(metadata_path, content).with_context(|| {
        format!(
            "Failed to write desktop secret metadata '{}'",
            metadata_path.display()
        )
    })?;
    Ok(())
}

fn summarize_desktop_secret_status(
    summary: SecretReferenceSummary,
    extracted_keys: &HashSet<String>,
    service: &str,
) -> DesktopSecretStatusSummary {
    let map_status = |entries: HashMap<String, Vec<String>>| {
        entries
            .into_iter()
            .map(|(name, keys)| {
                let items = keys
                    .into_iter()
                    .map(|key| {
                        let extracted = extracted_keys.contains(&key);
                        let (stored, error) = if extracted {
                            keyring_secret_status(service, &key)
                        } else {
                            (false, None)
                        };
                        DesktopSecretStatusItem {
                            key,
                            extracted,
                            stored,
                            error,
                        }
                    })
                    .collect();
                (name, items)
            })
            .collect()
    };

    DesktopSecretStatusSummary {
        routes: map_status(summary.routes),
        consumers: map_status(summary.consumers),
        publishers: map_status(summary.publishers),
    }
}

#[tauri::command]
async fn get_health_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(state, "GET", "/health", "", "").await
}

#[tauri::command]
async fn get_schema_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(state, "GET", "/schema.json", "", "").await
}

#[tauri::command]
async fn get_config_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(state, "GET", "/config", "", "").await
}

#[tauri::command]
async fn post_config_request(
    state: tauri::State<'_, DesktopState>,
    body_text: String,
) -> Result<BridgeResponse, String> {
    let mut processed_body = body_text;
    if !processed_body.trim().is_empty() {
        if let Ok(mut config_value) = serde_json::from_str::<serde_json::Value>(&processed_body) {
            if let Some(object) = config_value.as_object_mut() {
                object.insert("extract_secrets".into(), serde_json::Value::Bool(true));
                if let Ok(serialized) = serde_json::to_string(&config_value) {
                    processed_body = serialized;
                }
            }
        }
    }
    dispatch_ui_request(state, "POST", "/config", "", &processed_body).await
}

#[tauri::command]
async fn get_desktop_secrets_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    let config = state.app.get_config().await;
    let metadata_path = desktop_secret_metadata_path(Path::new(state.app.config_file_path()));
    let extracted_keys = read_desktop_secret_metadata(&metadata_path);
    let summary = summarize_desktop_secret_status(
        config.referenced_secret_keys(),
        &extracted_keys,
        DESKTOP_SECRET_SERVICE,
    );
    Ok(json_response(
        200,
        serde_json::to_value(summary).map_err(|error| error.to_string())?,
    ))
}

#[tauri::command]
async fn delete_desktop_secrets_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    let metadata_path = desktop_secret_metadata_path(Path::new(state.app.config_file_path()));
    let deleted = delete_desktop_secrets_for_metadata(&metadata_path, DESKTOP_SECRET_SERVICE)
        .map_err(|error| error.to_string())?;
    Ok(json_response(
        200,
        serde_json::json!({ "deleted": deleted }),
    ))
}

#[tauri::command]
async fn get_consumer_status_request(
    state: tauri::State<'_, DesktopState>,
    consumer: String,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(
        state,
        "GET",
        "/consumer-status",
        &format!("consumer={}", consumer),
        "",
    )
    .await
}

#[tauri::command]
async fn post_consumer_start_request(
    state: tauri::State<'_, DesktopState>,
    consumer: String,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(
        state,
        "POST",
        "/consumer-start",
        &format!("consumer={}", consumer),
        "",
    )
    .await
}

#[tauri::command]
async fn post_consumer_stop_request(
    state: tauri::State<'_, DesktopState>,
    consumer: String,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(
        state,
        "POST",
        "/consumer-stop",
        &format!("consumer={}", consumer),
        "",
    )
    .await
}

#[tauri::command]
async fn get_messages_request(
    state: tauri::State<'_, DesktopState>,
    consumer: Option<String>,
) -> Result<BridgeResponse, String> {
    let query = consumer
        .map(|c| format!("consumer={}", c))
        .unwrap_or_default();
    dispatch_ui_request(state, "GET", "/messages", &query, "").await
}

#[tauri::command]
async fn post_publish_request(
    state: tauri::State<'_, DesktopState>,
    body_text: String,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(state, "POST", "/publish", "", &body_text).await
}

#[tauri::command]
async fn get_runtime_status_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(state, "GET", "/runtime-status", "", "").await
}

#[tauri::command]
async fn get_metrics_request(
    state: tauri::State<'_, DesktopState>,
) -> Result<BridgeResponse, String> {
    dispatch_ui_request(state, "GET", "/metrics", "", "").await
}

#[tauri::command]
async fn execute_ui_request(
    state: tauri::State<'_, DesktopState>,
    request: DesktopUiRequest,
) -> Result<BridgeResponse, String> {
    // Generic entry point used by bundled UI code
    dispatch_ui_request(
        state,
        &request.method,
        &request.path,
        &request.query,
        &request.body_text,
    )
    .await
}

async fn dispatch_ui_request(
    state: tauri::State<'_, DesktopState>,
    method: &str,
    path: &str,
    query: &str,
    body_text: &str,
) -> Result<BridgeResponse, String> {
    tracing::trace!(
        "UI request: method={}, path={}, query={}, body_len={}",
        method,
        path,
        query,
        body_text.len()
    );

    let mut message = CanonicalMessage::from(body_text.to_string());
    message
        .metadata
        .insert("http_method".into(), method.to_uppercase());
    message
        .metadata
        .insert("http_path".into(), path.to_string());
    if !query.is_empty() {
        message
            .metadata
            .insert("http_query".into(), query.to_string());
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

    for route in config.routes.values() {
        if route.enabled && route.route.is_ref() {
            route.route.register_output_endpoint(None)?;
        }
    }

    for (name, route) in &config.routes {
        if !route.enabled {
            continue;
        }
        route.route.deploy(name).await?;
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

fn desktop_secret_metadata_path(config_path: &Path) -> PathBuf {
    config_path.with_file_name("secret_refs.json")
}

fn load_desktop_secrets_into_env(metadata_path: &Path, service: &str) -> anyhow::Result<()> {
    for key in read_desktop_secret_metadata(metadata_path) {
        if std::env::var_os(&key).is_some() {
            continue;
        }

        let entry = keyring::Entry::new(service, &key)
            .with_context(|| format!("Failed to open desktop keyring entry for '{key}'"))?;

        match entry.get_password() {
            Ok(value) => {
                // Desktop startup happens before worker threads spin up, which keeps
                // this process-wide env injection aligned with the config loader.
                unsafe {
                    std::env::set_var(&key, value);
                }
            }
            Err(keyring::Error::NoEntry) => {}
            Err(error) => {
                warn!("failed to load secret '{key}' from desktop keyring: {error}");
            }
        }
    }

    Ok(())
}

fn delete_desktop_secrets_for_metadata(
    metadata_path: &Path,
    service: &str,
) -> anyhow::Result<usize> {
    let mut deleted = 0usize;
    let mut remaining_keys = Vec::new();
    for key in read_desktop_secret_metadata(metadata_path) {
        let mut keep_key = false;
        let entry = keyring::Entry::new(service, &key)
            .with_context(|| format!("Failed to open desktop keyring entry for '{key}'"))?;

        match entry.delete_credential() {
            Ok(()) => deleted += 1,
            Err(keyring::Error::NoEntry) => {}
            Err(error) => {
                warn!("failed to delete secret '{key}' from desktop keyring: {error}");
                remaining_keys.push(key.clone());
                keep_key = true;
            }
        }

        // Keep process env consistent with keyring deletions.
        if !keep_key {
            // Desktop secret cleanup is triggered via user action and this app context
            // controls subsequent config loads, so clearing env vars here is expected.
            unsafe {
                std::env::remove_var(&key);
            }
        }
    }

    write_desktop_secret_metadata(metadata_path, remaining_keys.iter())?;
    Ok(deleted)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    tauri::Builder::default()
        .setup(|app| {
            let config_path = desktop_config_path(app)?;
            let metadata_path = desktop_secret_metadata_path(&config_path);
            let secret_store = Arc::new(DesktopKeyringSecretStore::new(
                DESKTOP_SECRET_SERVICE,
                metadata_path.clone(),
            ));
            load_desktop_secrets_into_env(&metadata_path, DESKTOP_SECRET_SERVICE)
                .context("Failed to hydrate desktop config secrets from keyring")?;
            let (mut config, config_file_path) = load_config_at_path(
                config_path
                    .to_str()
                    .context("Desktop config path contains invalid UTF-8")?
                    .to_string(),
            )
            .context("Failed to load desktop configuration")?;
            config.extract_secrets = true;

            init_logging(&config);

            let builder = PrometheusBuilder::new();
            let recorder = builder.build_recorder();
            let prometheus_handle = recorder.handle();
            metrics::set_global_recorder(recorder)
                .context("Failed to install Prometheus recorder")?;

            metrics::describe_gauge!(
                "mq_bridge_app_info",
                "Information about the mq-bridge-app application"
            );
            metrics::gauge!("mq_bridge_app_info", "version" => env!("CARGO_PKG_VERSION")).set(1.0);

            tauri::async_runtime::block_on(async {
                deploy_routes(&mut config)
                    .await
                    .context("Failed to deploy configured routes")
            })?;

            app.manage(DesktopState {
                app: UiApp::new_with_secret_store(
                    config,
                    prometheus_handle,
                    config_file_path,
                    secret_store,
                ),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            execute_ui_request,
            get_health_request,
            get_schema_request,
            get_config_request,
            post_config_request,
            get_desktop_secrets_request,
            delete_desktop_secrets_request,
            get_consumer_status_request,
            post_consumer_start_request,
            post_consumer_stop_request,
            get_messages_request,
            post_publish_request,
            get_runtime_status_request,
            get_metrics_request
        ])
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
