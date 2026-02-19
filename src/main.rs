//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use mq_bridge_app::config::{load_config, AppConfig};
use mq_bridge_app::web_ui;
use std::net::SocketAddr;
use tracing::{info, warn};
use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::EnvFilter;

use anyhow::Context;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let mut config: AppConfig = load_config().context("Failed to load configuration")?;
    init_logging(&config);

    // --- 2. Initialize Prometheus Metrics Exporter ---
    // We manually spawn the metrics server to be able to control its lifecycle.
    // The `install()` method spawns a task that we can't shut down.
    let metrics_task = if !config.metrics_addr.is_empty() {
        let builder = metrics_exporter_prometheus::PrometheusBuilder::new();
        let addr: SocketAddr = config.metrics_addr.parse().context(format!(
            "Failed to parse metrics listen address: {}",
            config.metrics_addr
        ))?;
        let (recorder, server_future) = builder.with_http_listener(addr).build()?;
        metrics::set_global_recorder(recorder).context("Failed to install Prometheus recorder")?;
        info!("Prometheus exporter listening on http://{}", addr);
        Some(tokio::spawn(server_future))
    } else {
        None
    };

    // Start Web UI
    let web_ui_handle = if config.routes.is_empty() || !config.ui_addr.is_empty() {
        let addr = if config.ui_addr.is_empty() {
            "0.0.0.0:8080"
        } else {
            &config.ui_addr
        };
        let web_ui_server = web_ui::start_web_server(addr, config.clone())?;
        Some(tokio::spawn(web_ui_server))
    } else {
        None
    };

    if config.routes.is_empty() {
        warn!("No routes configured. Waiting for configuration via Web UI.");
    } else {
        let routes = std::mem::take(&mut config.routes);
        for (name, route) in routes {
            route.deploy(&name).await?;
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

    for name in mq_bridge::list_routes() {
        mq_bridge::stop_route(&name).await;
    }

    // Abort the metrics task if it's running. It doesn't support graceful shutdown.
    if let Some(task) = metrics_task {
        task.abort();
    }

    if let Some(handle) = web_ui_handle {
        handle.abort();
    }

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
        use tokio::signal::unix::{signal, SignalKind};
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
