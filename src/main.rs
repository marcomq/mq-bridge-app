//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use clap::Parser;
use metrics_exporter_prometheus::PrometheusHandle;
use mq_bridge_app::config::{load_config, AppConfig};
use mq_bridge_app::web_ui;
use std::net::SocketAddr;
use tracing::{info, warn};
use tracing_subscriber::fmt::format::FmtSpan;
use tracing_subscriber::EnvFilter;

use anyhow::Context;

#[derive(Parser, Debug)]
#[command(version, about, long_about = None)]
struct Args {
    /// Path to configuration file
    #[arg(short, long)]
    config: Option<String>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();
    let mut config: AppConfig = load_config(args.config).context("Failed to load configuration")?;
    init_logging(&config);

    // --- Logic for default addresses ---
    // If there is no config (routes are empty), enable both on port 9090.
    // If there is a config, use the addr of the config (empty means deactivated).
    if config.routes.is_empty() {
        if config.ui_addr.is_empty() {
            config.ui_addr = "0.0.0.0:9090".to_string();
        }
        if config.metrics_addr.is_empty() {
            config.metrics_addr = "0.0.0.0:9090".to_string();
        }
    }

    // --- 2. Initialize Prometheus Metrics Exporter ---
    let mut prometheus_handle: Option<PrometheusHandle> = None;
    let metrics_task = if !config.metrics_addr.is_empty() {
        let builder = metrics_exporter_prometheus::PrometheusBuilder::new();

        // If metrics_addr and ui_addr are the same, we want metrics on /metrics via the Web UI.
        if config.metrics_addr == config.ui_addr {
            let recorder = builder
                .build_recorder();
            prometheus_handle = Some(recorder.handle());
            metrics::set_global_recorder(recorder)
                .context("Failed to install Prometheus recorder")?;
            info!(
                "Prometheus metrics enabled on Web UI (http://{}/metrics)",
                config.ui_addr
            );
            None
        } else {
            let addr: SocketAddr = config.metrics_addr.parse().context(format!(
                "Failed to parse metrics listen address: {}",
                config.metrics_addr
            ))?;
            let (recorder, server_future) = builder.with_http_listener(addr).build()?;
            metrics::set_global_recorder(recorder)
                .context("Failed to install Prometheus recorder")?;
            info!("Prometheus exporter listening on http://{}", addr);
            Some(tokio::spawn(server_future))
        }
    } else {
        None
    };

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
            r#"
      ┌────── mq-bridge-app ──────┐
──────┴───────────────────────────┴──────
      Web UI: http://{}:{}
"#,
            host, port
        );

        let web_ui_server =
            web_ui::start_web_server(addr.into(), config.clone(), prometheus_handle);
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
