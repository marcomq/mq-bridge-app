import type { FeatureAvailabilityResponse } from './generated/ui-types';

type EndpointKindMetadata = {
  kind: string;
  basicFields: readonly string[];
  rootOrder: number;
  requestBar?: RequestBarLayout;
  publisher: boolean;
  consumer: boolean;
  responseCapable?: boolean;
  requiresFeature?: string;
};

export type RequestBarFieldDescriptor = {
  inputId: "pub-extra-1" | "pub-extra-2" | "pub-url";
  field: string;
  label: string;
  placeholder?: string;
};

export type RequestBarLayout = {
  showMethod?: boolean;
  fields: readonly RequestBarFieldDescriptor[];
};

const ENDPOINT_KIND_METADATA = [
  {
    kind: "http",
    rootOrder: 0,
    basicFields: ["method", "url", "path"],
    requestBar: {
      showMethod: true,
      fields: [{ inputId: "pub-url", field: "url", label: "URL", placeholder: "https://example.com/api" }],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "websocket",
    rootOrder: 1,
    basicFields: ["url"],
    requestBar: {
      showMethod: true,
      fields: [{ inputId: "pub-url", field: "url", label: "URL", placeholder: "ws://localhost:8080" }],
    },
    publisher: true,
    consumer: true,
  },
  {
    kind: "grpc",
    rootOrder: 2,
    basicFields: ["url", "topic"],
    requestBar: {
      fields: [{ inputId: "pub-url", field: "url", label: "URL", placeholder: "http://localhost:50051" }],
    },
    publisher: true,
    consumer: true,
  },
  {
    kind: "nats",
    rootOrder: 3,
    basicFields: ["url", "subject", "stream"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "subject", label: "SUBJECT", placeholder: "events.created" },
        { inputId: "pub-url", field: "url", label: "SERVERS", placeholder: "nats://localhost:4222" },
      ],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "memory",
    rootOrder: 4,
    basicFields: ["topic"],
    requestBar: {
      fields: [{ inputId: "pub-url", field: "topic", label: "TOPIC", placeholder: "events" }],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "amqp",
    rootOrder: 5,
    basicFields: ["url", "queue", "subscribe_mode", "exchange"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "queue", label: "QUEUE", placeholder: "jobs" },
        { inputId: "pub-url", field: "url", label: "URL", placeholder: "amqp://guest:guest@localhost:5672/%2f" },
      ],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "kafka",
    rootOrder: 6,
    basicFields: ["url", "topic", "group_id"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "topic", label: "TOPIC", placeholder: "events" },
        { inputId: "pub-url", field: "url", label: "BROKERS", placeholder: "kafka:9092" },
      ],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "mqtt",
    rootOrder: 7,
    basicFields: ["url", "topic"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "topic", label: "TOPIC", placeholder: "events/updates" },
        { inputId: "pub-url", field: "url", label: "BROKER", placeholder: "tcp://localhost:1883" },
      ],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "mongodb",
    rootOrder: 8,
    basicFields: ["url", "database", "collection", "change_stream"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "database", label: "DATABASE", placeholder: "app" },
        { inputId: "pub-extra-2", field: "collection", label: "COLLECTION", placeholder: "messages" },
        { inputId: "pub-url", field: "url", label: "URL", placeholder: "mongodb://localhost:27017" },
      ],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "sqlx",
    rootOrder: 9,
    basicFields: ["url", "table"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "table", label: "TABLE", placeholder: "events" },
        { inputId: "pub-url", field: "url", label: "URL", placeholder: "postgres://user:pass@localhost/db" },
      ],
    },
    publisher: true,
    consumer: true,
  },
  {
    kind: "zeromq",
    rootOrder: 10,
    basicFields: ["url", "topic"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "topic", label: "TOPIC", placeholder: "events" },
        { inputId: "pub-url", field: "url", label: "URL", placeholder: "tcp://127.0.0.1:5555" },
      ],
    },
    publisher: true,
    consumer: true,
    responseCapable: true,
  },
  {
    kind: "file",
    rootOrder: 11,
    basicFields: ["path", "mode"],
    requestBar: {
      fields: [{ inputId: "pub-url", field: "path", label: "PATH", placeholder: "/tmp/messages.jsonl" }],
    },
    publisher: true,
    consumer: true,
  },
  { kind: "static", rootOrder: 12, basicFields: ["static"], publisher: true, consumer: true },
  { kind: "ref", rootOrder: 13, basicFields: ["ref"], publisher: false, consumer: false },
  {
    kind: "sled",
    rootOrder: 14,
    basicFields: ["path", "tree"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "tree", label: "TREE", placeholder: "default" },
        { inputId: "pub-url", field: "path", label: "PATH", placeholder: "./data/sled" },
      ],
    },
    publisher: true,
    consumer: true,
  },
  {
    kind: "ibmmq",
    rootOrder: 15,
    basicFields: ["connection_manager", "queue", "topic"],
    requestBar: {
      fields: [
        { inputId: "pub-extra-1", field: "queue", label: "QUEUE", placeholder: "DEV.QUEUE.1" },
        { inputId: "pub-extra-2", field: "topic", label: "TOPIC", placeholder: "topic://events" },
        { inputId: "pub-url", field: "url", label: "HOST", placeholder: "mq-host(1414)" },
      ],
    },
    publisher: true,
    consumer: true,
    requiresFeature: "ibm_mq",
  },
  { kind: "switch", rootOrder: 16, basicFields: ["metadata_key", "default", "cases"], publisher: true, consumer: false },
  { kind: "fanout", rootOrder: 17, basicFields: ["endpoints"], publisher: true, consumer: false },
  { kind: "reader", rootOrder: 18, basicFields: [], publisher: false, consumer: false },
  { kind: "response", rootOrder: 19, basicFields: [], publisher: false, consumer: false },
  { kind: "custom", rootOrder: 20, basicFields: [], publisher: false, consumer: false },
  { kind: "null", rootOrder: 21, basicFields: [], publisher: false, consumer: false },
  { kind: "aws", rootOrder: 22, basicFields: ["region", "access_key_id", "secret_access_key"], publisher: true, consumer: true },
] as const satisfies readonly EndpointKindMetadata[];

export type EndpointKind = typeof ENDPOINT_KIND_METADATA[number]["kind"];

export const KNOWN_ENDPOINT_ROOT_KEYS = [...ENDPOINT_KIND_METADATA]
  .sort((left, right) => left.rootOrder - right.rootOrder)
  .map((entry) => entry.kind);

export const BASIC_ENDPOINT_FIELDS = Object.fromEntries(
  ENDPOINT_KIND_METADATA.map((entry) => [entry.kind, entry.basicFields]),
) as Record<string, readonly string[]>;

export const PUBLISHER_TYPE_OPTIONS = ENDPOINT_KIND_METADATA
  .filter((entry) => entry.publisher)
  .sort((left, right) => left.rootOrder - right.rootOrder)
  .map((entry) => entry.kind);

export const CONSUMER_TYPE_OPTIONS = ENDPOINT_KIND_METADATA
  .filter((entry) => entry.consumer)
  .sort((left, right) => left.rootOrder - right.rootOrder)
  .map((entry) => entry.kind);

export const REQUEST_BAR_LAYOUTS = Object.fromEntries(
  ENDPOINT_KIND_METADATA.filter((entry) => entry.publisher)
    .map((entry) => [entry.kind, (entry as EndpointKindMetadata).requestBar || { fields: [] }]),
) as Record<string, RequestBarLayout>;


export const RESPONSE_CAPABLE_CONSUMER_TYPES = new Set(
  ENDPOINT_KIND_METADATA
    .filter((entry) => (entry as EndpointKindMetadata).responseCapable)
    .map((entry) => entry.kind),
) as ReadonlySet<string>;

/**
 * Filter endpoint types based on available backend features.
 * This allows the UI to dynamically show/hide endpoint types like IBM MQ
 * based on what the backend was compiled with.
 */
export function filterEndpointsByFeatures(
  endpoints: readonly string[],
  features: FeatureAvailabilityResponse
): string[] {
  return endpoints.filter((kind) => {
    const metadata = ENDPOINT_KIND_METADATA.find((entry) => entry.kind === kind);
    if (!metadata) return true;
    
    // If no feature requirement, always include
    if (!('requiresFeature' in metadata)) return true;
    
    // Check if the required feature is available
    const featureKey = metadata.requiresFeature as keyof FeatureAvailabilityResponse;
    return features[featureKey] === true;
  });
}

export function getPublisherTypeOptions(features: FeatureAvailabilityResponse): string[] {
  return filterEndpointsByFeatures(PUBLISHER_TYPE_OPTIONS, features);
}

export function getConsumerTypeOptions(features: FeatureAvailabilityResponse): string[] {
  return filterEndpointsByFeatures(CONSUMER_TYPE_OPTIONS, features);
}
