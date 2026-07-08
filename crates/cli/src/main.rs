//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use mq_bridge_app::{
    config::{AppConfig, load_config},
    mq_bridge, web_ui,
};

use clap::{Parser, Subcommand};
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
}

#[derive(clap::Args, Debug)]
struct CopyArgs {
    /// Source endpoint URI. The scheme selects the endpoint and query params set
    /// its config, e.g. `postgres://user:pass@host/db?table=src&sslmode=disable`,
    /// `nats://host:4222?subject=orders` or `file:///path/to/file?format=json`.
    #[arg(long)]
    from: String,

    /// Destination endpoint URI (same URI forms as `--from`), e.g.
    /// `postgres://user:pass@host/db?table=dst&insert_query=<url-encoded SQL>`.
    #[arg(long)]
    to: String,

    /// Exit once the source yields an empty batch (drain-then-exit). Without it,
    /// `copy` keeps running like a continuous bridge until Ctrl-C.
    #[arg(long)]
    drain: bool,

    /// Route concurrency (defaults to the engine default).
    #[arg(long)]
    concurrency: Option<usize>,

    /// Batch size (defaults to the engine default).
    #[arg(long)]
    batch_size: Option<usize>,
}

#[tokio::main(flavor = "multi_thread")]
async fn main() -> anyhow::Result<()> {
    // Initialize the default crypto provider for rustls (required for rustls 0.23.0+)
    // This allows mq-bridge to create TLS configurations for secure endpoints.
    let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();

    let args = Args::parse();

    if let Some(Command::Copy(copy_args)) = args.command {
        init_copy_logging();
        return run_copy(copy_args).await;
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

    let mut options = RouteOptions::default();
    if let Some(concurrency) = args.concurrency {
        options.concurrency = concurrency;
    }
    if let Some(batch_size) = args.batch_size {
        options.batch_size = batch_size;
    }
    options.exit_on_empty = args.drain;

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
        tokio::select! {
            res = handle.join() => {
                res.context("copy route task failed")?;
                info!("copy completed; source drained");
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Ctrl+C received; aborting copy");
            }
        }
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
/// Escaped mode: pass the full connection string percent-encoded as `?url=...`
/// to use it verbatim (e.g. `mongodb://_/?url=<encoded>&collection=orders`); its
/// own `?a=b` options are then never re-interpreted as config, which is the
/// escape hatch for any driver option that collides with a config field name.
fn endpoint_from_uri(uri: &str) -> anyhow::Result<mq_bridge::models::Endpoint> {
    use anyhow::bail;
    use mq_bridge::models::{
        Endpoint, EndpointType, FileConfig, MongoDbConfig, NatsConfig, RedisStreamsConfig,
        SqlxConfig,
    };
    use std::collections::HashMap;
    use url::Url;

    let parsed = Url::parse(uri).with_context(|| format!("not a valid URI: {uri}"))?;

    // scheme -> (EndpointType tag, recognised config fields with their types).
    let (tag, fields): (&str, HashMap<String, FieldType>) = match parsed.scheme() {
        "postgres" | "postgresql" | "mysql" | "mariadb" | "sqlite" => {
            ("sqlx", schema_fields(schemars::schema_for!(SqlxConfig)))
        }
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
        other => bail!(
            "unsupported endpoint scheme '{other}' in URI '{uri}'. Supported schemes: postgres, postgresql, mysql, mariadb, sqlite, nats, mongodb, redis, file"
        ),
    };

    // Split query params: recognised scalar config fields become endpoint config,
    // everything else is kept on the connection URL (driver params).
    let mut config = serde_json::Map::new();
    let mut driver_params: Vec<(String, String)> = Vec::new();
    // Escaped mode: `?url=<percent-encoded connection string>` supplies the exact
    // connection URL verbatim, so its own `?a=b` options are never re-interpreted
    // as config fields. Use it when a driver option would otherwise collide.
    let mut escaped_url: Option<String> = None;
    for (k, v) in parsed.query_pairs() {
        let (k, v) = (k.into_owned(), v.into_owned());
        if k == "path" {
            continue;
        }
        if k == "url" {
            escaped_url = Some(v);
            continue;
        }
        match fields.get(&k).copied() {
            // Object/array config fields (e.g. `tls`) can't be populated from a
            // scalar query param, and their names routinely collide with driver
            // options (`?tls=true`), so leave such params on the connection URL.
            Some(FieldType::Object) | None => driver_params.push((k, v)),
            Some(ty) => {
                config.insert(k, coerce_scalar(v, ty));
            }
        }
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
        config.insert("url".into(), serde_json::Value::String(base.to_string()));
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
        if visited.insert(reference.to_string()) {
            if let Some(target) = resolve_ref(root, reference) {
                collect_props(root, target, out, visited);
            }
        }
        return;
    }

    if let Some(props) = obj.get("properties").and_then(|p| p.as_object()) {
        for (name, sub) in props {
            out.entry(name.clone()).or_insert_with(|| field_type(root, sub));
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
    if let Some(reference) = sub.get("$ref").and_then(|r| r.as_str()) {
        if let Some(target) = resolve_ref(root, reference) {
            return field_type(root, target);
        }
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
}
