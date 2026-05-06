import {
  applyEndpointSchemaDefaults,
  createEmptyRouteConfig,
  defaultMetricsMiddleware,
  nextUniqueName,
} from "./routes";
import { cloneJson } from "./utils";
import { openConsumerByIndex, openPublisherByIndex, openRouteByName } from "./view-navigation";
import { publishersPanelState } from "./stores";
import { appWindow, getMqbState, mqbApp, mqbDialogs, mqbRuntime } from "./runtime-window";
import {
  extractImportedRequests,
  exportPresetsForPublisher,
  importFromJsonText,
} from "./import-export";

export let restorePublisherStateFromView: (idx: number, options?: { tab?: string }) => void | Promise<void> = () => {};
export let showPublisherHistoryEntry: (historyIndex: number) => void | Promise<void> = () => {};
export let clearActivePublisherHistory: () => void = () => {};
export let copyPublisherResponse: () => void = () => {};
export let copyPublisherResponseJson: () => void = () => {};
export let copyPublisherAsCurl: () => void = () => {};
export let savePublisherHistoryAsPresetAction: (historyIndex: number) => void | Promise<void> = () => {};
export let resendPublisherHistoryAction: (historyIndex: number) => void | Promise<void> = () => {};
export let savePublisherPresetAction: () => void | Promise<void> = () => {};
export let exportPublisherPresetsAction: () => void = () => {};
export let renamePublisherPresetAction: (presetIndex: number) => void | Promise<void> = () => {};
export let applyPublisherPresetAction: (presetIndex: number) => void = () => {};
export let deletePublisherPresetAction: (presetIndex: number) => void = () => {};
export let importPostmanToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let importOpenApiToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let importAsyncApiToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let importMqbToPublisherAction: (jsonText: string) => void | Promise<void> = () => {};
export let presetToPublisherAction: (presetIndex: number) => void | Promise<void> = () => {};
export let selectPublisherSubtab: (tab: "payload" | "headers" | "history" | "presets" | "definition") => void = () => {};
export let addPublisherAction: () => void | Promise<void> = () => {};
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

type PublisherConfig = {
  name: string;
  endpoint: Record<string, any>;
  comment?: string;
};

type ConsumerConfig = {
  name: string;
  endpoint: Record<string, any>;
  comment?: string;
  response?: unknown;
};

type RouteConfig = ReturnType<typeof createEmptyRouteConfig>;

type PublisherHistoryItem = {
  name: string;
  payload: string;
  metadata?: Array<{ k: string; v: string }>;
  requestMetadata?: Record<string, string>;
  targetLabel?: string;
  url?: string;
  responseData?: unknown;
  ok?: boolean;
  status: number;
  statusText?: string;
  displayStatus?: string;
  displayStatusText?: string;
  duration: number;
  time: number;
  pinned?: boolean;
};

type PublisherPreset = {
  name: string;
  method: string;
  url: string;
  payload: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
};

type PublishersAppConfig = {
  publishers: PublisherConfig[];
  consumers?: ConsumerConfig[];
  routes: Record<string, RouteConfig>;
};

type PublishersSchemaRoot = {
  properties?: {
    publishers?: {
      items?: Record<string, any>;
    };
  };
  $defs?: Record<string, any>;
};

type PublisherState = {
  payload: string;
  headers?: Array<{
    id: number;
    key: string;
    value: string;
    enabled: boolean;
  }>;
};

type PublisherResponseState = {
  responseVisible?: boolean;
  responseTabLabel?: string;
  responseStatusLabel?: string;
  responseStatusText?: string;
  responseStatusColor?: string;
  responseDurationLabel?: string;
  responseSizeLabel?: string;
  requestRows?: Array<[string, string]>;
  requestHeaders?: Array<[string, string]>;
  responseHeaders?: Array<[string, string]>;
  responsePayload?: string;
};

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

type PublisherSubtab = "payload" | "headers" | "history" | "presets" | "definition";

const STORAGE_KEY = "mqb_publisher_state";
const HISTORY_KEY = "mqb_publisher_history";
const PRESETS_KEY = "mqb_publisher_presets";
const ENV_VARS_KEY = "mqb_env_vars";
const PUBLISHER_TYPE_OPTIONS = [
  "http",
  "grpc",
  "nats",
  "memory",
  "amqp",
  "kafka",
  "mqtt",
  "mongodb",
  "zeromq",
  "file",
  "sled",
  "ibmmq",
];

const HTTP_METHOD_OPTIONS = ["POST", "GET", "PUT", "DELETE"];
const PUBLISHER_SUBTABS = new Set<PublisherSubtab>(["payload", "headers", "history", "presets", "definition"]);
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
  "file",
  "static",
  "memory",
  "mongodb",
  "sled",
  "htmx",
  "ref",
  "zeromq",
  "switch",
  "response",
  "custom",
  "null",
];

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

function createRefInputEndpoint(refName: string) {
  return {
    middlewares: defaultMetricsMiddleware(),
    ref: refName,
  };
}

function getEndpointType(publisher: Partial<PublisherConfig> | null | undefined): string {
  const endpoint = publisher?.endpoint || {};
  return ENDPOINT_TYPE_KEYS.find((key) => key in endpoint) || "null";
}

function normalizePublisherSubtab(tab: string | undefined, fallback: PublisherSubtab = "payload"): PublisherSubtab {
  return PUBLISHER_SUBTABS.has(tab as PublisherSubtab) ? (tab as PublisherSubtab) : fallback;
}

function createDefaultPublisherEndpoint(endpointType: string) {
  const defaults: Record<string, Record<string, any>> = {
    http: defaultHttpConfig(),
    grpc: { url: "http://localhost:50051" },
    nats: { url: "nats://localhost:4222", subject: "events.created" },
    memory: { topic: "events" },
    amqp: { url: "amqp://guest:guest@localhost:5672/%2f", queue: "jobs" },
    kafka: { url: "localhost:9092", topic: "events" },
    mqtt: { url: "tcp://localhost:1883", topic: "events/updates" },
    mongodb: { url: "mongodb://localhost:27017", database: "app", collection: "messages" },
    zeromq: { url: "tcp://127.0.0.1:5555", topic: "events" },
    file: { path: "/tmp/messages.jsonl" },
    sled: { path: "./data/sled", tree: "default" },
    ibmmq: { url: "localhost(1414)", queue: "DEV.QUEUE.1", topic: "topic://events" },
  };
  return { [endpointType]: cloneJson(defaults[endpointType] || {}) };
}

function parseJsonSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function initPublishers(config: PublishersAppConfig, schema: PublishersSchemaRoot) {
  const container = document.getElementById("publishers-container") as HTMLElement | null;
  const publishers = config.publishers || [];
  let appState = parseJsonSafe<Record<string, PublisherState>>(localStorage.getItem(STORAGE_KEY), {});
  let history = parseJsonSafe<PublisherHistoryItem[]>(localStorage.getItem(HISTORY_KEY), []);
  let presets = parseJsonSafe<Record<string, PublisherPreset[]>>(localStorage.getItem(PRESETS_KEY), {});
  let envVars = parseJsonSafe<Record<string, string>>(localStorage.getItem(ENV_VARS_KEY), {});

  const emptyAlert = document.getElementById("pub-empty-alert") as HTMLElement | null;
  const mainUi = document.getElementById("pub-main-ui") as HTMLElement | null;
  if (!container || !emptyAlert || !mainUi) {
    return;
  }

  container.style.display = "contents";
  let currentIdx = 0;
  let activeSubtab: PublisherSubtab = "payload";
  let pubSplit: unknown;
  let currentResponsePayload = "";
  let currentMethodValue = "POST";
  let nextPublisherHeaderId = 1;
  const state = getMqbState();

  mqbRuntime.registerDirtySection("publishers", {
    buttonId: "pub-save",
    getValue: () => config.publishers,
  });
  const hadUnsavedChangesBeforeInit = mqbRuntime.refreshDirtySection("publishers");

  const updateUrlHash = () => {
    appWindow().history.replaceState(null, "", `#publishers:${currentIdx || 0}`);
  };

  const saveAppState = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  const saveHistory = () => {
    history = history.slice(0, 1000);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  };
  const savePresets = () => {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  };
  const saveEnvVars = () => {
    localStorage.setItem(ENV_VARS_KEY, JSON.stringify(envVars));
  };
  const applyEnvVars = (value: string) =>
    String(value || "").replace(/\$\{([A-Za-z0-9_.-]+)\}/g, (_match, key) =>
      Object.prototype.hasOwnProperty.call(envVars, key) ? String(envVars[key] ?? "") : `\${${key}}`,
    );

  const openPublisherAt = (idx: number, tab = "definition") => {
    openPublisherByIndex(
      idx,
      tab as "payload" | "headers" | "history" | "presets" | "definition",
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

  const openRouteAt = (routeName: string) => {
    openRouteByName(
      config.routes,
      routeName,
      (routeIdx) => mqbApp.restore.route(routeIdx),
      () => mqbApp.init.routes(config, mqbApp.schema()),
    );
  };

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

  const setMethodSelectMode = (endpointType: string) => {
    if (endpointType === "http") {
      currentMethodValue = HTTP_METHOD_OPTIONS.includes(currentMethodValue) ? currentMethodValue : "POST";
      return;
    }
    currentMethodValue = HTTP_METHOD_OPTIONS.includes(currentMethodValue) ? currentMethodValue : "POST";
  };

  const getPublisherState = (name: string) => {
    if (!appState[name]) {
      appState[name] = { payload: '{\n  "hello": "world"\n}' };
    }
    return appState[name];
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
    const state = getPublisherState(publisher.name);
    if (!Array.isArray(state.headers)) {
      const httpConfig = getEndpointType(publisher) === "http" ? ensureHttpConfig(publisher) : null;
      state.headers = sortEntries(httpConfig?.custom_headers).map(([key, value]) => ({
        id: nextPublisherHeaderId++,
        key: String(key),
        value: String(value),
        enabled: true,
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

  const getPublisherPresets = (publisherName: string) => {
    if (!Array.isArray(presets[publisherName])) {
      presets[publisherName] = [];
    }
    return presets[publisherName];
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

  const requestToPreset = (request: {
    name: string;
    method: string;
    url: string;
    payload: string;
    headers: Array<{ key: string; value: string; enabled: boolean }>;
  }) => ({
    name: request.name,
    method: request.method || "POST",
    url: request.url || "",
    payload: request.payload || "",
    headers: (request.headers || []).map((row) => ({
      key: String(row.key || ""),
      value: String(row.value || ""),
      enabled: row.enabled !== false,
    })),
  });

  const requestToPublisher = (request: {
    name: string;
    method: string;
    url: string;
    payload: string;
    headers: Array<{ key: string; value: string; enabled: boolean }>;
  }) => {
    const currentNames = (config.publishers || []).map((publisher) => publisher.name);
    const baseName = String(request.name || "http").trim().replace(/\s+/g, "_").toLowerCase() || "http";
    const name = nextUniqueName(baseName, currentNames);
    const split = splitHttpUrl(request.url || "");
    const customHeaders = Object.fromEntries(
      (request.headers || [])
        .filter((row) => row.enabled !== false && String(row.key || "").trim())
        .map((row) => [String(row.key).trim(), String(row.value || "")]),
    );
    const endpoint = createDefaultPublisherEndpoint("http") as Record<string, any>;
    endpoint.http = endpoint.http || {};
    endpoint.http.url = split.base || (request.url || "");
    endpoint.http.method = request.method || "POST";
    endpoint.http.custom_headers = customHeaders;
    if (split.path) {
      endpoint.http.path = split.path;
    }
    const publisher: PublisherConfig = {
      name,
      endpoint,
      comment: "",
    };
    const headerRows = (request.headers || []).map((row) => ({
      id: nextPublisherHeaderId++,
      key: String(row.key || ""),
      value: String(row.value || ""),
      enabled: row.enabled !== false,
    }));
    appState[name] = {
      payload: request.payload || "",
      headers: headerRows,
    };
    return publisher;
  };

  const importRequestsIntoPublishers = async (
    jsonText: string,
    expectedKind: "postman" | "openapi" | "asyncapi",
  ) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const imported = extractImportedRequests(jsonText);
    if (imported.kind !== expectedKind) {
      throw new Error(`Selected file is not a valid ${expectedKind.toUpperCase()} JSON file.`);
    }

    const activePublisherName = publisher.name;
    const activeUrl = getCurrentPublisherUrl(publisher);
    const activePublisherPresets = getPublisherPresets(activePublisherName);
    let importedAsPresets = 0;
    let importedAsPublishers = 0;

    if (expectedKind === "postman") {
      const grouped = new Map<string, typeof imported.requests>();
      for (const request of imported.requests) {
        const reqUrl = (request.url || "").trim();
        if (reqUrl && reqUrl === activeUrl) {
          const preset = requestToPreset(request);
          const existingIndex = activePublisherPresets.findIndex((row) => row.name === preset.name);
          if (existingIndex >= 0) {
            activePublisherPresets[existingIndex] = preset;
          } else {
            activePublisherPresets.push(preset);
          }
          importedAsPresets += 1;
          continue;
        }
        const groupKey = String(request.group || request.name || "Imported Postman Group");
        if (!grouped.has(groupKey)) grouped.set(groupKey, []);
        grouped.get(groupKey)!.push(request);
      }

      for (const [groupName, requests] of grouped.entries()) {
        const first = requests[0];
        if (!first) continue;
        const publisher = requestToPublisher({
          ...first,
          name: groupName,
        });
        config.publishers.push(publisher);
        const publisherPresets = getPublisherPresets(publisher.name);
        for (const request of requests) {
          const preset = requestToPreset(request);
          const existingIndex = publisherPresets.findIndex((row) => row.name === preset.name);
          if (existingIndex >= 0) {
            publisherPresets[existingIndex] = preset;
          } else {
            publisherPresets.push(preset);
          }
        }
        importedAsPublishers += 1;
      }
    } else {
      for (const request of imported.requests) {
        if ((request.url || "").trim() && (request.url || "").trim() === activeUrl) {
          const preset = requestToPreset(request);
          const existingIndex = activePublisherPresets.findIndex((row) => row.name === preset.name);
          if (existingIndex >= 0) {
            activePublisherPresets[existingIndex] = preset;
          } else {
            activePublisherPresets.push(preset);
          }
          importedAsPresets += 1;
        } else {
          config.publishers.push(requestToPublisher(request));
          importedAsPublishers += 1;
        }
      }
    }

    envVars = { ...envVars, ...(imported.envVars || {}) };
    saveEnvVars();
    savePresets();
    saveAppState();

    if (importedAsPublishers > 0) {
      const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, true);
      if (saved) {
        const refreshedConfig = await mqbRuntime.fetchConfigFromServer<PublishersAppConfig>();
        mqbApp.config<PublishersAppConfig>().publishers = refreshedConfig.publishers;
      }
    }

    initPublishers(mqbApp.config<PublishersAppConfig>(), schema);
    const activeIdx = (mqbApp.config<PublishersAppConfig>().publishers || []).findIndex((item) => item.name === activePublisherName);
    if (activeIdx >= 0) {
      restorePublisherStateFromView(activeIdx, { tab: "presets" });
    }

    return { importedAsPresets, importedAsPublishers };
  };

  const syncPublishersPanelState = (responseState?: PublisherResponseState) => {
    const activePublisher = publishers[currentIdx];
    const activeName = activePublisher?.name;
    const filteredHistory = history.filter((item) => item.name === activeName);
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
    const presetRows = activeName
      ? getPublisherPresets(activeName).map((preset, presetIndex) => ({
          presetIndex,
          name: preset.name,
          method: preset.method || "POST",
          url: preset.url || "",
          bodyPreview: (preset.payload || "").replace(/\s+/g, " ").trim().substring(0, 80),
        }))
      : [];
    const requestPayload = activeName ? getPublisherState(activeName).payload : "";

    publishersPanelState.update((current: any) => ({
      hasPublishers: publishers.length > 0,
      items: publishers.map((publisher, index) => ({
        name: publisher.name,
        endpointType: getEndpointType(publisher).toUpperCase(),
        originalIndex: index,
      })),
      selectedIndex: currentIdx,
      activeSubtab,
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
      presetRows,
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
    getMqbState().last_publisher_idx = currentIdx;
    (appWindow() as any)._mqb_last_publisher_idx = currentIdx;
    if (options.tab) {
      activeSubtab = options.tab;
    } else if (!(options.preserveTab && isSamePublisher)) {
      activeSubtab = "payload";
    }
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

    if (requestMetadata.http_method) {
      currentMethodValue = requestMetadata.http_method;
    }

    const layout = getRequestBarLayout(endpointType);
    layout.fields.forEach((descriptor) => {
      const value = requestMetadata[`${REQUEST_BAR_METADATA_PREFIX}${descriptor.field}`]
        ?? requestMetadata[`request_bar.${descriptor.inputId}`];
      if (typeof value === "string") {
        setRequestBarFieldValue(publisher, descriptor, value);
      }
    });

    if (endpointType !== "http") return;

    const httpConfig = ensureHttpConfig(publisher);
    httpConfig.custom_headers = Object.fromEntries((item.metadata || []).map(({ k, v }) => [k, v]));

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
    const targetTab = normalizePublisherSubtab(options.tab, "payload");
    if (currentIdx !== idx) setActiveItem(idx, { tab: targetTab });
    void updateUIFromState();
    activeSubtab = targetTab;
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
    const state = getPublisherState(publisher.name);
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
    const endpointType = getEndpointType(publisher);
    setMethodSelectMode(endpointType);
    syncPublishersPanelState();
  };

  const updateUIFromState = async () => {
    if (publishers.length === 0) return;
    const idx = currentIdx;

    clearPublisherResponse();

    const publisher = publishers[idx];
    setMethodSelectMode(getEndpointType(publisher));
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

    state.form_mode = "publisher";
    (window as any)._mqb_form_mode = "publisher";
    
    await mqbApp.forms().init(configFormContainer, itemSchema, publishers[idx], (updated) => {
      const previousPublisher = publishers[idx];
      const nextPublisher = updated as PublisherConfig;
      copyRequestBarFieldValues(previousPublisher, nextPublisher);
      publishers[idx] = nextPublisher;
      setMethodSelectMode(getEndpointType(publishers[idx]));
      syncPublishersPanelState();
      mqbRuntime.refreshDirtySection("publishers");
    });
  };

  const copyCurrentPublisher = async () => {
    const current = config.publishers[currentIdx];
    if (!current) return;
    const currentEndpoint = cloneJson(current.endpoint || { null: null });
    const choice = await mqbDialogs.choose("Choose where to copy this publisher definition.", "Copy Publisher", {
      confirmLabel: "Continue",
      choices: [
        { value: "route_output", label: "New Route Output", description: "Creates a route with this publisher as output." },
        { value: "consumer", label: "New Consumer", description: "Copies the endpoint into a consumer. Review after copying." },
        { value: "ref", label: "New Ref Route", description: "Creates a route with a ref input and this publisher as output." },
      ],
    });
    if (!choice) return;

    if (choice === "route_output") {
      config.routes ||= {};
      const routeName = await mqbDialogs.prompt(
        "Choose a name for the new route. The input stays null until you review it.",
        "Copy to Route",
        {
          confirmLabel: "Create",
          value: nextUniqueName(`${current.name}_route`, Object.keys(config.routes || {})),
          placeholder: "publisher_route",
        },
      );
      if (!routeName) return;
      if (config.routes[routeName]) {
        await mqbDialogs.alert("Route already exists");
        return;
      }
      const routeConfig = createEmptyRouteConfig();
      routeConfig.output = currentEndpoint;
      config.routes[routeName] = routeConfig;
      mqbRuntime.refreshDirtySection("routes");
      openRouteAt(routeName);
      return;
    }

    if (choice === "consumer") {
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
      if (!consumerName) return;
      if ((config.consumers || []).some((consumer) => consumer.name === consumerName)) {
        await mqbDialogs.alert("Consumer already exists");
        return;
      }
      config.consumers.push({
        name: consumerName,
        endpoint: createConsumerEndpointFromPublisherEndpoint(currentEndpoint),
        comment: current.comment || "",
        response: null,
      });
      mqbRuntime.refreshDirtySection("consumers");
      openConsumerAt(config.consumers.length - 1, "definition");
      return;
    }

    const refTarget = await mqbDialogs.prompt(
      "Choose the ref input name. Other endpoints can reference this publisher through that name after the route is saved and running.",
      "Copy to Ref Route",
      {
        confirmLabel: "Next",
        value: current.name,
        placeholder: "publisher_ref",
      },
    );
    if (!refTarget) return;
    config.routes ||= {};
    const routeName = await mqbDialogs.prompt(
      "Choose a name for the new route that exposes this publisher via ref.",
      "Copy to Ref Route",
      {
        confirmLabel: "Create",
        value: nextUniqueName(`${current.name}_ref_route`, Object.keys(config.routes || {})),
        placeholder: "publisher_ref_route",
      },
    );
    if (!routeName) return;
    if (config.routes[routeName]) {
      await mqbDialogs.alert("Route already exists");
      return;
    }
    const routeConfig = createEmptyRouteConfig();
    routeConfig.input = createRefInputEndpoint(refTarget);
    routeConfig.output = currentEndpoint;
    config.routes[routeName] = routeConfig;
    mqbRuntime.refreshDirtySection("routes");
    openRouteAt(routeName);
  };

  const addPublisher = async () => {
    const endpointType = await mqbDialogs.choose("Choose the endpoint type for the new publisher.", "Add Publisher", {
      confirmLabel: "Create",
      choices: PUBLISHER_TYPE_OPTIONS.map((type) => ({ value: type, label: type.toUpperCase() })),
    });
    if (!endpointType) return;
    config.publishers.push({
      name: nextUniqueName(endpointType, (config.publishers || []).map((publisher) => publisher.name)),
      endpoint: createDefaultPublisherEndpoint(endpointType),
      comment: "",
    });
    initPublishers(config, schema);
    setActiveItem(config.publishers.length - 1);
    void updateUIFromState();
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
    initPublishers(config, schema);
    setActiveItem(config.publishers.length - 1);
    void updateUIFromState();
  };

  deleteCurrentPublisherAction = async (button = document.getElementById("pub-save")) => {
    if (!(await mqbDialogs.confirm("Delete this publisher?", "Delete Publisher"))) return;
    delete appState[config.publishers[currentIdx].name];
    config.publishers.splice(currentIdx, 1);
    const nextIdx = Math.max(0, currentIdx - 1);
    const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, false, button);
    if (!saved) return;

    const refreshedConfig = await mqbRuntime.fetchConfigFromServer<PublishersAppConfig>();
    mqbApp.config<PublishersAppConfig>().publishers = refreshedConfig.publishers;
    state.pending_publisher_restore = { idx: nextIdx, tab: "definition" };
    initPublishers(mqbApp.config<PublishersAppConfig>(), mqbApp.schema<PublishersSchemaRoot>());
    if ((mqbApp.config<PublishersAppConfig>().publishers || []).length > 0) {
      restorePublisherStateFromView(nextIdx, { tab: "definition" });
    }
  };

  saveCurrentPublisherAction = async (button = null) => {
    const activeElement = document.activeElement as HTMLElement | null;
    activeElement?.blur();
    await Promise.resolve();

    const selectedIdx = currentIdx;
    const selectedName = config.publishers[selectedIdx]?.name || null;
    const selectedTab = activeSubtab;
    const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, false, button);
    if (!saved) return;

    const savedPublishers = Array.isArray((saved as PublishersAppConfig).publishers)
      ? (saved as PublishersAppConfig).publishers
      : config.publishers;
    config.publishers = savedPublishers;
    mqbApp.config<PublishersAppConfig>().publishers = savedPublishers;
    mqbRuntime.markSectionSaved("publishers", savedPublishers);
    const refreshedIdx = (savedPublishers || []).findIndex((publisher: PublisherConfig) => publisher.name === selectedName);
    const pendingRestore = {
      idx: refreshedIdx === -1 ? Math.min(selectedIdx, Math.max(savedPublishers.length - 1, 0)) : refreshedIdx,
      tab: selectedTab,
    };
    getMqbState().pending_publisher_restore = pendingRestore;
    (appWindow() as any)._mqb_pending_publisher_restore = pendingRestore;
    initPublishers(mqbApp.config<PublishersAppConfig>(), mqbApp.schema<PublishersSchemaRoot>());
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
    getPublisherState(publisher.name).payload = value;
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
    const state = getPublisherState(publisher.name);
    try {
      updatePublisherPayload(JSON.stringify(JSON.parse(state.payload), null, 2));
    } catch {
      void mqbDialogs.alert("Invalid JSON");
    }
  };
  selectPublisherSubtab = (tab) => {
    activeSubtab = tab;
    syncPublishersPanelState();
  };

  sendPublisherAction = async () => {
    updateStateFromUI();
    if (mqbRuntime.refreshDirtySection("publishers")) {
      const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, true);
      if (!saved) return;
    }

    const publisher = publishers[currentIdx];
    const name = publisher.name;
    const endpoint = publisher.endpoint;
    const payload = applyEnvVars(getPublisherState(name).payload);
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
        name,
        payload,
        metadata: [...metaArray],
        requestMetadata: { ...metadata, ...requestHistoryMetadata },
        targetLabel: requestBinding?.label,
        url: resolvedRequestUrl,
        responseData,
        ok: statusInfo.ok,
        status: response.status,
        statusText: response.statusText,
        displayStatus: statusInfo.label,
        displayStatusText: statusInfo.text,
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
    const name = publishers[currentIdx]?.name;
    if (!name) return;
    history = history.filter((item) => item.name !== name);
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

    const payload = applyEnvVars(getPublisherState(publisher.name).payload || "");
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

  savePublisherHistoryAsPresetAction = async (historyIndex: number) => {
    const item = history[historyIndex];
    if (!item) return;
    const publisher = publishers.find((candidate) => candidate.name === item.name);
    if (!publisher) return;

    const publisherPresets = getPublisherPresets(publisher.name);
    const suggestedName = nextUniqueName(
      `${publisher.name}_history`,
      publisherPresets.map((preset) => preset.name),
    );

    const presetName = await mqbDialogs.prompt("Choose a name for this request preset.", "Save Preset", {
      confirmLabel: "Save",
      value: suggestedName,
      placeholder: "preset_name",
    });
    if (!presetName) return;

    const method = item.requestMetadata?.http_method || currentMethodValue || "POST";
    const url = typeof item.url === "string" ? item.url : "";
    const payload = item.payload || "";
    const headers = (item.metadata || []).map(({ k, v }) => ({ key: String(k || ""), value: String(v || ""), enabled: true }));

    const existingIndex = publisherPresets.findIndex((preset) => preset.name === presetName);
    const preset = { name: presetName, method, url, payload, headers };
    if (existingIndex >= 0) {
      publisherPresets[existingIndex] = preset;
    } else {
      publisherPresets.push(preset);
    }
    savePresets();
    syncPublishersPanelState();
  };

  resendPublisherHistoryAction = async (historyIndex: number) => {
    await showPublisherHistoryEntry(historyIndex);
    await sendPublisherAction();
  };

  savePublisherPresetAction = async () => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;

    const presetName = await mqbDialogs.prompt("Choose a name for this request preset.", "Save Preset", {
      confirmLabel: "Save",
      value: nextUniqueName(`${publisher.name}_preset`, getPublisherPresets(publisher.name).map((preset) => preset.name)),
      placeholder: "preset_name",
    });
    if (!presetName) return;

    const endpointType = getEndpointType(publisher);
    const layout = getRequestBarLayout(endpointType);
    const url = getRequestBarFieldValue(publisher, layout.fields.find((field) => field.inputId === "pub-url")).trim();
    const method = currentMethodValue || "POST";
    const payload = getPublisherState(publisher.name).payload || "";
    const headers = endpointType === "http"
      ? getPublisherHeaderRows(publisher).map((row) => ({ key: row.key, value: row.value, enabled: row.enabled }))
      : [];

    const publisherPresets = getPublisherPresets(publisher.name);
    const existingIndex = publisherPresets.findIndex((preset) => preset.name === presetName);
    const preset = { name: presetName, method, url, payload, headers };
    if (existingIndex >= 0) {
      publisherPresets[existingIndex] = preset;
    } else {
      publisherPresets.push(preset);
    }
    savePresets();
    syncPublishersPanelState();
  };

  exportPublisherPresetsAction = () => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    exportPresetsForPublisher(publisher.name);
  };

  renamePublisherPresetAction = async (presetIndex: number) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const publisherPresets = getPublisherPresets(publisher.name);
    const preset = publisherPresets[presetIndex];
    if (!preset) return;

    const nextName = await mqbDialogs.prompt("Rename preset", "Rename Preset", {
      confirmLabel: "Rename",
      value: preset.name,
      placeholder: "preset_name",
    });
    if (!nextName) return;
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === preset.name) return;

    const existingIndex = publisherPresets.findIndex((row, idx) => idx !== presetIndex && row.name === trimmed);
    if (existingIndex >= 0) {
      const confirmed = await mqbDialogs.confirm(
        `A preset named "${trimmed}" already exists. Overwrite it?`,
        "Overwrite Preset",
      );
      if (!confirmed) return;
      publisherPresets.splice(existingIndex, 1);
    }

    preset.name = trimmed;
    savePresets();
    syncPublishersPanelState();
  };

  applyPublisherPresetAction = (presetIndex: number) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const publisherPresets = getPublisherPresets(publisher.name);
    const preset = publisherPresets[presetIndex];
    if (!preset) return;

    const endpointType = getEndpointType(publisher);
    const layout = getRequestBarLayout(endpointType);
    currentMethodValue = preset.method || "POST";
    setRequestBarFieldValue(publisher, layout.fields.find((field) => field.inputId === "pub-url"), preset.url || "");
    getPublisherState(publisher.name).payload = preset.payload || "";

    if (endpointType === "http") {
      const rows = (preset.headers || []).map((header, index) => ({
        id: nextPublisherHeaderId + index,
        key: String(header.key || ""),
        value: String(header.value || ""),
        enabled: header.enabled !== false,
      }));
      nextPublisherHeaderId += rows.length;
      updatePublisherConfigFromMetadataRows(rows);
    } else {
      persistConfigState();
    }

    activeSubtab = "payload";
    syncPublishersPanelState();
  };

  deletePublisherPresetAction = (presetIndex: number) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const publisherPresets = getPublisherPresets(publisher.name);
    publisherPresets.splice(presetIndex, 1);
    savePresets();
    syncPublishersPanelState();
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
      const publisher = publishers[currentIdx];
      const targetPublisherName = publisher?.name || "";
      const result = await importFromJsonText(jsonText, {
        includeConfig: false,
        includePresets: true,
        targetPublisherName,
      });
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

    config.publishers = saved.publishers;
    mqbApp.config<PublishersAppConfig>().publishers = saved.publishers;
    initPublishers(mqbApp.config<PublishersAppConfig>(), schema);
    const firstImportedName = importedPublishers[0]?.name;
    const idx = (config.publishers || []).findIndex((publisher) => publisher.name === firstImportedName);
    if (idx >= 0) {
      restorePublisherStateFromView(idx, { tab: "definition" });
    }
    return { importedKind: type, importedPublishers: importedPublishers.length };
  };

  presetToPublisherAction = async (presetIndex: number) => {
    const publisher = publishers[currentIdx];
    if (!publisher) return;
    const publisherPresets = getPublisherPresets(publisher.name);
    const preset = publisherPresets[presetIndex];
    if (!preset) return;

    config.publishers.push(requestToPublisher({
      name: preset.name,
      method: preset.method,
      url: preset.url,
      payload: preset.payload,
      headers: preset.headers || [],
    }));
    saveAppState();
    const saved = await mqbRuntime.saveConfigSection("publishers", config.publishers, true);
    if (!saved) return;

    const refreshedConfig = await mqbRuntime.fetchConfigFromServer<PublishersAppConfig>();
    mqbApp.config<PublishersAppConfig>().publishers = refreshedConfig.publishers;
    initPublishers(mqbApp.config<PublishersAppConfig>(), schema);
    restorePublisherStateFromView(mqbApp.config<PublishersAppConfig>().publishers.length - 1, { tab: "definition" });
  };

  showPublisherHistoryEntry = async (historyIndex: number) => {
    const item = history[historyIndex];
    if (!item) return;
    const publisherIdx = publishers.findIndex((candidate) => candidate.name === item.name);
    if (publisherIdx === -1) return;

    const state = getPublisherState(item.name);
    state.payload = item.payload;
    applyHistoryRequestToPublisher(publishers[publisherIdx], item);
    saveAppState();
    setActiveItem(publisherIdx);
    await updateUIFromState();
    formatResponseDetails(
      {
        ok: typeof item.ok === "boolean" ? item.ok : item.status < 300,
        label: item.displayStatus || String(item.status),
        text: item.displayStatusText || item.statusText,
      },
      item.duration,
      item.responseData,
      {
        headers: item.metadata || [],
        method: item.requestMetadata?.http_method,
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
      saveEnvVars();
      await mqbDialogs.alert("Environment variables saved. You can now use ${varName} in URL, headers and body.");
    } catch (error) {
      await mqbDialogs.alert(`Invalid JSON: ${(error as Error).message}`);
    }
  };

  if (publishers.length > 0) {
    const pendingRestore = state.pending_publisher_restore || null;
    state.pending_publisher_restore = null;
    (appWindow() as any)._mqb_pending_publisher_restore = null;
    const initialIdx = pendingRestore?.idx ?? 0;
    const initialTab = normalizePublisherSubtab(pendingRestore?.tab, "payload");
    setActiveItem(initialIdx, { tab: initialTab });
    void updateUIFromState().then(() => {
      if (!hadUnsavedChangesBeforeInit) {
        mqbRuntime.markSectionSaved("publishers", config.publishers);
      }
    });
    activeSubtab = initialTab;
    syncPublishersPanelState();
  } else if (!hadUnsavedChangesBeforeInit) {
    mqbRuntime.markSectionSaved("publishers", config.publishers);
  }

  state.publishers_initialized = true;
  (appWindow() as any)._mqb_publishers_initialized = true;
  appWindow().restorePublisherState = restorePublisherState;
  restorePublisherStateFromView = restorePublisherState;
}
