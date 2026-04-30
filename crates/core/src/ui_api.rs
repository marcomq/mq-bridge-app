use crate::config::AppConfig;
use crate::ui_app::{
    ConsumerStatusResponse, PublishRequest, PublishResponse, RuntimeStatusResponse, UiApp,
    UpdateConfigError,
};
use anyhow::{Result, anyhow};
use schemars::schema_for;
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "kind", content = "payload", rename_all = "snake_case")]
pub enum UiCommand {
    GetConfig,
    GetSchema,
    UpdateConfig(AppConfig),
    ConsumerStatus { name: String },
    StartConsumer { name: String },
    StopConsumer { name: String },
    GetMessages { consumer: Option<String> },
    Publish(PublishRequest),
    RuntimeStatus,
    RenderMetrics,
}

#[derive(Debug, Clone, serde::Serialize)]
pub enum UiResponse {
    Ack { message: String },
    Config(AppConfig),
    Schema(serde_json::Value),
    ConsumerStatus(ConsumerStatusResponse),
    Messages(HashMap<String, VecDeque<serde_json::Value>>),
    Publish(PublishResponse),
    RuntimeStatus(RuntimeStatusResponse),
    Metrics(String),
}

#[derive(Debug)]
pub enum UiCommandError {
    InvalidInput(anyhow::Error),
    NotFound {
        resource: &'static str,
        name: String,
    },
    Failed(anyhow::Error),
}

impl UiCommandError {
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput(anyhow!(message.into()))
    }

    pub fn http_status_code(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "400",
            Self::NotFound { .. } => "404",
            Self::Failed(_) => "500",
        }
    }
}

impl std::fmt::Display for UiCommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput(err) | Self::Failed(err) => write!(f, "{err}"),
            Self::NotFound { resource, name } => write!(f, "{resource} not found: {name}"),
        }
    }
}

impl std::error::Error for UiCommandError {}

impl UiApp {
    fn map_update_config_error(error: UpdateConfigError) -> UiCommandError {
        match error {
            UpdateConfigError::Validation(message)
            | UpdateConfigError::UnsupportedCustomResponses(message)
            | UpdateConfigError::RegisterOutputEndpoint(message)
            | UpdateConfigError::DeployRouteFailed(message) => {
                UiCommandError::InvalidInput(anyhow!(message))
            }
            UpdateConfigError::Other(error) => UiCommandError::Failed(error),
        }
    }

    pub async fn execute(&self, command: UiCommand) -> Result<UiResponse, UiCommandError> {
        match command {
            UiCommand::GetConfig => Ok(UiResponse::Config(self.get_config().await)),
            UiCommand::GetSchema => {
                let schema = schema_for!(AppConfig);
                Ok(UiResponse::Schema(
                    serde_json::to_value(schema).map_err(|e| UiCommandError::Failed(e.into()))?,
                ))
            }
            UiCommand::UpdateConfig(config) => self
                .update_config(config)
                .await
                .map(|()| UiResponse::Ack {
                    message: "Configuration updated".to_string(),
                })
                .map_err(Self::map_update_config_error),
            UiCommand::ConsumerStatus { name } => self
                .consumer_status(&name)
                .await
                .map(UiResponse::ConsumerStatus)
                .ok_or(UiCommandError::NotFound {
                    resource: "Consumer",
                    name,
                }),
            UiCommand::StartConsumer { name } => {
                let started = self
                    .start_consumer(&name)
                    .await
                    .map_err(UiCommandError::Failed)?;
                if started {
                    Ok(UiResponse::Ack {
                        message: "Started".to_string(),
                    })
                } else {
                    Err(UiCommandError::NotFound {
                        resource: "Consumer",
                        name,
                    })
                }
            }
            UiCommand::StopConsumer { name } => {
                self.stop_consumer(&name).await;
                Ok(UiResponse::Ack {
                    message: "Stopped".to_string(),
                })
            }
            UiCommand::GetMessages { consumer } => Ok(UiResponse::Messages(
                self.get_messages(consumer.as_deref()).await,
            )),
            UiCommand::Publish(request) => {
                let publisher_name = request.name.clone();
                self.publish(request)
                    .await
                    .map_err(UiCommandError::Failed)?
                    .map(UiResponse::Publish)
                    .ok_or(UiCommandError::NotFound {
                        resource: "Publisher",
                        name: publisher_name,
                    })
            }
            UiCommand::RuntimeStatus => Ok(UiResponse::RuntimeStatus(self.runtime_status().await)),
            UiCommand::RenderMetrics => Ok(UiResponse::Metrics(self.render_metrics())),
        }
    }
}
