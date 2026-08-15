//! Copy-command conveniences layered over mq-bridge's route abstractions.

use std::any::Any;
use std::sync::{Arc, OnceLock};

use anyhow::{Context, anyhow, bail};
use async_trait::async_trait;
use evalexpr::{
    ContextWithMutableVariables, DefaultNumericTypes, HashMapContext, Node, Value,
    build_operator_tree,
};
use mq_bridge::ReceivedBatch;
use mq_bridge::models::{Endpoint, EndpointType, FileConsumerMode, Middleware, MongoConsume};
use mq_bridge::traits::{
    BatchCommitFunc, BoxFuture, ConsumerError, CustomMiddlewareFactory, EndpointStatus,
    MessageConsumer, MessageDisposition,
};
use serde_json::json;
use sha2::{Digest, Sha256};

const FILTER_MIDDLEWARE_NAME: &str = "__mq_bridge_app_copy_filter_v1";
static FILTER_FACTORY_REGISTRATION: OnceLock<Result<(), String>> = OnceLock::new();

/// The native mechanism used to resume a copy source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeCapability {
    Native,
    CursorBased,
    ExternalCheckpoint,
}

/// Compiles and attaches a first-class copy filter to the source endpoint.
///
/// The custom middleware is an implementation detail. Appending it makes it the
/// innermost consumer wrapper, so it runs immediately after the source and before
/// URI-configured transform or other processing middleware.
pub fn configure_filter(input: &mut Endpoint, expression: &str) -> anyhow::Result<()> {
    CompiledFilter::new(expression).context("invalid filter expression")?;
    ensure_filter_factory()?;
    input.middlewares.push(Middleware::Custom {
        name: FILTER_MIDDLEWARE_NAME.to_string(),
        config: json!({ "expression": expression }),
    });
    Ok(())
}

/// Configures the source's existing durable resume mechanism and returns its kind.
///
/// The generated identity includes the credential-redacted source, destination,
/// and filter, so changing pipeline semantics starts a distinct checkpoint while
/// credential rotation alone does not.
pub fn configure_resume(
    input: &mut Endpoint,
    output: &Endpoint,
    filter: Option<&str>,
) -> anyhow::Result<ResumeCapability> {
    let state_id = checkpoint_identity(input, output, filter)?;

    match &mut input.endpoint_type {
        EndpointType::Kafka(config) => {
            config.group_id.get_or_insert_with(|| state_id.clone());
            Ok(ResumeCapability::Native)
        }
        EndpointType::MongoDb(config) => {
            let mode = config.consume.unwrap_or({
                if config.change_stream {
                    MongoConsume::CaptureNew
                } else {
                    MongoConsume::CaptureAll
                }
            });
            match mode {
                MongoConsume::CaptureNew | MongoConsume::CaptureAll => {
                    config.cursor_id.get_or_insert_with(|| state_id.clone());
                    Ok(ResumeCapability::CursorBased)
                }
                MongoConsume::Snapshot => bail!(
                    "source `mongodb` does not support resumable copy in snapshot mode; use capture_all or capture_new"
                ),
                MongoConsume::Consumer => unsupported("mongodb consumer mode"),
            }
        }
        EndpointType::PostgresCdc(config) => {
            if config.temporary_slot {
                bail!(
                    "source `postgres_cdc` cannot resume with temporary_slot=true; use a persistent replication slot"
                );
            }
            if config.slot_name == "mq_bridge_slot" {
                config.slot_name = postgres_slot_name(&state_id);
            }
            config.cursor_id.get_or_insert_with(|| state_id.clone());
            Ok(ResumeCapability::Native)
        }
        EndpointType::Sqlx(config) if config.publication.is_some() => {
            config.cursor_id.get_or_insert_with(|| state_id.clone());
            config
                .slot_name
                .get_or_insert_with(|| postgres_slot_name(&state_id));
            Ok(ResumeCapability::Native)
        }
        EndpointType::Sqlx(config) => {
            if config.cursor_column.is_none() {
                bail!(
                    "source `sql` needs a monotonic `cursor_column` for resumable copy; add `?cursor_column=<column>` to --from"
                );
            }
            config.cursor_id.get_or_insert_with(|| state_id.clone());
            Ok(ResumeCapability::CursorBased)
        }
        EndpointType::ClickHouse(config) => {
            if config.cursor_column.is_none() {
                bail!("source `clickhouse` needs a monotonic `cursor_column` for resumable copy");
            }
            if config.checkpoint_store.is_none() {
                bail!(
                    "source `clickhouse` needs an external `checkpoint_store` for resumable copy"
                );
            }
            config.cursor_id.get_or_insert_with(|| state_id.clone());
            Ok(ResumeCapability::ExternalCheckpoint)
        }
        EndpointType::ObjectStore(config) => {
            if config.checkpoint_store.is_none() {
                bail!(
                    "source `object_store` needs an external `checkpoint_store` for resumable copy"
                );
            }
            config.cursor_id.get_or_insert_with(|| state_id.clone());
            Ok(ResumeCapability::ExternalCheckpoint)
        }
        EndpointType::File(config) => match config.mode {
            Some(FileConsumerMode::GroupSubscribe { .. }) => bail!(
                "source `file` has offset state, but resumable copy is not enabled because its current batch commit is not safe across partial failures"
            ),
            _ => unsupported("file"),
        },
        EndpointType::Nats(_) => bail!(
            "source `nats` has durable JetStream consumers, but resumable copy is not enabled because the durable identity cannot include the destination and filter"
        ),
        EndpointType::Mqtt(_) => unsupported("mqtt"),
        endpoint_type => unsupported(endpoint_kind(endpoint_type)),
    }
}

fn unsupported(source: &str) -> anyhow::Result<ResumeCapability> {
    bail!("source `{source}` does not support resumable copy")
}

fn endpoint_kind(endpoint_type: &EndpointType) -> &'static str {
    match endpoint_type {
        EndpointType::Amqp(_) => "amqp",
        EndpointType::Aws(_) => "aws",
        EndpointType::File(_) => "file",
        EndpointType::Grpc(_) => "grpc",
        EndpointType::Http(_) => "http",
        EndpointType::IbmMq(_) => "ibm_mq",
        EndpointType::Kafka(_) => "kafka",
        EndpointType::Memory(_) => "memory",
        EndpointType::MongoDb(_) => "mongodb",
        EndpointType::Mqtt(_) => "mqtt",
        EndpointType::Nats(_) => "nats",
        EndpointType::Null => "null",
        EndpointType::ObjectStore(_) => "object_store",
        EndpointType::PostgresCdc(_) => "postgres_cdc",
        EndpointType::RedisStreams(_) => "redis_streams",
        EndpointType::Sqlx(_) => "sql",
        EndpointType::WebSocket(_) => "websocket",
        EndpointType::ZeroMq(_) => "zeromq",
        _ => "this endpoint",
    }
}

fn postgres_slot_name(state_id: &str) -> String {
    format!("mqb_{}", state_id.replace('-', "_"))
}

fn checkpoint_identity(
    input: &Endpoint,
    output: &Endpoint,
    filter: Option<&str>,
) -> anyhow::Result<String> {
    let mut definition = json!({
        "source": input,
        "destination": output,
        "filter": filter,
    });
    redact_credentials(&mut definition, None);
    let encoded = serde_json::to_vec(&definition)?;
    let digest = Sha256::digest(encoded);
    Ok(format!("copy-{}", hex::encode(&digest[..16])))
}

fn redact_credentials(value: &mut serde_json::Value, key: Option<&str>) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, value) in map {
                redact_credentials(value, Some(key));
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_credentials(value, key);
            }
        }
        serde_json::Value::String(text) => {
            let key = key.unwrap_or_default().to_ascii_lowercase();
            if ["password", "secret", "token", "authorization", "cookie"]
                .iter()
                .any(|needle| key.contains(needle))
                || key == "key"
                || key.ends_with("_key")
            {
                *text = "[redacted]".to_string();
                return;
            }
            if let Ok(mut url) = url::Url::parse(text)
                && url.password().is_some()
            {
                let _ = url.set_password(None);
                *text = url.to_string();
            }
        }
        _ => {}
    }
}

fn ensure_filter_factory() -> anyhow::Result<()> {
    FILTER_FACTORY_REGISTRATION
        .get_or_init(|| {
            mq_bridge::extensions::register_middleware_factory(
                FILTER_MIDDLEWARE_NAME,
                Arc::new(CopyFilterFactory),
            )
            .map_err(|error| error.to_string())
        })
        .clone()
        .map_err(anyhow::Error::msg)
}

#[derive(Debug)]
struct CopyFilterFactory;

#[async_trait]
impl CustomMiddlewareFactory for CopyFilterFactory {
    async fn apply_consumer(
        &self,
        consumer: Box<dyn MessageConsumer>,
        _route_name: &str,
        config: &serde_json::Value,
    ) -> anyhow::Result<Box<dyn MessageConsumer>> {
        let expression = config
            .get("expression")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| anyhow!("copy filter requires an expression"))?;
        Ok(Box::new(FilterConsumer {
            inner: consumer,
            filter: CompiledFilter::new(expression).context("invalid filter expression")?,
        }))
    }
}

struct CompiledFilter {
    tree: Node<DefaultNumericTypes>,
    variables: Vec<String>,
}

impl CompiledFilter {
    fn new(expression: &str) -> anyhow::Result<Self> {
        let tree = build_operator_tree::<DefaultNumericTypes>(expression)?;
        let variables = tree
            .iter_variable_identifiers()
            .map(str::to_string)
            .collect();
        Ok(Self { tree, variables })
    }

    fn matches(&self, payload: &[u8]) -> anyhow::Result<bool> {
        let document: serde_json::Value = serde_json::from_slice(payload)
            .context("filter requires a structured JSON object payload")?;
        let object = document
            .as_object()
            .ok_or_else(|| anyhow!("filter requires a structured JSON object payload"))?;
        let mut context = HashMapContext::<DefaultNumericTypes>::new();
        for variable in &self.variables {
            let value = object
                .get(variable)
                .ok_or_else(|| anyhow!("filter field `{variable}` is missing"))?;
            context
                .set_value(variable.clone(), expression_value(variable, value)?)
                .map_err(|error| anyhow!(error))?;
        }
        self.tree
            .eval_boolean_with_context(&context)
            .map_err(|error| anyhow!(error))
    }
}

fn expression_value(
    field: &str,
    value: &serde_json::Value,
) -> anyhow::Result<Value<DefaultNumericTypes>> {
    match value {
        serde_json::Value::Null => Ok(Value::from(())),
        serde_json::Value::Bool(value) => Ok(Value::from(*value)),
        serde_json::Value::String(value) => Ok(Value::from(value.clone())),
        serde_json::Value::Number(value) => {
            if let Some(value) = value.as_i64() {
                Ok(Value::from_int(value))
            } else if let Some(value) = value.as_f64() {
                Ok(Value::from_float(value))
            } else {
                bail!("filter field `{field}` is outside the supported numeric range")
            }
        }
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => bail!(
            "filter field `{field}` is an array or object; only top-level scalar fields are supported"
        ),
    }
}

struct FilterConsumer {
    inner: Box<dyn MessageConsumer>,
    filter: CompiledFilter,
}

#[async_trait]
impl MessageConsumer for FilterConsumer {
    fn on_connect_hook(&self) -> Option<BoxFuture<'_, anyhow::Result<()>>> {
        self.inner.on_connect_hook()
    }

    fn on_disconnect_hook(&self) -> Option<BoxFuture<'_, anyhow::Result<()>>> {
        self.inner.on_disconnect_hook()
    }

    async fn receive_batch(&mut self, max_messages: usize) -> Result<ReceivedBatch, ConsumerError> {
        loop {
            let batch = self.inner.receive_batch(max_messages).await?;
            if batch.messages.is_empty() {
                return Ok(batch);
            }

            let mut kept = Vec::with_capacity(batch.messages.len());
            let mut keep_flags = Vec::with_capacity(batch.messages.len());
            for message in batch.messages {
                let keep = self
                    .filter
                    .matches(message.payload.as_ref())
                    .map_err(ConsumerError::Permanent)?;
                keep_flags.push(keep);
                if keep {
                    kept.push(message);
                }
            }

            if kept.is_empty() {
                (batch.commit)(vec![MessageDisposition::Ack; keep_flags.len()])
                    .await
                    .map_err(ConsumerError::Connection)?;
                continue;
            }

            let expected = kept.len();
            let commit: BatchCommitFunc = Box::new(move |dispositions| {
                Box::pin(async move {
                    if dispositions.len() != expected {
                        bail!(
                            "copy filter commit received {} dispositions for {expected} retained messages",
                            dispositions.len()
                        );
                    }
                    let mut retained = dispositions.into_iter();
                    let expanded = keep_flags
                        .into_iter()
                        .map(|keep| {
                            if keep {
                                retained.next().unwrap_or(MessageDisposition::Nack)
                            } else {
                                MessageDisposition::Ack
                            }
                        })
                        .collect();
                    (batch.commit)(expanded).await
                })
            });
            return Ok(ReceivedBatch {
                messages: kept,
                commit,
            });
        }
    }

    fn set_exit_on_empty(&mut self, exit_on_empty: bool) {
        self.inner.set_exit_on_empty(exit_on_empty);
    }

    fn commit_requires_order(&self) -> bool {
        self.inner.commit_requires_order()
    }

    async fn status(&self) -> EndpointStatus {
        self.inner.status().await
    }

    async fn close(&mut self) -> anyhow::Result<()> {
        self.inner.close().await
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mq_bridge::CanonicalMessage;
    use mq_bridge::models::{KafkaConfig, MqttConfig, SqlxConfig};
    use std::sync::Mutex;

    fn endpoint(endpoint_type: EndpointType) -> Endpoint {
        Endpoint::new(endpoint_type)
    }

    #[test]
    fn structured_scalar_fields_are_filtered() {
        let filter = CompiledFilter::new(r#"country == "DE" && amount >= 50"#).unwrap();
        assert!(filter.matches(br#"{"country":"DE","amount":75}"#).unwrap());
        assert!(!filter.matches(br#"{"country":"US","amount":75}"#).unwrap());
    }

    #[test]
    fn invalid_and_unstructured_filters_are_errors() {
        assert!(CompiledFilter::new("(").is_err());
        let filter = CompiledFilter::new("amount > 10").unwrap();
        assert!(filter.matches(b"not json").is_err());
    }

    #[test]
    fn resume_configures_native_and_cursor_sources() {
        let output = endpoint(EndpointType::Null);
        let mut kafka = endpoint(EndpointType::Kafka(KafkaConfig {
            url: "kafka://localhost:9092".to_string(),
            topic: Some("orders".to_string()),
            ..Default::default()
        }));
        assert_eq!(
            configure_resume(&mut kafka, &output, Some("amount > 10")).unwrap(),
            ResumeCapability::Native
        );
        let EndpointType::Kafka(kafka) = kafka.endpoint_type else {
            unreachable!()
        };
        assert!(kafka.group_id.unwrap().starts_with("copy-"));

        let mut sql = endpoint(EndpointType::Sqlx(SqlxConfig {
            url: "postgres://alice:secret@localhost/app".to_string(),
            table: "orders".to_string(),
            cursor_column: Some("id".to_string()),
            ..Default::default()
        }));
        assert_eq!(
            configure_resume(&mut sql, &output, None).unwrap(),
            ResumeCapability::CursorBased
        );
        let EndpointType::Sqlx(sql) = sql.endpoint_type else {
            unreachable!()
        };
        assert!(sql.cursor_id.unwrap().starts_with("copy-"));
        assert!(sql.checkpoint_store.is_none());
    }

    #[test]
    fn resume_rejects_unsupported_sources_early() {
        let mut input = endpoint(EndpointType::Mqtt(MqttConfig::default()));
        let error = configure_resume(&mut input, &endpoint(EndpointType::Null), None).unwrap_err();
        assert_eq!(
            error.to_string(),
            "source `mqtt` does not support resumable copy"
        );
    }

    #[test]
    fn checkpoint_identity_changes_with_semantics_not_passwords() {
        let output = endpoint(EndpointType::Null);
        let source = |password: &str| {
            endpoint(EndpointType::Sqlx(SqlxConfig {
                url: format!("postgres://alice:{password}@localhost/app"),
                table: "orders".to_string(),
                cursor_column: Some("id".to_string()),
                ..Default::default()
            }))
        };
        let first = checkpoint_identity(&source("one"), &output, Some("amount > 10")).unwrap();
        let rotated = checkpoint_identity(&source("two"), &output, Some("amount > 10")).unwrap();
        let changed = checkpoint_identity(&source("two"), &output, Some("amount > 20")).unwrap();
        assert_eq!(first, rotated);
        assert_ne!(first, changed);
    }

    struct OneBatchConsumer {
        messages: Option<Vec<CanonicalMessage>>,
        dispositions: Arc<Mutex<Vec<MessageDisposition>>>,
    }

    #[async_trait]
    impl MessageConsumer for OneBatchConsumer {
        async fn receive_batch(
            &mut self,
            _max_messages: usize,
        ) -> Result<ReceivedBatch, ConsumerError> {
            let Some(messages) = self.messages.take() else {
                return Ok(ReceivedBatch::empty());
            };
            let dispositions = Arc::clone(&self.dispositions);
            Ok(ReceivedBatch {
                messages,
                commit: Box::new(move |result| {
                    Box::pin(async move {
                        *dispositions.lock().unwrap() = result;
                        Ok(())
                    })
                }),
            })
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    fn message(amount: i64) -> CanonicalMessage {
        CanonicalMessage::new(format!(r#"{{"amount":{amount}}}"#).into_bytes(), None)
    }

    #[tokio::test]
    async fn filtered_messages_ack_and_retained_failures_do_not_advance_past_the_gap() {
        let dispositions = Arc::new(Mutex::new(Vec::new()));
        let inner = OneBatchConsumer {
            messages: Some(vec![message(100), message(1), message(200)]),
            dispositions: Arc::clone(&dispositions),
        };
        let mut consumer = FilterConsumer {
            inner: Box::new(inner),
            filter: CompiledFilter::new("amount > 10").unwrap(),
        };

        let batch = consumer.receive_batch(10).await.unwrap();
        assert_eq!(batch.messages.len(), 2);
        (batch.commit)(vec![MessageDisposition::Nack, MessageDisposition::Ack])
            .await
            .unwrap();
        assert!(matches!(
            dispositions.lock().unwrap()[0],
            MessageDisposition::Nack
        ));
        assert!(matches!(
            dispositions.lock().unwrap()[1],
            MessageDisposition::Ack
        ));
        assert!(matches!(
            dispositions.lock().unwrap()[2],
            MessageDisposition::Ack
        ));
    }

    #[tokio::test]
    async fn fully_filtered_batch_is_successfully_acknowledged() {
        let dispositions = Arc::new(Mutex::new(Vec::new()));
        let inner = OneBatchConsumer {
            messages: Some(vec![message(1)]),
            dispositions: Arc::clone(&dispositions),
        };
        let mut consumer = FilterConsumer {
            inner: Box::new(inner),
            filter: CompiledFilter::new("amount > 10").unwrap(),
        };

        let empty = consumer.receive_batch(10).await.unwrap();
        assert!(empty.messages.is_empty());
        assert!(matches!(
            dispositions.lock().unwrap()[0],
            MessageDisposition::Ack
        ));
    }
}
