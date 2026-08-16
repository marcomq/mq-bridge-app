//! Copy-command conveniences layered over mq-bridge's route abstractions.

use std::any::Any;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use anyhow::{Context, anyhow, bail};
use async_trait::async_trait;
use mq_bridge::ReceivedBatch;
use mq_bridge::models::{Endpoint, EndpointType, FileConsumerMode, Middleware, MongoConsume};
use mq_bridge::traits::{
    BatchCommitFunc, BoxFuture, ConsumerError, CustomMiddlewareFactory, EndpointStatus,
    MessageConsumer, MessageDisposition,
};
use serde_json::json;
use sha2::{Digest, Sha256};
use zen_expression::compiler::{FetchFastTarget, Opcode};
use zen_expression::expression::Standard;
use zen_expression::{Expression, Variable, compile_expression};

const FILTER_MIDDLEWARE_NAME: &str = "__mq_bridge_app_copy_filter_v1";
static FILTER_FACTORY_REGISTRATION: OnceLock<Result<(), String>> = OnceLock::new();

/// The native mechanism used to resume a copy source.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumeCapability {
    Native,
    CursorBased,
    ExternalCheckpoint,
}

impl ResumeCapability {
    /// Names the mechanism in logs, so a resumed copy says what it resumed from.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::CursorBased => "cursor",
            Self::ExternalCheckpoint => "external-checkpoint",
        }
    }
}

/// Compiles and attaches a first-class copy filter to the source endpoint.
///
/// The custom middleware is an implementation detail. Consumer middlewares are
/// applied in reverse, so the last entry is the innermost wrapper: the filter
/// runs immediately after the source and before URI-configured transform or
/// other processing middleware.
pub fn configure_filter(input: &mut Endpoint, expression: &str) -> anyhow::Result<()> {
    CompiledFilter::new(expression).context("invalid filter expression")?;
    ensure_filter_factory()?;
    let entry = Middleware::Custom {
        name: FILTER_MIDDLEWARE_NAME.to_string(),
        config: json!({ "expression": expression }),
    };
    // `buffer` is the one middleware the filter must not slip under: it
    // downcasts its inner consumer against a closed list of cancel-safe sources,
    // so anything between it and the source fails route startup. Sitting just
    // outside it keeps the filter ahead of every other middleware.
    match input
        .middlewares
        .iter()
        .rposition(|middleware| matches!(middleware, Middleware::Buffer(_)))
    {
        Some(index) => input.middlewares.insert(index, entry),
        None => input.middlewares.push(entry),
    }
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
    redact_credentials(&mut definition, None, None);
    strip_absent_fields(&mut definition, 0);
    let encoded = serde_json::to_vec(&definition)?;
    let digest = Sha256::digest(encoded);
    Ok(format!("copy-{}", hex::encode(&digest[..16])))
}

/// Drops absent config fields so the identity survives an mq-bridge upgrade.
///
/// Endpoint configs serialize every field, so a release that adds one optional
/// setting would otherwise change every existing checkpoint id and silently
/// restart each `--resume` from the beginning. An added `Option` arrives as
/// `null` and is removed here; a new field with a non-null default still moves
/// the identity.
///
/// Endpoint objects themselves are left alone. Their type is a flattened tag,
/// and a `null`-valued variant such as `null:` is the only thing naming it.
fn strip_absent_fields(value: &mut serde_json::Value, depth: usize) {
    match value {
        serde_json::Value::Object(map) => {
            if depth >= 2 && map.values().any(|value| !value.is_null()) {
                map.retain(|_, value| !value.is_null());
            }
            for value in map.values_mut() {
                strip_absent_fields(value, depth + 1);
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                strip_absent_fields(value, depth);
            }
        }
        _ => {}
    }
}

/// Replaces credential values so rotating a password does not fork the checkpoint.
///
/// Not a disclosure control — the result is hashed and never shown. It only
/// decides which fields may change the identity, which makes over-redaction the
/// risk worth avoiding: blanking a *semantic* field would let two genuinely
/// different pipelines share one checkpoint. Names are matched narrowly, and
/// anything unrecognised keeps contributing to the hash.
fn redact_credentials(value: &mut serde_json::Value, key: Option<&str>, parent: Option<&str>) {
    match value {
        serde_json::Value::Object(map) => {
            for (child_key, child) in map {
                redact_credentials(child, Some(child_key), key);
            }
        }
        serde_json::Value::Array(values) => {
            for value in values {
                redact_credentials(value, key, parent);
            }
        }
        serde_json::Value::String(text) => {
            if is_credential(key, parent) {
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

/// Whether `key` names a credential rather than a pipeline setting.
///
/// `key` on its own is ambiguous — key material under `encryption`, a dedup key
/// *template* under `deduplication` — so the enclosing field decides. Names like
/// `partition_key`, `metadata_key` and `cookie_metadata_key` are deliberately
/// excluded: they name a field to read, not a secret.
fn is_credential(key: Option<&str>, parent: Option<&str>) -> bool {
    let Some(key) = key.map(str::to_ascii_lowercase) else {
        return false;
    };
    ["password", "passphrase", "secret", "token", "credential"]
        .iter()
        .any(|needle| key.contains(needle))
        || matches!(key.as_str(), "authorization" | "cookie" | "access_key")
        || (key == "key" && parent == Some("encryption"))
        || parent == Some("decrypt_keys")
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
            deferred: Mutex::new(Vec::new()),
        }))
    }
}

struct CompiledFilter {
    expression: Expression<Standard>,
    variables: Vec<String>,
    warned_absent_field: AtomicBool,
}

impl CompiledFilter {
    fn new(expression: &str) -> anyhow::Result<Self> {
        let expression = normalize_filter_expression(expression);
        let expression =
            compile_expression(&expression).map_err(|error| anyhow!(error.to_string()))?;
        let variables = referenced_variables(&expression);
        Ok(Self {
            expression,
            variables,
            warned_absent_field: AtomicBool::new(false),
        })
    }

    /// Whether this message satisfies the expression.
    ///
    /// A field that is absent or null means "does not match", the way a SQL
    /// `WHERE` treats NULL: one heterogeneous document should not end a copy
    /// that is otherwise running fine. A payload that is not a JSON object is
    /// still an error, because that means the filter was pointed at data it
    /// cannot read at all, and silently dropping everything would be worse.
    fn matches(&self, payload: &[u8]) -> anyhow::Result<bool> {
        let document: serde_json::Value = serde_json::from_slice(payload)
            .context("filter requires a structured JSON object payload")?;
        let object = document
            .as_object()
            .ok_or_else(|| anyhow!("filter requires a structured JSON object payload"))?;
        for variable in &self.variables {
            let Some(value) = object.get(variable).filter(|value| !value.is_null()) else {
                self.warn_absent_field(variable);
                return Ok(false);
            };
            if value.is_array() || value.is_object() {
                bail!(
                    "filter field `{variable}` is an array or object; only top-level scalar fields are supported"
                );
            }
        }
        match self
            .expression
            .evaluate(Variable::from(&document))
            .map_err(|error| anyhow!(error.to_string()))?
        {
            Variable::Bool(value) => Ok(value),
            _ => bail!("filter expression did not evaluate to a boolean"),
        }
    }

    /// Warns once per copy: a field that is never present drops every message,
    /// and a typo in the expression should not just look like an empty source.
    fn warn_absent_field(&self, field: &str) {
        if !self.warned_absent_field.swap(true, Ordering::Relaxed) {
            tracing::warn!(
                field,
                "filter field is absent or null; those messages are not copied"
            );
        }
    }
}

fn referenced_variables(expression: &Expression<Standard>) -> Vec<String> {
    let mut variables = Vec::new();
    for opcode in expression.bytecode().iter() {
        let variable = match opcode {
            Opcode::FetchEnv(name) => Some(name.as_ref()),
            Opcode::FetchFast(path) => path.iter().find_map(|target| match target {
                FetchFastTarget::String(name) => Some(name.as_ref()),
                _ => None,
            }),
            _ => None,
        };
        if let Some(variable) = variable.filter(|name| !variables.iter().any(|item| item == name)) {
            variables.push(variable.to_string());
        }
    }
    variables
}

fn normalize_filter_expression(expression: &str) -> String {
    let mut normalized = String::with_capacity(expression.len());
    let mut chars = expression.chars().peekable();
    let mut quote = None;
    let mut escaped = false;

    while let Some(character) = chars.next() {
        if let Some(delimiter) = quote {
            normalized.push(character);
            if escaped {
                escaped = false;
            } else if character == '\\' {
                escaped = true;
            } else if character == delimiter {
                quote = None;
            }
            continue;
        }

        match character {
            '\'' | '"' => {
                quote = Some(character);
                normalized.push(character);
            }
            '&' if chars.next_if_eq(&'&').is_some() => normalized.push_str(" and "),
            '|' if chars.next_if_eq(&'|').is_some() => normalized.push_str(" or "),
            _ => normalized.push(character),
        }
    }

    normalized
}

struct FilterConsumer {
    inner: Box<dyn MessageConsumer>,
    filter: CompiledFilter,
    /// Commits for batches the filter emptied, held back on sources that need
    /// ordered commits. See [`FilterConsumer::receive_batch`].
    ///
    /// Behind a `Mutex` only to stay `Sync`, which `MessageConsumer` requires: a
    /// boxed `FnOnce` is `Send` but not `Sync`. It is only ever reached through
    /// `&mut self`, so `get_mut` suffices and nothing ever blocks.
    deferred: Mutex<Vec<(BatchCommitFunc, usize)>>,
}

impl FilterConsumer {
    fn deferred_commits(&mut self) -> &mut Vec<(BatchCommitFunc, usize)> {
        self.deferred
            .get_mut()
            .expect("held commits are only reached through &mut self, never locked")
    }
}

#[async_trait]
impl MessageConsumer for FilterConsumer {
    fn on_connect_hook(&self) -> Option<BoxFuture<'_, anyhow::Result<()>>> {
        self.inner.on_connect_hook()
    }

    fn on_disconnect_hook(&self) -> Option<BoxFuture<'_, anyhow::Result<()>>> {
        self.inner.on_disconnect_hook()
    }

    /// Reads until a batch has something to copy, acknowledging what it drops.
    ///
    /// A batch the filter empties still has to be acknowledged, but on a
    /// cumulative-ack source acknowledging it here would jump ahead of batches
    /// the route is still writing — the route's ordered sequencer only sees the
    /// commits this method returns — and a crash in that window would lose them.
    /// So when the source needs ordered commits, the emptied batch's commit is
    /// held and runs from inside the next retained batch's commit, which the
    /// sequencer does order. Sources that ack individually have no such coupling
    /// and are acknowledged straight away.
    ///
    /// A drain that ends while commits are still held simply re-reads and
    /// re-drops those messages next run; nothing reaches the destination twice.
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
                let dropped = keep_flags.len();
                if self.inner.commit_requires_order() {
                    self.deferred_commits().push((batch.commit, dropped));
                } else {
                    (batch.commit)(vec![MessageDisposition::Ack; dropped])
                        .await
                        .map_err(ConsumerError::Connection)?;
                }
                continue;
            }

            let deferred = std::mem::take(self.deferred_commits());
            let expected = kept.len();
            let commit: BatchCommitFunc = Box::new(move |dispositions| {
                Box::pin(async move {
                    if dispositions.len() != expected {
                        bail!(
                            "copy filter commit received {} dispositions for {expected} retained messages",
                            dispositions.len()
                        );
                    }
                    for (commit, dropped) in deferred {
                        commit(vec![MessageDisposition::Ack; dropped]).await?;
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
    use mq_bridge::models::{
        BufferMiddleware, KafkaConfig, MetricsMiddleware, MqttConfig, SqlxConfig,
    };
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
    fn logical_operators_inside_strings_are_not_rewritten() {
        let filter = CompiledFilter::new(r#"label == "A&&B" || label == "C""#).unwrap();
        assert!(filter.matches(br#"{"label":"A&&B"}"#).unwrap());
        assert!(filter.matches(br#"{"label":"C"}"#).unwrap());
    }

    #[test]
    fn invalid_and_unstructured_filters_are_errors() {
        assert!(CompiledFilter::new("(").is_err());
        let filter = CompiledFilter::new("amount > 10").unwrap();
        assert!(filter.matches(b"not json").is_err());
    }

    // A heterogeneous document must not end an otherwise healthy copy, so an
    // absent or null field reads as "does not match" the way SQL treats NULL.
    #[test]
    fn absent_and_null_fields_do_not_match_and_do_not_fail() {
        let filter = CompiledFilter::new("amount > 10").unwrap();
        assert!(!filter.matches(br#"{"country":"DE"}"#).unwrap());
        assert!(!filter.matches(br#"{"amount":null}"#).unwrap());
        assert!(filter.matches(br#"{"amount":75}"#).unwrap());
    }

    // `buffer` refuses anything between itself and the source, so the filter has
    // to wrap it rather than land underneath it.
    #[test]
    fn the_filter_wraps_buffer_rather_than_splitting_it_from_the_source() {
        let mut input = endpoint(EndpointType::Kafka(KafkaConfig {
            url: "kafka://localhost:9092".to_string(),
            topic: Some("orders".to_string()),
            ..Default::default()
        }));
        input.middlewares.push(Middleware::Buffer(BufferMiddleware {
            max_messages: 100,
            max_delay_ms: 10,
        }));
        configure_filter(&mut input, "amount > 10").unwrap();

        assert!(matches!(input.middlewares[0], Middleware::Custom { .. }));
        assert!(matches!(input.middlewares[1], Middleware::Buffer(_)));
    }

    #[test]
    fn the_filter_is_innermost_without_a_buffer() {
        let mut input = endpoint(EndpointType::Kafka(KafkaConfig {
            url: "kafka://localhost:9092".to_string(),
            topic: Some("orders".to_string()),
            ..Default::default()
        }));
        input
            .middlewares
            .push(Middleware::Metrics(MetricsMiddleware {}));
        configure_filter(&mut input, "amount > 10").unwrap();

        assert!(matches!(input.middlewares[1], Middleware::Custom { .. }));
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

    // `partition_key` reads like a credential to a `*_key` rule, but it is
    // routing: two destinations that differ in it are different pipelines and
    // must not share a checkpoint.
    #[test]
    fn key_named_settings_still_separate_pipelines() {
        let input = endpoint(EndpointType::Sqlx(SqlxConfig {
            url: "postgres://alice@localhost/app".to_string(),
            table: "orders".to_string(),
            cursor_column: Some("id".to_string()),
            ..Default::default()
        }));
        let sink = |partition_key: &str| {
            endpoint(EndpointType::Kafka(KafkaConfig {
                url: "kafka://localhost:9092".to_string(),
                topic: Some("orders".to_string()),
                partition_key: Some(partition_key.to_string()),
                ..Default::default()
            }))
        };
        assert_ne!(
            checkpoint_identity(&input, &sink("region"), None).unwrap(),
            checkpoint_identity(&input, &sink("customer"), None).unwrap()
        );
    }

    // An mq-bridge release that adds one optional setting must not silently
    // restart every resumable copy from the beginning.
    #[test]
    fn a_newly_added_absent_setting_keeps_the_identity_stable() {
        let mut definition = json!({
            "source": { "middlewares": [], "sql": { "url": "postgres://localhost/app" } },
            "destination": { "middlewares": [], "null": null },
            "filter": null,
        });
        let mut upgraded = json!({
            "source": {
                "middlewares": [],
                "sql": { "url": "postgres://localhost/app", "a_new_setting": null }
            },
            "destination": { "middlewares": [], "null": null },
            "filter": null,
        });
        strip_absent_fields(&mut definition, 0);
        strip_absent_fields(&mut upgraded, 0);
        assert_eq!(definition, upgraded);
        // The endpoint's own type tag is null-valued and must survive.
        assert!(definition["destination"].get("null").is_some());
    }

    /// Serves scripted batches and records each commit in the order it ran, so
    /// tests can assert *when* a batch was acknowledged, not just how.
    struct ScriptedConsumer {
        batches: std::collections::VecDeque<Vec<CanonicalMessage>>,
        commits: Arc<Mutex<Vec<Vec<MessageDisposition>>>>,
        ordered: bool,
    }

    impl ScriptedConsumer {
        fn new(
            batches: impl IntoIterator<Item = Vec<CanonicalMessage>>,
            ordered: bool,
        ) -> (Self, Arc<Mutex<Vec<Vec<MessageDisposition>>>>) {
            let commits = Arc::new(Mutex::new(Vec::new()));
            let consumer = Self {
                batches: batches.into_iter().collect(),
                commits: Arc::clone(&commits),
                ordered,
            };
            (consumer, commits)
        }
    }

    #[async_trait]
    impl MessageConsumer for ScriptedConsumer {
        async fn receive_batch(
            &mut self,
            _max_messages: usize,
        ) -> Result<ReceivedBatch, ConsumerError> {
            let Some(messages) = self.batches.pop_front() else {
                return Ok(ReceivedBatch::empty());
            };
            let commits = Arc::clone(&self.commits);
            Ok(ReceivedBatch {
                messages,
                commit: Box::new(move |result| {
                    Box::pin(async move {
                        commits.lock().unwrap().push(result);
                        Ok(())
                    })
                }),
            })
        }

        fn commit_requires_order(&self) -> bool {
            self.ordered
        }

        fn as_any(&self) -> &dyn Any {
            self
        }
    }

    fn filter_consumer(inner: ScriptedConsumer, expression: &str) -> FilterConsumer {
        FilterConsumer {
            inner: Box::new(inner),
            filter: CompiledFilter::new(expression).unwrap(),
            deferred: Mutex::new(Vec::new()),
        }
    }

    fn message(amount: i64) -> CanonicalMessage {
        CanonicalMessage::new(format!(r#"{{"amount":{amount}}}"#).into_bytes(), None)
    }

    #[tokio::test]
    async fn filtered_messages_ack_and_retained_failures_do_not_advance_past_the_gap() {
        let (inner, commits) =
            ScriptedConsumer::new([vec![message(100), message(1), message(200)]], true);
        let mut consumer = filter_consumer(inner, "amount > 10");

        let batch = consumer.receive_batch(10).await.unwrap();
        assert_eq!(batch.messages.len(), 2);
        (batch.commit)(vec![MessageDisposition::Nack, MessageDisposition::Ack])
            .await
            .unwrap();
        let commits = commits.lock().unwrap();
        assert!(matches!(
            commits[0][..],
            [
                MessageDisposition::Nack,
                MessageDisposition::Ack,
                MessageDisposition::Ack
            ]
        ));
    }

    // The whole point of holding the commit back: on a cumulative-ack source it
    // must not run until the route's sequencer says so, or it acks past batches
    // that are still being written.
    #[tokio::test]
    async fn an_emptied_batch_commits_with_the_next_retained_batch_when_order_matters() {
        let (inner, commits) = ScriptedConsumer::new([vec![message(1)], vec![message(100)]], true);
        let mut consumer = filter_consumer(inner, "amount > 10");

        let batch = consumer.receive_batch(10).await.unwrap();
        assert_eq!(batch.messages.len(), 1);
        assert!(
            commits.lock().unwrap().is_empty(),
            "the emptied batch must not be acknowledged before the route commits"
        );

        (batch.commit)(vec![MessageDisposition::Ack]).await.unwrap();
        let commits = commits.lock().unwrap();
        assert_eq!(commits.len(), 2, "both batches acknowledge, in order");
        assert!(matches!(commits[0][..], [MessageDisposition::Ack]));
        assert!(matches!(commits[1][..], [MessageDisposition::Ack]));
    }

    #[tokio::test]
    async fn an_emptied_batch_is_acknowledged_at_once_when_order_does_not_matter() {
        let (inner, commits) = ScriptedConsumer::new([vec![message(1)], vec![message(100)]], false);
        let mut consumer = filter_consumer(inner, "amount > 10");

        let batch = consumer.receive_batch(10).await.unwrap();
        assert_eq!(batch.messages.len(), 1);
        assert_eq!(commits.lock().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn a_drained_source_is_reported_empty_even_with_commits_still_held() {
        let (inner, commits) = ScriptedConsumer::new([vec![message(1)]], true);
        let mut consumer = filter_consumer(inner, "amount > 10");

        let empty = consumer.receive_batch(10).await.unwrap();
        assert!(
            empty.messages.is_empty(),
            "the drain signal reaches the route"
        );
        assert!(commits.lock().unwrap().is_empty());
    }
}
