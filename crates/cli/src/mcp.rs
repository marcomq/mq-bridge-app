//  mq-bridge-app — MCP server mode (`mq-bridge-app mcp`).
//
//  A lean, protocol-agnostic MCP server built directly on the `mq_bridge`
//  library. Unlike a fixed-config server, every tool takes the source/target
//  endpoint as JSON, so the model can publish to, and run routes between, any of
//  the supported connectors ad hoc.
//
//  Tools: `publish`, `start_route`, `list_routes`, `route_status`, `stop_route`.

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use mq_bridge_app::mq_bridge::{
    CanonicalMessage, Publisher, Sent, SentBatch,
    models::{Endpoint, Route},
    route::RouteHandle,
};
use rmcp::schemars;
use rmcp::{
    ErrorData as McpError, ServerHandler, ServiceExt,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{CallToolResult, ContentBlock, Implementation, ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
};
use serde::Deserialize;
use tokio::sync::Mutex;
use tracing::info;

/// A single message to publish, mapped onto mq-bridge's `CanonicalMessage`
/// (a `payload`, a `message_id`, and string `metadata` headers).
#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct InputMessage {
    /// The message content — a string (sent verbatim) or any JSON value
    /// (serialized to JSON bytes).
    payload: serde_json::Value,
    /// Optional string headers. Conventional keys: `kind` — the message type,
    /// used by mq-bridge's type-based routing/handlers; `correlation_id` and
    /// `reply_to` — request/reply correlation. Any other user headers are passed
    /// through. Keys starting with `mqb.src.` are reserved (source/provenance) and
    /// are stripped, so do not set them.
    #[serde(default)]
    metadata: HashMap<String, String>,
    /// Optional message id (string, integer, or MongoDB OID object). If omitted,
    /// a time-ordered UUIDv7 is generated.
    #[serde(default)]
    message_id: Option<serde_json::Value>,
}

impl InputMessage {
    fn into_canonical(self) -> Result<CanonicalMessage, McpError> {
        let mut msg = if let Some(s) = self.payload.as_str() {
            CanonicalMessage::from(s)
        } else {
            let bytes = serde_json::to_vec(&self.payload)
                .map_err(|e| McpError::internal_error(e.to_string(), None))?;
            CanonicalMessage::new(bytes, None)
        };
        if let Some(id) = self.message_id {
            // Reuse CanonicalMessage's own id parsing (handles string / int / OID).
            // A malformed id is reported rather than silently replaced by the
            // generated UUID, so the caller's id is never quietly dropped.
            let parsed = CanonicalMessage::from_json(serde_json::json!({ "message_id": id }))
                .map_err(|e| McpError::invalid_params(format!("invalid message_id: {e}"), None))?;
            msg.message_id = parsed.message_id;
        }
        for (k, v) in self.metadata {
            msg.metadata.insert(k, v);
        }
        Ok(msg)
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct PublishArgs {
    /// Target endpoint, keyed by connector type, e.g.
    /// `{"kafka": {"url": "localhost:9092", "topic": "orders"}}` or
    /// `{"file": {"path": "/tmp/out.jsonl"}}`.
    publisher: Endpoint,
    /// A single message to send.
    #[serde(default)]
    message: Option<InputMessage>,
    /// A batch of messages to send (alternative to `message`).
    #[serde(default)]
    messages: Option<Vec<InputMessage>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct StartRouteArgs {
    /// Optional unique route name (auto-generated if omitted).
    #[serde(default)]
    name: Option<String>,
    /// The route to run: an `input` (source) endpoint and an `output` (sink)
    /// endpoint — each keyed by connector type, e.g.
    /// `{"input": {"nats": {"url": "localhost:4222", "subject": "orders"}},
    ///   "output": {"file": {"path": "/tmp/out.jsonl"}}}` — plus optional execution
    /// options such as `concurrency`, `batch_size`, and `exit_on_empty` (drain the
    /// source then exit). Use `{"null": null}` as the `output` to discard messages.
    route: Route,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RouteNameArg {
    /// The route name.
    name: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct RouteStatusArgs {
    /// A specific route name; omit to report every running route.
    #[serde(default)]
    name: Option<String>,
}

/// The MCP server. Holds the routes it has started so it can report and stop them.
#[derive(Clone)]
pub struct BridgeMcp {
    routes: Arc<Mutex<HashMap<String, RouteHandle>>>,
    // Required by the `#[tool_router]` / `#[tool_handler]` macro convention; the
    // generated handler builds the router, so the field itself isn't read directly.
    #[allow(dead_code)]
    tool_router: ToolRouter<BridgeMcp>,
}

fn pretty(value: &serde_json::Value) -> String {
    serde_json::to_string_pretty(value).unwrap_or_else(|_| value.to_string())
}

fn ok_json(value: serde_json::Value) -> CallToolResult {
    CallToolResult::success(vec![ContentBlock::text(pretty(&value))])
}

/// A tool result flagged as an error (`is_error = true`) so the client/LLM does
/// not mistake a (partial) failure for success.
fn err_json(value: serde_json::Value) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(pretty(&value))])
}

/// One `{ name, status }` entry describing a running route.
fn route_entry_json(name: &str, handle: &RouteHandle) -> serde_json::Value {
    serde_json::json!({
        "name": name,
        "status": serde_json::to_value(handle.status()).unwrap_or_default(),
    })
}

fn invalid(msg: impl Into<String>) -> McpError {
    McpError::invalid_params(msg.into(), None)
}

fn internal(msg: impl Into<String>) -> McpError {
    McpError::internal_error(msg.into(), None)
}

fn describe_sent(sent: Sent) -> serde_json::Value {
    match sent {
        Sent::Ack => serde_json::json!({ "status": "Ack" }),
        Sent::Response(msg) => serde_json::json!({
            "status": "Response",
            "payload": msg.get_payload_str(),
            "metadata": msg.metadata,
        }),
    }
}

/// Describes a batch send outcome. Returns the JSON summary and whether any
/// message failed (so the caller can flag the tool result as an error).
fn describe_sent_batch(sent: SentBatch, count: usize) -> (serde_json::Value, bool) {
    match sent {
        SentBatch::Ack => (serde_json::json!({ "status": "Ack", "sent": count }), false),
        SentBatch::Partial { responses, failed } => {
            let failed_count = failed.len();
            let sent_ok = count.saturating_sub(failed_count);
            let value = serde_json::json!({
                "status": if failed_count == 0 { "Ack" } else { "Partial" },
                "sent": sent_ok,
                "failed": failed_count,
                "errors": failed.iter().map(|(_, e)| e.to_string()).collect::<Vec<_>>(),
                "responses": responses.map(|r| {
                    r.iter().map(|m| m.get_payload_str().to_string()).collect::<Vec<_>>()
                }),
            });
            (value, failed_count > 0)
        }
    }
}

/// Shared map of routes started via this server, keyed by route name.
type RouteMap = Arc<Mutex<HashMap<String, RouteHandle>>>;

#[tool_router]
impl BridgeMcp {
    pub fn new() -> Self {
        Self::with_routes(Arc::new(Mutex::new(HashMap::new())))
    }

    /// Builds a server that shares an existing route map. Used by the HTTP
    /// transport so every session sees (and can stop) the same routes.
    pub fn with_routes(routes: RouteMap) -> Self {
        Self {
            routes,
            tool_router: Self::tool_router(),
        }
    }

    #[tool(
        description = "Publish one message or a batch of messages to any endpoint. \
            The target is supplied inline as endpoint JSON keyed by type (e.g. \
            {\"kafka\": {\"url\": \"...\", \"topic\": \"...\"}}); this is independent of routes. \
            Provide either `message` or `messages`; each message has a `payload` and optional \
            `metadata` headers (e.g. `kind` for the message type, `correlation_id`). Returns the \
            send outcome (an acknowledgement, or the endpoint's reply for request/reply endpoints)."
    )]
    async fn publish(
        &self,
        Parameters(args): Parameters<PublishArgs>,
    ) -> Result<CallToolResult, McpError> {
        let publisher = Publisher::new(args.publisher)
            .await
            .map_err(|e| invalid(format!("invalid publisher endpoint: {e}")))?;

        match (args.message, args.messages) {
            (None, None) => Err(invalid("provide either `message` or `messages`")),
            (Some(_), Some(_)) => Err(invalid("provide only one of `message` or `messages`")),
            (Some(message), None) => {
                let canonical = message.into_canonical()?;
                let sent = publisher
                    .send(canonical)
                    .await
                    .map_err(|e| internal(format!("publish failed: {e}")))?;
                Ok(ok_json(describe_sent(sent)))
            }
            (None, Some(messages)) => {
                if messages.is_empty() {
                    return Err(invalid("`messages` must not be empty"));
                }
                let canonical: Vec<CanonicalMessage> = messages
                    .into_iter()
                    .map(InputMessage::into_canonical)
                    .collect::<Result<_, _>>()?;
                let count = canonical.len();
                let sent = publisher
                    .send_batch(canonical)
                    .await
                    .map_err(|e| internal(format!("batch publish failed: {e}")))?;
                let (summary, had_failures) = describe_sent_batch(sent, count);
                Ok(if had_failures {
                    err_json(summary)
                } else {
                    ok_json(summary)
                })
            }
        }
    }

    #[tool(
        description = "Create and run a route that moves messages from its `input` (source) \
            endpoint to its `output` (sink) endpoint, each keyed by connector type. Supports \
            route options like `concurrency`, `batch_size`, and `exit_on_empty` (drain the source \
            then exit; otherwise the route runs continuously until stopped). Returns the route \
            name for use with route_status / stop_route.",
        annotations(destructive_hint = true, read_only_hint = false)
    )]
    async fn start_route(
        &self,
        Parameters(args): Parameters<StartRouteArgs>,
    ) -> Result<CallToolResult, McpError> {
        let name = args
            .name
            .map(|n| n.trim().to_string())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(auto_route_name);
        let exit_on_empty = args.route.options.exit_on_empty;

        // Reject a duplicate name up front, but release the lock before the
        // potentially slow `run()` so other route tools aren't blocked on startup.
        if self.routes.lock().await.contains_key(&name) {
            return Err(invalid(format!("a route named '{name}' already exists")));
        }

        let handle = args
            .route
            .run(&name)
            .await
            .map_err(|e| internal(format!("failed to start route '{name}': {e}")))?;

        let mut routes = self.routes.lock().await;
        if routes.contains_key(&name) {
            // Lost a race with a concurrent start for the same name; stop the
            // route we just started so it doesn't leak, then report the conflict.
            drop(routes);
            handle.stop().await;
            return Err(invalid(format!("a route named '{name}' already exists")));
        }
        routes.insert(name.clone(), handle);

        Ok(ok_json(serde_json::json!({
            "route": name,
            "exit_on_empty": exit_on_empty,
        })))
    }

    #[tool(
        description = "List the routes started by this server, with their live connection health.",
        annotations(read_only_hint = true)
    )]
    async fn list_routes(&self) -> Result<CallToolResult, McpError> {
        let routes = self.routes.lock().await;
        let list: Vec<serde_json::Value> = routes
            .iter()
            .map(|(name, handle)| route_entry_json(name, handle))
            .collect();
        Ok(ok_json(serde_json::Value::Array(list)))
    }

    #[tool(
        description = "Report the live health/status of one route (by `name`) or all routes.",
        annotations(read_only_hint = true)
    )]
    async fn route_status(
        &self,
        Parameters(args): Parameters<RouteStatusArgs>,
    ) -> Result<CallToolResult, McpError> {
        let routes = self.routes.lock().await;
        match args.name {
            Some(name) => match routes.get(&name) {
                Some(handle) => Ok(ok_json(
                    serde_json::to_value(handle.status()).unwrap_or_default(),
                )),
                None => Err(invalid(format!("no route named '{name}'"))),
            },
            None => {
                let all: Vec<serde_json::Value> = routes
                    .iter()
                    .map(|(name, handle)| route_entry_json(name, handle))
                    .collect();
                Ok(ok_json(serde_json::Value::Array(all)))
            }
        }
    }

    #[tool(description = "Stop a running route by `name`.")]
    async fn stop_route(
        &self,
        Parameters(args): Parameters<RouteNameArg>,
    ) -> Result<CallToolResult, McpError> {
        let handle = self.routes.lock().await.remove(&args.name);
        match handle {
            Some(handle) => {
                handle.stop().await;
                Ok(ok_json(serde_json::json!({ "stopped": args.name })))
            }
            None => Err(invalid(format!("no route named '{}'", args.name))),
        }
    }
}

impl Default for BridgeMcp {
    fn default() -> Self {
        Self::new()
    }
}

#[tool_handler]
impl ServerHandler for BridgeMcp {
    fn get_info(&self) -> ServerInfo {
        // `Implementation` is `#[non_exhaustive]`, so build via Default then set fields.
        let mut server_info = Implementation::default();
        server_info.name = "mq-bridge-app".to_string();
        server_info.version = env!("CARGO_PKG_VERSION").to_string();

        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
        .with_server_info(server_info)
        .with_instructions(
            "mq-bridge: a universal, protocol-agnostic message and data bridge. Move data between \
             any of the supported endpoints (postgres, kafka, nats, mqtt, mongodb, redis, ibm-mq, \
             http, files, and more) ad hoc. `publish` and `start_route` take the endpoint(s) \
             inline as JSON keyed by type, e.g. {\"kafka\": {\"url\": \"...\", \"topic\": \
             \"...\"}}. Use `publish` to \
             send messages to a target; `start_route` to move messages from a source (`input`) to \
             a sink (`output`), optionally setting `exit_on_empty` to drain-then-exit; and \
             `list_routes` / `route_status` / `stop_route` to manage running routes.",
        )
    }
}

/// A process-unique name for an auto-named route. A monotonic counter avoids the
/// collisions a timestamp can produce for near-simultaneous starts.
fn auto_route_name() -> String {
    static ROUTE_SEQ: AtomicU64 = AtomicU64::new(1);
    format!("mcp-route-{}", ROUTE_SEQ.fetch_add(1, Ordering::Relaxed))
}

/// Entry point for the `mcp` subcommand.
pub async fn run(transport: String, bind: Option<String>) -> anyhow::Result<()> {
    match transport.as_str() {
        "stdio" => run_stdio().await,
        "http" => run_http(bind.unwrap_or_else(|| "127.0.0.1:9092".to_string())).await,
        other => anyhow::bail!("unknown --transport '{other}' (expected 'stdio' or 'http')"),
    }
}

async fn run_stdio() -> anyhow::Result<()> {
    info!("MCP server starting on stdio");
    let service = BridgeMcp::new().serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}

async fn run_http(bind: String) -> anyhow::Result<()> {
    use hyper_util::{
        rt::{TokioExecutor, TokioIo},
        server::conn::auto::Builder,
        service::TowerToHyperService,
    };
    use rmcp::transport::streamable_http_server::{
        StreamableHttpService, session::local::LocalSessionManager,
    };

    // One shared route map across all sessions, so routes started in any session
    // are visible to (and stoppable from) every session.
    let routes: RouteMap = Arc::new(Mutex::new(HashMap::new()));
    let service = TowerToHyperService::new(StreamableHttpService::new(
        move || Ok(BridgeMcp::with_routes(routes.clone())),
        LocalSessionManager::default().into(),
        Default::default(),
    ));

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    info!("MCP server listening on http://{bind}/ (streamable HTTP)");

    loop {
        let io = tokio::select! {
            _ = tokio::signal::ctrl_c() => break,
            accept = listener.accept() => match accept {
                Ok((stream, _)) => TokioIo::new(stream),
                // A transient accept error must not tear down the whole server.
                Err(e) => {
                    tracing::warn!("MCP http accept error: {e}");
                    continue;
                }
            },
        };
        let service = service.clone();
        tokio::spawn(async move {
            let _ = Builder::new(TokioExecutor::default())
                .serve_connection(io, service)
                .await;
        });
    }

    Ok(())
}
