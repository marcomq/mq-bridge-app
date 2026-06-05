/* This file is generated from Rust schemars schemas. Do not edit by hand. */



export interface AppConfig {
  log_level?: string;
  logger?: string;
  ui_addr?: string;
  metrics_addr?: string;
  routes?: Record<string, RouteConfig>;
  consumers?: ConsumerConfig[];
  publishers?: PublisherClient[];
  history?: Record<string, unknown>;
  env_vars?: Record<string, string>;
  config_security?: ConfigSecurity | null;
  extract_secrets?: boolean;
  default_tab?: string;
}

export interface ConsumerConfig {
  id?: string;
  name?: string;
  endpoint: Endpoint;
  comment?: string;
  response?: ConsumerResponseConfig | null;
  output?: ConsumerOutputConfig;
  message_capture?: ConsumerMessageCaptureConfig;
  description?: string;
  concurrency?: number;
  batch_size?: number;
  commit_concurrency_limit?: number;
}

export interface PublisherClient {
  id?: string;
  name?: string;
  endpoint: Endpoint;
  comment?: string;
  payload?: string;
  headers?: HeaderRow[];
  sort_order?: number | null;
}

export interface PublishRequest {
  name?: string;
  publisher_id?: string | null;
  payload: string;
  metadata?: Record<string, string>;
  endpoint?: Endpoint | null;
}

export interface RuntimeStatusResponse {
  active_consumers: string[];
  active_routes: string[];
  route_throughput: Record<string, number>;
  consumers: Record<string, ConsumerStatusSnapshot>;
}

export interface ConsumerStatusResponse {
  running: boolean;
  status: EndpointStatusSnapshot;
}

export interface StorageSecurityInfoResponse {
  target: string;
  encrypted: boolean;
  persistent: boolean;
  key_source: string;
  key_store_available: boolean;
  encrypted_config_available: boolean;
  persistent_messages_available: boolean;
  config_encrypted: boolean;
  messages_encrypted: boolean;
  messages_persistent: boolean;
  reason?: string | null;
  message_key_hex?: string | null;
  kid?: string | null;
}

export interface FeatureAvailabilityResponse {
  ibm_mq: boolean;
  kafka: boolean;
  nats: boolean;
  amqp: boolean;
  mqtt: boolean;
  http: boolean;
  grpc: boolean;
  zeromq: boolean;
  mongodb: boolean;
  aws: boolean;
  sled: boolean;
}

export interface RouteConfig {
  enabled?: boolean;
  input: Endpoint;
  output?: Endpoint;
  description?: string;
  concurrency?: number;
  batch_size?: number;
  commit_concurrency_limit?: number;
}

export interface Endpoint {
  middlewares?: Middleware[];
}

export type Middleware = Record<string, never>;

export interface DeduplicationMiddleware {
  sled_path: string;
  ttl_seconds: number;
}

export type MetricsMiddleware = Record<string, never>;

export interface DeadLetterQueueMiddleware {
  endpoint: Endpoint;
}

export interface RetryMiddleware {
  max_attempts?: number;
  initial_interval_ms?: number;
  max_interval_ms?: number;
  multiplier?: number;
}

export interface RandomPanicMiddleware {
  mode?: FaultMode;
  trigger_on_message?: number | null;
  enabled?: boolean;
}

export type FaultMode = "panic" | "disconnect" | "timeout" | "json_format_error" | "nack";

export interface DelayMiddleware {
  delay_ms: number;
}

export interface WeakJoinMiddleware {
  group_by: string;
  expected_count: number;
  timeout_ms: number;
}

export interface LimiterMiddleware {
  messages_per_second: number;
}

export interface BufferMiddleware {
  max_messages: number;
  max_delay_ms: number;
}

export interface CookieJarMiddleware {
  shared_scope?: string | null;
  cookie_metadata_key?: string;
  set_cookie_metadata_key?: string;
  capture_metadata_keys?: string[];
  export_metadata_prefix?: string | null;
  inject_metadata?: Record<string, string>;
}

export interface AwsConfig {
  queue_url?: string | null;
  topic_arn?: string | null;
  region?: string | null;
  endpoint_url?: string | null;
  access_key?: string | null;
  secret_key?: string | null;
  session_token?: string | null;
  max_messages?: number | null;
  wait_time_seconds?: number | null;
  binary_payload_mode?: boolean;
}

export interface KafkaConfig {
  url: string;
  topic?: string | null;
  username?: string | null;
  password?: string | null;
  tls?: TlsConfig;
  group_id?: string | null;
  delayed_ack?: boolean;
  producer_options?: unknown[][] | null;
  consumer_options?: unknown[][] | null;
}

export interface TlsConfig {
  required?: boolean;
  ca_file?: string | null;
  cert_file?: string | null;
  key_file?: string | null;
  cert_password?: string | null;
  accept_invalid_certs?: boolean;
}

export interface NatsConfig {
  url: string;
  subject?: string | null;
  stream?: string | null;
  username?: string | null;
  password?: string | null;
  tls?: TlsConfig;
  token?: string | null;
  request_reply?: boolean;
  request_timeout_ms?: number | null;
  delayed_ack?: boolean;
  no_jetstream?: boolean;
  subscriber_mode?: boolean;
  stream_max_messages?: number | null;
  deliver_policy?: NatsDeliverPolicy | null;
  stream_max_bytes?: number | null;
  prefetch_count?: number | null;
}

export type NatsDeliverPolicy = "all" | "last" | "new" | "last_per_subject";

export interface FileConfig {
  path: string;
  delimiter?: string | null;
  format?: FileFormat;
}

export type FileFormat = "normal" | "json" | "text" | "raw";

export interface MemoryConfig {
  topic: string;
  capacity?: number | null;
  request_reply?: boolean;
  request_timeout_ms?: number | null;
  subscribe_mode?: boolean;
  enable_nack?: boolean;
}

export interface SledConfig {
  path: string;
  tree?: string | null;
  read_from_start?: boolean;
  delete_after_read?: boolean;
}

export interface AmqpConfig {
  url: string;
  queue?: string | null;
  subscribe_mode?: boolean;
  username?: string | null;
  password?: string | null;
  tls?: TlsConfig;
  exchange?: string | null;
  prefetch_count?: number | null;
  no_persistence?: boolean;
  no_declare_queue?: boolean;
  delayed_ack?: boolean;
}

export interface MongoDbConfig {
  url: string;
  collection?: string | null;
  username?: string | null;
  password?: string | null;
  tls?: TlsConfig;
  database: string;
  polling_interval_ms?: number | null;
  reply_polling_ms?: number | null;
  request_reply?: boolean;
  change_stream?: boolean;
  request_timeout_ms?: number | null;
  ttl_seconds?: number | null;
  capped_size_bytes?: number | null;
  format?: MongoDbFormat;
  cursor_id?: string | null;
  receive_query?: string | null;
  meta_collection?: string | null;
}

export type MongoDbFormat = "normal" | "json" | "text" | "raw";

export interface MqttConfig {
  url: string;
  topic?: string | null;
  username?: string | null;
  password?: string | null;
  tls?: TlsConfig;
  client_id?: string | null;
  queue_capacity?: number | null;
  max_inflight?: number | null;
  qos?: number | null;
  clean_session?: boolean;
  keep_alive_seconds?: number | null;
  protocol?: MqttProtocol;
  session_expiry_interval?: number | null;
  delayed_ack?: boolean;
}

export type MqttProtocol = "v5" | "v3";

export interface HttpConfig {
  url: string;
  path?: string | null;
  method?: string | null;
  tls?: TlsConfig;
  workers?: number | null;
  message_id_header?: string | null;
  request_timeout_ms?: number | null;
  internal_buffer_size?: number | null;
  fire_and_forget?: boolean;
  batch_concurrency?: number | null;
  tcp_keepalive_ms?: number | null;
  pool_idle_timeout_ms?: number | null;
  compression_enabled?: boolean;
  compression_threshold_bytes?: number | null;
  concurrency_limit?: number | null;
  basic_auth?: unknown[] | null;
  custom_headers?: Record<string, string>;
}

export interface WebSocketConfig {
  url: string;
  path?: string | null;
  message_id_header?: string | null;
  internal_buffer_size?: number | null;
}

export interface IbmMqConfig {
  url: string;
  queue?: string | null;
  topic?: string | null;
  queue_manager: string;
  channel: string;
  username?: string | null;
  password?: string | null;
  cipher_spec?: string | null;
  tls?: TlsConfig;
  max_message_size?: number;
  wait_timeout_ms?: number;
  internal_buffer_size?: number | null;
  disable_status_inq?: boolean;
}

export interface ZeroMqConfig {
  url: string;
  socket_type?: ZeroMqSocketType | null;
  topic?: string | null;
  bind?: boolean;
  internal_buffer_size?: number | null;
}

export type ZeroMqSocketType = "push" | "pull" | "pub" | "sub" | "req" | "rep";

export interface GrpcConfig {
  url: string;
  topic?: string | null;
  timeout_ms?: number | null;
  tls?: TlsConfig;
  server_mode?: boolean;
  initial_stream_window_size?: number | null;
  initial_connection_window_size?: number | null;
  concurrency_limit_per_connection?: number | null;
  http2_keepalive_interval_ms?: number | null;
  http2_keepalive_timeout_ms?: number | null;
  max_decoding_message_size?: number | null;
}

export interface SqlxConfig {
  url: string;
  username?: string | null;
  password?: string | null;
  table: string;
  insert_query?: string | null;
  select_query?: string | null;
  delete_after_read?: boolean;
  auto_create_table?: boolean;
  polling_interval_ms?: number | null;
  tls?: TlsConfig;
  max_connections?: number | null;
  min_connections?: number | null;
  acquire_timeout_ms?: number | null;
  idle_timeout_ms?: number | null;
  max_lifetime_ms?: number | null;
}

export interface SwitchConfig {
  metadata_key: string;
  cases: Record<string, Endpoint>;
  default?: Endpoint | null;
}

export type ResponseConfig = Record<string, never>;

export interface ConsumerResponseConfig {
  headers?: Record<string, string>;
  payload?: string;
}

export type ConsumerOutputConfig = { mode: "none" } | { publisher: string; publisher_id?: string | null; mode: "publisher" } | { response?: ConsumerResponseConfig | null; mode: "response" };

export interface ConsumerMessageCaptureConfig {
  enabled?: boolean;
  keep_last?: number;
}

export interface HeaderRow {
  key?: string;
  value?: string;
  enabled?: boolean;
}

export interface ConfigSecurity {
  mode?: ConfigSecurityMode;
}

export type ConfigSecurityMode = "unencrypted" | "balanced" | "env_temporary_messages" | "temporary_messages" | "sensitive" | "durable";

export interface ConsumerStatusSnapshot {
  running: boolean;
  status: EndpointStatusSnapshot;
  throughput: number;
  message_sequence: number;
  capture_enabled: boolean;
  capture_keep_last: number;
}

export interface EndpointStatusSnapshot {
  healthy: boolean;
  target: string;
  pending?: number | null;
  capacity?: number | null;
  error?: string | null;
  details: unknown;
}

