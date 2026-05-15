import {
  applyEndpointSchemaDefaults,
  nextUniqueName,
} from "./routes";
import { get } from "svelte/store";
import { cloneJson } from "./utils";
import { openConsumerByIndex, openPublisherByIndex } from "./view-navigation";
import { publishersPanelState } from "./stores";
import { appWindow, currentHash, getMqbState, mqbApp, mqbDialogs, mqbRuntime } from "./runtime-window";
import {
  extractImportedRequests,
  importFromJsonText,
} from "./import-export";
import {
  ensureWorkspaceCollections,
  isSensitiveConfig,
  sanitizePublisherHistory,
  type PublisherPreset,
} from "./workspace-config";
import { setStoredJson } from "./encrypted-json-storage";
import { hasEncryptedMessages, resolveStorageSecurity } from "./storage-security";
import { buildPublisherTree } from "./publisher-grouping";
import {
  ensureRefOnlyEndpointDefaults,
  getEndpointType as getEndpointTypeFromEndpointRecord,
  normalizeMiddlewares,
  normalizeScalarEndpointValue,
  prunePolymorphicEndpointKeys,
} from "./endpoint-utils";
import { readJson, removeKey, writeJson } from "./storage";
import { getEntityStorageKey } from "./entity-key";
import { forceRefOnlyEndpoints } from "./schema-utils";
import type {
  ConsumerConfig,
  ConsumerOutputConfig,
  PublisherConfig,
  PublisherHistoryItem,
  PublishersAppConfig,
  PublishersSchemaRoot,
  PublisherState,
  PublisherResponseState,
} from "./panel-types";

export let restorePublisherStateFromView: (idx: number, options?: { tab?: string }) => void | Promise<void> = () => {};
export let showPublisherHistoryEntry: (historyIndex: number) => void | Promise<void> = () => {};
export let clearActivePublisherHistory: () => void = () => {};
export let copyPublisherResponse: () => void = () => {};
export let copyPublisherResponseJson: () => void = () => {};
export let copyPublisherAsCurl: () => void = () => {};
export let savePublisherHistoryAsPublisherAction: (historyIndex: number) => void | Promise<void> = () => {};
export let savePublisherHistoryAsPresetAction: (historyIndex: number) => void | Promise<void> = () => {};
export let resendPublisherHistoryAction: (historyIndex: number) => void | Promise<void> = () => {};
export let importPostmanToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let importOpenApiToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let importAsyncApiToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let importMqbToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let saveCurrentPublisherVariantAction: () => void | Promise<void> = () => {};
export let savePublisherPresetAction: () => void | Promise<void> = () => {};
export let exportPublisherPresetsAction: () => void = () => {};
export let renamePublisherPresetAction: (presetIndex: number) => void | Promise<void> = () => {};
export let applyPublisherPresetAction: (presetIndex: number) => void = () => {};
export let deletePublisherPresetAction: (presetIndex: number) => void | Promise<void> = () => {};
export let presetToPublisherAction: (presetIndex: number) => void | Promise<void> = () => {};
export let selectPublisherSubtab: (tab: string) => void = () => {};
export let addPublisherAction: (endpointType: string) => void | Promise<void> = () => {};
export let copyCurrentPublisherAction: () => void | Promise<void> = () => {};
export let editEnvironmentVarsAction: () => void | Promise<void> = () => {};
export let cloneCurrentPublisherAction: () => void = () => {};
export let deleteCurrentPublisherAction: (button?: HTMLElement | null) => void | Promise<void> = () => {};
export let saveCurrentPublisherAction: (button?: HTMLElement | null) => void | Promise<void> = () => {};
export let beautifyPublisherPayloadAction: () => void | Promise<void> = () => {};
export let sendPublisherAction: () => void | Promise<void> = () => {};
export let addPublisherMetadataRow: () => void = () => {};
export let updatePublisherMetadataRow: (index: number, field: "key" | "value", value: string) => void = () => {};
export let togglePublisherMetadataRow: (index: number, enabled: boolean) => void = () => {};
export let removePublisherMetadataRow: (index: number) => void = () => {};
export let updatePublisherPayload: (value: string) => void = () => {};
export let updatePublisherMethod: (value: string) => void = () => {};
export let updatePublisherRequestField: (fieldId: "pub-extra-1" | "pub-extra-2" | "pub-url", value: string) => void = () => {};

type RequestBarFieldDescriptor = {
  inputId: "pub-extra-1" | "pub-extra-2" | "pub-url";
  field: string;
  label: string;
  placeholder?: string;
};

type RequestBarLayout = {
  showMethod?: boolean;
  fields: RequestBarFieldDescriptor[];
};

type PublisherSubtab = "payload" | "headers" | "history" | "definition";

const STORAGE_KEY = "mqb_publisher_state";
const HISTORY_KEY = "mqb_publisher_history";

const HTTP_METHOD_OPTIONS = ["POST", "GET", "PUT", "DELETE"];
const PUBLISHER_SUBTABS = new Set<PublisherSubtab>(["payload", "headers", "history", "definition"]);
const REQUEST_BAR_METADATA_PREFIX = "request_bar.";

const ENDPOINT_TYPE_KEYS = [
  "http",
  "kafka",
  "mqtt",
  "grpc",
  "amqp",
  "ibmmq",
  "nats",
  "aws",
  "mongodb",
  "sqlx",
  "sled",
  "file",
  "static",
  "memory",
  "ref",
  "zeromq",
  "switch",
  "fanout",
  "reader",
  "response",
  "custom",
  "null",
];
// Internal or structural types that should not appear in the "New Publisher" dialog.
// We don't want to support ibmmq yet. But we want to support "static"
const EXCLUDED_PUBLISHER_TYPES = new Set(["custom", "ref", "response", "reader", "ibmmq", "null"]);
export const PUBLISHER_TYPE_OPTIONS = ENDPOINT_TYPE_KEYS.filter(
  (key) => !EXCLUDED_PUBLISHER_TYPES.has(key),
);

const REQUEST_BAR_LAYOUTS: Record<string, RequestBarLayout> = {
  http: {
    showMethod: true,
    fields: [{ inputId: "pub-url", field: "url", label: "URL", placeholder: "https://example.com/api" }],
  },
  kafka: {
    fields: [
      { inputId: "pub-extra-1", field: "topic", label: "TOPIC", placeholder: "events" },
      { inputId: "pub-url", field: "url", label: "BROKERS", placeholder: "kafka:9092" },
    ],
  },
  mqtt: {
    fields: [
      { inputId: "pub-extra-1", field: "topic", label: "TOPIC", placeholder: "events/updates" },
      { inputId: "pub-url", field: "url", label: "BROKER", placeholder: "tcp://localhost:1883" },
    ],
  },
  grpc: {
    fields: [{ inputId: "pub-url", field: "url", label: "URL", placeholder: "http://localhost:50051" }],
  },
  amqp: {
    fields: [
      { inputId: "pub-extra-1", field: "queue", label: "QUEUE", placeholder: "jobs" },
      { inputId: "pub-url", field: "url", label: "URL", placeholder: "amqp://guest:guest@localhost:5672/%2f" },
    ],
  },
  ibmmq: {
    fields: [
      { inputId: "pub-extra-1", field: "queue", label: "QUEUE", placeholder: "DEV.QUEUE.1" },
      { inputId: "pub-extra-2", field: "topic", label: "TOPIC", placeholder: "topic://events" },
      { inputId: "pub-url", field: "url", label: "HOST", placeholder: "mq-host(1414)" },
    ],
  },
  nats: {
    fields: [
      { inputId: "pub-extra-1", field: "subject", label: "SUBJECT", placeholder: "events.created" },
      { inputId: "pub-url", field: "url", label: "SERVERS", placeholder: "nats://localhost:4222" },
    ],
  },
  mongodb: {
    fields: [
      { inputId: "pub-extra-1", field: "database", label: "DATABASE", placeholder: "app" },
      { inputId: "pub-extra-2", field: "collection", label: "COLLECTION", placeholder: "messages" },
      { inputId: "pub-url", field: "url", label: "URL", placeholder: "mongodb://localhost:27017" },
    ],
  },
  sqlx: {
    fields: [
      { inputId: "pub-extra-1", field: "table", label: "TABLE", placeholder: "events" },
      { inputId: "pub-url", field: "url", label: "URL", placeholder: "postgres://user:pass@localhost/db" },
    ],
  },
  zeromq: {
    fields: [
      { inputId: "pub-extra-1", field: "topic", label: "TOPIC", placeholder: "events" },
      { inputId: "pub-url", field: "url", label: "URL", placeholder: "tcp://127.0.0.1:5555" },
    ],
  },
  file: {
    fields: [{ inputId: "pub-url", field: "path", label: "PATH", placeholder: "/tmp/messages.jsonl" }],
  },
  memory: {
    fields: [{ inputId: "pub-url", field: "topic", label: "TOPIC", placeholder: "events" }],
  },
  sled: {
    fields: [
      { inputId: "pub-extra-1", field: "tree", label: "TREE", placeholder: "default" },
      { inputId: "pub-url", field: "path", label: "PATH", placeholder: "./data/sled" },
    ],
  },
};

const SCHEMA_REQUEST_BAR_FIELDS = {
  HttpConfig: ["url", "custom_headers"],
  KafkaConfig: ["url", "topic"],
  MqttConfig: ["url", "topic"],
  GrpcConfig: ["url"],
  AmqpConfig: ["url", "queue"],
  IbmMqConfig: ["url", "queue", "topic"],
  NatsConfig: ["url", "subject"],
  MongoDbConfig: ["url", "database", "collection"],
  ZeroMqConfig: ["url", "topic"],
  SqlxConfig: ["url", "table"],
  FileConfig: ["path"],
  MemoryConfig: ["topic"],
  SledConfig: ["path", "tree"],
} satisfies Record<string, string[]>;

export function createConsumerEndpointFromPublisherEndpoint(endpoint: Record<string, any>) {
  const nextEndpoint = cloneJson(endpoint || {});
  const http = nextEndpoint.http;
  if (!http || typeof http !== "object" || typeof http.url !== "string") {
    return nextEndpoint;
  }

  try {
    const parsedUrl = new URL(http.url);
    const defaultPort = parsedUrl.protocol === "https:" ? "443" : "80";
    const port = parsedUrl.port || defaultPort;
    http.url = `0.0.0.0:${port}`;

    const nextPath = `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`;
    if (nextPath && nextPath !== "/") {
      http.path = nextPath;
    } else {
      delete http.path;
    }
  } catch {
    // Leave non-URL values unchanged; the user can adjust them manually after copying.
  }

  return nextEndpoint;
}

function sortEntries(obj: Record<string, any> | undefined | null) {
  return Object.entries(obj || {}).sort(([a], [b]) => a.localeCompare(b));
}

function defaultHttpConfig() {
  return {
    url: "http://localhost:8080",
    path: "/",
    method: "POST",
    tls: {
      required: false,
      accept_invalid_certs: false,
    },
    fire_and_forget: false,
    compression_enabled: false,
    basic_auth: ["", ""],
    custom_headers: {},
  };
}

function getEndpointType(publisher: Partial<PublisherConfig> | null | undefined): string {
  return getEndpointTypeFromEndpointRecord(publisher?.endpoint || {});
}

function normalizePublisherSubtab(tab: string | undefined, fallback: PublisherSubtab = "payload"): PublisherSubtab {
  if (tab === "presets") {
    return "definition";
  }
  return PUBLISHER_SUBTABS.has(tab as PublisherSubtab) ? (tab as PublisherSubtab) : fallback;
}

function createDefaultPublisherEndpoint(endpointType: string) {
  const isScalar = endpointType === "static" || endpointType === "ref";
  const base = {
    middlewares: isScalar ? [] : [{ retry: {} }],
  };

  if (endpointType === "static" || endpointType === "ref") {
    return { ...base, [endpointType]: "" };
  }

  const defaults: Record<string, Record<string, any>> = {
    http: defaultHttpConfig(),
    grpc: { url: "http://localhost:50051" },
    nats: { url: "nats://localhost:4222", subject: "events.created" },
    memory: { topic: "events" },
    amqp: { url: "amqp://guest:guest@localhost:5672/%2f", queue: "jobs" },
    kafka: { url: "localhost:9092", topic: "events" },
    sqlx: { url: "postgres://postgres:password@localhost/postgres", table: "events" },
    mqtt: { url: "tcp://localhost:1883", topic: "events/updates" },
    mongodb: { url: "mongodb://localhost:27017", database: "app", collection: "messages" },
    zeromq: { url: "tcp://127.0.0.1:5555", topic: "events" },
    file: { path: "/tmp/messages.jsonl" },
    sled: { path: "./data/sled", tree: "default" },
    ibmmq: { url: "localhost(1414)", queue: "DEV.QUEUE.1", topic: "topic://events" },
    switch: { metadata_key: "type", cases: {}, default: { ref: "" } },
    fanout: [{ ref: "" }],
  };
  return {
    ...base,
    [endpointType]: cloneJson(defaults[endpointType] || {}),
  };
}

function createEmptyPublisher(): PublisherConfig {
  return {
    name: "",
    endpoint: createDefaultPublisherEndpoint("http"),
    comment: "",
  };
}

function ensurePublisherEndpointDefaults(endpoint: unknown): Record<string, any> {
  if (typeof endpoint === "string") {
    return { ref: endpoint, middlewares: [] };
  }
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return createDefaultPublisherEndpoint("http");
  }

  const endpointRecord = endpoint as Record<string, any>;
  const data = endpointRecord.root && typeof endpointRecord.root === "object" ? endpointRecord.root : endpointRecord;
  const endpointType = getEndpointTypeFromEndpointRecord(data);

  const normalized: Record<string, any> = {
    ...createDefaultPublisherEndpoint(endpointType),
    ...cloneJson(data),
  };

  prunePolymorphicEndpointKeys(normalized, endpointType);

  if (endpointType === "switch") {
    const sw = normalized.switch;
    if (sw && typeof sw === "object") {
      if (!sw.metadata_key) sw.metadata_key = "type";
      const rawCases = cloneJson(sw.cases || {});
      const normalizedCases: Record<string, any> = {};
      if (rawCases && typeof rawCases === "object" && !Array.isArray(rawCases)) {
        for (const [k, v] of Object.entries(rawCases)) {
          normalizedCases[k] = ensureRefOnlyEndpointDefaults(v);
        }
      }
      sw.cases = normalizedCases;
      if (sw.default === undefined) sw.default = { ref: "" };
      sw.default = ensureRefOnlyEndpointDefaults(sw.default);
    }
  } else if (endpointType === "fanout") {
    if (Array.isArray(normalized.fanout)) {
      normalized.fanout = normalized.fanout.map((item: any) => ensureRefOnlyEndpointDefaults(item));
    } else {
      normalized.fanout = [{ ref: "" }];
    }
  }

  normalized[endpointType] = normalizeScalarEndpointValue(endpointType, normalized[endpointType]);
  normalized.middlewares = normalizeMiddlewares(normalized.middlewares, ensureRefOnlyEndpointDefaults);

  return normalized;
}

function normalizePublisherConfigShape(publisher: PublisherConfig): PublisherConfig {
  if (!publisher) return publisher;

  // Handle root artifact from form generator
  let data = { ...publisher } as any;
  if (data.root) {
    const { root, ...rest } = data;
    data = { ...rest, ...root };
  }

  data.endpoint = ensurePublisherEndpointDefaults(data.endpoint);

  return data as PublisherConfig;
}

function syncConsumerPublisherReferences(
  consumers: ConsumerConfig[] | undefined,
  previousPublisherName: string,
  nextPublisher: PublisherConfig,
) {
  const nextPublisherName = String(nextPublisher.name || "").trim();
  const nextPublisherId = String(nextPublisher.id || "").trim();
  if (!Array.isArray(consumers) || !previousPublisherName || !nextPublisherName) {
    return;
  }

  consumers.forEach((consumer) => {
    if (
      consumer.output?.mode === "publisher"
      && (
        (nextPublisherId && String(consumer.output.publisher_id || "").trim() === nextPublisherId)
        || consumer.output.publisher === previousPublisherName
      )
    ) {
      consumer.output = {
        ...consumer.output,
        publisher: nextPublisherName,
        publisher_id: nextPublisherId || consumer.output.publisher_id,
      };
    }
  });
}

function flattenPublisherHistory(store: PublisherHistoryStore): PublisherHistoryItem[] {
  return Object.values(store.publishers || {})
    .flatMap((rows) => rows || [])
    .sort((a, b) => Number(b.time) - Number(a.time));
}

function buildPublisherHistoryStore(history: PublisherHistoryItem[], updatedAt = Date.now()): PublisherHistoryStore {
  const publishers: PublisherHistoryStore["publishers"] = {};
  for (const item of history) {
    const publisherId = String(item.publisher_id || "").trim();
    const storageKey = publisherId || String(item.name || "").trim();
    if (!storageKey) continue;
    if (!publishers[storageKey]) {
      publishers[storageKey] = [];
    }
    publishers[storageKey].push(item);
  }
  return {
    version: 1,
    updated_at: updatedAt,
    publishers,
  };
}

export function initPublishers(config: PublishersAppConfig, schema: PublishersSchemaRoot) {
  mqbApp.setConfig(config as unknown as Record<string, any>);
  const container = document.getElementById("publishers-container") as HTMLElement | null;
  const mappedPublishers = (config.publishers || []).map((p) => normalizePublisherConfigShape(p));
  config.publishers ||= [];
  if (config.publishers !== mappedPublishers) {
    config.publishers.splice(0, config.publishers.length, ...mappedPublishers);
  }
  const publishers = config.publishers;
  const getPublisherStorageKey = (publisher: Partial<PublisherConfig> | null | undefined) =>
    getEntityStorageKey(publisher);
  const matchesHistoryPublisher = (
    item: Partial<PublisherHistoryItem> | null | undefined,
    publisher: Partial<PublisherConfig> | null | undefined,
  ) => {
    const publisherKey = getPublisherStorageKey(publisher);
    if (!publisherKey) {
      return false;
    }
    const historyPublisherId = String(item?.publisher_id || "").trim();
    if (historyPublisherId) {
      return historyPublisherId === publisherKey;
    }
    return String(item?.name || "").trim() === String(publisher?.name || "").trim();
  };
  const workspaceConfig = ensureWorkspaceCollections(config);
  const state = getMqbState();
  const storageSecurity = resolveStorageSecurity(state.storage_security, workspaceConfig);
  const encryptedMessages = hasEncryptedMessages(storageSecurity);
  const sensitiveMode = isSensitiveConfig(workspaceConfig) && !encryptedMessages;
  if (sensitiveMode) {
    removeKey(STORAGE_KEY);
    removeKey(HISTORY_KEY);
  }
  const preloadedStorage = getMqbState().storage_cache;
  let appState = sensitiveMode
    ? {}
    : encryptedMessages && preloadedStorage?.publisher_state
      ? (preloadedStorage.publisher_state as Record<string, PublisherState>)
      : readJson<Record<string, PublisherState>>(STORAGE_KEY, {});
  const localHistoryStore = sensitiveMode
    ? sanitizePublisherHistory({})
    : encryptedMessages && preloadedStorage?.publisher_history
      ? sanitizePublisherHistory(preloadedStorage.publisher_history)
      : sanitizePublisherHistory(readJson<unknown>(HISTORY_KEY, {}));
  const configHistoryStore = sanitizePublisherHistory(workspaceConfig.history);
  let historyStore = localHistoryStore.updated_at >= configHistoryStore.updated_at
    ? localHistoryStore
    : configHistoryStore;
  let history = flattenPublisherHistory(historyStore).slice(0, 1000);
  let envVars = workspaceConfig.env_vars;

  let savedPublisherKeys = new Set(
    ((Array.isArray(state.saved_sections?.publishers) ? state.saved_sections.publishers : publishers) || [])
      .map((publisher: PublisherConfig) => getPublisherStorageKey(publisher))
      .filter(Boolean),
  );
  const isSavedPublisher = (publisher: Partial<PublisherConfig> | null | undefined) =>
    savedPublisherKeys.has(getPublisherStorageKey(publisher));

  const emptyAlert = document.getElementById("pub-empty-alert") as HTMLElement | null;
  const mainUi = document.getElementById("pub-main-ui") as HTMLElement | null;
  if (!container || !emptyAlert || !mainUi) {
    return;
  }

  container.style.display = "flex";
  let currentIdx = 0;
  let activeSubtab: PublisherSubtab = "payload";
  let pubSplit: unknown;
  let currentResponsePayload = "";
  let currentMethodValue = "POST";
  let nextPublisherHeaderId = 1;
  let pendingHistorySync: number | null = null;

  const rememberPublisherView = (
    idx = currentIdx,
    tab: PublisherSubtab = activeSubtab,
  ) => {
    const nextIdx = Math.min(Math.max(0, idx), Math.max(publishers.length - 1, 0));
    state.last_publisher_idx = nextIdx;
    state.last_publisher_tab = tab;
    (appWindow() as any)._mqb_last_publisher_idx = nextIdx;
    (appWindow() as any)._mqb_last_publisher_tab = tab;
  };

  mqbRuntime.registerDirtySection("publishers", {
    buttonId: "pub-save",
    getValue: () => config.publishers,
  });
  const hadUnsavedChangesBeforeInit = mqbRuntime.refreshDirtySection("publishers");

  const updateUrlHash = () => {
    appWindow().history.replaceState(null, "", `#publishers:${currentIdx || 0}`);
  };

  const saveAppState = () => {
    if (sensitiveMode) return;
    if (encryptedMessages) {
      void setStoredJson(STORAGE_KEY, appState, storageSecurity);
      return;
    }
    writeJson(STORAGE_KEY, appState);
  };
  const syncHistoryToConfig = async (silent = true) => {
    historyStore = buildPublisherHistoryStore(history);
    workspaceConfig.history = historyStore;
    const nextConfig = mqbApp.config<PublishersAppConfig>();
    nextConfig.history = historyStore;
    await mqbRuntime.saveConfigSection("history", historyStore, silent);
  };
  const scheduleHistorySync = () => {
    if (pendingHistorySync != null) {
      appWindow().clearTimeout(pendingHistorySync);
    }
    pendingHistorySync = appWindow().setTimeout(() => {
      pendingHistorySync = null;
      void syncHistoryToConfig(true);
    }, 2000);
  };
  const saveHistory = (options: { sync?: boolean } = {}) => {
    history = history.slice(0, 1000);
    historyStore = buildPublisherHistoryStore(history);
    if (!sensitiveMode && !encryptedMessages) {
      writeJson(HISTORY_KEY, historyStore);
    } else if (encryptedMessages) {
      void setStoredJson(HISTORY_KEY, historyStore, storageSecurity);
    }
    if (options.sync !== false) {
      scheduleHistorySync();
    }
  };
  const persistWorkspaceCollections = async (silent = true) => {
    workspaceConfig.env_vars = envVars;
    workspaceConfig.history = historyStore;
    const nextConfig = mqbApp.config<PublishersAppConfig>();
    nextConfig.env_vars = envVars;
    nextConfig.history = historyStore;
    await mqbRuntime.saveConfigSection("env_vars", envVars, silent);
  };
  const applyEnvVars = (value: string) =>
    String(value || "").replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_match, key) =>
      Object.prototype.hasOwnProperty.call(envVars, key) ? String(envVars[key] ?? "") : `\${${key}}`,
    );

  const openPublisherAt = (idx: number, tab = "definition") => {
    openPublisherByIndex(
      idx,
      tab as "payload" | "headers" | "history" | "definition",
      restorePublisherStateFromView,
      () => {
        void initPublishers(config, schema);
      },
    );
  };

  const openConsumerAt = (idx: number, tab = "messages") => {
    openConsumerByIndex(
      idx,
      tab as "messages" | "definition" | "response",
      (consumerIdx, options) => mqbApp.restore.consumer(consumerIdx, options),
      () => mqbApp.init.consumers(config, mqbApp.schema()),
    );
  };

  if (
    (historyStore.updated_at === configHistoryStore.updated_at && configHistoryStore.updated_at > localHistoryStore.updated_at)
    || (history.length > 0 && flattenPublisherHistory(localHistoryStore).length === 0 && flattenPublisherHistory(configHistoryStore).length > 0)
  ) {
    saveHistory({ sync: false });
  }

  const ensureHttpConfig = (publisher: PublisherConfig) => {
    publisher.endpoint ||= {};
    if (!publisher.endpoint.http || typeof publisher.endpoint.http !== "object") {
      publisher.endpoint.http = defaultHttpConfig();
    }
    publisher.endpoint.http.custom_headers ||= {};
    return publisher.endpoint.http as Record<string, any>;
  };

  const ensureEndpointConfig = (publisher: PublisherConfig, endpointType: string) => {
    if (endpointType === "http") return ensureHttpConfig(publisher);
    publisher.endpoint ||= {};

    // Scalar and reference endpoints are configuration atoms and do not have technical sub-fields
    if (endpointType === "static" || endpointType === "ref") return null;

    if (!publisher.endpoint[endpointType] || typeof publisher.endpoint[endpointType] !== "object") {
      publisher.endpoint[endpointType] = {};
    }
    return publisher.endpoint[endpointType] as Record<string, any>;
  };

  const getExistingEndpointConfig = (publisher: PublisherConfig, endpointType = getEndpointType(publisher)) => {
    const endpoint = publisher?.endpoint || {};
    const endpointConfig = endpoint?.[endpointType];
    return endpointConfig && typeof endpointConfig === "object" ? endpointConfig : null;
  };

  const getRequestBarLayout = (endpointType: string): RequestBarLayout =>
    REQUEST_BAR_LAYOUTS[endpointType] || { fields: [] };

  const getRequestBarFieldValue = (publisher: PublisherConfig, descriptor: { field: string } | undefined) => {
    if (!descriptor) return "";
    const endpointType = getEndpointType(publisher);
    const endpointConfig = getExistingEndpointConfig(publisher, endpointType);

    if (endpointType === "http" && descriptor.field === "url") {
      const rawUrl = typeof endpointConfig?.url === "string" ? endpointConfig.url.trim() : "";
      const rawPath = typeof endpointConfig?.path === "string" ? endpointConfig.path.trim() : "";
      if (!rawUrl) return rawPath || "";
      if (!rawPath || rawPath === "/") return rawUrl;
      try {
        const parsed = new URL(rawUrl);
        const [pathOnly, query = ""] = rawPath.split("?");
        const normalizedPath = (pathOnly || "/").startsWith("/") ? (pathOnly || "/") : `/${pathOnly || "/"}`;
        parsed.pathname = normalizedPath;
        parsed.search = query ? `?${query}` : "";
        return parsed.toString();
      } catch {
        return `${rawUrl.replace(/\/+$/, "")}/${rawPath.replace(/^\/+/, "")}`;
      }
    }

    return typeof endpointConfig?.[descriptor.field] === "string" ? endpointConfig[descriptor.field] : "";
  };

  const setRequestBarFieldValue = (publisher: PublisherConfig, descriptor: { field: string } | undefined, rawValue: string) => {
    if (!descriptor) return;
    const endpointType = getEndpointType(publisher);
    const endpointConfig = ensureEndpointConfig(publisher, endpointType);
    if (!endpointConfig) return;

    if (endpointType === "http" && descriptor.field === "url") {
      const trimmedValue = rawValue.trim();
      if (!trimmedValue) {
        endpointConfig.url = "";
        endpointConfig.path = "/";
        return;
      }

      try {
        const parsed = new URL(trimmedValue);
        endpointConfig.url = parsed.origin;
        endpointConfig.path = `${parsed.pathname || "/"}${parsed.search || ""}`;
        return;
      } catch {
        // Accept host/path-like input without protocol.
        const match = trimmedValue.match(/^([^/]+)(\/.*)?$/);
        if (match) {
          endpointConfig.url = match[1];
          endpointConfig.path = match[2] || "/";
          return;
        }
      }
    }

    endpointConfig[descriptor.field] = rawValue;
  };

  const copyRequestBarFieldValues = (fromPublisher: PublisherConfig, toPublisher: PublisherConfig) => {
    const endpointType = getEndpointType(toPublisher);
    const layout = getRequestBarLayout(endpointType);
    layout.fields.forEach((descriptor) => {
      const sourceValue = getRequestBarFieldValue(fromPublisher, descriptor);
      setRequestBarFieldValue(toPublisher, descriptor, sourceValue);
    });
  };

  const getPublishStatusInfo = (endpointType: string, response: Response, responseData: any) => {
    if (!response.ok) {
      return {
        ok: false,
        code: response.status,
        label: String(response.status),
        text: response.statusText || "Error",
      };
    }
    if (endpointType === "http") {
      return {
        ok: true,
        code: response.status,
        label: String(response.status),
        text: response.statusText || "OK",
      };
    }
    if (responseData && typeof responseData === "object") {
      if (responseData.status === "Ack") {
        return { ok: true, code: response.status, label: "ACK", text: `${endpointType.toUpperCase()} accepted` };
      }
      if (responseData.status === "Response") {
        return { ok: true, code: response.status, label: "RESP", text: `${endpointType.toUpperCase()} replied` };
      }
    }
    return { ok: true, code: response.status, label: "OK", text: `${endpointType.toUpperCase()} sent` };
  };

  const getPublisherState = (publisher: PublisherConfig | null | undefined) => {
    const storageKey = getPublisherStorageKey(publisher);
    if (!storageKey) {
      return { payload: String(publisher?.payload || '{}') };
    }
    if (!appState[storageKey]) {
      appState[storageKey] = { payload: String(publisher?.payload || '{}') };
    }
    return appState[storageKey];
  };

  const normalizePublisherHeaderRows = (
    rows: Array<{ id?: number; key?: unknown; value?: unknown; enabled?: unknown }> | undefined,
  ) => {
    if (!Array.isArray(rows)) return { rows: [], changed: false };

    const seenIds = new Set<number>();
    const claimNextId = () => {
      while (seenIds.has(nextPublisherHeaderId) || nextPublisherHeaderId <= 0) {
        nextPublisherHeaderId += 1;
      }
      return nextPublisherHeaderId++;
    };
    let changed = false;
    const normalizedRows = rows.map((row) => {
      const candidateId = Number(row?.id);
      const nextRow = {
        id: Number.isInteger(candidateId) && candidateId > 0 ? candidateId : claimNextId(),
        key: String(row?.key ?? ""),
        value: String(row?.value ?? ""),
        enabled: row?.enabled !== false,
      };

      if (seenIds.has(nextRow.id)) {
        nextRow.id = claimNextId();
        changed = true;
      }

      if (
        !row ||
        Number(row.id) !== nextRow.id ||
        String(row.key ?? "") !== nextRow.key ||
        String(row.value ?? "") !== nextRow.value ||
        (row.enabled !== false) !== nextRow.enabled
      ) {
        changed = true;
      }

      seenIds.add(nextRow.id);
      return nextRow;
    });

    return { rows: normalizedRows, changed };
  };

  const syncNextPublisherHeaderId = () => {
    const maxId = Object.values(appState).reduce((currentMax, state) => {
      const headerMax = Array.isArray(state.headers)
        ? state.headers.reduce((rowMax, row) => Math.max(rowMax, Number(row.id) || 0), 0)
        : 0;
      return Math.max(currentMax, headerMax);
    }, 0);
    nextPublisherHeaderId = Math.max(nextPublisherHeaderId, maxId + 1);
  };

  const getPublisherHeaderRows = (publisher: PublisherConfig | undefined) => {
    if (!publisher) return [];
    const state = getPublisherState(publisher);
    if (!Array.isArray(state.headers)) {
      const savedHeaders = Array.isArray(publisher.headers)
        ? publisher.headers
        : sortEntries(getEndpointType(publisher) === "http" ? ensureHttpConfig(publisher)?.custom_headers : {})
            .map(([key, value]) => ({ key: String(key), value: String(value), enabled: true }));
      if (getEndpointType(publisher) === "http" && Array.isArray(publisher.headers)) {
        ensureHttpConfig(publisher).custom_headers = Object.fromEntries(
          publisher.headers
            .filter((row) => row.enabled !== false && String(row.key || "").trim().length > 0)
            .map((row) => [String(row.key).trim(), String(row.value || "")]),
        );
      }
      state.headers = savedHeaders.map((row) => ({
        id: nextPublisherHeaderId++,
        key: String(row.key || ""),
        value: String(row.value || ""),
        enabled: row.enabled !== false,
      }));
      saveAppState();
    } else {
      const normalized = normalizePublisherHeaderRows(state.headers);
      state.headers = normalized.rows;
      if (normalized.changed) {
        saveAppState();
      }
    }
    syncNextPublisherHeaderId();
    return state.headers;
  };

  const getCurrentPublisherUrl = (publisher: PublisherConfig) => {
    const endpointType = getEndpointType(publisher);
    const layout = getRequestBarLayout(endpointType);
    return getRequestBarFieldValue(
      publisher,
      layout.fields.find((field) => field.inputId === "pub-url"),
    ).trim();
  };

  const splitHttpUrl = (rawUrl: string) => {
    const value = String(rawUrl || "").trim();
    if (!value) return { base: "", path: "" };
    try {
      const parsed = new URL(value);
      const base = `${parsed.protocol}//${parsed.host}`;
      const path = `${parsed.pathname || "/"}${parsed.search || ""}`;
      return { base, path: path === "/" ? "" : path };
    } catch {
      return { base: value, path: "" };
    }
  };

  const getImportedRequestEndpointType = (request: PublisherPreset, fallbackPublisher?: PublisherConfig) =>
    request.endpoint_type || (fallbackPublisher ? getEndpointType(fallbackPublisher) : "http");

  const getImportedRequestFields = (request: PublisherPreset) => {
    const nextFields = { ...(request.request_fields || {}) };
    if (request.url && !nextFields.url) {
      nextFields.url = request.url;
    }
    return nextFields;
  };

  const getImportedRequestFieldValue = (request: PublisherPreset, field: string) =>
    String(getImportedRequestFields(request)[field] || "");

  const getImportedRequestMethodValue = (request: PublisherPreset) =>
    String(request.method || "").toUpperCase();

  const requestToPublisher = (request: PublisherPreset, fallbackPublisher?: PublisherConfig) => {
    const currentNames = (config.publishers || []).map((publisher) => publisher.name);
    const endpointType = getImportedRequestEndpointType(request, fallbackPublisher);
    const baseName = String(request.name || endpointType).trim() || endpointType;
    const name = nextUniqueName(baseName, currentNames);
    const requestFields = getImportedRequestFields(request);
    const customHeaders = Object.fromEntries(
      (request.headers || [])
        .filter((row) => row.enabled !== false && String(row.key || "").trim())
        .map((row) => [String(row.key).trim(), String(row.value || "")]),
    );
    const endpoint = createDefaultPublisherEndpoint(endpointType) as Record<string, any>;
    const publisher: PublisherConfig = {
      name,
      endpoint,
      comment: "",
    };
    const layout = getRequestBarLayout(endpointType);
    layout.fields.forEach((descriptor) => {
      setRequestBarFieldValue(publisher, descriptor, String(requestFields[descriptor.field] || ""));
    });
    if (endpointType === "http") {
      const httpConfig = ensureHttpConfig(publisher);
      httpConfig.method = getImportedRequestMethodValue(request) || "POST";
      httpConfig.custom_headers = customHeaders;
    }
    const headerRows = (request.headers || []).map((row) => ({
      id: nextPublisherHeaderId++,
      key: String(row.key || ""),
      value: String(row.value || ""),
      enabled: row.enabled !== false,
    }));
    appState[getPublisherStorageKey(publisher)] = {
      payload: request.payload || "",
      headers: headerRows,
    };
    publisher.payload = request.payload || "";
    publisher.headers = headerRows.map(({ key, value, enabled }) => ({ key, value, enabled }));
    return publisher;
  };

  const createPublisherVariantFromCurrentState = async (publisher: PublisherConfig) => {
    const nextName = await mqbDialogs.prompt("Choose a name for the saved publisher variant.", "Save Publisher Variant", {
      confirmLabel: "Save",
      value: nextUniqueName(`${publisher.name} copy`, (config.publishers || []).map((row) => row.name)),
      placeholder: "publisher_name",
    });
    if (!nextName) return null;

    const cloned = normalizePublisherConfigShape(cloneJson(publisher));
    cloned.id = undefined;
    cloned.name = nextName.trim();
    if (getEndpointType(cloned) === "http") {
      ensureHttpConfig(cloned).method = currentMethodValue || ensureHttpConfig(cloned).method;
    }
    cloned.payload = getPublisherState(publisher).payload || "";
    const nextState = structuredClone(getPublisherState(publisher));
    appState[getPublisherStorageKey(cloned)] = nextState;
    cloned.headers = (nextState.headers || []).map(({ key, value, enabled }) => ({ key, value, enabled }));
    return cloned;
  };

  const createPublisherVariantFromHistoryItem = async (publisher: PublisherConfig, item: PublisherHistoryItem) => {
    const nextName = await mqbDialogs.prompt("Choose a name for the saved publisher variant.", "Save Publisher Variant", {
      confirmLabel: "Save",
      value: nextUniqueName(`${publisher.name} history`, (config.publishers || []).map((row) => row.name)),
      placeholder: "publisher_name",
    });
    if (!nextName) return null;

    const cloned = normalizePublisherConfigShape(cloneJson(publisher));
    cloned.id = undefined;
    cloned.name = nextName.trim();
    const state = getPublisherState(cloned);
    state.payload = item.payload || "";
    applyHistoryRequestToPublisher(cloned, item);
    if (getEndpointType(cloned) === "http") {
      ensureHttpConfig(cloned).method = item.method || item.requestMetadata?.http_method || ensureHttpConfig(cloned).method;
    }
    cloned.payload = state.payload;
    cloned.headers = getPublisherHeaderRows(cloned).map(({ key, value, enabled }) => ({ key, value, enabled }));
    return cloned;
  };

  const importRequestsIntoPublishers = async (
    jsonText: string,
    expectedKind: "postman" | "openapi" | "asyncapi",
  ) => {
    const basePublisher = publishers[currentIdx] || createEmptyPublisher();
    const imported = extractImportedRequests(jsonText);
    if (imported.kind !== expectedKind) {
      throw new Error(`Selected file is not a valid ${expectedKind.toUpperCase()} JSON file.`);
    }

    let importedAsPublishers = 0;

    for (const request of imported.requests) {
      config.publishers.push(requestToPublisher(request, basePublisher));
      importedAsPublishers += 1;
    }

    envVars = { ...envVars, ...(imported.envVars || {}) };
    await persistWorkspaceCollections(true);
    saveAppState();

    if (importedAsPublishers > 0) {
      const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, true);
      if (saved) {
        const refreshedConfig = await mqbRuntime.fetchConfigFromServer<PublishersAppConfig>();
        mqbApp.config<PublishersAppConfig>().publishers = refreshedConfig.publishers;
      }
    }

    initPublishers(mqbApp.config<PublishersAppConfig>(), schema);
    const firstImportedName = imported.requests[0]?.name;
    const activeIdx = (mqbApp.config<PublishersAppConfig>().publishers || []).findIndex((item) => item.name === firstImportedName);
    if (activeIdx >= 0) {
      restorePublisherStateFromView(activeIdx, { tab: "definition" });
    }

    return { importedAsPublishers };
  };

  const syncPublishersPanelState = (responseState?: PublisherResponseState) => {
    const activePublisher = publishers[currentIdx];
    const filteredHistory = history.filter((item) => matchesHistoryPublisher(item, activePublisher));
    const endpointType = activePublisher ? getEndpointType(activePublisher) : "";
    const layout = getRequestBarLayout(endpointType);
    const getFieldState = (inputId: "pub-extra-1" | "pub-extra-2" | "pub-url", fallbackLabel: string) => {
      const descriptor = layout.fields.find((field) => field.inputId === inputId);
      return {
        label: descriptor?.label || fallbackLabel,
        placeholder: descriptor?.placeholder || "",
        value: activePublisher ? getRequestBarFieldValue(activePublisher, descriptor) : "",
        visible: Boolean(descriptor),
      };
    };
    const metadataRows = endpointType === "http" && activePublisher ? getPublisherHeaderRows(activePublisher) : [];
    const requestPayload = activePublisher ? getPublisherState(activePublisher).payload : "";
    const sidebarItems = publishers.map((publisher, index) => ({
      name: publisher.name,
      endpointType: getEndpointType(publisher).toUpperCase(),
      originalIndex: index,
    }));

    publishersPanelState.update((current: any) => ({
      hasPublishers: publishers.length > 0,
      items: sidebarItems,
      groupedItems: buildPublisherTree(publishers),
      selectedIndex: currentIdx,
      activeSubtab,
      isNew: activePublisher ? !isSavedPublisher(activePublisher) : false,
      deleteLabel: (activePublisher && !isSavedPublisher(activePublisher)) ? "Cancel" : "Delete",
      endpointType: endpointType === "ibmmq" ? "MQ" : endpointType.toUpperCase(),
      methodVisible: endpointType === "http" && !!layout.showMethod,
      methodValue: currentMethodValue,
      extraFieldOne: getFieldState("pub-extra-1", "Target"),
      extraFieldTwo: getFieldState("pub-extra-2", "Target"),
      urlField: getFieldState("pub-url", "URL"),
      requestPayload,
      metadataRows,
      responseVisible: responseState?.responseVisible ?? current.responseVisible,
      responseTabLabel: responseState?.responseTabLabel ?? current.responseTabLabel,
      responseStatusLabel: responseState?.responseStatusLabel ?? current.responseStatusLabel,
      responseStatusText: responseState?.responseStatusText ?? current.responseStatusText,
      responseStatusColor: responseState?.responseStatusColor ?? current.responseStatusColor,
      responseDurationLabel: responseState?.responseDurationLabel ?? current.responseDurationLabel,
      responseSizeLabel: responseState?.responseSizeLabel ?? current.responseSizeLabel,
      requestRows: responseState?.requestRows ?? current.requestRows,
      requestHeaders: responseState?.requestHeaders ?? current.requestHeaders,
      responseHeaders: responseState?.responseHeaders ?? current.responseHeaders,
      responsePayload: responseState?.responsePayload ?? current.responsePayload,
      historyRows: [...filteredHistory]
        .sort((a, b) => Number(b.time) - Number(a.time))
        .map((item) => {
        const isOk = typeof item.ok === "boolean" ? item.ok : item.status < 300;
        return {
          historyIndex: history.indexOf(item),
          timeLabel: new Date(item.time).toLocaleString(),
          statusLabel: String(item.displayStatus || item.status),
          statusClass: isOk ? "status-ok" : "status-err",
          payloadPreview: item.payload.substring(0, 100).replace(/\n/g, " "),
          pinned: Boolean(item.pinned),
        };
      }),
    }));
  };

  const renderSidebar = () => {
    syncPublishersPanelState();
    const hasPublishers = publishers.length > 0;
    emptyAlert.style.display = hasPublishers ? "none" : "block";
    mainUi.style.display = hasPublishers ? "contents" : "none";
  };

  const setActiveItem = (idx: number, options: { tab?: PublisherSubtab; preserveTab?: boolean } = {}) => {
    const nextIdx = Math.min(Math.max(0, idx), Math.max(publishers.length - 1, 0));
    const isSamePublisher = currentIdx === nextIdx;
    currentIdx = nextIdx;
    if (options.tab) {
      activeSubtab = options.tab;
    } else if (!(options.preserveTab && isSamePublisher)) {
      activeSubtab = "payload";
    }
    rememberPublisherView(currentIdx, activeSubtab);
    syncPublishersPanelState();
  };

  const clearPublisherResponse = () => {
    currentResponsePayload = "";
    syncPublishersPanelState({
      responseVisible: false,
      responseTabLabel: "Response",
      responseStatusLabel: "Ready",
      responseStatusText: "",
      responseStatusColor: "var(--text-primary)",
      responseDurationLabel: "",
      responseSizeLabel: "",
      requestRows: [],
      requestHeaders: [],
      responseHeaders: [],
      responsePayload: "",
    });
  };

  const buildHttpRequestMetadata = () => {
    const publisher = publishers[currentIdx];
    if (!publisher || getEndpointType(publisher) !== "http") return {};

    const rawUrl = getRequestBarFieldValue(
      publisher,
      getRequestBarLayout("http").fields.find((field) => field.inputId === "pub-url"),
    ).trim();
    const metadata: Record<string, string> = {};
    if (currentMethodValue) {
      metadata.http_method = currentMethodValue;
    }
    if (!rawUrl) return metadata;

    try {
      const parsed = new URL(rawUrl);
      metadata.http_path = parsed.pathname || "/";
      if (parsed.search.length > 1) {
        metadata.http_query = parsed.search.slice(1);
      }
    } catch {
      const slashIndex = rawUrl.indexOf("/", rawUrl.indexOf("//") + 2);
      if (slashIndex >= 0) {
        const pathWithQuery = rawUrl.slice(slashIndex);
        const [path, query] = pathWithQuery.split("?");
        metadata.http_path = path || "/";
        if (query) metadata.http_query = query;
      }
    }

    return metadata;
  };

  const buildRequestBarHistoryMetadata = (publisher: PublisherConfig) => {
    const endpointType = getEndpointType(publisher);
    const layout = getRequestBarLayout(endpointType);
    const metadata: Record<string, string> = {};

    if (layout.showMethod && currentMethodValue) {
      metadata.http_method = currentMethodValue;
    }

    layout.fields.forEach((descriptor) => {
      const value = applyEnvVars(getRequestBarFieldValue(publisher, descriptor).trim());
      metadata[`${REQUEST_BAR_METADATA_PREFIX}${descriptor.field}`] = value;
      metadata[`request_bar.${descriptor.inputId}`] = value;
    });

    return metadata;
  };

  const applyHistoryRequestToPublisher = (publisher: PublisherConfig | undefined, item: PublisherHistoryItem) => {
    if (!publisher) return;
    const endpointType = getEndpointType(publisher);
    const requestMetadata = item.requestMetadata || {};
    const requestFields = item.request_fields || {};

    if (item.method || requestMetadata.http_method) {
      currentMethodValue = String(item.method || requestMetadata.http_method);
    }

    const layout = getRequestBarLayout(endpointType);
    layout.fields.forEach((descriptor) => {
      const value = requestFields[descriptor.field]
        ?? requestMetadata[`${REQUEST_BAR_METADATA_PREFIX}${descriptor.field}`]
        ?? requestMetadata[`request_bar.${descriptor.inputId}`];
      if (typeof value === "string") {
        setRequestBarFieldValue(publisher, descriptor, value);
      }
    });

    if (endpointType !== "http") return;

    const httpConfig = ensureHttpConfig(publisher);
    httpConfig.custom_headers = Object.fromEntries(
      (item.headers?.length ? item.headers.map((row) => ({ k: row.key, v: row.value })) : item.metadata || [])
        .map(({ k, v }) => [k, v]),
    );

    const hasHistoryUrl = layout.fields.some((descriptor) =>
      typeof requestMetadata[`${REQUEST_BAR_METADATA_PREFIX}${descriptor.field}`] === "string" ||
      typeof requestMetadata[`request_bar.${descriptor.inputId}`] === "string",
    );
    if (!hasHistoryUrl && typeof item.url === "string") {
      const parsed = splitHttpUrl(item.url);
      httpConfig.url = parsed.base || item.url;
      if (parsed.path) {
        httpConfig.path = parsed.path;
      } else {
        delete httpConfig.path;
      }
    }

    if (hasHistoryUrl) return;

    const existingUrl = httpConfig.url || "";
    if (!requestMetadata.http_path && !requestMetadata.http_query) return;

    try {
      const parsed = new URL(existingUrl);
      parsed.pathname = requestMetadata.http_path || "/";
      parsed.search = requestMetadata.http_query ? `?${requestMetadata.http_query}` : "";
      httpConfig.url = parsed.toString();
    } catch {
      const path = requestMetadata.http_path || "/";
      const query = requestMetadata.http_query ? `?${requestMetadata.http_query}` : "";
      httpConfig.url = `${path}${query}`;
    }
  };

  const restorePublisherState = (idx: number, options: { tab?: string } = {}) => {
    if (!publishers[idx]) return;
    const targetTab = normalizePublisherSubtab(options.tab, state.last_publisher_tab || "payload");
    if (currentIdx !== idx) setActiveItem(idx, { tab: targetTab });
    void updateUIFromState();
    activeSubtab = targetTab;
    rememberPublisherView(idx, activeSubtab);
    syncPublishersPanelState();
  };

  const formatResponseDetails = (
    statusInfo: { ok: boolean; label: string; text?: string },
    duration: number,
    data: any,
    requestInfo: {
      headers?: Array<{ k: string; v: string }>;
      method?: string;
      path?: string;
      query?: string;
      targetLabel?: string;
      url?: string;
    } = {},
  ) => {
    const statusColor = statusInfo?.ok ? "var(--accent-http)" : "var(--accent-kafka)";
    const statusLabel = statusInfo?.label || "OK";
    const statusText = statusInfo?.text || "";
    const payloadString = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    const size = new TextEncoder().encode(payloadString).length;
    const sizeString = size > 1024 ? `${(size / 1024).toFixed(2)} KB` : `${size} B`;
    let payloadContent = "";
    const requestHeaders = Array.isArray(requestInfo.headers) ? requestInfo.headers : [];
    const requestRows: Array<[string, string]> = [];
    if (requestInfo.method) requestRows.push(["Method", requestInfo.method]);
    if (requestInfo.url) requestRows.push([requestInfo.targetLabel || "URL", requestInfo.url]);
    if (requestInfo.path) requestRows.push(["Path", requestInfo.path]);
    if (requestInfo.query) requestRows.push(["Query", requestInfo.query]);
    let responseHeaders: Array<[string, string]> = [];

    if (data && typeof data === "object") {
      const isResponse = data.status === "Response" || (data.metadata && data.payload);
      if (isResponse) {
        responseHeaders = sortEntries(data.metadata) as Array<[string, string]>;
        payloadContent = typeof data.payload === "string" ? data.payload : JSON.stringify(data.payload, null, 2);
      } else if (data.status === "Ack") {
        payloadContent = "// ACKNOWLEDGED: The backend processed the message successfully.";
      } else {
        payloadContent = JSON.stringify(data, null, 2);
      }
    } else {
      payloadContent = String(data || "");
    }
    currentResponsePayload = payloadContent;

    syncPublishersPanelState({
      responseVisible: true,
      responseTabLabel: `Response ✓ ${statusLabel}`,
      responseStatusLabel: statusLabel,
      responseStatusText: statusText,
      responseStatusColor: statusColor,
      responseDurationLabel: `${duration}ms`,
      responseSizeLabel: sizeString,
      requestRows,
      requestHeaders: requestHeaders.map(({ k, v }) => [k, v]),
      responseHeaders,
      responsePayload: payloadContent,
    });

    if (!pubSplit && mqbApp.split()) {
      pubSplit = mqbApp.split()?.(["#pub-top-content-wrapper", "#pub-response-container"], {
        direction: "vertical",
        sizes: [35, 65],
        minSize: 100,
        gutterSize: 4,
        elementStyle: (_dimension: string, size: number, gutterSize: number) => ({
          "flex-basis": `calc(${size}% - ${gutterSize}px)`,
        }),
        gutterStyle: (_dimension: string, gutterSize: number) => ({
          "flex-basis": `${gutterSize}px`,
        }),
      });
    }
  };

  const renderHistory = () => {
    syncPublishersPanelState();
  };

  const persistConfigState = () => {
    saveAppState();
    mqbRuntime.refreshDirtySection("publishers");
    syncPublishersPanelState();
  };

  const updatePublisherConfigFromMetadataRows = (
    rows: Array<{
      id: number;
      key: string;
      value: string;
      enabled: boolean;
    }>,
  ) => {
    const publisher = publishers[currentIdx];
    if (!publisher || getEndpointType(publisher) !== "http") return;
    const state = getPublisherState(publisher);
    state.headers = rows;
    const httpConfig = ensureHttpConfig(publisher);
    httpConfig.custom_headers = Object.fromEntries(
      rows
        .filter((row) => row.enabled)
        .map((row) => [row.key.trim(), row.value] as [string, string])
        .filter(([key]) => key),
    );
    persistConfigState();
  };

  const updateStateFromUI = () => {
    if (publishers.length === 0) return;
    const publisher = publishers[currentIdx];
    currentMethodValue = HTTP_METHOD_OPTIONS.includes(currentMethodValue) ? currentMethodValue : "POST";
    syncPublishersPanelState();
  };

  const updateUIFromState = async () => {
    if (publishers.length === 0) return;
    const idx = currentIdx;

    clearPublisherResponse();

    const publisher = publishers[idx];
    currentMethodValue = HTTP_METHOD_OPTIONS.includes(currentMethodValue) ? currentMethodValue : "POST";
    renderHistory();
    updateUrlHash();
    syncPublishersPanelState();

    const configFormContainer = document.getElementById("pub-config-form") as HTMLElement | null;
    if (!configFormContainer) return;
    configFormContainer.innerHTML = "";

    const itemSchema = cloneJson({
      ...(schema.properties?.publishers?.items || {}),
      $defs: schema.$defs,
    });
    applyEndpointSchemaDefaults(itemSchema);
    forceRefOnlyEndpoints(itemSchema);
    Object.entries(SCHEMA_REQUEST_BAR_FIELDS).forEach(([defName, fields]) => {
      const endpointSchema = itemSchema.$defs?.[defName];
      if (!endpointSchema?.properties) return;
      fields.forEach((fieldName) => {
        if (endpointSchema.properties[fieldName]) {
          endpointSchema.properties[fieldName].hidden = true;
        }
        if (Array.isArray(endpointSchema.required)) {
          endpointSchema.required = endpointSchema.required.filter((key: string) => key !== fieldName);
        }
      });
    });
    const httpConfigSchema = itemSchema.$defs?.HttpConfig;
    if (httpConfigSchema?.properties?.custom_headers) {
      httpConfigSchema.properties.custom_headers.hidden = true;
    }
    if (itemSchema.properties?.id) {
      itemSchema.properties.id.hidden = true;
    }

    const switchConfig = itemSchema.$defs?.SwitchConfig;
    if (switchConfig?.properties) {
      if (switchConfig.properties.default) {
        switchConfig.properties.default.default = { ref: "" };
      }
      if (switchConfig.properties.cases?.additionalProperties) {
        switchConfig.properties.cases.additionalProperties.default = { ref: "" };
      }
    }

    const fanoutConfig = itemSchema.$defs?.FanoutConfig || itemSchema.$defs?.FanOutConfig;
    if (fanoutConfig) {
      if (fanoutConfig.items) {
        fanoutConfig.items.default = { ref: "" };
      } else if (fanoutConfig.properties?.endpoints?.items) {
        fanoutConfig.properties.endpoints.items.default = { ref: "" };
      }
    }

    state.form_mode = "publisher";
    (window as any)._mqb_form_mode = "publisher";
    
    await mqbApp.forms().init(configFormContainer, itemSchema, publishers[idx], async (updated) => {
      const current = publishers[idx];
      const updatedPublisher = updated as PublisherConfig;
      const previousPublisherName = current?.name || "";
      const previousStorageKey = getPublisherStorageKey(current);
      const previousRequestPayload = get(publishersPanelState).requestPayload;

      // 1. Merge form updates into a clone of current to preserve fields not in the form (like presets)
      const mergedPublisher = {
        ...current,
        ...updatedPublisher,
        endpoint: {
          ...current.endpoint,
          ...updatedPublisher.endpoint,
        }
      };

      const nextPublisher = normalizePublisherConfigShape(mergedPublisher);
      const nextStorageKey = getPublisherStorageKey(nextPublisher);
      if (previousStorageKey && nextStorageKey && previousStorageKey !== nextStorageKey && !appState[nextStorageKey]) {
        const previousState = appState[previousStorageKey];
        appState[nextStorageKey] = previousState
          ? { ...previousState }
          : {
              payload: previousRequestPayload || String(current?.payload || "{}"),
              headers: getPublisherHeaderRows(current),
            };
        delete appState[previousStorageKey];
      }
      copyRequestBarFieldValues(current, nextPublisher);

      // Preserve custom headers for HTTP (managed in the Headers tab)
      if (getEndpointType(nextPublisher) === "http" && getEndpointType(current) === "http") {
        nextPublisher.endpoint.http.custom_headers = current.endpoint.http.custom_headers;
      }

      publishers[idx] = nextPublisher;
      syncConsumerPublisherReferences(config.consumers, previousPublisherName, nextPublisher);
      currentMethodValue = HTTP_METHOD_OPTIONS.includes(currentMethodValue) ? currentMethodValue : "POST";
      syncPublishersPanelState();
      mqbRuntime.refreshDirtySection("publishers");
    });
  };

  const copyCurrentPublisher = async () => {
    const current = config.publishers[currentIdx];
    if (!current) return;
    const currentEndpoint = cloneJson(current.endpoint || { null: null });
    config.consumers ||= [];
    const consumerName = await mqbDialogs.prompt(
      "Choose a name for the new consumer. Publisher-specific fields may need adjustment after copying.",
      "Copy to Consumer",
      {
        confirmLabel: "Create",
        value: nextUniqueName(getEndpointType(current), (config.consumers || []).map((consumer) => consumer.name)),
        placeholder: "publisher_consumer",
      },
    );
    const trimmedConsumerName = String(consumerName || "").trim();
    if (!trimmedConsumerName) return;
    if ((config.consumers || []).some((consumer) => consumer.name === trimmedConsumerName)) {
      await mqbDialogs.alert("Consumer already exists");
      return;
    }
    config.consumers.push({
      name: trimmedConsumerName,
      endpoint: createConsumerEndpointFromPublisherEndpoint(currentEndpoint),
      comment: current.comment || "",
      response: null,
      batch_size: 128,
    });
    mqbRuntime.refreshDirtySection("consumers");
    openConsumerAt(config.consumers.length - 1, "definition");
  };

  const addPublisher = (choice: string) => {
    if (choice) {
      config.publishers.push({
        name: nextUniqueName(choice, (config.publishers || []).map((publisher) => publisher.name)),
        endpoint: createDefaultPublisherEndpoint(choice),
        comment: "",
      });
      state.pending_publisher_restore = { idx: config.publishers.length - 1, tab: "definition" };
      (appWindow() as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
      initPublishers(config, schema);
    }
  };

  addPublisherAction = addPublisher;
  copyCurrentPublisherAction = copyCurrentPublisher;

  cloneCurrentPublisherAction = () => {
    const current = config.publishers[currentIdx];
    const cloned = cloneJson(current);
    cloned.name += "_copy";
    if (config.publishers.some((publisher) => publisher.name === cloned.name)) {
      void mqbDialogs.alert("Cloned publisher name already exists. Please choose a different name.");
      return;
    }
    config.publishers.push(cloned);
    state.pending_publisher_restore = { idx: config.publishers.length - 1, tab: "definition" };
    (appWindow() as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
    initPublishers(config, schema);
  };

  deleteCurrentPublisherAction = async (button = document.getElementById("pub-save")) => {
    const publisher = config.publishers[currentIdx];
    if (!publisher) return;

    const isNew = !isSavedPublisher(publisher);
    const confirmMsg = isNew ? "Discard this new publisher?" : "Delete this publisher?";
    const confirmTitle = isNew ? "Discard Publisher" : "Delete Publisher";

    if (!(await mqbDialogs.confirm(confirmMsg, confirmTitle))) return;

    delete appState[getPublisherStorageKey(publisher)];
    config.publishers.splice(currentIdx, 1);
    const nextIdx = Math.max(0, currentIdx - 1);

    if (isNew) {
      state.pending_publisher_restore = { idx: nextIdx, tab: "definition" };
      (appWindow() as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
      initPublishers(config, schema);
      return;
    }

    const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, false, button);
    if (!saved) return;

    const refreshedConfig = await mqbRuntime.fetchConfigFromServer<PublishersAppConfig>();
    mqbApp.config<PublishersAppConfig>().publishers = refreshedConfig.publishers;
    state.pending_publisher_restore = { idx: nextIdx, tab: "definition" };
    (appWindow() as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
    initPublishers(mqbApp.config<PublishersAppConfig>(), mqbApp.schema<PublishersSchemaRoot>());
  };

  saveCurrentPublisherAction = async (button = null) => {
    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur();
    await Promise.resolve();

    const selectedIdx = currentIdx;
    const originalName = config.publishers[selectedIdx]?.name || null;
    const selectedTab = activeSubtab;
    const mapped = config.publishers.map((publisher) => {
      const nextPublisher = normalizePublisherConfigShape(publisher);
      nextPublisher.payload = getPublisherState(publisher).payload || "";
      nextPublisher.headers = getPublisherHeaderRows(publisher).map(({ key, value, enabled }) => ({ key, value, enabled }));
      return nextPublisher;
    });
    config.publishers.splice(0, config.publishers.length, ...mapped);
    const selectedName = config.publishers[selectedIdx]?.name || originalName;
    const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, false, button);
    if (!saved) {
      // If saveConfigSection failed, we should not proceed with re-initializing
      return;
    }

    const refreshedConfig = saved?.publishers
      ? {
          ...mqbApp.config<PublishersAppConfig>(),
          ...(saved as PublishersAppConfig),
          publishers: (saved as PublishersAppConfig).publishers,
        }
      : await mqbRuntime.fetchConfigFromServer<PublishersAppConfig>();

    if (!refreshedConfig) return;

    // Update local config with the refreshed data from the backend
    mqbApp.setConfig(refreshedConfig);
    const normalizedSavedPublishers = (refreshedConfig.publishers || []).map((publisher: PublisherConfig) =>
      normalizePublisherConfigShape({ ...publisher }),
    );
    
    if (refreshedConfig.history) {
      mqbRuntime.markSectionSaved("history", refreshedConfig.history);
    }
    mqbRuntime.markSectionSaved("publishers", refreshedConfig.publishers);
    const currentPublishers = mqbApp.config<PublishersAppConfig>().publishers || []; // Use the updated mqbApp.config()
    const refreshedIdx = currentPublishers.findIndex((publisher: PublisherConfig) => publisher.name === selectedName); // Find index in the updated list
    const pendingRestore = {
      idx: refreshedIdx === -1 ? Math.min(selectedIdx, Math.max(currentPublishers.length - 1, 0)) : refreshedIdx, // Ensure index is valid
      tab: selectedTab,
    };
    getMqbState().pending_publisher_restore = pendingRestore;
    rememberPublisherView(pendingRestore.idx, selectedTab);
    (appWindow() as any)._mqb_pending_publisher_restore = pendingRestore;
    initPublishers(mqbApp.config<PublishersAppConfig>(), mqbApp.schema<PublishersSchemaRoot>()); // Re-initialize with the fully updated config
  };

  addPublisherMetadataRow = () => {
    const publisher = publishers[currentIdx];
    if (!publisher || getEndpointType(publisher) !== "http") return;
    const currentRows = getPublisherHeaderRows(publisher);
    updatePublisherConfigFromMetadataRows([
      ...currentRows,
      { id: nextPublisherHeaderId++, key: "", value: "", enabled: true },
    ]);
  };
  updatePublisherMetadataRow = (index, field, value) => {
    const publisher = publishers[currentIdx];
    if (!publisher || getEndpointType(publisher) !== "http") return;
    const currentRows = getPublisherHeaderRows(publisher);
    const nextRows = currentRows.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, [field]: value } : entry,
    );
    updatePublisherConfigFromMetadataRows(nextRows);
  };
  togglePublisherMetadataRow = (index: number, enabled: boolean) => {
    const publisher = publishers[currentIdx];
    if (!publisher || getEndpointType(publisher) !== "http") return;
    const currentRows = getPublisherHeaderRows(publisher);
    const nextRows = currentRows.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, enabled } : entry,
    );
    updatePublisherConfigFromMetadataRows(nextRows);
  };
  removePublisherMetadataRow = (index) => {
    const publisher = publishers[currentIdx];
    if (!publisher || getEndpointType(publisher) !== "http") return;
    const currentRows = getPublisherHeaderRows(publisher);
    updatePublisherConfigFromMetadataRows(currentRows.filter((_, currentIndex) => currentIndex !== index));
  };
  updatePublisherPayload = (value) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    getPublisherState(publisher).payload = value;
    saveAppState();
    syncPublishersPanelState();
  };
  updatePublisherMethod = (value) => {
    currentMethodValue = value;
    syncPublishersPanelState();
  };
  updatePublisherRequestField = (fieldId, value) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const endpointType = getEndpointType(publisher);
    const layout = getRequestBarLayout(endpointType);
    setRequestBarFieldValue(publisher, layout.fields.find((field) => field.inputId === fieldId), value.trim());
    persistConfigState();
  };
  beautifyPublisherPayloadAction = () => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const state = getPublisherState(publisher);
    try {
      updatePublisherPayload(JSON.stringify(JSON.parse(state.payload), null, 2));
    } catch {
      void mqbDialogs.alert("Invalid JSON");
    }
  };
  selectPublisherSubtab = (tab) => {
    activeSubtab = normalizePublisherSubtab(tab, activeSubtab);
    rememberPublisherView(currentIdx, activeSubtab);
    syncPublishersPanelState();
  };

  sendPublisherAction = async () => {
    updateStateFromUI();
    if (mqbRuntime.refreshDirtySection("publishers")) {
      const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, true);
      if (!saved) return;
    }

    // If sending from the definition tab, switch to Body so the response is visible.
    if (activeSubtab === "definition") {
      selectPublisherSubtab("payload");
    }

    const publisher = publishers[currentIdx];
    const name = publisher.name;
    const endpoint = publisher.endpoint;
    const payload = applyEnvVars(getPublisherState(publisher).payload);
    const metaArray =
      getEndpointType(publisher) === "http"
        ? sortEntries(ensureHttpConfig(publisher).custom_headers).map(([key, value]) => ({
            k: applyEnvVars(String(key)),
            v: applyEnvVars(String(value)),
          }))
        : [];
    const metadata = buildHttpRequestMetadata();
    Object.keys(metadata).forEach((key) => {
      metadata[key] = applyEnvVars(String(metadata[key]));
    });
    const requestHistoryMetadata = buildRequestBarHistoryMetadata(publisher);

    // Merge custom headers into metadata for the outgoing request
    metaArray.forEach(({ k, v }) => {
      if (k) metadata[k] = v;
    });

    const requestUrl = getRequestBarFieldValue(
      publisher,
      getRequestBarLayout(getEndpointType(publisher)).fields.find((field) => field.inputId === "pub-url"),
    ).trim();
    const resolvedRequestUrl = applyEnvVars(requestUrl);
    const layout = getRequestBarLayout(getEndpointType(publisher));
    const requestBinding = layout.fields.find((field) => field.inputId === "pub-url") || layout.fields[0] || null;

    syncPublishersPanelState({
      responseVisible: true,
      responseTabLabel: "Response",
      responseStatusLabel: "Sending",
      responseStatusText: "",
      responseStatusColor: "var(--text-primary)",
      responseDurationLabel: "",
      responseSizeLabel: "",
      requestRows: [],
      requestHeaders: [],
      responseHeaders: [],
      responsePayload: "Sending...",
    });

    try {
      const startTime = Date.now();
      const endpointType = getEndpointType(publisher);
      const controller = new AbortController();
      const timeoutId = appWindow().setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch("/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, payload, metadata, endpoint }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const duration = Date.now() - startTime;
      const text = await response.text();
      let responseData: any = text;
      try {
        responseData = JSON.parse(text);
      } catch {}

      const statusInfo = getPublishStatusInfo(endpointType, response, responseData);
      formatResponseDetails(statusInfo, duration, responseData, {
        headers: metaArray,
        method: metadata.http_method,
        path: metadata.http_path,
        query: metadata.http_query,
        targetLabel: requestBinding?.label,
        url: resolvedRequestUrl,
      });

      history.unshift({
        publisher_id: getPublisherStorageKey(publisher),
        name,
        payload,
        headers: metaArray.map(({ k, v }) => ({ key: k, value: v, enabled: true })),
        metadata: [...metaArray],
        endpoint_type: endpointType,
        method: layout.showMethod ? currentMethodValue : undefined,
        request_fields: Object.fromEntries(
          layout.fields.map((descriptor) => [descriptor.field, getRequestBarFieldValue(publisher, descriptor).trim()]),
        ),
        requestMetadata: { ...metadata, ...requestHistoryMetadata },
        targetLabel: requestBinding?.label,
        url: resolvedRequestUrl,
        responseData,
        ok: statusInfo.ok,
        status: response.status,
        statusText: response.statusText,
        displayStatus: statusInfo.label,
        displayStatusText: statusInfo.text,
        status_info: {
          ok: statusInfo.ok,
          code: response.status,
          label: statusInfo.label,
          text: statusInfo.text,
        },
        duration,
        time: Date.now(),
      });
      saveHistory();
      renderHistory();
    } catch (error) {
      const isTimeout = error instanceof DOMException && error.name === "AbortError";
      currentResponsePayload = isTimeout
        ? "Error: Publish request timed out after 10s"
        : `Error: ${(error as Error).message}`;
      syncPublishersPanelState({
        responseVisible: true,
        responseTabLabel: "Response ✓ Error",
        responseStatusLabel: "Error",
        responseStatusText: "",
        responseStatusColor: "var(--accent-kafka)",
        responseDurationLabel: "",
        responseSizeLabel: "",
        requestRows: [],
        requestHeaders: [],
        responseHeaders: [],
        responsePayload: currentResponsePayload,
      });
    }
  };

  if (document.getElementById("tab-publishers")?.classList.contains("active") && !pubSplit && mqbApp.split()) {
    pubSplit = mqbApp.split()?.(["#pub-top-content-wrapper", "#pub-response-container"], {
      direction: "vertical",
      sizes: [35, 65],
      minSize: 100,
      gutterSize: 4,
      elementStyle: (_dimension: string, size: number, gutterSize: number) => ({
        "flex-basis": `calc(${size}% - ${gutterSize}px)`,
      }),
      gutterStyle: (_dimension: string, gutterSize: number) => ({
        "flex-basis": `${gutterSize}px`,
      }),
    });
  }

  renderSidebar();

  clearActivePublisherHistory = () => {
    const publisher = publishers[currentIdx];
    const publisherKey = getPublisherStorageKey(publisher);
    const name = publisher?.name;
    if (!publisherKey && !name) return;
    history = history.filter((item) => {
      if (publisherKey) {
        return !(item.publisher_id === publisherKey && item.name === name);
      }
      return !(
        (item.publisher_id === undefined || item.publisher_id === null || item.publisher_id === "")
        && item.name === name
      );
    });
    saveHistory();
    renderHistory();
    clearPublisherResponse();
  };

  copyPublisherResponse = () => {
    if (!currentResponsePayload) return;
    void navigator.clipboard.writeText(currentResponsePayload);
  };

  copyPublisherResponseJson = () => {
    if (!currentResponsePayload) return;
    try {
      const parsed = JSON.parse(currentResponsePayload);
      void navigator.clipboard.writeText(JSON.stringify(parsed, null, 2));
    } catch {
      void navigator.clipboard.writeText(currentResponsePayload);
    }
  };

  copyPublisherAsCurl = () => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;

    const endpointType = getEndpointType(publisher);
    if (endpointType !== "http") return;

    const layout = getRequestBarLayout("http");
    const url = applyEnvVars(
      getRequestBarFieldValue(publisher, layout.fields.find((field) => field.inputId === "pub-url")).trim(),
    );
    if (!url) return;

    const payload = applyEnvVars(getPublisherState(publisher).payload || "");
    const headerParts = sortEntries(ensureHttpConfig(publisher).custom_headers)
      .map(([key, value]) => `-H ${JSON.stringify(`${applyEnvVars(String(key))}: ${applyEnvVars(String(value))}`)}`);
    const method = currentMethodValue || "POST";
    const dataPart = payload ? `--data ${JSON.stringify(payload)}` : "";
    const curlCommand = [
      "curl",
      `-X ${method}`,
      ...headerParts,
      dataPart,
      JSON.stringify(url),
    ]
      .filter((part) => String(part).trim().length > 0)
      .join(" ");
    void navigator.clipboard.writeText(curlCommand);
  };

  savePublisherHistoryAsPublisherAction = async (historyIndex: number) => {
    const item = history[historyIndex];
    if (!item) return;
    const publisher = publishers.find((candidate) => matchesHistoryPublisher(item, candidate));
    if (!publisher) return;

    const variant = await createPublisherVariantFromHistoryItem(publisher, item);
    if (!variant) return;

    config.publishers.push(variant);
    saveAppState();
    await saveCurrentPublisherAction();
  };

  resendPublisherHistoryAction = async (historyIndex: number) => {
    await showPublisherHistoryEntry(historyIndex);
    await sendPublisherAction();
  };

  saveCurrentPublisherVariantAction = async () => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;

    const variant = await createPublisherVariantFromCurrentState(publisher);
    if (!variant) return;

    config.publishers.push(variant);
    saveAppState();
    await saveCurrentPublisherAction();
  };

  importPostmanToPublisherAction = async (jsonText: string) => {
    await importRequestsIntoPublishers(jsonText, "postman");
  };

  importOpenApiToPublisherAction = async (jsonText: string) => {
    await importRequestsIntoPublishers(jsonText, "openapi");
  };

  importAsyncApiToPublisherAction = async (jsonText: string) => {
    await importRequestsIntoPublishers(jsonText, "asyncapi");
  };

  importMqbToPublisherAction = async (jsonText: string) => {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const type = String(parsed?.type || "");
    if (type !== "mqb-export" && type !== "mqb-presets" && type !== "mqb-config") {
      throw new Error("Selected file is not a valid mq-bridge export/presets file.");
    }

    if (type === "mqb-presets") {
      const result = await importFromJsonText(jsonText, {
        includeConfig: false,
        includePresets: true,
        targetPublisherName: "",
      });
      envVars = ensureWorkspaceCollections(mqbApp.config<PublishersAppConfig>()).env_vars;
      syncPublishersPanelState();
      return result;
    }

    const incomingConfig =
      parsed?.config && typeof parsed.config === "object"
        ? (parsed.config as Record<string, unknown>)
        : parsed;
    const importedPublishersRaw = Array.isArray(incomingConfig.publishers)
      ? incomingConfig.publishers
      : [];
    if (importedPublishersRaw.length === 0) {
      throw new Error("No publishers found in import file.");
    }

    const existingNames = new Set((config.publishers || []).map((publisher) => publisher.name));
    const importedPublishers = importedPublishersRaw
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const publisher = cloneJson(row as PublisherConfig);
        const baseName = String(publisher.name || "imported_publisher").trim() || "imported_publisher";
        let name = baseName;
        let idx = 1;
        while (existingNames.has(name)) {
          name = `${baseName}_${idx++}`;
        }
        existingNames.add(name);
        publisher.name = name;
        publisher.comment = String(publisher.comment || "");
        publisher.endpoint = publisher.endpoint && typeof publisher.endpoint === "object"
          ? publisher.endpoint
          : createDefaultPublisherEndpoint("http");
        return publisher;
      });

    config.publishers.push(...importedPublishers);
    const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, false);
    if (!saved?.publishers) {
      throw new Error("Failed to save imported publishers.");
    }

    config.publishers.splice(0, config.publishers.length, ...saved.publishers);
    mqbApp.config<PublishersAppConfig>().publishers = saved.publishers;
    initPublishers(mqbApp.config<PublishersAppConfig>(), schema);
    const firstImportedName = importedPublishers[0]?.name;
    const idx = (config.publishers || []).findIndex((publisher) => publisher.name === firstImportedName);
    if (idx >= 0) {
      restorePublisherStateFromView(idx, { tab: "definition" });
    }
    return { importedKind: type, importedPublishers: importedPublishers.length };
  };

  showPublisherHistoryEntry = async (historyIndex: number) => {
    const item = history[historyIndex];
    if (!item) return;
    const publisherIdx = publishers.findIndex((candidate) => matchesHistoryPublisher(item, candidate));
    if (publisherIdx === -1) return;

    const state = getPublisherState(publishers[publisherIdx]);
    state.payload = item.payload;
    applyHistoryRequestToPublisher(publishers[publisherIdx], item);
    saveAppState();
    setActiveItem(publisherIdx);
    await updateUIFromState();
    formatResponseDetails(
      {
        ok: typeof item.ok === "boolean" ? item.ok : Boolean(item.status_info?.ok ?? item.status < 300),
        label: String(item.displayStatus || item.status_info?.label || item.status),
        text: String(item.displayStatusText || item.status_info?.text || item.statusText || ""),
      },
      item.duration,
      item.responseData,
      {
        headers: item.metadata?.length
          ? item.metadata
          : (item.headers || []).map((row) => ({ k: row.key, v: row.value })),
        method: item.method || item.requestMetadata?.http_method,
        path: item.requestMetadata?.http_path,
        query: item.requestMetadata?.http_query,
        targetLabel: item.targetLabel,
        url: item.url,
      },
    );
  };

  editEnvironmentVarsAction = async () => {
    const current = JSON.stringify(envVars, null, 2);
    const input = await mqbDialogs.prompt(
      "Define environment variables as JSON. Example: {\"baseUrl\":\"https://api.local\",\"token\":\"abc\"}",
      "Environment Variables",
      {
        confirmLabel: "Save",
        value: current,
      },
    );
    if (input == null) return;
    try {
      const parsed = JSON.parse(input);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Expected a JSON object");
      }
      envVars = Object.fromEntries(
        Object.entries(parsed).map(([key, value]) => [String(key), typeof value === "string" ? value : JSON.stringify(value)]),
      );
      await persistWorkspaceCollections(true);
      await mqbDialogs.alert("Environment variables saved. You can now use ${varName} in URL, headers and body.");
    } catch (error) {
      await mqbDialogs.alert(`Invalid JSON: ${(error as Error).message}`);
    }
  };

  if (publishers.length > 0) {
    const pendingRestore = state.pending_publisher_restore || (appWindow() as any)._mqb_pending_publisher_restore || null;
    state.pending_publisher_restore = null;
    (appWindow() as any)._mqb_pending_publisher_restore = null;
    const hashMatch = currentHash().match(/^#publishers:(\d+)$/);
    const hashIdx = hashMatch ? parseInt(hashMatch[1], 10) : null;
    const initialIdx = pendingRestore?.idx ?? hashIdx ?? state.last_publisher_idx ?? 0;
    const initialTab = normalizePublisherSubtab(pendingRestore?.tab, state.last_publisher_tab || "payload");
    setActiveItem(initialIdx, { tab: initialTab });
    void updateUIFromState().then(() => {
      if (!hadUnsavedChangesBeforeInit) {
        mqbRuntime.markSectionSaved("publishers", config.publishers);
      }
    });
    selectPublisherSubtab(initialTab);
  } else if (!hadUnsavedChangesBeforeInit) {
    mqbRuntime.markSectionSaved("publishers", config.publishers);
  }

  state.publishers_initialized = true;
  (appWindow() as any)._mqb_publishers_initialized = true;
  appWindow().restorePublisherState = restorePublisherState;
  restorePublisherStateFromView = restorePublisherState;

  addPublisherAction = addPublisher;
  showPublisherHistoryEntry = showPublisherHistoryEntry;
  clearActivePublisherHistory = clearActivePublisherHistory;
  copyPublisherResponse = copyPublisherResponse;
  copyPublisherResponseJson = copyPublisherResponseJson;
  copyPublisherAsCurl = copyPublisherAsCurl;
  savePublisherHistoryAsPublisherAction = savePublisherHistoryAsPublisherAction;
  savePublisherHistoryAsPresetAction = savePublisherHistoryAsPublisherAction;
  resendPublisherHistoryAction = resendPublisherHistoryAction;
  saveCurrentPublisherVariantAction = saveCurrentPublisherVariantAction;
  savePublisherPresetAction = saveCurrentPublisherVariantAction;
  exportPublisherPresetsAction = () => {};
  renamePublisherPresetAction = async () => {};
  applyPublisherPresetAction = () => {};
  deletePublisherPresetAction = async () => {};
  importPostmanToPublisherAction = importPostmanToPublisherAction;
  importOpenApiToPublisherAction = importOpenApiToPublisherAction;
  importAsyncApiToPublisherAction = importAsyncApiToPublisherAction;
  importMqbToPublisherAction = importMqbToPublisherAction;
  presetToPublisherAction = async () => {};
  selectPublisherSubtab = selectPublisherSubtab;
  editEnvironmentVarsAction = editEnvironmentVarsAction;
  beautifyPublisherPayloadAction = beautifyPublisherPayloadAction;
  sendPublisherAction = sendPublisherAction;
}
