//  mq-bridge-app
//  © Copyright 2025, by Marco Mengelkoch
//  Licensed under MIT License, see License file for more details
//  git clone https://github.com/marcomq/mq-bridge-app
use crate::publisher_registry;

use std::sync::Arc;

use axum::serve;
use mq_bridge::{models::TlsConfig, CanonicalMessage};
use rmcp::{
    model::{
        CallToolRequestParams, CallToolResult, ListToolsResult, PaginatedRequestParams,
        ServerCapabilities, ServerInfo,
    },
    service::RequestContext,
    ErrorData as McpError, ServerHandler, ServiceExt,
};
use tracing::info;

use crate::config::{AppConfig, McpConfig};

fn mcp_internal(msg: String) -> McpError {
    McpError::internal_error(msg, None)
}

fn mcp_invalid(msg: String) -> McpError {
    McpError::invalid_params(msg, None)
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
                    "metadata": { "type": "object" },
                    "id": { "type": "string" }
                },
                "required": ["payload"]
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
use self::tools::{ConnectorRef, EndpointInput, McpTool, McpToolAction};

pub struct MqBridgeMcpServer {
    tools: Arc<Vec<McpTool>>,
    server_name: Arc<str>,
}

impl Clone for MqBridgeMcpServer {
    fn clone(&self) -> Self {
        Self {
            tools: self.tools.clone(),
            server_name: self.server_name.clone(),
        }
    }
}

impl MqBridgeMcpServer {
    pub fn new(config: &AppConfig, server_name: impl Into<String>) -> Self {
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
        }
    }

    pub async fn start(self, mcp_config: &McpConfig) -> anyhow::Result<()> {
        let bind = &mcp_config.bind;
        match mcp_config.transport {
            crate::config::McpTransport::StreamableHttp => {
                self.start_streamable_http(bind, &mcp_config.tls).await
            }
            crate::config::McpTransport::Stdio => self.start_stdio().await,
        }
    }

    async fn start_streamable_http(
        self,
        bind: &str,
        tls_config: &Option<TlsConfig>,
    ) -> anyhow::Result<()> {
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
                let msg =
                    CanonicalMessage::from_json(args).map_err(|e| mcp_invalid(e.to_string()))?;
                let route_name = tool.connector.route_name.as_deref().unwrap_or_default();

                let Some(route) = publisher_registry::get_publisher_definition(route_name) else {
                    return Err(mcp_invalid(format!(
                        "Route definition '{}' not found for publisher tool",
                        route_name
                    )));
                };

                // Create a temporary, one-shot publisher from the route definition.
                let publisher = mq_bridge::Publisher::new(route.output.clone())
                    .await
                    .map_err(|e| {
                        mcp_internal(format!(
                            "Failed to create publisher for '{}': {}",
                            route_name, e
                        ))
                    })?;

                publisher
                    .send(msg.clone())
                    .await
                    .map_err(|e| mcp_internal(e.to_string()))?;
                Ok(tools::success(format!(
                    "Message published successfully. ID: {:032x}",
                    msg.message_id
                )))
            }

            McpToolAction::Introspect => {
                let mut publisher_list: Vec<serde_json::Value> = Vec::new();
                for name in publisher_registry::list_publisher_definitions() {
                    if let Some(route) = publisher_registry::get_publisher_definition(&name) {
                        let connector = endpoint_to_connector_ref(&route.output, &name);
                        serde_json::json!({
                            "name": format!("publish_to_{}", name.replace('-', "_")),
                            "description": route.options.description,
                            "type": connector.connector_type,
                        });
                    }
                }
                // Sort for consistent output
                publisher_list.sort_by(|a, b| {
                    a["name"]
                        .as_str()
                        .unwrap_or("")
                        .cmp(b["name"].as_str().unwrap_or(""))
                });

                let endpoint_list = publisher_list;

                Ok(tools::success(
                    serde_json::to_string_pretty(&endpoint_list).unwrap_or_default(),
                ))
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
                        "available_publishers": publisher_registry::list_publisher_definitions(),
                    }),
                };

                Ok(tools::success(status))
            }
        }
    }
}

impl ServerHandler for MqBridgeMcpServer {
    fn get_info(&self) -> ServerInfo {
        // ServerInfo is a type alias for InitializeResult (#[non_exhaustive]).
        // The implementation is also #[non_exhaustive], so struct literal syntax
        // is not possible — use Default + field assignment instead.
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
        // Dynamically build the tool list from the base tools and the registered publishers.
        let mut dynamic_tools = self.tools.clone().to_vec();

        for name in publisher_registry::list_publisher_definitions() {
            if let Some(route) = publisher_registry::get_publisher_definition(&name) {
                let connector = endpoint_to_connector_ref(&route.output, &name);
                dynamic_tools.push(McpTool {
                    name: format!("publish_to_{}", name.replace('-', "_")),
                    description: route.options.description.clone(),
                    action: McpToolAction::Publish,
                    connector,
                });
            }
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
            if let Some(route) = publisher_registry::get_publisher_definition(&route_name) {
                // Construct a temporary McpTool to pass to handle_tool_call
                let connector = endpoint_to_connector_ref(&route.output, &route_name);
                let temp_tool = McpTool {
                    name: request.name.to_string(),
                    description: route.options.description,
                    action: McpToolAction::Publish,
                    connector,
                };
                return self.handle_tool_call(&temp_tool, arguments).await;
            }
        }

        Err(mcp_invalid(format!("Unknown tool: {}", request.name)))
    }
}

pub async fn start_server(config: AppConfig) -> anyhow::Result<()> {
    let server = MqBridgeMcpServer::new(&config, "mq-bridge-mcp");
    server.start(&config.mcp).await
}

fn endpoint_to_connector_ref(
    endpoint: &mq_bridge::models::Endpoint,
    route_name: &str,
) -> ConnectorRef {
    ConnectorRef {
        connector_type: endpoint.endpoint_type.name().to_string(),
        route_name: Some(route_name.to_string()),
    }
}
