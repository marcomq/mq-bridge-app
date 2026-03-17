//  mq-bridge-mcp: An MCP server for mq-bridge endpoints.
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use anyhow::Context;
use clap::Parser;
use config::Config;
use mq_bridge::CanonicalMessage;
use mq_bridge::{models::Endpoint, models::TlsConfig};
use mq_bridge_app::config::{McpConfig, McpTransport};
use mq_bridge_app::{consumer_registry, publisher_registry};
use rmcp::{
    model::{
        Annotated, CallToolRequestParams, CallToolResult, ListResourcesResult, ListToolsResult,
        PaginatedRequestParams, RawResource, ReadResourceRequestParams, ReadResourceResult,
        ResourceContents, ServerCapabilities, ServerInfo,
    },
    service::{RequestContext, ServiceExt},
    ErrorData as McpError, ServerHandler,
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

#[derive(Parser, Debug)]
#[clap(author, version, about, long_about = None)]
struct Cli {
    /// Path to the configuration file (YAML or JSON)
    #[clap(short, long, default_value = "config.yml")]
    config: String,

    /// Transport protocol for the MCP server (overrides config if set)
    #[clap(long, value_enum)]
    transport: Option<CliTransport>,

    /// Port for the Http transport (overrides config if set)
    #[clap(long)]
    port: Option<u16>,

    /// Generate JSON schema to the specified path
    #[clap(long)]
    schema: Option<String>,
}

#[derive(clap::ValueEnum, Clone, Debug)]
enum CliTransport {
    Stdio,
    Http,
}

impl From<CliTransport> for McpTransport {
    fn from(t: CliTransport) -> Self {
        match t {
            CliTransport::Stdio => McpTransport::Stdio,
            CliTransport::Http => McpTransport::StreamableHttp,
        }
    }
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Clone)]
pub struct PublisherConfig {
    #[serde(flatten)]
    pub endpoint: Endpoint,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Clone)]
pub struct ConsumerConfig {
    #[serde(flatten)]
    pub endpoint: Endpoint,
    #[serde(default)]
    pub description: String,
}

mod tools {
    use rmcp::model::Tool;
    use serde::{Deserialize, Serialize};

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct ConnectorRef {
        pub connector_type: String,
        /// The original endpoint name as defined in config (not the tool name).
        pub endpoint_name: Option<String>,
    }

    #[derive(Clone, Debug)]
    pub struct McpTool {
        pub name: String,
        pub description: String,
        pub action: McpToolAction,
        pub connector: ConnectorRef,
    }

    #[derive(Clone, Debug)]
    pub enum McpToolAction {
        Publish,
        Introspect,
        Status,
        Consume,
    }

    #[derive(Deserialize)]
    pub struct EndpointInput {
        pub name: Option<String>,
    }

    #[derive(Deserialize, Default)]
    pub struct ConsumeArgs {
        pub timeout_ms: Option<u64>,
        pub max_messages: Option<usize>,
    }

    /// Serialize `data` as pretty JSON and return a successful CallToolResult.
    /// Accepts a `serde_json::Value` directly to avoid double-serialization.
    pub fn success_value(data: serde_json::Value) -> rmcp::model::CallToolResult {
        let content_str = serde_json::to_string_pretty(&data).unwrap_or_default();
        rmcp::model::CallToolResult::success(vec![rmcp::model::Content::text(content_str)])
    }

    /// Convenience wrapper for plain string results.
    pub fn success_str(msg: impl Into<String>) -> rmcp::model::CallToolResult {
        rmcp::model::CallToolResult::success(vec![rmcp::model::Content::text(msg.into())])
    }

    pub fn to_rmcp_tool(tool: &McpTool) -> Tool {
        let schema = match tool.action {
            McpToolAction::Publish => serde_json::json!({
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "items": { "$ref": "#/$defs/message" }
                    },
                    "message": { "$ref": "#/$defs/message" }
                },
                "oneOf": [
                    { "required": ["messages"] },
                    { "required": ["message"] }
                ],
                "$defs": {
                    "message": {
                        "type": "object",
                        "properties": {
                            "payload": { "description": "The message content (string, JSON object, or any JSON value)" },
                            "metadata": { "type": "object", "additionalProperties": { "type": "string" } },
                            "message_id": { "description": "The message ID (string, integer, or MongoDB OID object)" }
                        },
                        "required": ["payload"]
                    }
                }
            }),
            McpToolAction::Introspect => serde_json::json!({
                "type": "object",
                "properties": {}
            }),
            McpToolAction::Status => serde_json::json!({
                "type": "object",
                "properties": {
                    "name": { "type": "string" }
                }
            }),
            McpToolAction::Consume => serde_json::json!({
                "type": "object",
                "properties": {
                    "timeout_ms": { "type": "integer" },
                    "max_messages": { "type": "integer" }
                }
            }),
        };

        let mut rmcp_tool = Tool::default();
        rmcp_tool.name = tool.name.clone().into();
        rmcp_tool.description = Some(tool.description.clone().into());
        rmcp_tool.input_schema = serde_json::from_value(schema).unwrap_or_default();
        rmcp_tool
    }
}
use self::tools::{ConnectorRef, ConsumeArgs, EndpointInput, McpTool, McpToolAction};

fn default_log_level() -> String {
    "info".to_string()
}

fn mcp_invalid(msg: String) -> McpError {
    McpError::invalid_params(msg, None)
}

fn mcp_internal(msg: String) -> McpError {
    McpError::internal_error(msg, None)
}

/// Convert an endpoint config name to a tool name suffix (replaces `-` with `_`).
fn to_tool_suffix(name: &str) -> String {
    name.replace('-', "_")
}

pub struct MqBridgeMcpServer {
    /// Static tools (list_publishers, list_consumers, get_status) plus all
    /// dynamic publish_to_* and consume_from_* tools, built once at startup.
    tools: Arc<Vec<McpTool>>,
    /// Lookup map: tool_name → original endpoint name in config.
    /// Avoids the lossy `_` ↔ `-` round-trip for dispatch.
    tool_to_endpoint: Arc<HashMap<String, String>>,
    server_name: Arc<str>,
    consumers: Arc<HashMap<String, ConsumerConfig>>,
}

#[derive(Debug, Deserialize, Serialize, JsonSchema, Clone, Default)]
pub struct McpAppConfig {
    #[serde(default = "default_log_level")]
    pub log_level: String,
    #[serde(default)]
    pub logger: String,
    #[serde(default)]
    pub mcp: McpConfig,
    #[serde(default)]
    pub publishers: HashMap<String, PublisherConfig>,
    #[serde(default)]
    pub consumers: HashMap<String, ConsumerConfig>,
}

impl Clone for MqBridgeMcpServer {
    fn clone(&self) -> Self {
        Self {
            tools: self.tools.clone(),
            tool_to_endpoint: self.tool_to_endpoint.clone(),
            server_name: self.server_name.clone(),
            consumers: self.consumers.clone(),
        }
    }
}

pub fn load_mcp_config(config_path: &str) -> anyhow::Result<McpAppConfig> {
    let builder = Config::builder()
        .add_source(config::File::with_name(config_path).required(true))
        .add_source(config::Environment::with_prefix("MCP_SERVER").separator("__"));
    let settings = builder.build()?;
    let config: McpAppConfig = settings.try_deserialize()?;
    Ok(config)
}

impl MqBridgeMcpServer {
    pub fn new(config: &McpAppConfig, server_name: impl Into<String>) -> Self {
        let mut tool_list = vec![
            McpTool {
                name: "list_publishers".into(),
                description: "Lists all available publishers that can be used to send messages."
                    .into(),
                action: McpToolAction::Introspect,
                connector: ConnectorRef {
                    endpoint_name: None,
                    connector_type: "internal".into(),
                },
            },
            McpTool {
                name: "list_consumers".into(),
                description: "Lists all available consumers that can be used to receive messages."
                    .into(),
                action: McpToolAction::Introspect,
                connector: ConnectorRef {
                    endpoint_name: None,
                    connector_type: "internal_consumer".into(),
                },
            },
            McpTool {
                name: "get_status".into(),
                description: "Returns the status of registered publishers and consumers.".into(),
                action: McpToolAction::Status,
                connector: ConnectorRef {
                    endpoint_name: None,
                    connector_type: "internal".into(),
                },
            },
        ];

        // Build lookup map and dynamic tools in one pass over publishers.
        let mut tool_to_endpoint: HashMap<String, String> = HashMap::new();

        for name in publisher_registry::list_publishers() {
            if let Some(pub_def) = publisher_registry::get_publisher(&name) {
                let tool_name = format!("publish_to_{}", to_tool_suffix(&name));
                tool_to_endpoint.insert(tool_name.clone(), name.clone());
                tool_list.push(McpTool {
                    name: tool_name,
                    description: pub_def.description,
                    action: McpToolAction::Publish,
                    connector: ConnectorRef {
                        connector_type: pub_def.endpoint_type.clone(),
                        endpoint_name: Some(name),
                    },
                });
            }
        }

        for (name, def) in config.consumers.iter() {
            let tool_name = format!("consume_from_{}", to_tool_suffix(name));
            tool_to_endpoint.insert(tool_name.clone(), name.clone());
            tool_list.push(McpTool {
                name: tool_name,
                description: def.description.clone(),
                action: McpToolAction::Consume,
                connector: ConnectorRef {
                    connector_type: def.endpoint.endpoint_type.name().to_string(),
                    endpoint_name: Some(name.clone()),
                },
            });
        }

        tool_list.sort_by(|a, b| a.name.cmp(&b.name));

        Self {
            tools: Arc::new(tool_list),
            tool_to_endpoint: Arc::new(tool_to_endpoint),
            server_name: server_name.into().into(),
            consumers: Arc::new(config.consumers.clone()),
        }
    }

    pub async fn start(self, mcp_config: &McpConfig) -> anyhow::Result<()> {
        let bind = &mcp_config.bind;
        match mcp_config.transport {
            mq_bridge_app::config::McpTransport::StreamableHttp => {
                self.start_streamable_http(bind, &mcp_config.tls).await
            }
            mq_bridge_app::config::McpTransport::Stdio => self.start_stdio().await,
        }
    }

    async fn start_streamable_http(
        self,
        bind: &str,
        tls_config: &Option<TlsConfig>,
    ) -> anyhow::Result<()> {
        use axum::serve;
        use axum::{routing::get, Router};
        use rmcp::transport::streamable_http_server::{
            session::local::LocalSessionManager, StreamableHttpServerConfig, StreamableHttpService,
        };

        let addr: std::net::SocketAddr = bind.parse()?;
        info!("MCP StreamableHTTP server starting on {}", addr);

        let me = self.clone();
        let service = StreamableHttpService::new(
            move || Ok(me.clone()),
            Arc::new(LocalSessionManager::default()),
            StreamableHttpServerConfig::default(),
        );

        let router = Router::new()
            .route(
                "/",
                get(|| async { "MCP endpoint is running. Please use a compatible client." }),
            )
            .nest_service("/mcp", service);

        if let Some(tls) = tls_config {
            info!("TLS enabled for MCP server");
            let tls_cfg = axum_server::tls_rustls::RustlsConfig::from_pem_file(
                tls.cert_file
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("TLS cert_file required"))?,
                tls.key_file
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!("TLS key_file required"))?,
            )
            .await?;

            axum_server::bind_rustls(addr, tls_cfg)
                .serve(router.into_make_service())
                .await?;
        } else {
            let listener = tokio::net::TcpListener::bind(addr).await?;
            serve(listener, router).await?;
        }

        Ok(())
    }

    async fn start_stdio(self) -> anyhow::Result<()> {
        use rmcp::transport::stdio;

        info!("MCP stdio server starting");
        let service = self.serve(stdio()).await?;
        service.waiting().await?;
        Ok(())
    }

    async fn handle_tool_call(
        &self,
        tool: &McpTool,
        args: Option<serde_json::Value>,
    ) -> Result<CallToolResult, McpError> {
        let args = args.unwrap_or(serde_json::Value::Object(Default::default()));

        match &tool.action {
            McpToolAction::Publish => {
                let messages_arr = if let Some(msgs) = args.get("messages") {
                    msgs.as_array()
                        .ok_or_else(|| mcp_invalid("'messages' must be an array".into()))?
                        .clone()
                } else if let Some(msg) = args.get("message") {
                    vec![msg.clone()]
                } else {
                    return Err(mcp_invalid("Missing 'messages' or 'message' argument".into()));
                };

                let mut canonical_messages = Vec::new();
                for m_val in messages_arr {
                    // If the input matches our schema { payload: ..., metadata: ... }, use it.
                    // Otherwise, treat the whole object as payload (legacy behavior).
                    let msg = if let Some(obj) = m_val.as_object() {
                        if let Some(payload_val) = obj.get("payload") {
                            let mut m = if let Some(s) = payload_val.as_str() {
                                CanonicalMessage::from(s)
                            } else {
                                let bytes = serde_json::to_vec(payload_val)
                                    .map_err(|e| mcp_internal(e.to_string()))?;
                                CanonicalMessage::new(bytes, None)
                            };

                            if let Some(id_val) = obj.get("message_id") {
                                // Use CanonicalMessage's own parser logic for ID
                                if let Ok(tm) = CanonicalMessage::from_json(serde_json::json!({ "message_id": id_val })) {
                                    m.message_id = tm.message_id;
                                }
                            }
                            if let Some(meta) = obj.get("metadata").and_then(|v| v.as_object()) {
                                for (k, v) in meta {
                                    if let Some(s) = v.as_str() {
                                        m.metadata.insert(k.clone(), s.to_string());
                                    }
                                }
                            }
                            m
                        } else {
                            CanonicalMessage::from_json(m_val.clone())
                                .map_err(|e| mcp_invalid(e.to_string()))?
                        }
                    } else {
                        CanonicalMessage::from_json(m_val.clone())
                            .map_err(|e| mcp_invalid(e.to_string()))?
                    };
                    canonical_messages.push(msg);
                }

                let endpoint_name = tool.connector.endpoint_name.as_deref().unwrap_or_default();
                let Some(pub_def) = publisher_registry::get_publisher(endpoint_name) else {
                    return Err(mcp_invalid(format!(
                        "Publisher '{}' not found",
                        endpoint_name
                    )));
                };

                let publisher = pub_def.publisher.clone();
                match publisher.send_batch(canonical_messages).await {
                    Ok(_) => Ok(tools::success_str("Batch published successfully")),
                    Err(e) => Err(mcp_internal(e.to_string())),
                }
            }

            McpToolAction::Introspect => {
                if tool.name == "list_consumers" {
                    let mut consumer_list: Vec<serde_json::Value> = self
                        .consumers
                        .iter()
                        .map(|(name, def)| {
                            serde_json::json!({
                                "name": format!("consume_from_{}", to_tool_suffix(name)),
                                "description": def.description,
                                "type": def.endpoint.endpoint_type.name(),
                            })
                        })
                        .collect();
                    consumer_list.sort_by(|a, b| {
                        a["name"]
                            .as_str()
                            .unwrap_or("")
                            .cmp(b["name"].as_str().unwrap_or(""))
                    });
                    // Pass Value directly — no double-serialization.
                    return Ok(tools::success_value(serde_json::Value::Array(
                        consumer_list,
                    )));
                }

                // Default: list_publishers
                let mut endpoint_list: Vec<serde_json::Value> = Vec::new();
                for name in publisher_registry::list_publishers() {
                    if let Some(pub_def) = publisher_registry::get_publisher(&name) {
                        endpoint_list.push(serde_json::json!({
                            "name": format!("publish_to_{}", to_tool_suffix(&name)),
                            "description": pub_def.description,
                            "type": pub_def.endpoint_type,
                        }));
                    }
                }
                endpoint_list.sort_by(|a, b| {
                    a["name"]
                        .as_str()
                        .unwrap_or("")
                        .cmp(b["name"].as_str().unwrap_or(""))
                });

                Ok(tools::success_value(serde_json::Value::Array(
                    endpoint_list,
                )))
            }

            McpToolAction::Consume => {
                let endpoint_name = tool.connector.endpoint_name.as_deref().unwrap_or_default();
                let Some(consumer_def) = self.consumers.get(endpoint_name) else {
                    return Err(mcp_invalid(format!(
                        "Consumer '{}' not found",
                        endpoint_name
                    )));
                };

                let consume_args: ConsumeArgs = serde_json::from_value(args).unwrap_or_default();
                let timeout = Duration::from_millis(consume_args.timeout_ms.unwrap_or(5000));
                let max_messages = consume_args.max_messages.unwrap_or(10);

                // Reuse pooled consumer if available; fall back to creating one.
                let consumer_arc = match consumer_registry::get_consumer(endpoint_name) {
                    Some(c) => c,
                    None => {
                        let c = consumer_def
                            .endpoint
                            .create_consumer(endpoint_name)
                            .await
                            .map_err(|e| {
                                mcp_internal(format!(
                                    "Failed to create consumer for '{}': {}",
                                    endpoint_name, e
                                ))
                            })?;
                        consumer_registry::register_consumer(endpoint_name, c)
                    }
                };

                let mut consumer = consumer_arc.lock().await;
                match tokio::time::timeout(timeout, consumer.receive_batch(max_messages)).await {
                    Ok(Ok(batch)) => {
                        let msgs: Vec<serde_json::Value> = batch
                            .messages
                            .iter()
                            .map(|m| {
                                // Prefer parsed JSON; fall back to plain string.
                                serde_json::from_slice(&m.payload).unwrap_or_else(|_| {
                                    serde_json::Value::String(m.get_payload_str().to_string())
                                })
                            })
                            .collect();

                        let dispositions =
                            vec![mq_bridge::traits::MessageDisposition::Ack; batch.messages.len()];
                        (batch.commit)(dispositions).await.ok();

                        Ok(tools::success_value(serde_json::Value::Array(msgs)))
                    }
                    Ok(Err(e)) => Err(mcp_internal(format!("Error consuming batch: {}", e))),
                    Err(_) => Ok(tools::success_str(format!(
                        "Timed out after {}ms with no messages",
                        timeout.as_millis()
                    ))),
                }
            }

            McpToolAction::Status => {
                let input: EndpointInput =
                    serde_json::from_value(args).unwrap_or(EndpointInput { name: None });

                let publishers = publisher_registry::list_publishers();
                let consumers: Vec<String> = self.consumers.keys().cloned().collect();

                let status = match input.name.as_deref() {
                    Some(name) => {
                        let is_publisher = publishers.contains(&name.to_string());
                        let is_consumer = self.consumers.contains_key(name);
                        serde_json::json!({
                            "name": name,
                            "publisher": is_publisher,
                            "consumer": is_consumer,
                        })
                    }
                    None => serde_json::json!({
                        "publishers": publishers,
                        "consumers": consumers,
                    }),
                };

                Ok(tools::success_value(status))
            }
        }
    }
}

impl ServerHandler for MqBridgeMcpServer {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        info.capabilities = ServerCapabilities::builder()
            .enable_tools()
            .enable_resources()
            .build();
        info.instructions = Some(
            "mq-bridge MCP server. Use list_publishers / list_consumers to discover available \
             endpoints, then use publish_to_<name> or consume_from_<name> tools."
                .into(),
        );
        info.server_info.name = self.server_name.as_ref().into();
        info.server_info.version = env!("CARGO_PKG_VERSION").into();
        info
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: RequestContext<rmcp::RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        // Tool list is fully built at startup — just convert and return.
        Ok(ListToolsResult {
            tools: self.tools.iter().map(tools::to_rmcp_tool).collect(),
            next_cursor: None,
            meta: None,
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _ctx: RequestContext<rmcp::RoleServer>,
    ) -> Result<CallToolResult, McpError> {
        info!("MCP tool call: {}", request.name);

        let arguments = request.arguments.map(serde_json::Value::Object);

        // Look up the tool by name directly from the pre-built list.
        if let Some(tool) = self.tools.iter().find(|t| t.name == request.name).cloned() {
            return self.handle_tool_call(&tool, arguments).await;
        }

        Err(mcp_invalid(format!("Unknown tool: {}", request.name)))
    }

    async fn list_resources(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: RequestContext<rmcp::RoleServer>,
    ) -> Result<ListResourcesResult, McpError> {
        let mut resources = Vec::new();
        for (name, def) in self.consumers.iter() {
            resources.push(Annotated {
                raw: RawResource::new(format!("mq://{}", name), name.clone())
                    .with_description(def.description.clone())
                    .with_mime_type("application/json"),
                annotations: None,
            });
        }
        Ok(ListResourcesResult {
            resources,
            next_cursor: None,
            meta: None,
        })
    }

    /// Returns non-destructive metadata about the endpoint.
    /// Does NOT consume or ack any messages — use `consume_from_<name>` for that.
    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _ctx: RequestContext<rmcp::RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let uri_str = request.uri.as_str();
        let consumer_name = uri_str
            .strip_prefix("mq://")
            .ok_or_else(|| mcp_invalid(format!("Invalid resource URI: {}", uri_str)))?;

        let Some(consumer_def) = self.consumers.get(consumer_name) else {
            return Err(mcp_invalid(format!(
                "Consumer '{}' not found",
                consumer_name
            )));
        };

        let metadata = serde_json::json!({
            "name": consumer_name,
            "description": consumer_def.description,
            "broker_type": consumer_def.endpoint.endpoint_type.name(),
            "uri": uri_str,
            "hint": format!(
                "Use the 'consume_from_{}' tool to receive messages from this endpoint.",
                to_tool_suffix(consumer_name)
            ),
        });

        Ok(ReadResourceResult::new(vec![ResourceContents::text(
            serde_json::to_string_pretty(&metadata).unwrap_or_default(),
            request.uri,
        )]))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let args = Cli::parse();

    if let Some(schema_path) = args.schema {
        let schema = schemars::schema_for!(McpAppConfig);
        let schema_json =
            serde_json::to_string_pretty(&schema).context("Failed to serialize schema")?;

        if schema_path == "-" {
            println!("{}", schema_json);
        } else {
            let path = std::path::Path::new(&schema_path);
            if let Some(parent) = path.parent() {
                if !parent.as_os_str().is_empty() && !parent.exists() {
                    std::fs::create_dir_all(parent)
                        .context("Failed to create parent directory for schema")?;
                }
            }
            std::fs::write(path, schema_json).context("Failed to write schema file")?;
        }
        return Ok(());
    }

    let mut config = load_mcp_config(&args.config)?;

    // Apply CLI overrides
    if let Some(transport) = args.transport {
        config.mcp.transport = transport.into();
    }
    if let Some(port) = args.port {
        let current_bind = if config.mcp.bind.is_empty() {
            "0.0.0.0:3000"
        } else {
            &config.mcp.bind
        };

        if let Ok(mut addr) = current_bind.parse::<std::net::SocketAddr>() {
            addr.set_port(port);
            config.mcp.bind = addr.to_string();
        } else {
            config.mcp.bind = format!("0.0.0.0:{}", port);
        }
    }

    if config.mcp.bind.is_empty() {
        config.mcp.bind = "0.0.0.0:3000".to_string();
    }

    // Register publishers from config
    for (name, publisher_conf) in &config.publishers {
        let mut route = mq_bridge::Route::new(
            mq_bridge::models::Endpoint {
                endpoint_type: mq_bridge::models::EndpointType::Null,
                ..Default::default()
            },
            publisher_conf.endpoint.clone(),
        );
        route.options.description = publisher_conf.description.clone();
        publisher_registry::register_publisher(
            name,
            mq_bridge_app::publisher_registry::PublisherDefinition {
                publisher: route.create_publisher().await?,
                description: route.options.description.clone(),
                endpoint_type: route.output.endpoint_type.name().to_string(),
            },
        );
        info!("Registered publisher '{}'", name);
    }

    // Register consumer definitions from config
    for (name, consumer_conf) in &config.consumers {
        let def = consumer_registry::ConsumerDefinition {
            endpoint: consumer_conf.endpoint.clone(),
            description: consumer_conf.description.clone(),
        };
        consumer_registry::register_consumer_definition(name, def);
        info!("Registered consumer '{}'", name);
    }

    let server = MqBridgeMcpServer::new(&config, "mq-bridge-mcp");
    server.start(&config.mcp).await?;

    Ok(())
}
