//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use mq_bridge_app::{
    config::{AppConfig, load_config},
    mq_bridge,
    ui_app::mcp_status_ipc_url,
    web_ui,
};

use clap::{Parser, Subcommand};
use std::net::SocketAddr;
use std::time::Duration;
use tracing::{info, warn};
use tracing_subscriber::EnvFilter;
use tracing_subscriber::fmt::format::FmtSpan;

use anyhow::Context;

mod mcp;
mod mcp_install;

#[cfg(feature = "mimalloc")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

/// App-level default batch size for headless routes (`copy`, MCP) when the caller
/// does not specify one. The library's `RouteOptions::default()` stays at 1; this
/// is the batteries-included value the app applies on top.
pub(crate) const DEFAULT_BATCH_SIZE: usize = 1024;

/// App-level default route concurrency for headless routes (`copy`, MCP) when the
/// caller does not specify one. See [`DEFAULT_BATCH_SIZE`].
pub(crate) const DEFAULT_CONCURRENCY: usize = 4;

/// How often `copy --drain` checks whether the route task has ended. The engine
/// exposes completion as a poll, not a notification; see [`run_copy`].
const COPY_POLL_INTERVAL: Duration = Duration::from_millis(50);

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

    #[command(subcommand)]
    command: Option<Command>,
}

#[derive(Subcommand, Debug)]
enum Command {
    /// Copy data from one endpoint to another as a headless one-route job.
    ///
    /// With `--drain` the job exits once the source is empty; otherwise it runs
    /// as a continuous bridge until Ctrl-C. No web UI is started.
    Copy(CopyArgs),

    /// Run as an MCP (Model Context Protocol) server exposing the bridge as tools.
    ///
    /// A universal, protocol-agnostic message/data bridge driven from natural
    /// language: publish messages to any endpoint and run routes between any two
    /// endpoints, all supplied ad hoc as endpoint JSON. No web UI is started.
    Mcp(McpArgs),
}

#[derive(clap::Args, Debug)]
struct McpArgs {
    /// Transport: `stdio` (default, for local clients like Claude Desktop/Code) or
    /// `http` (streamable HTTP served over hyper).
    #[arg(long, default_value = "stdio")]
    transport: String,

    /// Bind address for `--transport http` (defaults to 127.0.0.1:9092).
    #[arg(long)]
    bind: Option<String>,

    /// Report running routes and publish targets to a local mq-bridge-app UI
    /// (web or desktop), so they show up alongside its configured consumers and
    /// publishers.
    ///
    /// Off by default: without this flag nothing about this server ever leaves the
    /// process. Only names, connector types, health and message counts are sent —
    /// never endpoint URLs or credentials. The UI is reached over a local IPC
    /// socket next to the config file, so a remote UI cannot be targeted.
    ///
    /// `install` bakes this flag into the registered command when set.
    #[arg(long, global = true)]
    report_to_ui: bool,

    /// Register/unregister this binary with local MCP clients instead of serving.
    #[command(subcommand)]
    action: Option<McpAction>,
}

#[derive(Subcommand, Debug)]
enum McpAction {
    /// Register this binary as a stdio MCP server with local MCP clients.
    ///
    /// Without `--client`, every client detected on this machine is configured.
    /// The absolute path of the running binary is what gets registered.
    Install {
        /// Client to configure (all detected clients if omitted).
        #[arg(long, value_enum)]
        client: Option<mcp_install::Client>,

        /// Register in the current project's config instead of the user's
        /// global one. Not supported by Claude Desktop.
        #[arg(long)]
        local: bool,

        /// Print the config snippet for a client we don't write directly,
        /// instead of installing anything.
        #[arg(long)]
        print_config: bool,
    },

    /// Remove this server from local MCP clients.
    Uninstall {
        /// Client to clean up (all detected clients if omitted).
        #[arg(long, value_enum)]
        client: Option<mcp_install::Client>,

        /// Remove the project-scoped registration instead of the global one.
        #[arg(long)]
        local: bool,
    },

    /// Show where this server is registered, and whether it still points here.
    Status {
        /// Inspect project-scoped configs instead of the global ones.
        #[arg(long)]
        local: bool,
    },
}

#[derive(clap::Args, Debug)]
struct CopyArgs {
    /// Source endpoint URI. The scheme selects the endpoint and query params set
    /// its config, e.g. `postgres://user:pass@host/db?table=src&sslmode=disable`,
    /// `nats://host:4222?subject=orders` or `file:///path/to/file?format=json`.
    ///
    /// Append `|`-separated middlewares to wrap the endpoint, applied in order:
    /// `...?table=src|retry?max_attempts=5|metrics`. Middleware params are that
    /// middleware's config fields. A literal `|` inside the URI must be written
    /// as `%7C`.
    #[arg(long)]
    from: String,

    /// Destination endpoint URI (same URI and middleware forms as `--from`), e.g.
    /// `postgres://user:pass@host/db?table=dst&insert_query=<url-encoded SQL>`.
    #[arg(long)]
    to: String,

    /// Exit once the source yields an empty batch (drain-then-exit). Without it,
    /// `copy` keeps running like a continuous bridge until Ctrl-C.
    #[arg(long)]
    drain: bool,

    /// Route concurrency (defaults to 4).
    #[arg(long)]
    concurrency: Option<usize>,

    /// Batch size (defaults to 1024).
    #[arg(long)]
    batch_size: Option<usize>,
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    // Initialize the default crypto provider for rustls (required for rustls 0.23.0+)
    // This allows mq-bridge to create TLS configurations for secure endpoints.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let args = Args::parse();

    match args.command {
        Some(Command::Copy(copy_args)) => {
            init_copy_logging();
            return run_copy(copy_args).await;
        }
        Some(Command::Mcp(mcp_args)) => {
            // The install actions configure clients and exit; only the bare
            // `mcp` command actually serves.
            match mcp_args.action {
                Some(McpAction::Install {
                    client,
                    local,
                    print_config,
                }) => {
                    return if print_config {
                        mcp_install::print_config(mcp_args.report_to_ui)
                    } else {
                        mcp_install::install(client, local, mcp_args.report_to_ui)
                    };
                }
                Some(McpAction::Uninstall { client, local }) => {
                    return mcp_install::uninstall(client, local);
                }
                Some(McpAction::Status { local }) => return mcp_install::status(local),
                None => {}
            }

            // stdio transport uses stdout as the MCP channel, so logs must go to stderr.
            init_mcp_logging();
            // Resolving the config is how the MCP finds the UI: both processes
            // derive the same status socket from the config file they were
            // pointed at. Strictly best-effort — a missing, unreadable or
            // invalid config just means no reporting, never a failure to start.
            let ui_status_ipc_url = if mcp_args.report_to_ui {
                match load_config(
                    args.config.clone(),
                    args.init_config.clone(),
                    args.init_config_str.clone(),
                    args.config_str.clone(),
                ) {
                    Ok((_, config_file_path)) => Some(mcp_status_ipc_url(&config_file_path)),
                    Err(e) => {
                        warn!(
                            "Could not read configuration ({e}); MCP status will not be reported"
                        );
                        None
                    }
                }
            } else {
                None
            };
            return mcp::run(
                mcp_args.transport,
                mcp_args.bind,
                mcp_args.report_to_ui,
                ui_status_ipc_url,
            )
            .await;
        }
        None => {}
    }

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
    if !has_persisted_config || config.consumers.is_empty() {
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

    // `metrics-exporter-prometheus` only drains its histogram buckets during
    // upkeep. The `build()` (http-listener) branch above spawns its own upkeep
    // task, but `build_recorder()` does not, so without this the per-message
    // `queue_message_processing_duration_seconds` samples recorded by mq-bridge
    // accumulate in an unbounded AtomicBucket and slowly leak memory. Drive
    // upkeep manually whenever we built the recorder without a listener.
    if metrics_task.is_none() {
        let upkeep_handle = prometheus_handle.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
            loop {
                interval.tick().await;
                upkeep_handle.run_upkeep();
            }
        });
    }

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

    if config.consumers.is_empty() {
        warn!("No consumers configured. Waiting for configuration via Web UI.");
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
/// Runs the `copy` subcommand: builds a single in-memory route from the `--from`
/// and `--to` URIs and awaits its completion. With `--drain` the underlying route
/// exits once the source is empty; otherwise it runs until Ctrl-C.
async fn run_copy(args: CopyArgs) -> anyhow::Result<()> {
    use mq_bridge::models::{Route, RouteOptions};

    let input = endpoint_from_uri(&args.from).context("invalid --from endpoint")?;
    let output = endpoint_from_uri(&args.to).context("invalid --to endpoint")?;

    let options = RouteOptions {
        concurrency: args.concurrency.unwrap_or(DEFAULT_CONCURRENCY),
        batch_size: args.batch_size.unwrap_or(DEFAULT_BATCH_SIZE),
        exit_on_empty: args.drain,
        ..Default::default()
    };

    let route = Route::new(input, output).with_options(options);
    let handle = route
        .run("copy")
        .await
        .context("failed to start copy route")?;

    info!(
        from = %args.from,
        to = %args.to,
        drain = args.drain,
        "copy route started"
    );

    if args.drain {
        // One-shot: run until the source is drained, or abort on Ctrl-C.
        //
        // The route task ends on a permanent error just as it does on a real drain, so
        // joining it alone cannot tell a succeeded batch job from a failed one — and
        // `join` consumes the handle, making the outcome unreadable afterwards. Poll
        // `outcome()` instead (the same completion signal `wait_route` uses) so a cron
        // or systemd-timer invocation gets a non-zero exit when nothing was copied.
        let outcome = tokio::select! {
            outcome = async {
                loop {
                    if let Some(outcome) = handle.outcome() {
                        break outcome;
                    }
                    tokio::time::sleep(COPY_POLL_INTERVAL).await;
                }
            } => Some(outcome),
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl+C received; aborting copy");
                None
            }
        };

        // Interrupted: shut the route down the same way the continuous branch does,
        // so the source connection and any checkpoint are released before we exit.
        if outcome.is_none() {
            handle.stop().await;
        }

        copy_result(outcome, handle.status().error)?;
    } else {
        // Continuous bridge: run until Ctrl-C, then stop gracefully.
        tokio::signal::ctrl_c()
            .await
            .context("failed to listen for Ctrl+C")?;
        info!("Ctrl+C received; stopping copy");
        handle.stop().await;
    }

    Ok(())
}

/// Maps a finished `copy --drain` route to the process result: a route killed by a
/// permanent error must not exit 0, or a cron/timer job reports success while having
/// copied nothing. `None` means Ctrl-C interrupted the wait.
fn copy_result(
    outcome: Option<mq_bridge::route::RouteOutcome>,
    error: Option<String>,
) -> anyhow::Result<()> {
    use mq_bridge::route::RouteOutcome;

    match outcome {
        Some(RouteOutcome::Failed) => {
            let cause = error.unwrap_or_else(|| "no error reported".to_string());
            anyhow::bail!("copy failed: {cause}");
        }
        Some(RouteOutcome::Stopped) => info!("copy stopped before the source drained"),
        Some(RouteOutcome::Completed) => info!("copy completed; source drained"),
        None => {}
    }
    Ok(())
}

/// Maps an endpoint URI to an mq-bridge [`Endpoint`]: the scheme
/// selects the endpoint, and `?param=a&next=b` query parameters set its config.
///
/// Query keys that match a *scalar* field of the target endpoint's config struct
/// become endpoint config (e.g. `table`, `insert_query`, `subject`,
/// `delete_after_read`); any other query params — including ones whose name
/// matches an object-typed config field like `tls` — stay on the connection URL,
/// so driver options such as `sslmode`, `replicaSet` or `tls=true` pass through
/// unchanged. `file` URIs map the path to the `path` field. For `nats`, the
/// dominant target field `subject` may also be given as the URL path
/// (`nats://host:4222/orders`) as an alternative to `?subject=orders` (the query
/// form wins if both are present); redis is excluded because a redis URL path is
/// the database number, not the stream.
///
/// MongoDB defaults to a non-destructive source here: when neither `consume` nor
/// the deprecated `change_stream` is given, `consume` is set to `capture_all`
/// (read existing documents, then watch) rather than the library's destructive
/// queue-drain `consumer` default. Pass `?consume=consumer` to opt back in.
///
/// Escaped mode: pass the full connection string percent-encoded as `?url=...`
/// to use it verbatim (e.g. `mongodb://_/?url=<encoded>&collection=orders`); its
/// own `?a=b` options are then never re-interpreted as config, which is the
/// escape hatch for any driver option that collides with a config field name.
/// Parses a `--from`/`--to` value into an endpoint, including any middlewares.
///
/// The value is the endpoint URI optionally followed by `|`-separated middleware
/// specs, applied in the order written:
/// `postgres://host/db?table=src|retry?max_attempts=5|metrics`.
/// A literal `|` inside the URI itself (e.g. in a password) must be written
/// percent-encoded as `%7C`.
fn endpoint_from_uri(uri: &str) -> anyhow::Result<mq_bridge::models::Endpoint> {
    let mut parts = uri.split('|');
    let base = parts.next().unwrap_or(uri);
    let mut endpoint = base_endpoint_from_uri(base)?;
    for spec in parts {
        endpoint.middlewares.push(
            middleware_from_spec(spec)
                .with_context(|| format!("invalid middleware '{spec}' in '{uri}'"))?,
        );
    }
    Ok(endpoint)
}

/// Builds a middleware from a `name` / `name?param=value&...` spec. Params are
/// the middleware config struct's own fields, coerced to the type the field
/// expects; `dlq`'s `endpoint` is itself an endpoint URI, and object/array
/// fields (e.g. `weak_join`'s `required`) take a JSON literal.
fn middleware_from_spec(spec: &str) -> anyhow::Result<mq_bridge::models::Middleware> {
    use anyhow::bail;
    use mq_bridge::models::{
        BufferMiddleware, CompressionMiddleware, CookieJarMiddleware, DeadLetterQueueMiddleware,
        DeduplicationMiddleware, DelayMiddleware, EncryptionConfig, LimiterMiddleware,
        MetricsMiddleware, RandomPanicMiddleware, RetryMiddleware, TransformMiddleware,
        WeakJoinMiddleware,
    };
    use std::collections::HashMap;

    let (name, query) = match spec.split_once('?') {
        Some((name, query)) => (name.trim(), query),
        None => (spec.trim(), ""),
    };
    // An underscore is awkward to type in a shell-quoted URI, so `-` is accepted
    // as well (`weak-join` == `weak_join`).
    let tag = name.replace('-', "_");

    let fields: HashMap<String, FieldType> = match tag.as_str() {
        "deduplication" => schema_fields(schemars::schema_for!(DeduplicationMiddleware)),
        "metrics" => schema_fields(schemars::schema_for!(MetricsMiddleware)),
        "dlq" => schema_fields(schemars::schema_for!(DeadLetterQueueMiddleware)),
        "retry" => schema_fields(schemars::schema_for!(RetryMiddleware)),
        "random_panic" => schema_fields(schemars::schema_for!(RandomPanicMiddleware)),
        "delay" => schema_fields(schemars::schema_for!(DelayMiddleware)),
        "weak_join" => schema_fields(schemars::schema_for!(WeakJoinMiddleware)),
        "limiter" => schema_fields(schemars::schema_for!(LimiterMiddleware)),
        "buffer" => schema_fields(schemars::schema_for!(BufferMiddleware)),
        "cookie_jar" => schema_fields(schemars::schema_for!(CookieJarMiddleware)),
        "transform" => schema_fields(schemars::schema_for!(TransformMiddleware)),
        "encryption" => schema_fields(schemars::schema_for!(EncryptionConfig)),
        "compression" => schema_fields(schemars::schema_for!(CompressionMiddleware)),
        // The escape hatch for a handler-provided middleware: `name` selects it,
        // `config` carries its free-form JSON.
        "custom" => HashMap::from([
            ("name".to_string(), FieldType::StringLike),
            ("config".to_string(), FieldType::Object),
        ]),
        other => bail!(
            "unsupported middleware '{other}'. Supported middlewares: deduplication, metrics, dlq, retry, random_panic, delay, weak_join, limiter, buffer, cookie_jar, transform, encryption, compression, custom"
        ),
    };

    let mut config = serde_json::Map::new();
    for (k, v) in url::form_urlencoded::parse(query.as_bytes()) {
        let (k, v) = (k.into_owned(), v.into_owned());
        let value = if tag == "dlq" && k == "endpoint" {
            let endpoint =
                endpoint_from_uri(&v).with_context(|| format!("invalid dlq endpoint '{v}'"))?;
            serde_json::to_value(endpoint)?
        } else {
            match fields.get(&k).copied() {
                // A known object/array field must be a JSON literal; a value that
                // doesn't parse is a user error worth naming, the same way
                // `base_endpoint_from_uri` handles its object fields, rather than
                // a silent fallback to a string that serde rejects later.
                Some(FieldType::Object) => serde_json::from_str(&v).with_context(|| {
                    format!(
                        "query param '{k}' in middleware spec '{spec}' expects a JSON literal, got '{v}'"
                    )
                })?,
                // An unknown field (`None`) is passed through for serde to reject
                // by name.
                None => serde_json::from_str(&v).unwrap_or(serde_json::Value::String(v)),
                Some(ty) => coerce_scalar(v, ty),
            }
        };
        config.insert(k, value);
    }

    let mut tagged = serde_json::Map::new();
    tagged.insert(tag.clone(), serde_json::Value::Object(config));
    serde_json::from_value(serde_json::Value::Object(tagged))
        .with_context(|| format!("could not build a '{tag}' middleware from '{spec}'"))
}

fn base_endpoint_from_uri(uri: &str) -> anyhow::Result<mq_bridge::models::Endpoint> {
    use anyhow::bail;
    use mq_bridge::models::{
        AmqpConfig, AwsConfig, ClickHouseConfig, Endpoint, EndpointType, FileConfig, GrpcConfig,
        HttpConfig, IbmMqConfig, KafkaConfig, MongoDbConfig, MqttConfig, NatsConfig,
        ObjectStoreConfig, PostgresCdcConfig, RedisStreamsConfig, SqlxConfig, WebSocketConfig,
        ZeroMqConfig,
    };
    use std::collections::HashMap;
    use url::Url;

    let parsed = Url::parse(uri).with_context(|| format!("not a valid URI: {uri}"))?;

    // Endpoints without a connection URL are built directly — they don't fit the
    // scalar-field-routing path below (which always attaches a `url`).
    match parsed.scheme() {
        // A sink that discards everything. `null:` (any trailing content ignored).
        "null" => return Ok(Endpoint::new(EndpointType::Null)),
        // A source that endlessly produces a fixed message (config-only load
        // generator) or a sink. Body from `?body=`, or read a file with
        // `?body_file=`. `raw=true` sends the body verbatim (no JSON re-encode) —
        // use it so a generated JSON row is the payload as-is. Any other query
        // param becomes message metadata.
        "static" => {
            let mut body: Option<String> = None;
            let mut raw = false;
            let mut metadata: HashMap<String, String> = HashMap::new();
            for (k, v) in parsed.query_pairs() {
                match k.as_ref() {
                    "body" => body = Some(v.into_owned()),
                    "body_file" => {
                        body =
                            Some(std::fs::read_to_string(v.as_ref()).with_context(|| {
                                format!("failed to read static body_file '{}'", v)
                            })?);
                    }
                    "raw" => raw = v == "true",
                    _ => {
                        metadata.insert(k.into_owned(), v.into_owned());
                    }
                }
            }
            let mut cfg = serde_json::Map::new();
            cfg.insert(
                "body".into(),
                serde_json::Value::String(body.unwrap_or_default()),
            );
            cfg.insert("raw".into(), serde_json::Value::Bool(raw));
            cfg.insert("metadata".into(), serde_json::to_value(metadata)?);
            let mut tagged = serde_json::Map::new();
            tagged.insert("static".into(), serde_json::Value::Object(cfg));
            let endpoint_type: EndpointType =
                serde_json::from_value(serde_json::Value::Object(tagged)).with_context(|| {
                    format!("could not build a 'static' endpoint from URI '{uri}'")
                })?;
            return Ok(Endpoint::new(endpoint_type));
        }
        // In-process channel. Topic is the host (+path): `memory://my-topic`.
        // `?capacity=`, `?subscribe_mode=` are recognised; other params ignored.
        "memory" => {
            let host = parsed.host_str().unwrap_or("");
            let path = parsed.path().trim_matches('/');
            let topic = if path.is_empty() {
                host.to_string()
            } else if host.is_empty() {
                path.to_string()
            } else {
                format!("{host}/{path}")
            };
            if topic.is_empty() {
                anyhow::bail!("memory URI '{uri}' must include a topic, e.g. memory://my-topic");
            }
            let mut cfg = serde_json::Map::new();
            cfg.insert("topic".into(), serde_json::Value::String(topic));
            for (k, v) in parsed.query_pairs() {
                match k.as_ref() {
                    "capacity" => {
                        if let Ok(n) = v.parse::<u64>() {
                            cfg.insert("capacity".into(), serde_json::Value::from(n));
                        }
                    }
                    "subscribe_mode" => {
                        cfg.insert(
                            "subscribe_mode".into(),
                            serde_json::Value::Bool(v == "true"),
                        );
                    }
                    // An in-process channel has no connection URL to carry driver
                    // options, so anything else would just be discarded.
                    other => anyhow::bail!(
                        "unrecognised query param '{other}' in memory URI '{uri}': only 'capacity' and 'subscribe_mode' are supported"
                    ),
                }
            }
            let mut tagged = serde_json::Map::new();
            tagged.insert("memory".into(), serde_json::Value::Object(cfg));
            let endpoint_type: EndpointType =
                serde_json::from_value(serde_json::Value::Object(tagged)).with_context(|| {
                    format!("could not build a 'memory' endpoint from URI '{uri}'")
                })?;
            return Ok(Endpoint::new(endpoint_type));
        }
        _ => {}
    }

    // scheme -> (EndpointType tag, recognised config fields with their types).
    let (tag, fields): (&str, HashMap<String, FieldType>) = match parsed.scheme() {
        "postgres" | "postgresql" | "mysql" | "mariadb" | "sqlite" => {
            ("sqlx", schema_fields(schemars::schema_for!(SqlxConfig)))
        }
        // Logical-replication CDC source. The connection URL is rebuilt with a
        // plain `postgres` scheme; `publication`, `slot_name`, etc. are scalar
        // config fields set via query params. (An underscore is not a legal URI
        // scheme character, so the scheme is spelled `postgres-cdc`/`pgcdc`.)
        "postgres-cdc" | "pgcdc" => (
            "postgres_cdc",
            schema_fields(schemars::schema_for!(PostgresCdcConfig)),
        ),
        "nats" => ("nats", schema_fields(schemars::schema_for!(NatsConfig))),
        "mongodb" => (
            "mongodb",
            schema_fields(schemars::schema_for!(MongoDbConfig)),
        ),
        "redis" | "rediss" | "redis_streams" => (
            "redis",
            schema_fields(schemars::schema_for!(RedisStreamsConfig)),
        ),
        "file" => ("file", schema_fields(schemars::schema_for!(FileConfig))),
        // Cloud object storage. The bucket scheme both selects the endpoint and is
        // the connection URL the `object_store` crate expects, so it is not
        // rewritten below; credentials come from the environment.
        "s3" | "s3a" | "gs" | "gcs" | "az" | "azure" | "abfs" | "abfss" => (
            "object_store",
            schema_fields(schemars::schema_for!(ObjectStoreConfig)),
        ),
        "kafka" => ("kafka", schema_fields(schemars::schema_for!(KafkaConfig))),
        "mqtt" | "mqtts" => ("mqtt", schema_fields(schemars::schema_for!(MqttConfig))),
        // AMQP is RabbitMQ's wire protocol; both scheme spellings are accepted.
        "amqp" | "amqps" | "rabbitmq" | "rabbitmqs" => {
            ("amqp", schema_fields(schemars::schema_for!(AmqpConfig)))
        }
        "http" | "https" => ("http", schema_fields(schemars::schema_for!(HttpConfig))),
        // ClickHouse is accessed over its HTTP interface; the `clickhouse(s)`
        // scheme here just picks the endpoint kind and is rewritten to
        // `http(s)://` below.
        "clickhouse" | "clickhouses" => (
            "clickhouse",
            schema_fields(schemars::schema_for!(ClickHouseConfig)),
        ),
        "ws" | "wss" => (
            "websocket",
            schema_fields(schemars::schema_for!(WebSocketConfig)),
        ),
        // `grpc(s)` only selects the endpoint kind and is rewritten to
        // `http(s)://` below, matching the client-mode URL GrpcConfig expects.
        "grpc" | "grpcs" => ("grpc", schema_fields(schemars::schema_for!(GrpcConfig))),
        "ibmmq" | "ibm-mq" => ("ibmmq", schema_fields(schemars::schema_for!(IbmMqConfig))),
        // AWS SQS/SNS has no single connection URL: `queue_url`/`topic_arn` are
        // scalar config fields set via query params, so the URI's own
        // authority is just a placeholder (e.g. `aws://_/?queue_url=...`).
        "aws" | "aws-sqs" => ("aws", schema_fields(schemars::schema_for!(AwsConfig))),
        "zeromq" | "zmq" => ("zeromq", schema_fields(schemars::schema_for!(ZeroMqConfig))),
        other => bail!(
            "unsupported endpoint scheme '{other}' in URI '{uri}'. Supported schemes: postgres, postgresql, mysql, mariadb, sqlite, nats, mongodb, redis, file, kafka, mqtt, mqtts, amqp, amqps, rabbitmq, rabbitmqs, http, https, clickhouse, clickhouses, ws, wss, grpc, grpcs, ibmmq, aws, zeromq, zmq, s3, gs, az, abfs"
        ),
    };

    // Split query params: recognised scalar config fields become endpoint config,
    // everything else is kept on the connection URL (driver params) — but only
    // where such a param can actually take effect, see `driver_options`.
    let mut config = serde_json::Map::new();
    let mut driver_params: Vec<(String, String)> = Vec::new();
    // Escaped mode: `?url=<percent-encoded connection string>` supplies the exact
    // connection URL verbatim, so its own `?a=b` options are never re-interpreted
    // as config fields. Use it when a driver option would otherwise collide.
    let mut escaped_url: Option<String> = None;
    // Whether an unrecognised param can ride along on the connection URL as a
    // driver option. True only for endpoints whose URL really is a query-bearing
    // connection string. The rest either have no URL at all (`file` has a path,
    // `aws` has ARNs) or a connection string that is not a URI — kafka's bare
    // `host:port` list, ibmmq's `host(port)`, the mqtt/nats/zeromq/grpc endpoint
    // addresses — where appending `?k=v` corrupts it rather than configuring
    // anything. There, an unrecognised param is a user error, not an option.
    let driver_options = matches!(
        tag,
        "sqlx"
            | "postgres_cdc"
            | "mongodb"
            | "redis"
            | "amqp"
            | "http"
            | "clickhouse"
            | "websocket"
    );
    for (k, v) in parsed.query_pairs() {
        let (k, v) = (k.into_owned(), v.into_owned());
        // A file endpoint takes its path from the URI itself, so a `?path=` would
        // be a second, conflicting source for the same field.
        if k == "path" && tag == "file" {
            continue;
        }
        if k == "url" && tag != "file" {
            escaped_url = Some(v);
            continue;
        }
        match fields.get(&k).copied() {
            // An object/array field (e.g. `encryption`, `tls`, kafka's
            // `producer_options`) can't be populated from a scalar, so its value is
            // read as a JSON literal, as the middleware spec syntax already does.
            // Where driver options exist the same name is also a plausible option
            // (`?tls=true`), so only an actual `{`/`[` literal is taken as config.
            Some(FieldType::Object) if !driver_options || is_json_literal(&v) => {
                let value: serde_json::Value = serde_json::from_str(&v).with_context(|| {
                    format!("query param '{k}' in URI '{uri}' expects a JSON literal, got '{v}'")
                })?;
                config.insert(k, value);
            }
            Some(FieldType::Object) | None if driver_options => driver_params.push((k, v)),
            None => bail!(
                "unrecognised query param '{k}' in URI '{uri}': a '{tag}' endpoint has no connection-URL driver options, so '{k}' would have no effect"
            ),
            Some(ty) => {
                config.insert(k, coerce_scalar(v, ty));
            }
        }
    }

    // Non-destructive default for MongoDB sources: the library defaults `consume`
    // to the queue-drain `consumer` mode, which claims and *deletes* source
    // documents. For the CLI/UI we default to `capture_all` (read existing docs,
    // then watch) so pointing at an existing collection never mutates it. Only
    // applied when the user gave neither `consume` nor the deprecated
    // `change_stream`, so any explicit choice still wins.
    if tag == "mongodb" && !config.contains_key("consume") && !config.contains_key("change_stream")
    {
        config.insert(
            "consume".into(),
            serde_json::Value::String("capture_all".into()),
        );
    }

    if tag == "file" {
        let path = uri.split('?').next().unwrap_or(uri);
        let path = path.strip_prefix("file://").unwrap_or(path);
        if path.is_empty() {
            bail!("file URI '{uri}' must include a path");
        }
        config.insert("path".into(), serde_json::Value::String(path.to_string()));
    } else if let Some(url) = escaped_url {
        // Escaped mode: the connection string is authoritative and complete, so
        // any leftover non-config param is ambiguous — it belongs inside `url=`.
        if let Some((k, _)) = driver_params.first() {
            bail!(
                "in escaped mode (url=...), put driver options inside the encoded connection string; unexpected query param '{k}' in URI '{uri}'"
            );
        }
        config.insert("url".into(), serde_json::Value::String(url));
    } else {
        // For endpoints with a single dominant "target" field, also accept it as
        // the URL path (e.g. `nats://host:4222/orders`), matching the UI's short
        // display convention, alongside the query-param form (`?subject=orders`).
        // Only for `nats`: a redis URL path is the database number, not the stream.
        let path_field = match tag {
            "nats" => Some("subject"),
            _ => None,
        };
        let mut base = parsed.clone();
        if let Some(field) = path_field {
            let path = base.path().trim_matches('/');
            if !path.is_empty() && !config.contains_key(field) {
                config.insert(field.into(), serde_json::Value::String(path.to_string()));
            }
            base.set_path("");
        }
        // Connection URL = base URI plus any leftover (driver) params.
        base.set_fragment(None);
        base.set_query(None);
        if !driver_params.is_empty() {
            let mut qs = base.query_pairs_mut();
            for (k, v) in &driver_params {
                qs.append_pair(k, v);
            }
        }
        // The postgres_cdc endpoint takes a plain `postgres://` connection URL;
        // the `postgres_cdc`/`pgcdc` scheme only selects the endpoint kind.
        let mut url = base.to_string();
        if tag == "postgres_cdc" {
            for prefix in ["postgres-cdc://", "pgcdc://"] {
                if let Some(rest) = url.strip_prefix(prefix) {
                    url = format!("postgres://{rest}");
                    break;
                }
            }
        }
        // A few schemes exist only to pick the endpoint kind from the CLI and
        // are rewritten to the connection scheme the underlying driver expects.
        let rewrites: &[(&str, &str)] = match tag {
            // rdkafka's bootstrap.servers is a bare host:port list, no scheme.
            "kafka" => &[("kafka://", "")],
            "mqtt" => &[("mqtts://", "ssl://"), ("mqtt://", "tcp://")],
            "amqp" => &[("rabbitmqs://", "amqps://"), ("rabbitmq://", "amqp://")],
            "clickhouse" => &[("clickhouses://", "https://"), ("clickhouse://", "http://")],
            "grpc" => &[("grpcs://", "https://"), ("grpc://", "http://")],
            "zeromq" => &[("zeromq://", "tcp://"), ("zmq://", "tcp://")],
            // `object_store` only recognizes `gs://` for GCS, not the `gcs://` alias.
            "object_store" => &[("gcs://", "gs://")],
            _ => &[],
        };
        for (prefix, replacement) in rewrites {
            if let Some(rest) = url.strip_prefix(prefix) {
                url = format!("{replacement}{rest}");
                break;
            }
        }
        if tag == "kafka" {
            url = url.trim_end_matches('/').to_string();
        }
        // IBM MQ's driver expects `host(port)` (with comma-separated hosts for
        // failover), not a URI authority, so `host:port` is reformatted here.
        if tag == "ibmmq"
            && let Some(rest) = url.strip_prefix("ibmmq://")
        {
            let rest = rest.trim_end_matches('/');
            url = match rest.rsplit_once(':') {
                Some((host, port)) => format!("{host}({port})"),
                None => rest.to_string(),
            };
        }
        // AwsConfig has no `url` field (`queue_url`/`topic_arn` carry the
        // connection info as scalar config fields), so the placeholder
        // authority is discarded rather than attached as an unknown field.
        if tag != "aws" {
            config.insert("url".into(), serde_json::Value::String(url));
        }
    }

    let mut tagged = serde_json::Map::new();
    tagged.insert(tag.to_string(), serde_json::Value::Object(config));
    let endpoint_type: EndpointType = serde_json::from_value(serde_json::Value::Object(tagged))
        .with_context(|| format!("could not build a '{tag}' endpoint from URI '{uri}'"))?;
    Ok(Endpoint::new(endpoint_type))
}

/// The JSON scalar type a config field expects, used to coerce string query
/// params into the right type without guessing from the value's shape.
#[derive(Clone, Copy)]
enum FieldType {
    Bool,
    Integer,
    Number,
    /// An object or array field (e.g. a nested config struct): it cannot be set
    /// from a scalar query param, so such params are routed to driver options.
    Object,
    /// Strings, enums, and anything else scalar — kept as a JSON string.
    StringLike,
}

/// Maps a config struct's serde field names to their expected scalar type, so
/// query params can be routed (recognised field vs driver param) and coerced
/// correctly. Walks the JSON schema following `$ref`, `allOf`, `anyOf` and
/// `oneOf`, so fields introduced via `#[serde(flatten)]` (e.g. an internally
/// tagged enum) are recognised too, not just top-level `properties`.
fn schema_fields(schema: schemars::Schema) -> std::collections::HashMap<String, FieldType> {
    let mut out = std::collections::HashMap::new();
    if let Ok(root) = serde_json::to_value(&schema) {
        let mut visited = std::collections::HashSet::new();
        collect_props(&root, &root, &mut out, &mut visited);
    }
    out
}

/// Recursively collects `(field name, type)` pairs from `node` into `out`,
/// resolving local `$ref`s against `root` and descending schema combinators.
fn collect_props(
    root: &serde_json::Value,
    node: &serde_json::Value,
    out: &mut std::collections::HashMap<String, FieldType>,
    visited: &mut std::collections::HashSet<String>,
) {
    let Some(obj) = node.as_object() else { return };

    if let Some(reference) = obj.get("$ref").and_then(|r| r.as_str()) {
        if visited.insert(reference.to_string())
            && let Some(target) = resolve_ref(root, reference)
        {
            collect_props(root, target, out, visited);
        }
        return;
    }

    if let Some(props) = obj.get("properties").and_then(|p| p.as_object()) {
        for (name, sub) in props {
            out.entry(name.clone())
                .or_insert_with(|| field_type(root, sub));
        }
    }

    for key in ["allOf", "anyOf", "oneOf"] {
        if let Some(arr) = obj.get(key).and_then(|a| a.as_array()) {
            for sub in arr {
                collect_props(root, sub, out, visited);
            }
        }
    }
}

/// Resolves a local JSON-schema `$ref` (`#/$defs/Name` or `#/definitions/Name`)
/// to its target subschema within `root`.
fn resolve_ref<'a>(root: &'a serde_json::Value, reference: &str) -> Option<&'a serde_json::Value> {
    let name = reference.rsplit('/').next()?;
    ["$defs", "definitions"]
        .iter()
        .find_map(|defs| root.get(defs).and_then(|d| d.get(name)))
}

/// Determines the scalar [`FieldType`] of a property subschema. Handles a direct
/// `type`, an `Option<T>` (`{"type":["integer","null"]}` or an `anyOf`/`oneOf`
/// with a null member), and a `$ref` to a scalar def; anything else is treated
/// as string-like (enums deserialize from a string, so no coercion is needed).
fn field_type(root: &serde_json::Value, sub: &serde_json::Value) -> FieldType {
    if let Some(reference) = sub.get("$ref").and_then(|r| r.as_str())
        && let Some(target) = resolve_ref(root, reference)
    {
        return field_type(root, target);
    }
    let has = |t: &str| match sub.get("type") {
        Some(serde_json::Value::String(s)) => s == t,
        Some(serde_json::Value::Array(a)) => a.iter().any(|x| x.as_str() == Some(t)),
        _ => false,
    };
    if has("boolean") {
        return FieldType::Bool;
    }
    if has("integer") {
        return FieldType::Integer;
    }
    if has("number") {
        return FieldType::Number;
    }
    if has("object") || has("array") {
        return FieldType::Object;
    }
    // Option<scalar> is often modelled as anyOf/oneOf of the scalar and null.
    for key in ["anyOf", "oneOf"] {
        if let Some(arr) = sub.get(key).and_then(|a| a.as_array()) {
            for member in arr {
                match field_type(root, member) {
                    FieldType::StringLike => {}
                    ty => return ty,
                }
            }
        }
    }
    FieldType::StringLike
}

/// Whether a query-param value is written as a JSON object or array literal.
/// Used to tell a nested-config value (`?tls={"ca_file":"/x"}`) from a driver
/// option that happens to share the field's name (`?tls=true`) on endpoints
/// whose connection URL carries both.
fn is_json_literal(v: &str) -> bool {
    let v = v.trim_start();
    v.starts_with('{') || v.starts_with('[')
}

/// Coerces a query-param string into the JSON scalar its target field expects.
/// Only bool/number *fields* trigger bool/number coercion, so a string field
/// keeps values like `2024` or `true` verbatim; a value that fails to parse for
/// a numeric field falls back to a string so serde reports a clear type error.
fn coerce_scalar(s: String, ty: FieldType) -> serde_json::Value {
    match ty {
        FieldType::Bool => match s.as_str() {
            "true" => serde_json::Value::Bool(true),
            "false" => serde_json::Value::Bool(false),
            _ => serde_json::Value::String(s),
        },
        FieldType::Integer => match s.parse::<i64>() {
            Ok(i) => serde_json::Value::from(i),
            Err(_) => serde_json::Value::String(s),
        },
        FieldType::Number => match s.parse::<f64>() {
            Ok(f) => serde_json::Value::from(f),
            Err(_) => serde_json::Value::String(s),
        },
        // Object/array fields are routed to driver params before reaching here;
        // keep the raw string as a defensive fallback.
        FieldType::StringLike | FieldType::Object => serde_json::Value::String(s),
    }
}

/// Minimal logging setup for the headless `copy` subcommand (no AppConfig).
fn init_copy_logging() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .try_init();
}

/// Logging for the `mcp` subcommand. Writes to **stderr** because the `stdio`
/// transport uses stdout as the MCP (JSON-RPC) channel — logging there would
/// corrupt the protocol stream.
fn init_mcp_logging() {
    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(env_filter)
        .with_target(false)
        .with_writer(std::io::stderr)
        .try_init();
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

#[cfg(test)]
mod copy_result_tests {
    use super::copy_result;
    use super::mq_bridge::route::RouteOutcome;

    /// A route killed by a permanent error ends its task exactly like a real drain
    /// does, so `copy --drain` used to exit 0 and log "source drained" after copying
    /// nothing — silent success for a cron job. The cause must reach the exit status.
    #[test]
    fn failed_outcome_is_an_error_carrying_the_cause() {
        let err = copy_result(
            Some(RouteOutcome::Failed),
            Some("Any driver does not support MySql type Timestamp".to_string()),
        )
        .expect_err("a failed route must not report success");
        assert!(
            err.to_string()
                .contains("Any driver does not support MySql type Timestamp"),
            "the permanent error must be surfaced, got: {err}"
        );
    }

    #[test]
    fn failed_outcome_without_a_recorded_error_still_fails() {
        assert!(copy_result(Some(RouteOutcome::Failed), None).is_err());
    }

    #[test]
    fn drained_and_stopped_and_interrupted_succeed() {
        assert!(copy_result(Some(RouteOutcome::Completed), None).is_ok());
        assert!(copy_result(Some(RouteOutcome::Stopped), None).is_ok());
        // Ctrl-C before the route finished.
        assert!(copy_result(None, None).is_ok());
    }
}

#[cfg(test)]
mod uri_tests {
    use super::endpoint_from_uri;

    fn config(uri: &str, tag: &str) -> serde_json::Value {
        let ep = endpoint_from_uri(uri).expect("uri should parse");
        serde_json::to_value(&ep).unwrap()[tag].clone()
    }

    // A driver option whose name matches an object-typed config field (`tls` is a
    // TlsConfig struct) must stay on the connection URL, not be hijacked as config.
    #[test]
    fn mongodb_tls_option_stays_on_url() {
        let cfg = config("mongodb://host:27017/?tls=true&database=appdb", "mongodb");
        assert_eq!(cfg["url"], "mongodb://host:27017/?tls=true");
        assert_eq!(cfg["database"], "appdb");
    }

    // A recognised scalar field becomes config; an unrecognised param is a driver
    // option and passes through on the URL unchanged.
    #[test]
    fn mongodb_scalar_field_vs_driver_param() {
        let cfg = config(
            "mongodb://host/?collection=orders&database=appdb&replicaSet=rs0",
            "mongodb",
        );
        assert_eq!(cfg["collection"], "orders");
        assert_eq!(cfg["url"], "mongodb://host/?replicaSet=rs0");
    }

    // MongoDB sources are non-destructive by default in the CLI: `consume` is set
    // to `capture_all` when the user gives neither `consume` nor `change_stream`,
    // so pointing at an existing collection never claims/deletes its documents.
    #[test]
    fn mongodb_defaults_to_non_destructive_capture_all() {
        let cfg = config(
            "mongodb://host/?collection=orders&database=appdb",
            "mongodb",
        );
        assert_eq!(cfg["consume"], "capture_all");
    }

    // An explicit `consume` (or the deprecated `change_stream`) always wins over
    // the non-destructive default.
    #[test]
    fn mongodb_explicit_consume_wins_over_default() {
        let cfg = config(
            "mongodb://host/?collection=orders&database=appdb&consume=consumer",
            "mongodb",
        );
        assert_eq!(cfg["consume"], "consumer");

        let cfg = config(
            "mongodb://host/?collection=orders&database=appdb&change_stream=true",
            "mongodb",
        );
        assert!(cfg["consume"].is_null());
        assert_eq!(cfg["change_stream"], true);
    }

    // A redis URL path is the database number, not the stream, so it must remain on
    // the connection URL.
    #[test]
    fn redis_path_is_database_not_stream() {
        let cfg = config("redis://host:6379/0", "redis_streams");
        assert_eq!(cfg["url"], "redis://host:6379/0");
        assert!(cfg["stream"].is_null());
    }

    // Escaped mode: `?url=<encoded>` is used verbatim (its own options are never
    // re-interpreted), while sibling params still set config fields.
    #[test]
    fn escaped_url_is_verbatim() {
        let inner = "mongodb://u:p@host/db?tls=true&replicaSet=rs0";
        let mut outer = url::Url::parse("mongodb://_/").unwrap();
        outer
            .query_pairs_mut()
            .append_pair("url", inner)
            .append_pair("collection", "orders")
            .append_pair("database", "appdb");
        let cfg = config(outer.as_str(), "mongodb");
        assert_eq!(cfg["url"], inner);
        assert_eq!(cfg["collection"], "orders");
    }

    // `null:` builds the discard sink regardless of trailing content. A flattened
    // unit `Null` variant serializes as a `null` key with a null value.
    #[test]
    fn null_scheme_builds_null_endpoint() {
        let ep = endpoint_from_uri("null:").expect("uri should parse");
        let v = serde_json::to_value(&ep).unwrap();
        assert!(v.get("null").is_some(), "expected a null endpoint, got {v}");
    }

    // `static:` carries its payload in `?body=`; `raw=true` sends it verbatim.
    #[test]
    fn static_scheme_body_and_raw() {
        let cfg = config("static:?body=hello&raw=true", "static");
        assert_eq!(cfg["body"], "hello");
        assert_eq!(cfg["raw"], true);
    }

    // `memory://topic` maps the host to the channel topic.
    #[test]
    fn memory_scheme_topic_from_host() {
        let cfg = config("memory://my-topic?capacity=1000", "memory");
        assert_eq!(cfg["topic"], "my-topic");
        assert_eq!(cfg["capacity"], 1000);
    }

    // `postgres_cdc://` selects the CDC endpoint; the connection URL is rebuilt
    // with a plain `postgres` scheme, and `publication` is a scalar config field.
    #[test]
    fn postgres_cdc_scheme_rewrites_url_and_takes_publication() {
        let cfg = config(
            "postgres-cdc://u:p@host:5432/db?publication=mqb_pub&slot_name=mqb_slot",
            "postgres_cdc",
        );
        assert_eq!(cfg["url"], "postgres://u:p@host:5432/db");
        assert_eq!(cfg["publication"], "mqb_pub");
        assert_eq!(cfg["slot_name"], "mqb_slot");
    }

    // In escaped mode the connection string is complete, so a stray driver-style
    // param is rejected rather than silently dropped.
    #[test]
    fn escaped_url_rejects_stray_param() {
        let mut outer = url::Url::parse("mongodb://_/").unwrap();
        outer
            .query_pairs_mut()
            .append_pair("url", "mongodb://host/db")
            .append_pair("database", "appdb")
            .append_pair("bogus", "x");
        let err = endpoint_from_uri(outer.as_str()).unwrap_err();
        assert!(err.to_string().contains("escaped mode"), "got: {err}");
    }

    // A file endpoint has no driver options, so an object-typed field such as
    // `encryption` is read as a JSON literal instead of being dropped.
    #[test]
    fn file_object_field_is_read_as_json_literal() {
        let mut uri = url::Url::parse("file:///tmp/out.jsonl").unwrap();
        uri.query_pairs_mut()
            .append_pair("format", "raw")
            .append_pair("compression", "gzip")
            .append_pair("encryption", r#"{"key_id":"k1","key":"${env:MQB_KEY}"}"#);
        let cfg = config(uri.as_str(), "file");
        assert_eq!(cfg["path"], "/tmp/out.jsonl");
        assert_eq!(cfg["format"], "raw");
        assert_eq!(cfg["compression"], "gzip");
        assert_eq!(cfg["encryption"]["key_id"], "k1");
        assert_eq!(cfg["encryption"]["key"], "${env:MQB_KEY}");
    }

    // The consumer mode is a `#[serde(flatten)]`ed tagged enum, so `mode` and its
    // variant fields are only recognised by walking the schema — they must not
    // trip the unrecognised-param error.
    #[test]
    fn file_flattened_mode_fields_are_recognised() {
        let cfg = config("file:///var/log/app.log?mode=subscribe&delete=true", "file");
        assert_eq!(cfg["mode"], "subscribe");
        assert_eq!(cfg["delete"], true);
    }

    // Rejecting unrecognised params on the endpoints that have no driver options
    // only works if every documented param really is a config field. These are the
    // example URIs from README.md, dev/docs/ and benches/etl/.
    #[test]
    fn documented_example_uris_parse() {
        for uri in [
            // Endpoints with no connection-URL driver options: newly strict.
            "kafka://kafka.local:9092?topic=orders&group_id=mqb-orders-sync",
            "kafka://kafka.local:9093?topic=orders&username=svc&password=secret",
            "mqtt://broker.local:1883?topic=alerts&client_id=mqb-alerts-01&qos=2",
            "mqtts://user:pass@broker.local:8883?topic=events",
            "nats://localhost:4222?subject=orders",
            "zeromq://127.0.0.1:5555?socket_type=push",
            "grpc://localhost:50051?topic=orders",
            "ibmmq://qmhost:1414?queue_manager=QM1&channel=DEV.APP.SVRCONN&queue=orders",
            "aws://_/?queue_url=https://sqs.us-east-1.amazonaws.com/123/orders&region=us-east-1",
            "memory://my-topic?capacity=1000",
            "file:///data/customers.csv?format=csv",
            "file:///var/log/app/events.log?mode=subscribe",
            // Endpoints that do carry driver options: `sslmode`/`async_insert` are
            // driver options, not config fields, and must still pass through.
            "postgres://u:p@localhost:5432/db?table=bench&cursor_column=id&sslmode=disable",
            "clickhouse://user:pass@ch.local:8123?table=events&database=analytics&async_insert=true",
            "amqp://guest:guest@localhost:5672/%2f?exchange=events&queue=events",
            "mongodb://localhost?database=app&collection=orders&consume=capture_new",
            "postgres-cdc://user:pass@localhost/app?publication=mqb_pub&slot_name=mqb_slot",
            "https://api.example.com/ingest?method=POST&request_timeout_ms=5000",
        ] {
            if let Err(e) = endpoint_from_uri(uri) {
                panic!("documented URI should parse: {uri}\n  {e:#}");
            }
        }
    }

    // On an endpoint whose URL does carry driver options, a JSON literal picks the
    // nested config field while a scalar of the same name stays a driver option
    // (see `mongodb_tls_option_stays_on_url` for the scalar half).
    #[test]
    fn mongodb_tls_json_literal_is_config() {
        let mut uri = url::Url::parse("mongodb://host:27017/").unwrap();
        uri.query_pairs_mut()
            .append_pair("database", "appdb")
            .append_pair("tls", r#"{"required":true,"ca_file":"/etc/ca.pem"}"#);
        let cfg = config(uri.as_str(), "mongodb");
        assert_eq!(cfg["tls"]["required"], true);
        assert_eq!(cfg["tls"]["ca_file"], "/etc/ca.pem");
        assert_eq!(cfg["url"], "mongodb://host:27017/");
    }

    // Kafka's connection string is a bare `host:port` list, not a URI, so a param
    // appended to it could never be read as a driver option — an object field is
    // config, and an unrecognised name is an error.
    #[test]
    fn kafka_object_fields_are_config_not_url_junk() {
        let mut uri = url::Url::parse("kafka://broker:9092").unwrap();
        uri.query_pairs_mut()
            .append_pair("topic", "orders")
            .append_pair("tls", r#"{"required":true}"#)
            .append_pair("producer_options", r#"[["linger.ms","5"]]"#);
        let cfg = config(uri.as_str(), "kafka");
        assert_eq!(cfg["url"], "broker:9092");
        assert_eq!(cfg["tls"]["required"], true);
        assert_eq!(cfg["producer_options"][0][0], "linger.ms");
    }

    #[test]
    fn kafka_rejects_unrecognised_param() {
        let err = endpoint_from_uri("kafka://broker:9092?topic=t&bogus=x").unwrap_err();
        assert!(
            err.to_string().contains("unrecognised query param"),
            "got: {err}"
        );
    }

    // IBM MQ's `host(port)` connection string is likewise not a URI; `tls` is a
    // nested struct that was previously unreachable from a URI.
    #[test]
    fn ibmmq_tls_is_config_and_url_stays_host_port() {
        let mut uri = url::Url::parse("ibmmq://qmhost:1414").unwrap();
        uri.query_pairs_mut()
            .append_pair("queue_manager", "QM1")
            .append_pair("channel", "DEV.APP.SVRCONN")
            .append_pair("queue", "orders")
            .append_pair("tls", r#"{"required":true,"cipher_spec":"ANY_TLS12"}"#);
        let cfg = config(uri.as_str(), "ibmmq");
        assert_eq!(cfg["url"], "qmhost(1414)");
        assert_eq!(cfg["tls"]["cipher_spec"], "ANY_TLS12");
    }

    // AwsConfig has no `url` field, so a leftover param had nothing to ride on and
    // was dropped on the floor.
    #[test]
    fn aws_rejects_unrecognised_param() {
        let err = endpoint_from_uri("aws://_/?region=us-east-1&bogus=x").unwrap_err();
        assert!(
            err.to_string().contains("unrecognised query param"),
            "got: {err}"
        );
    }

    // An in-process channel has no connection URL at all.
    #[test]
    fn memory_rejects_unrecognised_param() {
        let err = endpoint_from_uri("memory://my-topic?bogus=x").unwrap_err();
        assert!(
            err.to_string().contains("unrecognised query param"),
            "got: {err}"
        );
    }

    // `path` is a real WebSocketConfig field; it used to be skipped for every
    // scheme because a file endpoint derives its path from the URI.
    #[test]
    fn websocket_path_param_reaches_config() {
        let cfg = config("ws://host:8080?path=/stream", "websocket");
        assert_eq!(cfg["path"], "/stream");
    }

    // A param that is not a FileConfig field can never take effect, so it is
    // rejected rather than silently ignored.
    #[test]
    fn file_rejects_unrecognised_param() {
        let err = endpoint_from_uri("file:///tmp/out.jsonl?bogus=x").unwrap_err();
        assert!(
            err.to_string().contains("unrecognised query param"),
            "got: {err}"
        );
    }

    // An object-typed field given something that is not JSON at all is reported as
    // such, rather than reaching serde as a bare string. (A value that *is* valid
    // JSON but the wrong shape still gets serde's own type error.)
    #[test]
    fn file_object_field_rejects_non_json() {
        let err = endpoint_from_uri("file:///tmp/out.jsonl?encryption=yes-please").unwrap_err();
        assert!(
            err.to_string().contains("expects a JSON literal"),
            "got: {err}"
        );
    }

    // `|`-separated middlewares wrap the endpoint in the order written, and their
    // params are coerced to the middleware config field's own type.
    #[test]
    fn middlewares_are_appended_in_order() {
        let ep = endpoint_from_uri("kafka://broker:9092?topic=orders|retry?max_attempts=5|metrics")
            .expect("uri should parse");
        let v = serde_json::to_value(&ep).unwrap();
        assert_eq!(v["kafka"]["topic"], "orders");
        let mw = v["middlewares"].as_array().expect("middlewares array");
        assert_eq!(mw.len(), 2);
        assert_eq!(mw[0]["retry"]["max_attempts"], 5);
        assert!(mw[1].get("metrics").is_some(), "got: {}", mw[1]);
    }

    // A middleware's own object-typed field takes a JSON literal, and `-` in the
    // name is accepted for the snake_case tag.
    #[test]
    fn middleware_dash_alias_and_json_field() {
        let ep = endpoint_from_uri(
            "null:|weak-join?group_by=cid&expected_count=2&timeout_ms=1000&required=[\"a\",\"b\"]",
        )
        .expect("uri should parse");
        let v = serde_json::to_value(&ep).unwrap();
        let wj = &v["middlewares"][0]["weak_join"];
        assert_eq!(wj["group_by"], "cid");
        assert_eq!(wj["required"], serde_json::json!(["a", "b"]));
    }

    // `dlq`'s `endpoint` param is itself an endpoint URI, parsed recursively.
    #[test]
    fn dlq_endpoint_param_is_a_nested_uri() {
        let mut spec = String::from("kafka://broker:9092?topic=orders|dlq?");
        let mut q = url::form_urlencoded::Serializer::new(String::new());
        q.append_pair("endpoint", "file:///tmp/failed.jsonl");
        spec.push_str(&q.finish());
        let ep = endpoint_from_uri(&spec).expect("uri should parse");
        let v = serde_json::to_value(&ep).unwrap();
        assert_eq!(
            v["middlewares"][0]["dlq"]["endpoint"]["file"]["path"],
            "/tmp/failed.jsonl"
        );
    }

    // An unknown middleware name is rejected with the supported list.
    #[test]
    fn unknown_middleware_is_rejected() {
        let err = endpoint_from_uri("null:|bogus").unwrap_err();
        let msg = format!("{err:#}");
        assert!(msg.contains("unsupported middleware 'bogus'"), "got: {msg}");
    }

    // `kafka://` selects the Kafka endpoint; the scheme is stripped so `url`
    // (rdkafka's bootstrap.servers) is a bare host:port, and `topic` is scalar.
    #[test]
    fn kafka_scheme_strips_prefix_and_takes_topic() {
        let cfg = config("kafka://broker:9092?topic=orders", "kafka");
        assert_eq!(cfg["url"], "broker:9092");
        assert_eq!(cfg["topic"], "orders");
    }

    // `mqtt://` is rewritten to `tcp://` (what rumqtt expects); `mqtts://`
    // becomes `ssl://`.
    #[test]
    fn mqtt_scheme_rewrites_to_tcp_and_ssl() {
        let cfg = config("mqtt://broker:1883?topic=sensors", "mqtt");
        assert_eq!(cfg["url"], "tcp://broker:1883");
        assert_eq!(cfg["topic"], "sensors");

        let cfg = config("mqtts://broker:8883?topic=sensors", "mqtt");
        assert_eq!(cfg["url"], "ssl://broker:8883");
    }

    // `rabbitmq://` is accepted as an alias for `amqp://`, rewritten to the
    // native scheme; `queue` is a scalar config field.
    #[test]
    fn rabbitmq_scheme_rewrites_to_amqp() {
        let cfg = config(
            "rabbitmq://guest:guest@host:5672/vhost?queue=orders",
            "amqp",
        );
        assert_eq!(cfg["url"], "amqp://guest:guest@host:5672/vhost");
        assert_eq!(cfg["queue"], "orders");
    }

    // `http://`/`https://` pass through unchanged, with the target path already
    // part of the URL; `method` is a scalar config field.
    #[test]
    fn http_scheme_passthrough_and_scalar_fields() {
        let cfg = config("http://api.example.com/ingest?method=POST", "http");
        assert_eq!(cfg["url"], "http://api.example.com/ingest");
        assert_eq!(cfg["method"], "POST");
    }

    // `clickhouse://` is rewritten to `http://` (ClickHouse's HTTP interface);
    // `table` and `database` are scalar config fields.
    #[test]
    fn clickhouse_scheme_rewrites_to_http() {
        let cfg = config(
            "clickhouse://host:8123?table=events&database=analytics",
            "clickhouse",
        );
        assert_eq!(cfg["url"], "http://host:8123");
        assert_eq!(cfg["table"], "events");
        assert_eq!(cfg["database"], "analytics");
    }

    // Bucket schemes select the `object_store` endpoint and are also the connection
    // URL the crate expects, so they pass through unrewritten; `gcs://` is the one
    // alias normalised (to `gs://`). `cursor_id`/`checkpoint_store` are scalar fields.
    #[test]
    fn object_store_bucket_schemes() {
        let cfg = config(
            "s3://my-bucket/events?cursor_id=replayer&checkpoint_store=file:///tmp/c.json",
            "object_store",
        );
        assert_eq!(cfg["url"], "s3://my-bucket/events");
        assert_eq!(cfg["cursor_id"], "replayer");
        assert_eq!(cfg["checkpoint_store"], "file:///tmp/c.json");

        assert_eq!(config("gs://b/p", "object_store")["url"], "gs://b/p");
        assert_eq!(config("az://b/p", "object_store")["url"], "az://b/p");
        assert_eq!(config("gcs://b/p", "object_store")["url"], "gs://b/p");
    }

    // `ws://`/`wss://` pass through unchanged.
    #[test]
    fn websocket_scheme_passthrough() {
        let cfg = config("ws://0.0.0.0:9000", "websocket");
        assert_eq!(cfg["url"], "ws://0.0.0.0:9000/");
    }

    // `grpc://` is rewritten to `http://` (the client-mode URL GrpcConfig
    // expects); `topic` is a scalar config field.
    #[test]
    fn grpc_scheme_rewrites_to_http() {
        let cfg = config("grpc://localhost:50051?topic=orders", "grpc");
        assert_eq!(cfg["url"], "http://localhost:50051");
        assert_eq!(cfg["topic"], "orders");
    }

    // `ibmmq://` is reformatted to the driver's `host(port)` connection string;
    // `queue_manager` and `channel` are required scalar config fields.
    #[test]
    fn ibmmq_scheme_reformats_host_port() {
        let cfg = config(
            "ibmmq://qmhost:1414?queue_manager=QM1&channel=DEV.APP.SVRCONN&queue=orders",
            "ibmmq",
        );
        assert_eq!(cfg["url"], "qmhost(1414)");
        assert_eq!(cfg["queue_manager"], "QM1");
        assert_eq!(cfg["channel"], "DEV.APP.SVRCONN");
        assert_eq!(cfg["queue"], "orders");
    }

    // AWS SQS/SNS has no connection URL: the placeholder authority is dropped,
    // and `queue_url`/`region` are scalar config fields set via query params.
    #[test]
    fn aws_scheme_has_no_url_field() {
        let cfg = config(
            "aws://_/?queue_url=https://sqs.us-east-1.amazonaws.com/123/orders&region=us-east-1",
            "aws",
        );
        assert!(
            cfg.get("url").is_none(),
            "aws config should have no url field, got {cfg}"
        );
        assert_eq!(
            cfg["queue_url"],
            "https://sqs.us-east-1.amazonaws.com/123/orders"
        );
        assert_eq!(cfg["region"], "us-east-1");
    }

    // `zeromq://`/`zmq://` are rewritten to `tcp://`, the transport ZeroMQ expects.
    #[test]
    fn zeromq_scheme_rewrites_to_tcp() {
        let cfg = config("zeromq://127.0.0.1:5555?socket_type=push", "zeromq");
        assert_eq!(cfg["url"], "tcp://127.0.0.1:5555");
        assert_eq!(cfg["socket_type"], "push");

        let cfg = config("zmq://127.0.0.1:5555", "zeromq");
        assert_eq!(cfg["url"], "tcp://127.0.0.1:5555");
    }
}
