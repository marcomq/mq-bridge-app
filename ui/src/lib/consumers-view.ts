import {
  applyEndpointSchemaDefaults,
  defaultMetricsMiddleware,
  nextUniqueName
} from "./routes";
import {
  cloneJson,
  normalizeConsumerNames,
  normalizeConsumerResponse,
  sanitizeConsumerName,
  normalizeMiddlewares as sharedNormalizeMiddlewares,
} from "./utils";
import { extractImportedRequests } from "./import-export";
import { openConsumerByIndex, openPublisherByIndex } from "./view-navigation";
import { consumersPanelState } from "./stores";
import { appWindow, currentHash, getMqbState, mqbApp, mqbDialogs, mqbRuntime } from "./runtime-window";
import { ensureWorkspaceCollections, isSensitiveConfig, type ConfigSecurity } from "./workspace-config";
import { getStoredJson, setStoredJson } from "./encrypted-json-storage";
import { hasEncryptedMessages, resolveStorageSecurity } from "./storage-security";

export let restoreConsumerStateFromView: (idx: number, options?: { tab?: string }) => void | Promise<void> = () => { };
export let showConsumerMessageDetails: (name: string, msgIdx: number) => void = () => { };
export let toggleActiveConsumer: () => void = () => { };
export let clearActiveConsumerHistory: () => void = () => { };
export let addConsumerAction: (endpointType: string) => void | Promise<void> = () => { };
export let copyCurrentConsumerAction: () => void | Promise<void> = () => { };
export let cloneCurrentConsumerAction: () => void = () => { };
export let saveCurrentConsumerAction: () => void | Promise<void> = () => { };
export let deleteCurrentConsumerAction: () => void | Promise<void> = () => { };
export let selectConsumerSubtab: (tab: "definition" | "response" | "messages") => void = () => { };
export let setConsumerMessageCaptureEnabledAction: (enabled: boolean) => void = () => { };
export let setConsumerMessageCaptureKeepLastAction: (keepLast: number) => void = () => { };
export let setConsumerOutputModeAction: (mode: "none" | "publisher" | "response") => void = () => { };
export let setConsumerOutputPublisherAction: (publisher: string) => void = () => { };
export let addConsumerResponseHeader: () => void = () => { };
export let updateConsumerResponseHeader: (index: number, field: "key" | "value", value: string) => void = () => { };
export let toggleConsumerResponseHeader: (index: number, enabled: boolean) => void = () => { };
export let removeConsumerResponseHeader: (index: number) => void = () => { };
export let updateConsumerResponsePayload: (value: string) => void = () => { };
export let importAsyncApiToConsumerAction: (jsonText: string) => void | Promise<void> = () => { };
export let importMqbToConsumerAction: (jsonText: string) => void | Promise<void> = () => { };

type ConsumerMessage = {
  id?: string;
  payload: unknown;
  metadata?: Record<string, string>;
  time?: string;
  response?: unknown;
  response_metadata?: Record<string, string>;
};

type ConsumerStatus = {
  running: boolean;
  unsaved?: boolean;
  status: {
    healthy: boolean;
    error?: string;
  };
};

type ConsumerConfig = {
  id?: string;
  name: string;
  endpoint: Record<string, unknown>;
  comment?: string;
  response?: unknown;
  output?: ConsumerOutputConfig | null;
  message_capture?: ConsumerMessageCaptureConfig;
  batch_size?: number;
};

type ConsumerMessageCaptureConfig = {
  enabled: boolean;
  keep_last: number;
};

type ConsumerResponseConfig = {
  headers: Record<string, string>;
  payload: string;
};

type ConsumerOutputConfig =
  | { mode: "none" }
  | { mode: "publisher"; publisher: string; publisher_id?: string | null }
  | { mode: "response"; response: ConsumerResponseConfig | null };

type ConsumerResponseHeaderRow = {
  id: number;
  key: string;
  value: string;
  enabled: boolean;
};

type PublisherConfig = {
  id?: string;
  name: string;
  endpoint: Record<string, unknown>;
  comment?: string;
};

type ConsumersAppConfig = {
  consumers: ConsumerConfig[];
  publishers?: PublisherConfig[];
  routes?: Record<string, unknown>;
  config_security?: ConfigSecurity;
};

type ConsumersSchemaRoot = {
  properties?: {
    consumers?: {
      items?: Record<string, any>;
    };
  };
  $defs?: Record<string, any>;
};

const MSG_STORAGE_KEY = "mqb_consumer_messages";
export const CONSUMER_TYPE_OPTIONS = [
  "http",
  "grpc",
  "nats",
  "memory",
  "amqp",
  "kafka",
  "mqtt",
  "mongodb",
  "sqlx",
  "zeromq",
  "file",
  "static",
  "sled",
].filter((t) => !["ref", "fanout", "switch", "ibmmq"].includes(t));

const RESPONSE_CAPABLE_CONSUMER_TYPES = new Set([
  "http",
  "nats",
  "memory",
  "amqp",
  "mongodb",
  "mqtt",
  "zeromq",
  "kafka",
]);

export { sanitizeConsumerName, normalizeConsumerNames };

export function normalizeConsumerMessage(raw: unknown, fallbackTime = new Date().toISOString()): ConsumerMessage {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const looksWrapped =
      Object.prototype.hasOwnProperty.call(record, "id") ||
      Object.prototype.hasOwnProperty.call(record, "payload") ||
      Object.prototype.hasOwnProperty.call(record, "metadata") ||
      Object.prototype.hasOwnProperty.call(record, "time") ||
      Object.prototype.hasOwnProperty.call(record, "response_metadata") ||
      Object.prototype.hasOwnProperty.call(record, "response");

    if (looksWrapped) {
      const metadata =
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? Object.fromEntries(
            Object.entries(record.metadata as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
          )
          : undefined;

      const response_metadata =
        record.response_metadata && typeof record.response_metadata === "object" && !Array.isArray(record.response_metadata)
          ? Object.fromEntries(
            Object.entries(record.response_metadata as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
          )
          : undefined;

      return {
        id: typeof record.id === "string" || typeof record.id === "number" || typeof record.id === "bigint" ? String(record.id) : undefined,
        payload: Object.prototype.hasOwnProperty.call(record, "payload") ? record.payload : raw,
        metadata,
        time: typeof record.time === "string" ? record.time : fallbackTime,
        response: record.response,
        response_metadata,
      };
    }
  }

  return {
    payload: raw,
    time: fallbackTime,
  };
}

function extractUuidV7Timestamp(idStr: string): string | null {
  try {
    const hex = idStr.replace(/-/g, "");
    if (hex.length < 12) return null;
    const milliseconds = parseInt(hex.substring(0, 12), 16);
    return new Date(milliseconds).toLocaleString();
  } catch {
    return null;
  }
}

function getConsumerInputType(consumer: Partial<ConsumerConfig> | null | undefined): string {
  const input = consumer?.endpoint || {};
  return ["ref", "static"].find(k => k in input)
    || Object.keys(input).find((key) => key !== "middlewares")
    || "N/A";
}

function createDefaultConsumerEndpoint(endpointType: string): Record<string, unknown> {
  const isScalar = endpointType === "static" || endpointType === "ref";
  const base = {
    middlewares: isScalar ? [] : defaultMetricsMiddleware(),
  };

  if (endpointType === "static" || endpointType === "ref") {
    return { ...base, [endpointType]: isScalar ? "" : {} };
  }
  const defaults: Record<string, Record<string, any>> = {
    http: { url: "0.0.0.0:8080", method: "POST" },
    grpc: { url: "0.0.0.0:50051" },
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
    switch: { metadata_key: "type", cases: {}, default: { ref: "" } },
    fanout: [{ ref: "" }],
  };
  return {
    ...base,
    [endpointType]: cloneJson(defaults[endpointType] || {}),
  };
}

function normalizeScalarConsumerEndpointValue(endpointType: string, value: unknown): unknown {
  if (endpointType !== "static" && endpointType !== "ref") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as any)[endpointType] === "string") {
    return (value as any)[endpointType];
  }
  return typeof value === "string" ? value : "";
}

function ensureRefOnlyEndpointDefaults(endpoint: unknown): Record<string, any> {
  if (typeof endpoint === "string") {
    return { ref: endpoint, middlewares: [] };
  }
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return { ref: "", middlewares: [] };
  }

  const endpointRecord = endpoint as Record<string, any>;
  // Handle potential 'root' wrapping from form library
  const data = endpointRecord.root && typeof endpointRecord.root === "object" ? endpointRecord.root : endpointRecord;

  return {
    ref: typeof data.ref === "string" ? data.ref : "",
    middlewares: sharedNormalizeMiddlewares(
      data.middlewares,
      ensureRefOnlyEndpointDefaults,
    ),
  };
}

function ensureConsumerEndpointDefaults(endpoint: unknown): Record<string, unknown> {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return createDefaultConsumerEndpoint("http");
  }
  const endpointRecord = endpoint as Record<string, any>;
  const data = endpointRecord.root && typeof endpointRecord.root === "object" ? endpointRecord.root : endpointRecord;

  // Prioritize 'ref' or 'static' to avoid mis-detection if defaults are merged in
  const endpointType = ["ref", "static"].find(k => k in data)
    || Object.keys(data).find((key) => key !== "middlewares")
    || "http";

  const normalized: Record<string, any> = {
    ...createDefaultConsumerEndpoint(endpointType),
    ...cloneJson(data),
  };

  // Cleanup other endpoint keys to prevent pollution during polymorphic switching
  const ALL_TYPE_KEYS = ["http", "grpc", "nats", "memory", "amqp", "kafka", "mqtt", "mongodb", "sqlx", "zeromq", "file", "static", "ref", "sled", "ibmmq", "switch", "fanout", "reader", "response", "custom", "null", "aws", "url", "topic", "subject", "queue", "path"];
  ALL_TYPE_KEYS.forEach(k => {
    if (k !== endpointType && k in normalized) {
      delete normalized[k];
    }
  });

  if (endpointType === "switch") {
    const sw = normalized.switch as any;
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
      normalized.fanout = (normalized.fanout as unknown[]).map((item) =>
        ensureRefOnlyEndpointDefaults(item),
      );
    } else {
      normalized.fanout = [{ ref: "" }];
    }
  }

  normalized[endpointType] = normalizeScalarConsumerEndpointValue(endpointType, normalized[endpointType]);

  normalized.middlewares = sharedNormalizeMiddlewares(
    normalized.middlewares,
    ensureRefOnlyEndpointDefaults,
  );

  return normalized;
}

function normalizeConsumerConfigShape(consumer: ConsumerConfig): ConsumerConfig {
  if (!consumer) return consumer;
  let data = { ...consumer } as any;
  if (data.root) {
    const { root, ...rest } = data;
    data = { ...rest, ...root };
  }
  data.endpoint = ensureConsumerEndpointDefaults(data.endpoint);
  data.output = normalizeConsumerOutput(data.output, data.response);
  data.message_capture = normalizeConsumerMessageCapture(data.message_capture);
  data.response = data.output.mode === "response" ? data.output.response : null;
  return data as ConsumerConfig;
}

function forceRefOnlyEndpoints(itemSchema: any) {
  if (!itemSchema.$defs) itemSchema.$defs = {};
  if (!itemSchema.$defs.RefConfig) {
    itemSchema.$defs.RefConfig = {
      type: "object",
      title: "",
      properties: { ref: { type: "string" } },
      required: ["ref"],
      "wa-no-label": true,
    };
  }
  if (!itemSchema.$defs.StaticConfig) {
    itemSchema.$defs.StaticConfig = { type: "object", properties: { static: { type: "string" } }, required: ["static"] };
  }

  const forceRef = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    obj.$ref = "#/$defs/RefConfig";
    delete obj.oneOf;
    delete obj.anyOf;
    delete obj.allOf;
    delete obj.properties;
    delete obj.enum;
    delete obj.const;
    delete obj.default;
    // Ensure type is 'object' to match RefConfig and avoid type selection UI
    obj.type = "object";
  };

  {
    const dlq = itemSchema.$defs.DlqConfig;
    if (dlq?.properties?.endpoint) forceRef(dlq.properties.endpoint);

    const fanout = itemSchema.$defs.FanoutConfig || itemSchema.$defs.FanOutConfig;
    if (fanout) {
      const endpoints = fanout.items || fanout.properties?.endpoints?.items;
      if (endpoints) forceRef(endpoints);
    }

    const sw = itemSchema.$defs.SwitchConfig;
    if (sw?.properties) {
      if (sw.properties.default) forceRef(sw.properties.default);
      if (sw.properties.cases?.additionalProperties) forceRef(sw.properties.cases.additionalProperties);
    }
  }
}

function splitConsumerListenAddress(rawUrl: string): { url: string; path?: string } {
  const value = String(rawUrl || "").trim();
  if (!value) return { url: "0.0.0.0:8080" };
  const fromTemplate = value.match(/^\$\{[^}]+\}(\/.*)?$/);
  if (fromTemplate) {
    const templatePath = (fromTemplate[1] || "").trim();
    return { url: "0.0.0.0:8080", path: templatePath || undefined };
  }
  try {
    const parsed = new URL(value);
    const protocolDefaultPort = parsed.protocol === "https:" ? "443" : "80";
    const port = parsed.port || protocolDefaultPort;
    const path = `${parsed.pathname || "/"}${parsed.search || ""}`;
    return { url: `0.0.0.0:${port}`, path: path && path !== "/" ? path : undefined };
  } catch {
    return { url: value };
  }
}

function consumerSupportsCustomResponse(consumer: Partial<ConsumerConfig> | null | undefined): boolean {
  return RESPONSE_CAPABLE_CONSUMER_TYPES.has(getConsumerInputType(consumer).toLowerCase());
}

function normalizeConsumerOutput(
  output: unknown,
  fallbackResponse: unknown = null,
): ConsumerOutputConfig {
  const fallbackNormalized = normalizeConsumerResponse(fallbackResponse);
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return fallbackNormalized
      ? { mode: "response", response: fallbackNormalized }
      : { mode: "none" };
  }

  const raw = output as Record<string, unknown>;
  if (raw.mode === "publisher") {
    const publisher = typeof raw.publisher === "string" ? String(raw.publisher).trim() : "";
    const publisher_id =
      typeof raw.publisher_id === "string" && String(raw.publisher_id).trim()
        ? String(raw.publisher_id).trim()
        : undefined;
    return { mode: "publisher", publisher, ...(publisher_id ? { publisher_id } : {}) };
  }
  if (raw.mode === "response") {
    return { mode: "response", response: normalizeConsumerResponse(raw.response) };
  }
  if (raw.mode === "none") {
    return { mode: "none" };
  }
  return fallbackNormalized
    ? { mode: "response", response: fallbackNormalized }
    : { mode: "none" };
}

function syncLegacyConsumerResponse(consumer: ConsumerConfig | null | undefined) {
  if (!consumer) return;
  const normalizedOutput = normalizeConsumerOutput(consumer.output, consumer.response);
  consumer.output = normalizedOutput;
  consumer.response = normalizedOutput.mode === "response" ? normalizedOutput.response : null;
  consumer.message_capture = normalizeConsumerMessageCapture(consumer.message_capture);
}

function normalizeConsumerMessageCapture(
  capture: Partial<ConsumerMessageCaptureConfig> | null | undefined,
): ConsumerMessageCaptureConfig {
  const rawKeepLast = Number(capture?.keep_last);
  const keep_last = Number.isFinite(rawKeepLast) ? Math.max(1, Math.round(rawKeepLast)) : 100;
  return {
    enabled: typeof capture?.enabled === "boolean" ? capture.enabled : true,
    keep_last,
  };
}

function getDefaultConsumerOutput(
  consumer: Partial<ConsumerConfig> | null | undefined,
  publishers: PublisherConfig[] = [],
): ConsumerOutputConfig {
  if (consumerSupportsCustomResponse(consumer)) {
    return { mode: "response", response: null };
  }
  if (publishers.length === 1) {
    return {
      mode: "publisher",
      publisher: publishers[0].name,
      ...(publishers[0].id ? { publisher_id: publishers[0].id } : {}),
    };
  }
  return { mode: "none" };
}

function getDefaultConsumerMessageCapture(): ConsumerMessageCaptureConfig {
  return { enabled: true, keep_last: 100 };
}

// Writes to both the typed state object and the window-level mirror that older
// non-TypeScript callers rely on. Centralising this avoids ~20 scattered pairs.
function setWindowState<K extends string>(key: K, value: unknown) {
  (appWindow() as any)[`_mqb_${key}`] = value;
}

export async function initConsumers(config: ConsumersAppConfig, schema: ConsumersSchemaRoot) {
  const workspaceConfig = ensureWorkspaceCollections(config as ConsumersAppConfig & Record<string, unknown>);
  const storageSecurity = resolveStorageSecurity(getMqbState().storage_security, workspaceConfig);
  const encryptedMessages = hasEncryptedMessages(storageSecurity);
  const sensitiveMode = isSensitiveConfig(workspaceConfig) && !encryptedMessages;
  if (sensitiveMode && typeof localStorage.removeItem === "function") {
    localStorage.removeItem(MSG_STORAGE_KEY);
  }
  const mappedConsumers = (config.consumers || []).map((c) => normalizeConsumerConfigShape(c));
  config.consumers ||= [];
  if (config.consumers !== mappedConsumers) {
    config.consumers.splice(0, config.consumers.length, ...mappedConsumers);
  }
  const consumers = config.consumers;
  consumers.forEach((consumer) => syncLegacyConsumerResponse(consumer));

  const consList = document.getElementById("cons-list") as HTMLElement | null;
  const configFormContainer = document.getElementById("cons-config-form") as HTMLElement | null;
  const emptyAlert = document.getElementById("cons-empty-alert") as HTMLElement | null;
  const mainUi = document.getElementById("cons-main-ui") as HTMLElement | null;

  if (!consList || !configFormContainer || !emptyAlert || !mainUi) {
    return;
  }

  const state = getMqbState();
  if (state.consumer_poll_timer) {
    clearTimeout(state.consumer_poll_timer);
  }
  state.consumer_poll_timer = null;
  state.consumer_poll_nonce = (state.consumer_poll_nonce || 0) + 1;
  setWindowState("consumer_poll_timer", null);
  setWindowState("consumer_poll_nonce", state.consumer_poll_nonce);
  const pollNonce = state.consumer_poll_nonce;

  let currentIdx = 0;
  let activeSubtab: "definition" | "response" | "messages" = "messages";
  let selectedMessageIndex: number | null = null;
  let pendingToggle: { name: string; action: "start" | "stop" } | null = null;
  let nextResponseHeaderId = 1;
  let savedConsumerNames = new Set(
    ((Array.isArray(state.saved_sections?.consumers) ? state.saved_sections.consumers : consumers) || [])
      .map((consumer: ConsumerConfig) => consumer.name),
  );
  const initialConsumersSnapshot = cloneJson(config.consumers);
  const settleInitialDirtyBaseline = () => {
    appWindow().setTimeout(() => {
      mqbRuntime.markSectionSaved("consumers", initialConsumersSnapshot);
    }, 0);
  };

  const getAvailablePublishers = (): PublisherConfig[] => {
    const livePublishers = mqbApp.config<ConsumersAppConfig>()?.publishers;
    if (Array.isArray(livePublishers) && livePublishers.length > 0) {
      return livePublishers;
    }
    return Array.isArray(config.publishers) ? config.publishers : [];
  };
  const getPublisherStorageKey = (publisher: Partial<PublisherConfig> | null | undefined) =>
    String(publisher?.id || publisher?.name || "").trim();
  const getPublisherByName = (publisherName: string) =>
    getAvailablePublishers().find((publisher) => String(publisher?.name || "").trim() === String(publisherName || "").trim());
  const getConsumerStorageKey = (consumer: Partial<ConsumerConfig> | null | undefined) =>
    String(consumer?.id || consumer?.name || "").trim();

  const getAvailablePublisherNames = (): string[] =>
    getAvailablePublishers()
      .map((publisher) => String(publisher?.name || "").trim())
      .filter(Boolean);

  const rememberConsumerView = (
    idx = currentIdx,
    tab: "definition" | "response" | "messages" = activeSubtab,
  ) => {
    const nextIdx = Math.min(Math.max(0, idx), Math.max(consumers.length - 1, 0));
    state.last_consumer_idx = nextIdx;
    state.last_consumer_tab = tab;
    setWindowState("last_consumer_idx", nextIdx);
    setWindowState("last_consumer_tab", tab);
  };

  mqbRuntime.registerDirtySection("consumers", {
    buttonId: "cons-save",
    getValue: () => config.consumers,
  });
  const hadUnsavedChangesBeforeInit = mqbRuntime.refreshDirtySection("consumers");

  const updateUrlHash = () => {
    appWindow().history.replaceState(null, "", `#consumers:${currentIdx || 0}`);
  };

  let consumerMessages: Record<string, ConsumerMessage[]> = {};
  if (encryptedMessages) {
    const loaded = getMqbState().storage_cache?.consumer_messages
      || await getStoredJson<Record<string, unknown>>(MSG_STORAGE_KEY, {}, storageSecurity);
    consumerMessages = loaded && typeof loaded === "object"
      ? Object.fromEntries(
        Object.entries(loaded).map(([name, messages]) => [
          name,
          Array.isArray(messages) ? messages.map((message) => normalizeConsumerMessage(message)) : [],
        ]),
      )
      : {};
  } else if (!sensitiveMode) {
    try {
      const parsed = JSON.parse(localStorage.getItem(MSG_STORAGE_KEY) || "{}");
      consumerMessages = parsed && typeof parsed === "object"
        ? Object.fromEntries(
          Object.entries(parsed as Record<string, unknown>).map(([name, messages]) => [
            name,
            Array.isArray(messages) ? messages.map((message) => normalizeConsumerMessage(message)) : [],
          ]),
        )
        : {};
    } catch {
      consumerMessages = {};
    }
  }

  consumerMessages = Object.fromEntries(
    (config.consumers || []).map((consumer) => {
      const storageKey = getConsumerStorageKey(consumer);
      return [
        storageKey,
        consumerMessages[storageKey] || [],
      ] as const;
    }).filter(([storageKey]) => Boolean(storageKey)),
  );

  const saveMessages = () => {
    if (sensitiveMode) return;
    if (encryptedMessages) {
      void setStoredJson(MSG_STORAGE_KEY, consumerMessages, storageSecurity);
      return;
    }
    localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(consumerMessages));
  };

  const trimStoredMessages = (consumerKey: string) => {
    const consumer = (config.consumers || []).find((entry) => getConsumerStorageKey(entry) === consumerKey);
    const capture = normalizeConsumerMessageCapture(consumer?.message_capture);
    const currentMessages = consumerMessages[consumerKey] || [];
    if (currentMessages.length > capture.keep_last) {
      consumerMessages[consumerKey] = currentMessages.slice(0, capture.keep_last);
      return true;
    }
    return false;
  };

  let trimmedExistingMessages = false;
  for (const consumer of config.consumers || []) {
    trimmedExistingMessages = trimStoredMessages(getConsumerStorageKey(consumer)) || trimmedExistingMessages;
  }
  if (trimmedExistingMessages) {
    saveMessages();
  }

  const consumerStatus: Record<string, ConsumerStatus> = {};
  const consumerThroughput: Record<string, number> = {};
  const consumerRateSamples: Record<string, { timestampMs: number; total: number }> = {};
  const consumerMessageSequences: Record<string, number> = {};
  const consumerLastPolled: Record<string, number> = {};
  const consumerViewState: Record<number, { responseHeaders: ConsumerResponseHeaderRow[] }> = {};

  const syncSavedConsumerNames = (source: ConsumerConfig[]) => {
    savedConsumerNames = new Set((source || []).map((consumer) => consumer.name));
  };
  syncSavedConsumerNames(
    Array.isArray(state.saved_sections?.consumers) ? state.saved_sections.consumers : consumers,
  );
  const isSavedConsumer = (name: string) => savedConsumerNames.has(name);

  const getConsumerResponseRows = (index: number) => {
    if (!consumerViewState[index]) {
      const normalizedResponse = normalizeConsumerResponse(consumers[index]?.response);
      consumerViewState[index] = {
        responseHeaders: Object.entries(normalizedResponse?.headers || {})
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => ({ id: nextResponseHeaderId++, key, value, enabled: true })),
      };
    }
    return consumerViewState[index].responseHeaders;
  };

  const syncConsumersPanelState = () => {
    const currentConsumer = consumers[currentIdx] || null;
    const currentConsumerName = currentConsumer?.name || null;
    const currentConsumerKey = currentConsumer ? getConsumerStorageKey(currentConsumer) : null;
    const messages = currentConsumerKey ? consumerMessages[currentConsumerKey] || [] : [];
    const status = currentConsumerName
      ? consumerStatus[currentConsumerName] || { running: false, status: { healthy: false } }
      : { running: false, status: { healthy: false } };
    const isTogglePending = !!(currentConsumerName && pendingToggle && pendingToggle.name === currentConsumerName);

    const liveStatusText = status.running
      ? status.status.healthy
        ? "Connected"
        : `Connection Error: ${status.status.error || "Unknown"}`
      : status.status.error
        ? `Start failed: ${status.status.error}`
        : "Consumer Stopped";
    const liveStatusVariant = status.running
      ? (status.status.healthy ? "success" : "danger")
      : status.status.error
        ? "danger"
        : "neutral";

    const selectedMessage =
      selectedMessageIndex !== null && currentConsumerKey
        ? (consumerMessages[currentConsumerKey] || [])[selectedMessageIndex]
        : null;
    const detailRequestHeaders = selectedMessage
      ? Object.entries(selectedMessage.metadata || {}).sort(([a], [b]) => a.localeCompare(b))
      : [];
    const detailRequestPayload = selectedMessage
      ? typeof selectedMessage.payload === "string"
        ? selectedMessage.payload
        : JSON.stringify(selectedMessage.payload, null, 2)
      : "";
    const detailRequestContentType = selectedMessage?.metadata
      ? (selectedMessage.metadata["Content-Type"] || selectedMessage.metadata["content-type"] || "")
      : "";

    const detailTime = selectedMessage
      ? selectedMessage.id
        ? extractUuidV7Timestamp(selectedMessage.id)
        : selectedMessage.time
          ? new Date(selectedMessage.time).toLocaleString()
          : "N/A"
      : null;
    const detailResponsePayload = selectedMessage?.response != null
      ? typeof selectedMessage.response === "string"
        ? selectedMessage.response
        : JSON.stringify(selectedMessage.response, null, 2)
      : "";
    const detailResponseHeaders = (selectedMessage && selectedMessage.response_metadata)
      ? Object.entries(selectedMessage.response_metadata).sort(([a], [b]) => a.localeCompare(b))
      : [];
    const detailResponseContentType = (selectedMessage && selectedMessage.response_metadata)
      ? (selectedMessage.response_metadata["Content-Type"] || selectedMessage.response_metadata["content-type"] || "")
      : "";
    const detailInfo = selectedMessage
      ? `Message from ${detailTime}${detailRequestHeaders.length > 0 ? ` (Metadata: ${detailRequestHeaders.map(([key]) => key).join(", ")})` : ""}`
      : "Select a message to view details";

    syncLegacyConsumerResponse(currentConsumer);
    const messageCapture = normalizeConsumerMessageCapture(currentConsumer?.message_capture);
    const responseSupported = consumerSupportsCustomResponse(currentConsumer);
    const activeOutput = normalizeConsumerOutput(currentConsumer?.output, currentConsumer?.response);
    if (activeOutput.mode === "response" && !responseSupported) {
      currentConsumer!.output = { mode: "none" };
      currentConsumer!.response = null;
    }
    const resolvedOutput = normalizeConsumerOutput(currentConsumer?.output, currentConsumer?.response);
    if (currentConsumer && resolvedOutput.mode !== "response") {
      consumerViewState[currentIdx] = { responseHeaders: [] };
    }
    const normalizedResponse = resolvedOutput.mode === "response" ? normalizeConsumerResponse(resolvedOutput.response) : null;
    const responseHeaders = resolvedOutput.mode === "response" ? getConsumerResponseRows(currentIdx) : [];
    const responsePayload = normalizedResponse?.payload || "";

    consumersPanelState.set({
      hasConsumers: consumers.length > 0,
      currentConsumerName,
      items: consumers.map((consumer, index) => {
        const status = consumerStatus[consumer.name];
        const statusClass = status
          ? status.running
            ? status.status?.healthy ? "status-ok" : "status-err"
            : "status-off"
          : "status-off";
        return {
          name: consumer.name,
          inputProto: getConsumerInputType(consumer).toUpperCase(),
          statusClass,
          messageCount: consumerMessages[getConsumerStorageKey(consumer)]?.length || 0,
          throughputLabel: status?.running
            ? `${(consumerThroughput[consumer.name] || 0).toFixed(1)} msg/s`
            : "",
          originalIndex: index,
        };
      }),
      selectedIndex: currentIdx,
      activeSubtab,
      isNew: currentConsumerName ? !isSavedConsumer(currentConsumerName) : false,
      deleteLabel: (currentConsumerName && !isSavedConsumer(currentConsumerName)) ? "Cancel" : "Delete",
      messageCaptureEnabled: messageCapture.enabled,
      messageCaptureKeepLast: messageCapture.keep_last,
      responseEnabled: Boolean(currentConsumer),
      outputMode: resolvedOutput.mode,
      publisherOptions: getAvailablePublisherNames(),
      selectedPublisher: resolvedOutput.mode === "publisher" ? resolvedOutput.publisher : "",
      responseSupported,
      responseHeaders,
      responsePayload,
      liveStatusText,
      liveStatusVariant,
      toggleLabel: isTogglePending ? (pendingToggle?.action === "start" ? "Starting..." : "Stopping...") : status.running ? "Stop" : "Start",
      toggleVariant: isTogglePending ? "neutral" : status.running ? "danger" : "success",
      toggleBusy: isTogglePending,
      messages: messages.map((message, messageIndex) => ({
        timeLabel:
          (message.id ? extractUuidV7Timestamp(message.id) : null) ||
          (message.time ? new Date(message.time).toLocaleString() : "N/A"),
        payloadPreview:
          typeof message.payload === "string" ? message.payload : JSON.stringify(message.payload),
        messageIndex,
        selected: selectedMessageIndex === messageIndex,
      })),
      detailInfo,
      detailRequestPayload,
      detailRequestHeaders,
      detailResponsePayload,
      detailResponseHeaders,
      detailRequestContentType,
      detailResponseContentType,
      hasResponse: selectedMessage?.response != null,
    });
  };

  const schedulePoll = (delayMs: number) => {
    if (state.consumer_poll_nonce !== pollNonce) return;
    if (state.consumer_poll_timer) clearTimeout(state.consumer_poll_timer);
    state.consumer_poll_timer = appWindow().setTimeout(pollLoop, delayMs);
    setWindowState("consumer_poll_timer", state.consumer_poll_timer);
  };

  const syncRuntimeConsumerStatuses = () => {
    const runtimeConsumers =
      (getMqbState().runtime_status?.consumers || {}) as Record<
        string,
        { running?: boolean; status?: { healthy?: boolean; error?: string }; message_sequence?: number }
      >;
    const nowMs = Date.now();

    for (const existingName of Object.keys(consumerStatus)) {
      if (!(config.consumers || []).some((consumer) => consumer.name === existingName)) {
        delete consumerStatus[existingName];
        delete consumerThroughput[existingName];
        delete consumerRateSamples[existingName];
        delete consumerMessageSequences[existingName];
        delete consumerLastPolled[existingName];
      }
    }

    for (const consumer of config.consumers || []) {
      const name = consumer.name;
      if (!isSavedConsumer(name)) {
        consumerStatus[name] = { running: false, status: { healthy: false }, unsaved: true };
        continue;
      }

      const runtimeConsumer = runtimeConsumers[name];
      consumerStatus[name] = {
        running: Boolean(runtimeConsumer?.running),
        status: {
          healthy: Boolean(runtimeConsumer?.status?.healthy),
          ...(runtimeConsumer?.status?.error ? { error: runtimeConsumer.status.error } : {}),
        },
      };

      if (consumerStatus[name].running) {
        const currentSeq = runtimeConsumer?.message_sequence || 0;
        const prevSample = consumerRateSamples[name];
        if (prevSample) {
          const elapsedSec = (nowMs - prevSample.timestampMs) / 1000;
          if (elapsedSec >= 0.8) {
            const delta = Math.max(0, currentSeq - prevSample.total);
            consumerThroughput[name] = delta / elapsedSec;
            consumerRateSamples[name] = { timestampMs: nowMs, total: currentSeq };
          }
        } else {
          consumerRateSamples[name] = { timestampMs: nowMs, total: currentSeq };
          consumerThroughput[name] = 0;
        }
      } else {
        consumerThroughput[name] = 0;
      }
    }
  };

  const renderSidebar = () => {
    syncConsumersPanelState();
    const hasConsumers = consumers.length > 0;
    emptyAlert.style.display = hasConsumers ? "none" : "block";
    mainUi.style.display = hasConsumers ? "contents" : "none";
  };

  const setActiveItem = (idx: number) => {
    if (consumers.length === 0) {
      currentIdx = 0;
      selectedMessageIndex = null;
      rememberConsumerView(0, activeSubtab);
      syncConsumersPanelState();
      return;
    }
    currentIdx = Math.min(Math.max(0, idx), consumers.length - 1);
    rememberConsumerView(currentIdx, activeSubtab);
    selectedMessageIndex = null;
    syncConsumersPanelState();
  };

  const refreshConsumerStatuses = async () => {
    syncRuntimeConsumerStatuses();
    syncConsumersPanelState();
  };

  const openConsumerAt = (idx: number, tab = "messages") => {
    openConsumerByIndex(
      idx,
      tab as "messages" | "definition" | "response",
      restoreConsumerStateFromView,
      () => { void initConsumers(config, schema); },
    );
  };

  const openPublisherAt = (idx: number, tab = "payload") => {
    openPublisherByIndex(
      idx,
      tab as "payload" | "headers" | "history" | "definition",
      (publisherIdx, options) => mqbApp.restore.publisher(publisherIdx, options),
      () => mqbApp.init.publishers(config, mqbApp.schema()),
    );
  };

  const copyCurrentConsumer = async () => {
    const current = config.consumers[currentIdx];
    if (!current) return;
    const publisherName = await mqbDialogs.prompt(
      "Choose a name for the new publisher. Consumer-specific fields may need adjustment after copying.",
      "Copy to Publisher",
      {
        confirmLabel: "Create",
        value: nextUniqueName(
          `${current.name}_publisher`,
          (config.publishers || []).map((publisher) => publisher.name),
        ),
        placeholder: "consumer_publisher",
      },
    );
    if (!publisherName) return;
    if ((config.publishers || []).some((publisher) => publisher.name === publisherName)) {
      await mqbDialogs.alert("Publisher already exists");
      return;
    }
    config.publishers ||= [];
    config.publishers.push({
      name: publisherName,
      endpoint: cloneJson(current.endpoint),
      comment: current.comment || "",
    });
    mqbRuntime.refreshDirtySection("publishers");
    openPublisherAt(config.publishers.length - 1, "definition");
  };

  const addConsumer = (endpointType: string) => {
    if (endpointType) {
      config.consumers.push({
        name: nextUniqueName(endpointType, (config.consumers || []).map((consumer) => consumer.name)),
        endpoint: createDefaultConsumerEndpoint(endpointType),
        comment: "",
        response: null,
        output: getDefaultConsumerOutput({ endpoint: createDefaultConsumerEndpoint(endpointType) }, config.publishers || []),
        batch_size: 128,
        message_capture: getDefaultConsumerMessageCapture(),
      });
      const nextIdx = config.consumers.length - 1;
      state.pending_consumer_restore = { idx: nextIdx, tab: "definition" };
      setWindowState("pending_consumer_restore", state.pending_consumer_restore);
      void initConsumers(config, schema);
    }
  };
  const requestToHttpConsumer = (request: { name: string; method: string; url: string }) => {
    const currentNames = (config.consumers || []).map((consumer) => consumer.name);
    const baseName = String(request.name || "http").trim().replace(/\s+/g, "_").toLowerCase() || "http";
    const name = nextUniqueName(sanitizeConsumerName(baseName), currentNames);
    const listen = splitConsumerListenAddress(request.url || "");
    const httpConfig: Record<string, unknown> = { url: listen.url, method: request.method || "POST" };
    if (listen.path) httpConfig.path = listen.path;
    const endpoint = ensureConsumerEndpointDefaults({ middlewares: defaultMetricsMiddleware(), http: httpConfig });
    return {
      name,
      endpoint,
      comment: "",
      response: null,
      output: getDefaultConsumerOutput({ endpoint }, config.publishers || []),
      batch_size: 128,
      message_capture: getDefaultConsumerMessageCapture(),
    } as ConsumerConfig;
  };

  const persistImportedConsumers = async (importedConsumers: ConsumerConfig[]) => {
    if (importedConsumers.length === 0) {
      throw new Error("No consumers found in import file.");
    }

    const firstImportedName = importedConsumers[0]?.name || "";
    config.consumers.push(
      ...importedConsumers.map((consumer) => {
        const output = normalizeConsumerOutput(consumer.output, consumer.response);
        return {
          ...consumer,
          endpoint: ensureConsumerEndpointDefaults(consumer.endpoint),
          output,
          message_capture: normalizeConsumerMessageCapture(consumer.message_capture),
          response: output.mode === "response" ? output.response : null,
          batch_size: consumer.batch_size ?? 128,
        };
      }),
    );
    const saved = await mqbRuntime.saveConfigSection("consumers", config.consumers, false);
    if (!saved?.consumers) throw new Error("Failed to save imported consumers.");

    config.consumers.splice(0, config.consumers.length, ...saved.consumers);
    mqbApp.config<ConsumersAppConfig>().consumers = saved.consumers;
    syncSavedConsumerNames(saved.consumers || []);
    await initConsumers(config, schema);

    const nextIdx = config.consumers.findIndex((consumer) => consumer.name === firstImportedName);
    if (nextIdx >= 0) {
      await restoreConsumerStateFromView(nextIdx, { tab: "definition" });
    } else if (config.consumers.length > 0) {
      await restoreConsumerStateFromView(config.consumers.length - 1, { tab: "definition" });
    }
  };

  const syncCurrentConsumerResponse = (response: { headers: Record<string, string>; payload: string } | null) => {
    if (!config.consumers[currentIdx]) return;
    config.consumers[currentIdx].output = { mode: "response", response };
    config.consumers[currentIdx].response = response;
    mqbRuntime.refreshDirtySection("consumers");
    syncConsumersPanelState();
  };

  const setCurrentConsumerOutputMode = (mode: "none" | "publisher" | "response") => {
    const current = config.consumers[currentIdx];
    if (!current) return;

    if (mode === "response") {
      if (!consumerSupportsCustomResponse(current)) return;
      const previous = normalizeConsumerOutput(current.output, current.response);
      const response = previous.mode === "response" ? previous.response : normalizeConsumerResponse(current.response);
      current.output = { mode: "response", response };
      current.response = response;
      activeSubtab = "response";
    } else if (mode === "publisher") {
      const existing = normalizeConsumerOutput(current.output, current.response);
      const publisherOptions = getAvailablePublisherNames();
      if (publisherOptions.length === 0) {
        void mqbDialogs.alert("Create or select a publisher first.");
        return;
      }
      const preferredPublisher =
        existing.mode === "publisher" && existing.publisher
          ? existing.publisher
          : publisherOptions.length === 1
            ? publisherOptions[0]
            : "";
      const preferredPublisherConfig = getPublisherByName(preferredPublisher);
      current.output = {
        mode: "publisher",
        publisher: preferredPublisher,
        ...(preferredPublisherConfig?.id ? { publisher_id: preferredPublisherConfig.id } : {}),
      };
      current.response = null;
      if (activeSubtab !== "messages") activeSubtab = "response";
    } else {
      current.output = { mode: "none" };
      current.response = null;
    }

    rememberConsumerView(currentIdx, activeSubtab);
    mqbRuntime.refreshDirtySection("consumers");
    syncConsumersPanelState();
  };

  const setCurrentConsumerOutputPublisher = (publisher: string) => {
    const current = config.consumers[currentIdx];
    if (!current) return;
    const publisherName = String(publisher || "").trim();
    const publisherConfig = getPublisherByName(publisherName);
    current.output = {
      mode: "publisher",
      publisher: publisherName,
      ...(publisherConfig?.id ? { publisher_id: publisherConfig.id } : {}),
    };
    current.response = null;
    mqbRuntime.refreshDirtySection("consumers");
    syncConsumersPanelState();
  };

  const setCurrentConsumerMessageCaptureEnabled = (enabled: boolean) => {
    const current = config.consumers[currentIdx];
    if (!current) return;
    current.message_capture = { ...normalizeConsumerMessageCapture(current.message_capture), enabled };
    mqbRuntime.refreshDirtySection("consumers");
    syncConsumersPanelState();
  };

  const setCurrentConsumerMessageCaptureKeepLast = (keepLast: number) => {
    const current = config.consumers[currentIdx];
    if (!current) return;
    current.message_capture = normalizeConsumerMessageCapture({ ...current.message_capture, keep_last: keepLast });
    trimStoredMessages(getConsumerStorageKey(current));
    saveMessages();
    mqbRuntime.refreshDirtySection("consumers");
    syncConsumersPanelState();
  };

  const persistCurrentConsumerResponse = (
    responseHeaders = getConsumerResponseRows(currentIdx),
    payload = normalizeConsumerResponse(config.consumers[currentIdx]?.response)?.payload || "",
  ) => {
    const headers = Object.fromEntries(
      responseHeaders
        .filter((row) => row.enabled)
        .map((row) => [row.key.trim(), row.value.trim()] as [string, string])
        .filter(([key, value]) => key && value),
    );
    syncCurrentConsumerResponse(normalizeConsumerResponse({ headers, payload }));
  };

  showConsumerMessageDetails = (name: string, msgIdx: number) => {
    const consumer = (config.consumers || []).find((entry) => entry.name === name);
    const message = (consumerMessages[getConsumerStorageKey(consumer)] || [])[msgIdx];
    if (!message) return;
    selectedMessageIndex = msgIdx;
    activeSubtab = "messages";
    rememberConsumerView(currentIdx, activeSubtab);
    syncConsumersPanelState();
  };

  const toggleConsumer = async (name: string) => {
    if (pendingToggle?.name === name) return;

    const isRunning = consumerStatus[name]?.running;
    const action = isRunning ? "stop" : "start";
    let targetName = name;
    let normalizedNamesChanged = false;

    if (action === "start") {
      const normalized = normalizeConsumerNames(config.consumers, currentIdx);
      normalizedNamesChanged = normalized.changed;
      targetName = normalized.selectedName || targetName;
      if (targetName !== name) syncConsumersPanelState();
    }

    if (
      action === "start" &&
      (!isSavedConsumer(targetName) || mqbRuntime.refreshDirtySection("consumers") || normalizedNamesChanged)
    ) {
      const saved = await mqbRuntime.saveConfigSection("consumers", config.consumers, false, document.getElementById("cons-save"));
      if (!saved?.consumers) return;

      consumers.splice(0, consumers.length, ...saved.consumers);
      config.consumers = consumers;
      mqbApp.config<ConsumersAppConfig>().consumers = consumers;
      syncSavedConsumerNames(consumers);

      const refreshedIdx = consumers.findIndex((consumer) => consumer.name === targetName);
      if (refreshedIdx === -1) {
        await mqbDialogs.alert("Save completed, but the selected consumer no longer exists.");
        return;
      }
      currentIdx = refreshedIdx;
      targetName = consumers[refreshedIdx].name;
    }

    pendingToggle = { name: targetName, action };
    syncConsumersPanelState();

    try {
      const response = await fetch(`/consumer-${action}?consumer=${encodeURIComponent(targetName)}`, { method: "POST" });
      if (response.ok) {
        await appWindow().pollRuntimeStatus();
        syncRuntimeConsumerStatuses();
        syncConsumersPanelState();
      } else {
        const errorMessage = (await response.text()) || `Failed to ${action} consumer`;
        consumerStatus[targetName] = {
          running: false,
          status: { healthy: false, error: errorMessage.replace(/^Internal Server Error:\s*/i, "") },
        };
        syncConsumersPanelState();
        await mqbDialogs.alert(errorMessage);
      }
    } catch (error) {
      console.error(`Error during ${action}:`, error);
      await mqbDialogs.alert(`Failed to ${action} consumer`);
    } finally {
      pendingToggle = null;
      syncConsumersPanelState();
    }
  };

  const clearConsumerHistory = (name: string) => {
    const consumer = (config.consumers || []).find((entry) => entry.name === name);
    consumerMessages[getConsumerStorageKey(consumer)] = [];
    saveMessages();
    syncConsumersPanelState();
  };

  const updateUI = async () => {
    if (consumers.length === 0) return;

    updateUrlHash();
    configFormContainer.innerHTML = "";

    const itemSchema = cloneJson({
      ...(schema.properties?.consumers?.items || {}),
      $defs: schema.$defs,
    }) as Record<string, any>;
    applyEndpointSchemaDefaults(itemSchema);
    forceRefOnlyEndpoints(itemSchema);

    for (const field of ["response", "output", "message_capture"] as const) {
      if (itemSchema.properties?.[field]) {
        itemSchema.properties[field].hidden = true;
      }
    }
    if (itemSchema.properties?.id) {
      itemSchema.properties.id.hidden = true;
    }
    const httpConfigSchema = itemSchema.$defs?.HttpConfig;
    if (httpConfigSchema?.properties?.custom_headers) {
      httpConfigSchema.properties.custom_headers.hidden = true;
    }

    const switchConfig = itemSchema.$defs?.SwitchConfig;
    if (switchConfig?.properties) {
      if (switchConfig.properties.default) switchConfig.properties.default.default = { ref: "" };
      if (switchConfig.properties.cases?.additionalProperties) {
        switchConfig.properties.cases.additionalProperties.default = { ref: "" };
      }
    }

    const fanoutConfig = itemSchema.$defs?.FanoutConfig || itemSchema.$defs?.FanOutConfig;
    if (fanoutConfig) {
      if (fanoutConfig.items) fanoutConfig.items.default = { ref: "" };
      else if (fanoutConfig.properties?.endpoints?.items) fanoutConfig.properties.endpoints.items.default = { ref: "" };
    }

    const dlqConfig = itemSchema.$defs?.DlqConfig;
    if (dlqConfig?.properties?.endpoint) {
      dlqConfig.properties.endpoint.default = { ref: "" };
    }

    if (consumers[currentIdx] && isSavedConsumer(consumers[currentIdx].name)) {
      await refreshConsumerStatuses();
    }

    state.form_mode = "consumer";
    (window as any)._mqb_form_mode = "consumer";

    await mqbApp.forms().init(configFormContainer, itemSchema, config.consumers[currentIdx], (updated) => {
      const current = config.consumers[currentIdx];
      const normalized = normalizeConsumerConfigShape(updated as ConsumerConfig);

      // Preserve fields handled outside the JSON form (via sub-tabs and action buttons)
      if (current) {
        normalized.id = current.id;
        normalized.output = current.output;
        normalized.response = current.response;
        normalized.message_capture = current.message_capture;
      }

      config.consumers[currentIdx] = normalized;
      syncConsumersPanelState();
      mqbRuntime.refreshDirtySection("consumers");
    });

    syncConsumersPanelState();
  };

  const restoreConsumerState = async (idx: number, options: { tab?: string } = {}) => {
    if (consumers.length === 0) return;
    const requestedTab = (options.tab || state.last_consumer_tab || "messages") as "definition" | "response" | "messages";
    activeSubtab = requestedTab;
    setActiveItem(idx);
    startPolling();
    await updateUI();
    activeSubtab = requestedTab;
    rememberConsumerView(currentIdx, activeSubtab);
    syncConsumersPanelState();
  };

  toggleActiveConsumer = () => {
    const name = consumers[currentIdx]?.name;
    if (!name) return;
    void toggleConsumer(name);
  };

  clearActiveConsumerHistory = () => {
    const name = consumers[currentIdx]?.name;
    if (!name) return;
    clearConsumerHistory(name);
  };

  addConsumerAction = addConsumer;
  copyCurrentConsumerAction = copyCurrentConsumer;
  setConsumerMessageCaptureEnabledAction = setCurrentConsumerMessageCaptureEnabled;
  setConsumerMessageCaptureKeepLastAction = setCurrentConsumerMessageCaptureKeepLast;
  setConsumerOutputModeAction = setCurrentConsumerOutputMode;
  setConsumerOutputPublisherAction = setCurrentConsumerOutputPublisher;

  cloneCurrentConsumerAction = async () => {
    const current = config.consumers[currentIdx];
    const cloned = cloneJson(current);
    cloned.name = nextUniqueName(
      sanitizeConsumerName(`${cloned.name}_copy`),
      (config.consumers || []).map((consumer) => consumer.name),
    );
    cloned.endpoint = ensureConsumerEndpointDefaults(cloned.endpoint);
    syncLegacyConsumerResponse(cloned);
    config.consumers.push(cloned);
    const nextIdx = config.consumers.length - 1;
    state.pending_consumer_restore = { idx: nextIdx, tab: "definition" };
    setWindowState("pending_consumer_restore", state.pending_consumer_restore);
    await initConsumers(config, schema);
  };

  deleteCurrentConsumerAction = async () => {
    const consumer = config.consumers[currentIdx];
    if (!consumer) return;

    const isNew = !isSavedConsumer(consumer.name);
    if (!(await mqbDialogs.confirm(
      isNew ? "Discard this new consumer?" : "Delete this consumer?",
      isNew ? "Discard Consumer" : "Delete Consumer",
    ))) return;

    const newConsumers = config.consumers.slice();
    newConsumers.splice(currentIdx, 1);
    const nextIdx = Math.max(0, currentIdx - 1);

    if (isNew) {
      config.consumers = newConsumers;
      state.pending_consumer_restore = { idx: nextIdx, tab: activeSubtab };
      setWindowState("pending_consumer_restore", state.pending_consumer_restore);
      await initConsumers(config, schema);
      return;
    }

    const saved = await mqbRuntime.saveConfigSection("consumers", newConsumers, false);
    if (!saved?.consumers) {
      await mqbDialogs.alert("Failed to save consumer deletion.");
      return;
    }
    config.consumers = saved.consumers;
    mqbApp.config<ConsumersAppConfig>().consumers = saved.consumers;
    syncSavedConsumerNames(saved.consumers || []);
    state.pending_consumer_restore = { idx: nextIdx, tab: activeSubtab };
    setWindowState("pending_consumer_restore", state.pending_consumer_restore);
    await initConsumers(config, schema);
  };

  saveCurrentConsumerAction = async () => {
    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur();
    await Promise.resolve();
    const normalized = normalizeConsumerNames(config.consumers, currentIdx);
    const selectedName = normalized.selectedName;
    const selectedTab = activeSubtab;
    const mapped = (config.consumers || []).map((consumer) => normalizeConsumerConfigShape({ ...consumer }));
    config.consumers.splice(0, config.consumers.length, ...mapped);
    const saved = await mqbRuntime.saveConfigSection("consumers", config.consumers, false, document.getElementById("cons-save"));
    if (!saved) return;

    const normalizedSavedConsumers = (saved.consumers || []).map((consumer: ConsumerConfig) =>
      normalizeConsumerConfigShape({ ...consumer }),
    );
    config.consumers.splice(0, config.consumers.length, ...normalizedSavedConsumers);
    mqbApp.config<ConsumersAppConfig>().consumers = normalizedSavedConsumers;
    syncSavedConsumerNames(saved.consumers || []);
    mqbRuntime.markSectionSaved("consumers", normalizedSavedConsumers);
    const targetIdx = (mqbApp.config<ConsumersAppConfig>().consumers || []).findIndex(
      (consumer: ConsumerConfig) => consumer.name === selectedName,
    );
    const pendingRestore = { idx: targetIdx === -1 ? currentIdx : targetIdx, tab: selectedTab };
    getMqbState().pending_consumer_restore = pendingRestore;
    rememberConsumerView(pendingRestore.idx, selectedTab);
    setWindowState("pending_consumer_restore", pendingRestore);
    await initConsumers(mqbApp.config<ConsumersAppConfig>(), mqbApp.schema<ConsumersSchemaRoot>());
    syncConsumersPanelState();
  };

  selectConsumerSubtab = (tab) => {
    activeSubtab = tab;
    rememberConsumerView(currentIdx, activeSubtab);
    syncConsumersPanelState();
    if (activeSubtab === "messages" && !state.cons_split && mqbApp.split()) {
      state.cons_split = mqbApp.split()?.([`#cons-list-pane`, `#cons-detail-pane`], {
        direction: "vertical",
        sizes: [40, 60],
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

  addConsumerResponseHeader = () => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;
    const responseHeaders = [
      ...getConsumerResponseRows(currentIdx),
      { id: nextResponseHeaderId++, key: "", value: "", enabled: true },
    ];
    consumerViewState[currentIdx] = { responseHeaders };
    persistCurrentConsumerResponse(responseHeaders);
  };

  updateConsumerResponseHeader = (index, field, value) => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;
    const responseHeaders = getConsumerResponseRows(currentIdx).map((row, i) =>
      i === index ? { ...row, [field]: value } : row,
    );
    consumerViewState[currentIdx] = { responseHeaders };
    persistCurrentConsumerResponse(responseHeaders);
  };

  toggleConsumerResponseHeader = (index, enabled) => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;
    const responseHeaders = getConsumerResponseRows(currentIdx).map((row, i) =>
      i === index ? { ...row, enabled } : row,
    );
    consumerViewState[currentIdx] = { responseHeaders };
    persistCurrentConsumerResponse(responseHeaders);
  };

  removeConsumerResponseHeader = (index) => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;
    const responseHeaders = getConsumerResponseRows(currentIdx).filter((_, i) => i !== index);
    consumerViewState[currentIdx] = { responseHeaders };
    persistCurrentConsumerResponse(responseHeaders);
  };

  updateConsumerResponsePayload = (value) => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;
    persistCurrentConsumerResponse(getConsumerResponseRows(currentIdx), value);
  };

  importAsyncApiToConsumerAction = async (jsonText: string) => {
    const imported = extractImportedRequests(jsonText);
    if (imported.kind !== "asyncapi") throw new Error("Selected file is not a valid AsyncAPI JSON file.");
    const importedConsumers = imported.requests.map((request) =>
      requestToHttpConsumer({ name: request.name, method: request.method, url: request.url }),
    );
    await persistImportedConsumers(importedConsumers);
  };

  importMqbToConsumerAction = async (jsonText: string) => {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const type = String(parsed?.type || "");
    if (type !== "mqb-export" && type !== "mqb-config") {
      throw new Error("Selected file is not a valid mq-bridge export/config file.");
    }
    const importedConfig = parsed?.config && typeof parsed.config === "object"
      ? (parsed.config as Record<string, unknown>)
      : parsed;
    const importedConsumersRaw = Array.isArray(importedConfig.consumers) ? importedConfig.consumers : [];
    const existingNames = (config.consumers || []).map((consumer) => consumer.name);
    const importedConsumers = importedConsumersRaw
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const consumer = cloneJson(row as ConsumerConfig);
        const fallbackName = String(consumer.name || "imported_consumer");
        consumer.name = nextUniqueName(
          sanitizeConsumerName(fallbackName),
          [...existingNames, ...importedConsumersRaw.map((r: any) => String(r?.name || ""))],
        );
        consumer.endpoint = ensureConsumerEndpointDefaults(consumer.endpoint);
        syncLegacyConsumerResponse(consumer);
        existingNames.push(consumer.name);
        return consumer;
      });
    await persistImportedConsumers(importedConsumers);
  };

  const pollLoop = async () => {
    if (state.consumer_poll_nonce !== pollNonce) return;
    const onConsumersTab = state.active_tab === "consumers" || currentHash().startsWith("#consumers");
    if (!onConsumersTab) {
      schedulePoll(2000);
      return;
    }

    try {
      const activeConsumer = (config.consumers || [])[currentIdx];
      if (!activeConsumer) {
        schedulePoll(1000);
        return;
      }
      const messageCapture = normalizeConsumerMessageCapture(activeConsumer.message_capture);

      syncRuntimeConsumerStatuses();
      const name = activeConsumer.name;
      const runtimeConsumer = getMqbState().runtime_status?.consumers?.[name];
      const knownSequence = consumerMessageSequences[name] || 0;
      const nextSequence = runtimeConsumer?.message_sequence || 0;

      syncConsumersPanelState();

      if (!messageCapture.enabled) {
        consumerMessageSequences[name] = nextSequence;
        schedulePoll(runtimeConsumer?.running ? 1000 : 5000);
        return;
      }

      if (nextSequence <= knownSequence) {
        schedulePoll(runtimeConsumer?.running ? 1000 : 5000);
        return;
      }

      const response = await fetch(`/messages?consumer=${encodeURIComponent(name)}`);
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown[]>;
        let hasNew = false;
        const selectedMessages: ConsumerMessage[] = [];
        const maxMessages = messageCapture.keep_last;

        for (const [sourceName, rawMessages] of Object.entries(data)) {
          const sourceConsumer = (config.consumers || []).find((consumer) => consumer.name === sourceName);
          const sourceKey = getConsumerStorageKey(sourceConsumer || { name: sourceName });
          const messages = Array.isArray(rawMessages)
            ? rawMessages.map((message) => normalizeConsumerMessage(message))
            : [];
          consumerMessages[sourceKey] = [...messages, ...(consumerMessages[sourceKey] || [])].slice(0, maxMessages);
          consumerMessages[sourceKey].sort((a, b) => {
            const cmp = (b.time || "").localeCompare(a.time || "");
            return cmp !== 0 ? cmp : (b.id || "").localeCompare(a.id || "");
          });
          hasNew = hasNew || messages.length > 0;
          if (sourceName !== name && messages.length > 0) {
            selectedMessages.push(...messages);
          }
        }

        const activeKey = getConsumerStorageKey(activeConsumer);
        if ((!data[name] || data[name].length === 0) && selectedMessages.length > 0) {
          consumerMessages[activeKey] = [...selectedMessages, ...(consumerMessages[activeKey] || [])].slice(0, maxMessages);
          consumerMessages[activeKey].sort((a, b) => {
            const cmp = (b.time || "").localeCompare(a.time || "");
            return cmp !== 0 ? cmp : (b.id || "").localeCompare(a.id || "");
          });
          hasNew = true;
        }

        consumerLastPolled[name] = Date.now();
        consumerMessageSequences[name] = nextSequence;
        if (hasNew) saveMessages();

        syncConsumersPanelState();
        schedulePoll(hasNew ? 1000 : 5000);
        return;
      }
    } catch (error) {
      console.error("Polling error:", error);
    }

    schedulePoll(5000);
  };

  const startPolling = () => {
    void pollLoop();
  };

  appWindow().renderConsumersRuntimeStatus = () => {
    syncRuntimeConsumerStatuses();
    syncConsumersPanelState();
    if (state.active_tab === "consumers" || currentHash().startsWith("#consumers")) {
      schedulePoll(0);
    }
  };

  state.consumers_initialized = true;
  setWindowState("consumers_initialized", true);
  appWindow().restoreConsumerState = restoreConsumerState;
  restoreConsumerStateFromView = restoreConsumerState;

  renderSidebar();

  if (consumers.length > 0) {
    const pendingRestore = state.pending_consumer_restore || (appWindow() as any)._mqb_pending_consumer_restore || null;
    state.pending_consumer_restore = null;
    setWindowState("pending_consumer_restore", null);
    const hashMatch = currentHash().match(/^#consumers:(\d+)$/);
    const hashIdx = hashMatch ? parseInt(hashMatch[1], 10) : null;
    const initialIdx = pendingRestore?.idx ?? hashIdx ?? state.last_consumer_idx ?? 0;
    const initialTab = (pendingRestore?.tab || state.last_consumer_tab || "messages") as "definition" | "response" | "messages";

    activeSubtab = initialTab;
    setActiveItem(initialIdx);
    startPolling();
    await updateUI();
    if (!hadUnsavedChangesBeforeInit) settleInitialDirtyBaseline();
    selectConsumerSubtab(initialTab);
  } else {
    if (!hadUnsavedChangesBeforeInit) settleInitialDirtyBaseline();
  }
}
