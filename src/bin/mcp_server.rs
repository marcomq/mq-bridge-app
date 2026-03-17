//  mq-bridge-mcp: An MCP server for mq-bridge endpoints.
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

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
        pub route_name: Option<String>,
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

    pub fn success<T: Serialize>(data: T) -> rmcp::model::CallToolResult {
        let content_str = serde_json::to_string(&data).unwrap_or_default();
        rmcp::model::CallToolResult::success(vec![rmcp::model::Content::text(content_str)])
    }

    pub fn to_rmcp_tool(tool: &McpTool) -> Tool {
        let schema = match tool.action {
            McpToolAction::Publish => serde_json::json!({
                "type": "object",
                "properties": {
                    "messages": {
                        "type": "array",
                        "items": { "$ref": "#/$defs/message" }
                    }
                },
                "required": ["messages"],
                "$defs": { "message": { "type": "object", "properties": { "payload": { "type": "string" } }, "required": ["payload"] } }
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

fn msg_to_string(msg: &CanonicalMessage) -> String {
    if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&msg.payload) {
        json.to_string()
    } else {
        msg.get_payload_str().to_string()
    }
}

pub struct MqBridgeMcpServer {
    tools: Arc<Vec<McpTool>>,
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
                description: "Lists all available publishers that can be used to send messages. \
                    These are derived from route definitions where `input` is null."
                    .into(),
                action: McpToolAction::Introspect,
                connector: ConnectorRef {
                    route_name: None,
                    connector_type: "internal".into(),
                },
            },
            McpTool {
                name: "list_consumers".into(),
                description: "Lists all available consumers that can be used to receive messages."
                    .into(),
                action: McpToolAction::Introspect,
                connector: ConnectorRef {
                    route_name: None,
                    connector_type: "internal_consumer".into(),
                },
            },
            McpTool {
                name: "get_status".into(),
                description: "Returns the current status of running routes. \
                    In MCP mode, this will be empty unless routes are deployed dynamically."
                    .into(),
                action: McpToolAction::Status,
                connector: ConnectorRef {
                    route_name: None,
                    connector_type: "internal".into(),
                },
            },
        ];

        // Sort tools by name for consistent output
        tool_list.sort_by(|a, b| a.name.cmp(&b.name));

        Self {
            tools: Arc::new(tool_list),
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

        // The factory closure is called once per client session.
        // clone() is cheap since all fields are Arc-wrapped.
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
                let input: serde_json::Value = args;
                let messages_val = input
                    .get("messages")
                    .ok_or_else(|| mcp_invalid("Missing 'messages' argument".into()))?;
                let messages_arr = messages_val
                    .as_array()
                    .ok_or_else(|| mcp_invalid("'messages' must be an array".into()))?;

                let mut canonical_messages = Vec::new();
                for m_val in messages_arr {
                    let msg = CanonicalMessage::from_json(m_val.clone())
                        .map_err(|e| mcp_invalid(e.to_string()))?;
                    canonical_messages.push(msg);
                }

                let route_name = tool.connector.route_name.as_deref().unwrap_or_default();
                let Some(pub_def) = publisher_registry::get_publisher(route_name) else {
                    return Err(mcp_invalid(format!(
                        "Route definition '{}' not found for publisher tool",
                        route_name
                    )));
                };

                let publisher = pub_def.publisher.clone();
                match publisher.send_batch(canonical_messages).await {
                    Ok(_) => Ok(tools::success("Batch published successfully".to_string())),
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
                                "name": format!("consume_from_{}", name.replace('-', "_")),
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
                    return Ok(tools::success(
                        serde_json::to_string_pretty(&consumer_list).unwrap_or_default(),
                    ));
                }

                // Default introspect is list_publishers
                let mut endpoint_list: Vec<serde_json::Value> = Vec::new();
                for name in publisher_registry::list_publishers() {
                    if let Some(pub_def) = publisher_registry::get_publisher(&name) {
                        endpoint_list.push(serde_json::json!({
                            "name": format!("publish_to_{}", name.replace('-', "_")),
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

                Ok(tools::success(
                    serde_json::to_string_pretty(&endpoint_list).unwrap_or_default(),
                ))
            }

            McpToolAction::Consume => {
                let consumer_name = tool.connector.route_name.as_deref().unwrap_or_default();
                let Some(consumer_def) = self.consumers.get(consumer_name) else {
                    return Err(mcp_invalid(format!(
                        "Consumer definition '{}' not found for consumer tool",
                        consumer_name
                    )));
                };

                let consume_args: ConsumeArgs = serde_json::from_value(args).unwrap_or_default();
                let timeout = Duration::from_millis(consume_args.timeout_ms.unwrap_or(5000));
                let max_messages = consume_args.max_messages.unwrap_or(10);

                let mut consumer = consumer_def
                    .endpoint
                    .create_consumer(consumer_name)
                    .await
                    .map_err(|e| {
                        mcp_internal(format!(
                            "Failed to create consumer for '{}': {}",
                            consumer_name, e
                        ))
                    })?;

                match tokio::time::timeout(timeout, consumer.receive_batch(max_messages)).await {
                    Ok(Ok(batch)) => {
                        let msgs_str: Vec<String> =
                            batch.messages.iter().map(msg_to_string).collect();
                        let result_json = serde_json::to_string(&msgs_str).unwrap_or_default();

                        let dispositions =
                            vec![mq_bridge::traits::MessageDisposition::Ack; batch.messages.len()];
                        (batch.commit)(dispositions).await.ok();

                        Ok(tools::success(result_json))
                    }
                    Ok(Err(e)) => Err(mcp_internal(format!("Error consuming batch: {}", e))),
                    Err(_) => Ok(tools::success(format!(
                        "Timed out after {}ms",
                        timeout.as_millis()
                    ))),
                }
            }

            McpToolAction::Status => {
                let input: EndpointInput =
                    serde_json::from_value(args).unwrap_or(EndpointInput { name: None });

                let routes = mq_bridge::list_routes();
                let status: serde_json::Value = match input.name.as_deref() {
                    Some(name) => {
                        let is_running = routes.contains(&name.to_string());
                        serde_json::json!({ name: if is_running { "running" } else { "stopped" } })
                    }
                    None => serde_json::json!({
                        "running_routes": routes,
                        "available_publishers": publisher_registry::list_publishers(),
                    }),
                };

                Ok(tools::success(status))
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
            "mq-bridge MCP server. Use list_endpoints to discover available \
             message queue endpoints, then publish or consume messages."
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
        // Dynamically build the tool list from the base tools and the registered publishers.
        let mut dynamic_tools = self.tools.clone().to_vec();

        for name in publisher_registry::list_publishers() {
            if let Some(pub_def) = publisher_registry::get_publisher(&name) {
                let connector = ConnectorRef {
                    connector_type: pub_def.endpoint_type.clone(),
                    route_name: Some(name.clone()),
                };
                dynamic_tools.push(McpTool {
                    name: format!("publish_to_{}", name.replace('-', "_")),
                    description: pub_def.description,
                    action: McpToolAction::Publish,
                    connector,
                });
            }
        }

        // Add dynamic consumer tools
        for (name, def) in self.consumers.iter() {
            let connector = ConnectorRef {
                connector_type: def.endpoint.endpoint_type.name().to_string(),
                route_name: Some(name.clone()),
            };
            dynamic_tools.push(McpTool {
                name: format!("consume_from_{}", name.replace('-', "_")),
                description: format!("Consume messages from {}", def.description),
                action: McpToolAction::Consume,
                connector,
            });
        }
        dynamic_tools.sort_by(|a, b| a.name.cmp(&b.name));

        Ok(ListToolsResult {
            tools: dynamic_tools.iter().map(tools::to_rmcp_tool).collect(),
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

        // Find the tool dynamically.
        let tool = self.tools.iter().find(|t| t.name == request.name).cloned();

        let arguments = request.arguments.map(serde_json::Value::Object);

        if let Some(tool) = tool {
            // It's a static tool like 'list_publishers' or 'get_status'
            return self.handle_tool_call(&tool, arguments).await;
        }

        // If not a static tool, check if it's a dynamic publisher tool.
        if let Some(route_name) = request.name.strip_prefix("publish_to_") {
            let route_name = route_name.replace('_', "-");
            if let Some(pub_def) = publisher_registry::get_publisher(&route_name) {
                // Construct a temporary McpTool to pass to handle_tool_call
                let connector = ConnectorRef {
                    connector_type: pub_def.endpoint_type.clone(),
                    route_name: Some(route_name.clone()),
                };
                let temp_tool = McpTool {
                    name: request.name.to_string(),
                    description: pub_def.description,
                    action: McpToolAction::Publish,
                    connector,
                };
                return self.handle_tool_call(&temp_tool, arguments).await;
            }
        }

        // Check for dynamic consumer tool.
        if let Some(consumer_name) = request.name.strip_prefix("consume_from_") {
            let consumer_name = consumer_name.replace('_', "-");
            if let Some(def) = self.consumers.get(&consumer_name) {
                let connector = ConnectorRef {
                    connector_type: def.endpoint.endpoint_type.name().to_string(),
                    route_name: Some(consumer_name.to_string()),
                };
                let temp_tool = McpTool {
                    name: request.name.to_string(),
                    description: def.description.clone(),
                    action: McpToolAction::Consume,
                    connector,
                };
                return self.handle_tool_call(&temp_tool, arguments).await;
            }
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

    async fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _ctx: RequestContext<rmcp::RoleServer>,
    ) -> Result<ReadResourceResult, McpError> {
        let uri_str = request.uri.as_str();
        let consumer_name = if let Some(name) = uri_str.strip_prefix("mq://") {
            name
        } else {
            return Err(mcp_invalid(format!("Invalid resource URI: {}", uri_str)));
        };

        let Some(consumer_def) = self.consumers.get(consumer_name) else {
            return Err(mcp_invalid(format!(
                "Consumer '{}' not found",
                consumer_name
            )));
        };

        let mut consumer = consumer_def
            .endpoint
            .create_consumer(consumer_name)
            .await
            .map_err(|e| {
                mcp_internal(format!(
                    "Failed to create consumer for '{}': {}",
                    consumer_name, e
                ))
            })?;

        // For resource reading, we do a quick batch consume (e.g. up to 10 messages)
        // effectively peeking or draining depending on the consumer implementation.
        let batch = consumer
            .receive_batch(10)
            .await
            .map_err(|e| mcp_internal(e.to_string()))?;

        let mut content = String::new();
        for msg in &batch.messages {
            content.push_str(&msg_to_string(msg));
            content.push('\n');
        }

        // Commit to acknowledge receipt (assuming read_resource consumes)
        if !batch.messages.is_empty() {
            let dispositions =
                vec![mq_bridge::traits::MessageDisposition::Ack; batch.messages.len()];
            (batch.commit)(dispositions)
                .await
                .map_err(|e| mcp_internal(format!("Failed to commit offset: {}", e)))?;
        }

        Ok(ReadResourceResult::new(vec![ResourceContents::text(
            content,
            request.uri,
        )]))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt::init();

    let args = Cli::parse();

    let mut config = load_mcp_config(&args.config)?;

    // Apply CLI overrides
    if let Some(transport) = args.transport {
        config.mcp.transport = transport.into();
    }
    if let Some(port) = args.port {
        // Assuming bind address is 0.0.0.0 if not specified or just updating port
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
        info!("Registered publisher definition '{}'", name);
    }

    // Register consumers from config
    for (name, consumer_conf) in &config.consumers {
        let def = consumer_registry::ConsumerDefinition {
            endpoint: consumer_conf.endpoint.clone(),
            description: consumer_conf.description.clone(),
        };
        consumer_registry::register_consumer_definition(name, def);
        info!("Registered consumer definition '{}'", name);
    }

    let server = MqBridgeMcpServer::new(&config, "mq-bridge-mcp");
    server.start(&config.mcp).await?;

    Ok(())
}
