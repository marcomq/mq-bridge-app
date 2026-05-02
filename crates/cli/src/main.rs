//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use mq_bridge_app::{
    config::{AppConfig, load_config},
    mq_bridge, web_ui,
};

use clap::Parser;
use std::net::SocketAddr;
use std::time::Duration;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::format::FmtSpan;

use anyhow::Context;
#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Path to configuration file for loading and saving.
    #[arg(short, long)]
    config: Option<String>,

    /// Path to a template configuration file to initialize from on first run if the main config file doesn't exist.
    #[arg(short, long)]
    init_config: Option<String>,

    /// A string containing configuration (e.g., YAML or JSON) to initialize from if the main config file doesn't exist.
    #[arg(long)]
    init_config_str: Option<String>,

    /// A string containing configuration (e.g., YAML or JSON) to override the config file.
    #[arg(long)]
    config_str: Option<String>,

    /// Generate JSON schema to the specified path
    #[arg(long)]
    schema: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize the default crypto provider for rustls (required for rustls 0.23.0+)
    // This allows mq-bridge to create TLS configurations for secure endpoints.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let args = Args::parse();

    if let Some(schema_path) = args.schema {
        let schema = schemars::schema_for!(AppConfig);
        let schema_json =
            serde_json::to_string_pretty(&schema).context("Failed to serialize schema")?;

        if schema_path == "-" {
            println!("{}", schema_json);
        } else {
            let path = std::path::Path::new(&schema_path);
            if let Some(parent) = path.parent()
                && !parent.as_os_str().is_empty()
                && !parent.exists()
            {
                std::fs::create_dir_all(parent)
                    .context("Failed to create parent directory for schema")?;
            }
            std::fs::write(path, schema_json).context("Failed to write schema file")?;
        }
        return Ok(());
    }

    let (mut config, config_file_path): (AppConfig, String) = load_config(
        args.config,
        args.init_config,
        args.init_config_str,
        args.config_str,
    )
    .context("Failed to load configuration")?;
    init_logging(&config);
    println!(
        r#"
      ┌────── mq-bridge-app ──────┐
──────┴───────────────────────────┴──────"#
    );

    // --- Logic for default addresses ---
    // When no persisted config file exists (common in http/no-tauri dev mode), ensure
    // UI + metrics are reachable with sane defaults.
    let has_persisted_config = std::path::Path::new(&config_file_path).exists();
    if !has_persisted_config || (config.routes.is_empty() && config.consumers.is_empty()) {
        if config.metrics_addr.is_empty() {
            config.metrics_addr = "0.0.0.0:9090".to_string();
        }
        if config.ui_addr.is_empty() {
            config.ui_addr = "0.0.0.0:9091".to_string();
        }
    }

    let mut prom_addr = None;
    // --- 2. Initialize Prometheus Metrics Exporter ---
    let builder = metrics_exporter_prometheus::PrometheusBuilder::new();
    let (recorder, metrics_task) =
        if !config.metrics_addr.is_empty() && config.metrics_addr != config.ui_addr {
            let addr: SocketAddr = config.metrics_addr.parse().context(format!(
                "Failed to parse metrics listen address: {}",
                config.metrics_addr
            ))?;
            let (recorder, server_future) = builder.with_http_listener(addr).build()?;
            prom_addr = Some(addr);
            (recorder, Some(tokio::spawn(server_future)))
        } else {
            (builder.build_recorder(), None)
        };
    let prometheus_handle = recorder.handle();
    metrics::set_global_recorder(recorder).context("Failed to install Prometheus recorder")?;

    metrics::describe_gauge!(
        "mq_bridge_app_info",
        "Information about the mq-bridge-app application"
    );
    // Standard Prometheus pattern: use a fixed value of 1.0 for info metrics,
    // encoding the actual data (version, etc.) in the labels.
    metrics::gauge!("mq_bridge_app_info", "version" => env!("CARGO_PKG_VERSION")).set(1.0);

    // Start Web UI
    let web_ui_handle = if !config.ui_addr.is_empty() {
        let addr = &config.ui_addr;
        let socket_addr: SocketAddr = addr
            .parse()
            .with_context(|| format!("Failed to parse UI listen address: {}", addr))?;
        let port = socket_addr.port();
        let host = if socket_addr.ip().is_unspecified() {
            "localhost".to_string()
        } else {
            socket_addr.ip().to_string()
        };
        println!(
            r#"      Web UI: http://{}:{}
"#,
            host, port
        );
        info!(
            "Prometheus metrics enabled on Web UI (http://{}/metrics)",
            config.ui_addr
        );

        let web_ui_server = web_ui::start_web_server(
            addr.into(),
            config.clone(),
            prometheus_handle,
            config_file_path,
        );
        Some(tokio::spawn(web_ui_server))
    } else {
        println!(
            r#"        Starting without UI server
"#
        );
        None
    };
    if let Some(addr) = prom_addr {
        info!("Prometheus exporter listening on http://{}", addr);
    }

    // --- Deploy Routes if MCP is disabled ---
    if config.routes.is_empty() && config.consumers.is_empty() {
        warn!("No routes or consumers configured. Waiting for configuration via Web UI.");
    } else {
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
    }

    info!("Bridge running. Waiting for signal.");

    tokio::select! {
        _ = tokio::signal::ctrl_c() => {
            info!("Ctrl+C (SIGINT) received.");
        },
        _ = platform_specific_shutdown() => {
                info!("Shutdown signal received.");
        },
    }

    info!("Shutdown signal received. Broadcasting to all tasks...");

    let shutdown_task = async {
        let routes = mq_bridge::list_routes();
        if !routes.is_empty() {
            info!("Attempting to gracefully stop {} routes...", routes.len());
            for name in routes {
                mq_bridge::stop_route(&name).await;
            }
        }
    };

    if tokio::time::timeout(Duration::from_secs(10), shutdown_task)
        .await
        .is_err()
    {
        warn!("Graceful shutdown timed out after 10 seconds. Forcing shutdown.");
    } else {
        info!("All routes stopped gracefully.");
    }

    // Abort the metrics task if it's running. It doesn't support graceful shutdown.
    if let Some(task) = metrics_task {
        task.abort();
    }

    if let Some(handle) = web_ui_handle {
        handle.abort();
    }

    info!("Shutdown complete.");

    Ok(())
}
fn init_logging(config: &AppConfig) {
    // --- 1. Initialize Logging ---
    // If the TOKIO_CONSOLE env var is set, initialize the console subscriber.
    // This is an exclusive choice, as the console subscriber is a logging layer.
    if std::env::var("TOKIO_CONSOLE").is_ok() {
        // console_subscriber::init();
        warn!("Tokio console subscriber not initialized. Cannot run `tokio-console` to connect.");
        return;
    }

    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(config.log_level.clone()));

    let logger = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_span_events(FmtSpan::CLOSE) // Log entry and exit of spans
        .with_target(true);
    match config.logger.as_str() {
        "json" => {
            logger.json().init();
        }
        "plain" => {
            logger.init();
        }
        _ => {
            logger.init();
        }
    }
    tracing::debug!(
        "Logging initialized with level {} and logger {}",
        config.log_level,
        config.logger
    );
}

/// Waits for a platform-specific shutdown signal.
/// On Unix, this is SIGTERM. On other platforms, it's a future that never completes.
async fn platform_specific_shutdown() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        match signal(SignalKind::terminate()) {
            Ok(mut stream) => {
                use tracing::info;

                stream.recv().await;
                info!("SIGTERM received.");
            }
            Err(e) => {
                warn!(
                    "Failed to install SIGTERM handler: {}. This signal will be ignored.",
                    e
                );
                // If we can't listen for the signal, pend forever.
                std::future::pending::<()>().await;
            }
        }
    }
    #[cfg(not(unix))]
    // On non-unix, ctrl_c is the primary mechanism. This future never completes.
    std::future::pending::<()>().await
}
