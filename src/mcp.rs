//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app

use std::collections::HashMap;
use std::sync::Arc;

use axum::serve;
use mq_bridge::Route;
use rmcp::{
    model::{
        CallToolRequestParams, CallToolResult, ListToolsResult,
        PaginatedRequestParams, ServerCapabilities, ServerInfo,
    },
    service::RequestContext,
    ErrorData as McpError, ServerHandler, ServiceExt,
};
use tracing::info;

use crate::config::McpConfig;

mod error {
    use rmcp::ErrorData as McpError;

    pub fn mcp_internal(msg: String) -> McpError {
        McpError::internal_error(msg, None)
    }

    pub fn mcp_invalid(msg: String) -> McpError {
        McpError::invalid_params(msg, None)
    }
}
use self::error::{mcp_internal, mcp_invalid};

mod tools {
    use rmcp::model::Tool;
    use serde::{Deserialize, Serialize};

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub struct ConnectorRef {
        pub connector_type: String,
        pub topic: Option<String>,
        pub subject: Option<String>,
        pub group_id: Option<String>,
    }

    #[derive(Clone, Debug)]
    pub struct McpTool {
        pub name: String,
        pub description: String,
        pub action: McpToolAction,
        pub connector: ConnectorRef,
    }

    #[derive(Clone, Debug, Serialize, Deserialize)]
    pub enum McpToolAction {
        Publish,
        Consume { timeout_ms: u64 },
        Introspect,
        Status,
    }

    #[derive(Deserialize)]
    pub struct PublishInput {
        pub payload: String,
        pub headers: Option<std::collections::HashMap<String, String>>,
        pub correlation_id: Option<String>,
    }

    #[derive(Deserialize, Default)]
    pub struct ConsumeInput {
        pub correlation_id: Option<String>,
    }

    #[derive(Deserialize)]
    pub struct EndpointInput {
        pub name: Option<String>,
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
                    "payload": { "type": "string" },
                    "headers": { "type": "object" },
                    "correlation_id": { "type": "string" }
                },
                "required": ["payload"]
            }),
            McpToolAction::Consume { .. } => serde_json::json!({
                "type": "object",
                "properties": {
                    "correlation_id": { "type": "string" }
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
        };

        let mut rmcp_tool = Tool::default();
        rmcp_tool.name = tool.name.clone().into();
        rmcp_tool.description = Some(tool.description.clone().into());
        rmcp_tool.input_schema = serde_json::from_value(schema).unwrap_or_default();
        rmcp_tool
    }
}
use self::tools::{
    ConnectorRef, ConsumeInput, EndpointInput, McpTool, McpToolAction, PublishInput,
};

pub trait ConnectorBus: Send + Sync + 'static {
    fn publish(
        &self,
        connector: &ConnectorRef,
        payload: &str,
        headers: Option<std::collections::HashMap<String, String>>,
        correlation_id: Option<String>,
    ) -> impl std::future::Future<Output = anyhow::Result<String>> + Send;

    fn consume_next(
        &self,
        connector: &ConnectorRef,
        timeout_ms: u64,
        correlation_id: Option<String>,
    ) -> impl std::future::Future<Output = anyhow::Result<Option<String>>> + Send;

    fn endpoint_status(
        &self,
        name: Option<&str>,
    ) -> impl std::future::Future<Output = anyhow::Result<String>> + Send;
}

struct AppBus {
    routes: Arc<HashMap<String, Route>>,
}

impl ConnectorBus for AppBus {
    async fn publish(
        &self,
        _connector: &ConnectorRef,
        _payload: &str,
        _headers: Option<std::collections::HashMap<String, String>>,
        _correlation_id: Option<String>,
    ) -> anyhow::Result<String> {
        Ok("msg_id_placeholder".to_string())
    }

    async fn consume_next(
        &self,
        _connector: &ConnectorRef,
        _timeout_ms: u64,
        _correlation_id: Option<String>,
    ) -> anyhow::Result<Option<String>> {
        Ok(None)
    }

    async fn endpoint_status(&self, name: Option<&str>) -> anyhow::Result<String> {
        if let Some(n) = name {
            if self.routes.contains_key(n) {
                Ok("Running".to_string())
            } else {
                Ok("Unknown".to_string())
            }
        } else {
            Ok(format!("{} routes active", self.routes.len()))
        }
    }
}

pub struct MqBridgeMcpServer<B: ConnectorBus> {
    tools: Arc<Vec<McpTool>>,
    bus: Arc<B>,
    server_name: Arc<str>,
}

impl<B: ConnectorBus> Clone for MqBridgeMcpServer<B> {
    fn clone(&self) -> Self {
        Self {
            tools: self.tools.clone(),
            bus: self.bus.clone(),
            server_name: self.server_name.clone(),
        }
    }
}

impl<B: ConnectorBus> MqBridgeMcpServer<B> {
    pub fn new(_config: &McpConfig, bus: B, server_name: impl Into<String>) -> Self {
        let tool_list = vec![
            McpTool {
                name: "list_endpoints".into(),
                description: "Lists all configured and available endpoints with \
                    their type (Kafka/NATS/etc.), name, and description. \
                    Use this first if you are unsure which endpoint to use."
                    .into(),
                action: McpToolAction::Introspect,
                connector: ConnectorRef {
                    connector_type: "internal".into(),
                    topic: None,
                    subject: None,
                    group_id: None,
                },
            },
            McpTool {
                name: "endpoint_status".into(),
                description: "Returns the current connection status and basic \
                    metrics for a specific endpoint. Useful to verify an endpoint \
                    is healthy before publishing."
                    .into(),
                action: McpToolAction::Status,
                connector: ConnectorRef {
                    connector_type: "internal".into(),
                    topic: None,
                    subject: None,
                    group_id: None,
                },
            },
        ];

        // TODO: Iterate over routes/config to add tools dynamically

        Self {
            tools: Arc::new(tool_list),
            bus: Arc::new(bus),
            server_name: server_name.into().into(),
        }
    }

    pub async fn start(self, config: &McpConfig) -> anyhow::Result<()> {
        let bind = &config.bind;
        match config.transport {
            crate::config::McpTransport::StreamableHttp => {
                self.start_streamable_http(bind).await
            }
            crate::config::McpTransport::Stdio => self.start_stdio().await,
        }
    }

    async fn start_streamable_http(self, bind: &str) -> anyhow::Result<()> {
        use axum::Router;
        use rmcp::transport::streamable_http_server::{
            session::local::LocalSessionManager, StreamableHttpServerConfig,
            StreamableHttpService,
        };

        let addr: std::net::SocketAddr = bind.parse()?;
        info!("MCP StreamableHTTP server starting on {}", addr);

        // Factory-Closure wird pro Client-Session aufgerufen.
        // self.clone() ist günstig da alle Felder Arc-wrapped sind.
        let me = self.clone();
        let service = StreamableHttpService::new(
            move || Ok(me.clone()),
            Arc::new(LocalSessionManager::default()),
            StreamableHttpServerConfig::default(),
        );

        let router = Router::new().nest_service("/mcp", service);
        let listener = tokio::net::TcpListener::bind(addr).await?;
        serve(listener, router).await?;

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
        name: &str,
        args: Option<serde_json::Value>,
    ) -> Result<CallToolResult, McpError> {
        let tool = self
            .tools
            .iter()
            .find(|t| t.name == name)
            .ok_or_else(|| mcp_invalid(format!("Unknown tool: {name}")))?;

        let args = args.unwrap_or(serde_json::Value::Object(Default::default()));

        match &tool.action {
            McpToolAction::Publish => {
                let input: PublishInput =
                    serde_json::from_value(args).map_err(|e| mcp_invalid(e.to_string()))?;

                let msg_id = self
                    .bus
                    .publish(
                        &tool.connector,
                        &input.payload,
                        input.headers,
                        input.correlation_id,
                    )
                    .await
                    .map_err(|e| mcp_internal(e.to_string()))?;

                Ok(tools::success(format!(
                    "Message published successfully. ID: {msg_id}"
                )))
            }

            McpToolAction::Consume { timeout_ms } => {
                let input: ConsumeInput = serde_json::from_value(args).unwrap_or_default();

                match self
                    .bus
                    .consume_next(&tool.connector, *timeout_ms, input.correlation_id)
                    .await
                    .map_err(|e| mcp_internal(e.to_string()))?
                {
                    Some(msg) => Ok(tools::success(msg)),
                    None => Ok(tools::success("No messages available (timeout)")),
                }
            }

            McpToolAction::Introspect => {
                let endpoint_list: Vec<serde_json::Value> = self
                    .tools
                    .iter()
                    .filter(|t| t.connector.connector_type != "internal")
                    .map(|t| {
                        serde_json::json!({
                            "name": t.name,
                            "description": t.description,
                            "type": t.connector.connector_type,
                            "topic": t.connector.topic,
                        })
                    })
                    .collect();

                Ok(tools::success(
                    serde_json::to_string_pretty(&endpoint_list).unwrap_or_default(),
                ))
            }

            McpToolAction::Status => {
                let input: EndpointInput =
                    serde_json::from_value(args).unwrap_or(EndpointInput { name: None });

                let status = self
                    .bus
                    .endpoint_status(input.name.as_deref())
                    .await
                    .map_err(|e| mcp_internal(e.to_string()))?;

                Ok(tools::success(status))
            }
        }
    }
}

impl<B: ConnectorBus> ServerHandler for MqBridgeMcpServer<B> {
    fn get_info(&self) -> ServerInfo {
        // ServerInfo = type alias für InitializeResult (#[non_exhaustive])
        // Implementation ist ebenfalls #[non_exhaustive]
        // → kein struct literal möglich, Default + Feldzuweisung verwenden
        let mut info = ServerInfo::default();
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info.instructions = Some(
            "mq-bridge MCP server. Use list_endpoints to discover available \
             message queue endpoints, then publish or consume messages."
                .into(),
        );
        info.server_info.name = self.server_name.as_ref().to_string().into();
        info.server_info.version = env!("CARGO_PKG_VERSION").into();
        info
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _ctx: RequestContext<rmcp::RoleServer>,
    ) -> Result<ListToolsResult, McpError> {
        let tools = self.tools.iter().map(tools::to_rmcp_tool).collect();

        Ok(ListToolsResult {
            tools,
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
        self.handle_tool_call(&request.name, arguments).await
    }
}

pub async fn start_server(config: McpConfig, routes: HashMap<String, Route>) -> anyhow::Result<()> {
    let bus = AppBus {
        routes: Arc::new(routes),
    };
    let server = MqBridgeMcpServer::new(&config, bus, "mq-bridge-mcp");
    server.start(&config).await
}