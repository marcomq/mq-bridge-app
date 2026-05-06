import {
  applyEndpointSchemaDefaults,
  createEmptyRouteConfig,
  defaultMetricsMiddleware,
  nextUniqueName
} from "./routes";
import {
  cloneJson,
  normalizeConsumerNames,
  normalizeConsumerResponse,
  sanitizeConsumerName,
} from "./utils";
import { extractImportedRequests } from "./import-export";
import { openConsumerByIndex, openPublisherByIndex, openRouteByName } from "./view-navigation";
import { consumersPanelState } from "./stores";
import { appWindow, currentHash, getMqbState, mqbApp, mqbDialogs, mqbRuntime } from "./runtime-window";

export let restoreConsumerStateFromView: (idx: number, options?: { tab?: string }) => void | Promise<void> = () => {};
export let showConsumerMessageDetails: (name: string, msgIdx: number) => void = () => {};
export let toggleActiveConsumer: () => void = () => {};
export let clearActiveConsumerHistory: () => void = () => {};
export let addConsumerAction: () => void = () => {};
export let copyCurrentConsumerAction: () => void | Promise<void> = () => {};
export let cloneCurrentConsumerAction: () => void = () => {};
export let saveCurrentConsumerAction: () => void | Promise<void> = () => {};
export let deleteCurrentConsumerAction: () => void | Promise<void> = () => {};
export let selectConsumerSubtab: (tab: "definition" | "response" | "messages") => void = () => {};
export let addConsumerResponseHeader: () => void = () => {};
export let updateConsumerResponseHeader: (index: number, field: "key" | "value", value: string) => void = () => {};
export let toggleConsumerResponseHeader: (index: number, enabled: boolean) => void = () => {};
export let removeConsumerResponseHeader: (index: number) => void = () => {};
export let updateConsumerResponsePayload: (value: string) => void = () => {};
export let importAsyncApiToConsumerAction: (jsonText: string) => void | Promise<void> = () => {};
export let importMqbToConsumerAction: (jsonText: string) => void | Promise<void> = () => {};

type ConsumerMessage = {
  id?: string;
  payload: unknown;
  metadata?: Record<string, string>;
  time?: string;
};

const MAX_FILTERED_CONSUMER_MESSAGES = 1000;
const MAX_UNFILTERED_CONSUMER_MESSAGES = 100;

type ConsumerStatus = {
  running: boolean;
  unsaved?: boolean;
  status: {
    healthy: boolean;
    error?: string;
  };
};

type ConsumerConfig = {
  name: string;
  endpoint: Record<string, unknown>;
  comment?: string;
  response?: unknown;
};

type ConsumerResponseHeaderRow = {
  id: number;
  key: string;
  value: string;
  enabled: boolean;
};

type PublisherConfig = {
  name: string;
  endpoint: Record<string, unknown>;
  comment?: string;
};

type RouteConfig = ReturnType<typeof createEmptyRouteConfig>;

type ConsumersAppConfig = {
  consumers: ConsumerConfig[];
  publishers?: PublisherConfig[];
  routes: Record<string, RouteConfig>;
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
const CONSUMER_TYPE_OPTIONS = [
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
];

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
      Object.prototype.hasOwnProperty.call(record, "time");

    if (looksWrapped) {
      const metadata =
        record.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
          ? Object.fromEntries(
              Object.entries(record.metadata as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
            )
          : undefined;

      return {
        id: typeof record.id === "string" || typeof record.id === "number" || typeof record.id === "bigint" ? String(record.id) : undefined,
        payload: Object.prototype.hasOwnProperty.call(record, "payload") ? record.payload : raw,
        metadata,
        time: typeof record.time === "string" ? record.time : fallbackTime,
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
  return Object.keys(input).filter((key) => key !== "middlewares")[0] || "N/A";
}

function createDefaultConsumerEndpoint(endpointType: string): Record<string, unknown> {
  return {
    middlewares: defaultMetricsMiddleware(),
    [endpointType]: {},
  };
}

function ensureConsumerEndpointDefaults(endpoint: unknown): Record<string, unknown> {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return createDefaultConsumerEndpoint("http");
  }
  const endpointRecord = endpoint as Record<string, unknown>;
  const endpointType = Object.keys(endpointRecord).find((key) => key !== "middlewares") || "http";
  const normalized = {
    ...createDefaultConsumerEndpoint(endpointType),
    ...endpointRecord,
  };
  if (!("middlewares" in normalized)) {
    normalized.middlewares = defaultMetricsMiddleware();
  }
  return normalized;
}

function splitConsumerListenAddress(rawUrl: string): { url: string; path?: string } {
  const value = String(rawUrl || "").trim();
  if (!value) return { url: "0.0.0.0:8080" };
  const fromTemplate = value.match(/^\$\{[^}]+\}(\/.*)?$/);
  if (fromTemplate) {
    const templatePath = (fromTemplate[1] || "").trim();
    return {
      url: "0.0.0.0:8080",
      path: templatePath || undefined,
    };
  }
  try {
    const parsed = new URL(value);
    const protocolDefaultPort = parsed.protocol === "https:" ? "443" : "80";
    const port = parsed.port || protocolDefaultPort;
    const path = `${parsed.pathname || "/"}${parsed.search || ""}`;
    return {
      url: `0.0.0.0:${port}`,
      path: path && path !== "/" ? path : undefined,
    };
  } catch {
    return { url: value };
  }
}

function consumerSupportsCustomResponse(consumer: Partial<ConsumerConfig> | null | undefined): boolean {
  return RESPONSE_CAPABLE_CONSUMER_TYPES.has(getConsumerInputType(consumer).toLowerCase());
}

export async function initConsumers(config: ConsumersAppConfig, schema: ConsumersSchemaRoot) {
  const consumers = config.consumers || [];
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
  (appWindow() as any)._mqb_consumer_poll_timer = null;
  (appWindow() as any)._mqb_consumer_poll_nonce = state.consumer_poll_nonce;
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

  mqbRuntime.registerDirtySection("consumers", {
    buttonId: "cons-save",
    getValue: () => config.consumers,
  });
  const hadUnsavedChangesBeforeInit = mqbRuntime.refreshDirtySection("consumers");

  const updateUrlHash = () => {
    appWindow().history.replaceState(null, "", `#consumers:${currentIdx || 0}`);
  };

  let consumerMessages: Record<string, ConsumerMessage[]> = {};
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
  const saveMessages = () => localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(consumerMessages));

  const consumerStatus: Record<string, ConsumerStatus> = {};
  const consumerThroughput: Record<string, number> = {};
  const consumerRateSamples: Record<string, { timestampMs: number; total: number }> = {};
  const consumerMessageSequences: Record<string, number> = {};
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
    const currentConsumerName = consumers[currentIdx]?.name || null;
    const messages = currentConsumerName ? consumerMessages[currentConsumerName] || [] : [];
    const status = currentConsumerName
      ? consumerStatus[currentConsumerName] || { running: false, status: { healthy: false } }
      : { running: false, status: { healthy: false } };
    const isTogglePending = !!(
      currentConsumerName &&
      pendingToggle &&
      pendingToggle.name === currentConsumerName
    );
    const liveStatusText = status.running
      ? status.status.healthy
        ? "Connected"
        : `Connection Error: ${status.status.error || "Unknown"}`
      : status.status.error
        ? `Start failed: ${status.status.error}`
        : "Log Collector Stopped";
    const liveStatusVariant = status.running
      ? (status.status.healthy ? "success" : "danger")
      : status.status.error
        ? "danger"
        : "neutral";

    const selectedMessage =
      selectedMessageIndex !== null && currentConsumerName
        ? (consumerMessages[currentConsumerName] || [])[selectedMessageIndex]
        : null;
    const detailMetadata = selectedMessage
      ? Object.entries(selectedMessage.metadata || {}).sort(([a], [b]) => a.localeCompare(b))
      : [];
    const detailPayload = selectedMessage
      ? typeof selectedMessage.payload === "string"
        ? selectedMessage.payload
        : JSON.stringify(selectedMessage.payload, null, 2)
      : "";
    const detailTime = selectedMessage
      ? selectedMessage.id
        ? extractUuidV7Timestamp(selectedMessage.id)
        : selectedMessage.time
          ? new Date(selectedMessage.time).toLocaleString()
          : "N/A"
      : null;
    const detailInfo = selectedMessage
      ? `Message from ${detailTime}${detailMetadata.length > 0 ? ` (Metadata: ${detailMetadata.map(([key]) => key).join(", ")})` : ""}`
      : "Select a message to view details";

    const currentConsumer = consumers[currentIdx] || null;
    const responseEnabled = consumerSupportsCustomResponse(currentConsumer);
    if (currentConsumer && !responseEnabled && currentConsumer.response !== null) {
      currentConsumer.response = null;
    }
    if (!responseEnabled && activeSubtab === "response") {
      activeSubtab = "definition";
    }
    if (currentConsumer && !responseEnabled) {
      consumerViewState[currentIdx] = { responseHeaders: [] };
    }
    const normalizedResponse = responseEnabled ? normalizeConsumerResponse(currentConsumer?.response) : null;
    const responseHeaders = responseEnabled ? getConsumerResponseRows(currentIdx) : [];
    const responsePayload = normalizedResponse?.payload || "";

    consumersPanelState.set({
      hasConsumers: consumers.length > 0,
      currentConsumerName,
      items: consumers.map((consumer, index) => {
        const status = consumerStatus[consumer.name];
        const statusClass = status
          ? status.running
            ? status.status?.healthy
              ? "status-ok"
              : "status-err"
            : "status-off"
          : "status-off";

        return {
          name: consumer.name,
          inputProto: getConsumerInputType(consumer).toUpperCase(),
          statusClass,
          messageCount: consumerMessages[consumer.name]?.length || 0,
          throughputLabel: status?.running
            ? `${(consumerThroughput[consumer.name] || 0).toFixed(1)} msg/s`
            : "",
          originalIndex: index,
        };
      }),
      selectedIndex: currentIdx,
      activeSubtab,
      responseEnabled,
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
      detailPayload,
      detailMetadata,
    });
  };

  const schedulePoll = (delayMs: number) => {
    if (state.consumer_poll_nonce !== pollNonce) return;
    if (state.consumer_poll_timer) clearTimeout(state.consumer_poll_timer);
    state.consumer_poll_timer = appWindow().setTimeout(pollLoop, delayMs);
    (appWindow() as any)._mqb_consumer_poll_timer = state.consumer_poll_timer;
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
      getMqbState().last_consumer_idx = 0;
      (appWindow() as any)._mqb_last_consumer_idx = 0;
      syncConsumersPanelState();
      return;
    }
    currentIdx = Math.min(Math.max(0, idx), consumers.length - 1);
    getMqbState().last_consumer_idx = currentIdx;
    (appWindow() as any)._mqb_last_consumer_idx = currentIdx;
    selectedMessageIndex = null;
    syncConsumersPanelState();
  };

  const refreshConsumerStatuses = async () => {
    syncRuntimeConsumerStatuses();
    syncConsumersPanelState();
    renderLiveLog();
  };

  const openConsumerAt = (idx: number, tab = "messages") => {
    openConsumerByIndex(
      idx,
      tab as "messages" | "definition" | "response",
      restoreConsumerStateFromView,
      () => {
        void initConsumers(config, schema);
      },
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

  const openRouteAt = (routeName: string) => {
    openRouteByName(
      config.routes,
      routeName,
      (routeIdx) => mqbApp.restore.route(routeIdx),
      () => mqbApp.init.routes(config, mqbApp.schema()),
    );
  };

  const copyCurrentConsumer = async () => {
    const current = config.consumers[currentIdx];
    if (!current) return;

    const choice = await mqbDialogs.choose("Choose where to copy this consumer definition.", "Copy Consumer", {
      confirmLabel: "Continue",
      choices: [
        { value: "route_input", label: "New Route Input" },
        { value: "publisher", label: "New Publisher (review required)" },
        { value: "ref", label: "New Ref Consumer" },
      ],
    });
    if (!choice) return;

    if (choice === "route_input") {
      const routeName = await mqbDialogs.prompt(
        "Choose a name for the new route. The output stays null until you review it.",
        "Copy to Route",
        {
          confirmLabel: "Create",
          value: nextUniqueName(`${current.name}_route`, Object.keys(config.routes || {})),
          placeholder: "consumer_route",
        },
      );
      if (!routeName) return;
      if (config.routes[routeName]) {
        await mqbDialogs.alert("Route already exists");
        return;
      }

      const routeConfig = createEmptyRouteConfig();
      routeConfig.input = cloneJson(current.endpoint);
      config.routes[routeName] = routeConfig;
      mqbRuntime.refreshDirtySection("routes");
      openRouteAt(routeName);
      return;
    }

    if (choice === "publisher") {
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
      return;
    }

    const refTarget = await mqbDialogs.prompt(
      "Enter the ref target name. This must match a registered endpoint name at runtime.",
      "Copy as Ref Consumer",
      {
        confirmLabel: "Next",
        value: current.name,
        placeholder: "route_or_ref_name",
      },
    );
    if (!refTarget) return;

    const consumerName = await mqbDialogs.prompt("Choose a name for the new ref consumer.", "Copy as Ref Consumer", {
      confirmLabel: "Create",
      value: nextUniqueName("ref", (config.consumers || []).map((consumer) => consumer.name)),
      placeholder: "ref_consumer",
    });
    if (!consumerName) return;
    const normalizedConsumerName = nextUniqueName(
      sanitizeConsumerName(consumerName),
      (config.consumers || []).map((consumer) => consumer.name),
    );
    if ((config.consumers || []).some((consumer) => consumer.name === normalizedConsumerName)) {
      await mqbDialogs.alert("Consumer already exists");
      return;
    }

    config.consumers.push({
      name: normalizedConsumerName,
      endpoint: { ref: refTarget },
      comment: current.comment || "",
      response: null,
    });
    mqbRuntime.refreshDirtySection("consumers");
    openConsumerAt(config.consumers.length - 1);
  };

  const addConsumer = async () => {
    const endpointType = await mqbDialogs.choose("Choose the endpoint type for the new consumer.", "Add Consumer", {
      confirmLabel: "Create",
      choices: CONSUMER_TYPE_OPTIONS.map((type) => ({ value: type, label: type.toUpperCase() })),
    });
    if (!endpointType) return;

    config.consumers.push({
      name: nextUniqueName(endpointType, (config.consumers || []).map((consumer) => consumer.name)),
      endpoint: createDefaultConsumerEndpoint(endpointType),
      comment: "",
      response: null,
    });
    const nextIdx = config.consumers.length - 1;
    await initConsumers(config, schema);
    await restoreConsumerStateFromView(nextIdx);
  };

  const requestToHttpConsumer = (request: {
    name: string;
    method: string;
    url: string;
  }) => {
    const currentNames = (config.consumers || []).map((consumer) => consumer.name);
    const baseName = String(request.name || "http")
      .trim()
      .replace(/\s+/g, "_")
      .toLowerCase() || "http";
    const name = nextUniqueName(
      sanitizeConsumerName(baseName),
      currentNames,
    );
    const listen = splitConsumerListenAddress(request.url || "");
    const httpConfig: Record<string, unknown> = {
      url: listen.url,
      method: request.method || "POST",
    };
    if (listen.path) {
      httpConfig.path = listen.path;
    }
    return {
      name,
      endpoint: ensureConsumerEndpointDefaults({
        middlewares: defaultMetricsMiddleware(),
        http: httpConfig,
      }),
      comment: "",
      response: null,
    } as ConsumerConfig;
  };

  const persistImportedConsumers = async (importedConsumers: ConsumerConfig[]) => {
    if (importedConsumers.length === 0) {
      throw new Error("No consumers found in import file.");
    }

    const firstImportedName = importedConsumers[0]?.name || "";
    config.consumers.push(
      ...importedConsumers.map((consumer) => ({
        ...consumer,
        endpoint: ensureConsumerEndpointDefaults(consumer.endpoint),
      })),
    );
    const saved = await mqbRuntime.saveConfigSection("consumers", config.consumers, false);
    if (!saved?.consumers) {
      throw new Error("Failed to save imported consumers.");
    }

    config.consumers = saved.consumers;
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
    config.consumers[currentIdx].response = response;
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
    const message = (consumerMessages[name] || [])[msgIdx];
    if (!message) return;
    selectedMessageIndex = msgIdx;
    activeSubtab = "messages";
    syncConsumersPanelState();
  };

  const renderLiveLog = () => {
    if (consumers.length === 0) return;
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
      if (targetName !== name) {
        syncConsumersPanelState();
      }
    }

    if (
      action === "start" &&
      (!isSavedConsumer(targetName) ||
        mqbRuntime.refreshDirtySection("consumers") ||
        normalizedNamesChanged)
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
        renderLiveLog();
      } else {
        const errorMessage = (await response.text()) || `Failed to ${action} consumer`;
        consumerStatus[targetName] = {
          running: false,
          status: {
            healthy: false,
            error: errorMessage.replace(/^Internal Server Error:\s*/i, ""),
          },
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
    consumerMessages[name] = [];
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
    if (itemSchema.properties?.response) {
      itemSchema.properties.response.hidden = true;
    }
    const httpConfigSchema = itemSchema.$defs?.HttpConfig;
    if (httpConfigSchema?.properties?.custom_headers) {
      httpConfigSchema.properties.custom_headers.hidden = true;
    }

    if (consumers[currentIdx] && isSavedConsumer(consumers[currentIdx].name)) {
      await refreshConsumerStatuses();
    }

    state.form_mode = "consumer";
    (window as any)._mqb_form_mode = "consumer";

    await mqbApp.forms().init(configFormContainer, itemSchema, config.consumers[currentIdx], (updated) => {
      (updated as Record<string, unknown>).response = config.consumers[currentIdx]?.response || null;
      config.consumers[currentIdx] = updated as ConsumerConfig;
      syncConsumersPanelState();
      mqbRuntime.refreshDirtySection("consumers");
    });

    renderLiveLog();
  };

  const restoreConsumerState = async (idx: number, options: { tab?: string } = {}) => {
    if (consumers.length === 0) {
      return;
    }

    setActiveItem(idx);
    startPolling();
    await updateUI();

    const requestedTab = (options.tab || "messages") as "definition" | "response" | "messages";
    activeSubtab =
      requestedTab === "response" && !consumerSupportsCustomResponse(consumers[currentIdx]) ? "definition" : requestedTab;
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
  cloneCurrentConsumerAction = async () => {
      const current = config.consumers[currentIdx];
      const cloned = cloneJson(current);
      cloned.name = nextUniqueName(
        sanitizeConsumerName(`${cloned.name}_copy`),
        (config.consumers || []).map((consumer) => consumer.name),
      );
      cloned.endpoint = ensureConsumerEndpointDefaults(cloned.endpoint);
      config.consumers.push(cloned);
      const nextIdx = config.consumers.length - 1;
      await initConsumers(config, schema);
      await restoreConsumerStateFromView(nextIdx);
    };
  deleteCurrentConsumerAction = async () => {
      if (!(await mqbDialogs.confirm("Delete this consumer?", "Delete Consumer"))) return;

      const newConsumers = config.consumers.slice();
      newConsumers.splice(currentIdx, 1);
      const saved = await mqbRuntime.saveConfigSection("consumers", newConsumers, false);
      if (!saved?.consumers) {
        await mqbDialogs.alert("Failed to save consumer deletion.");
        return;
      }
      config.consumers = saved.consumers;
      mqbApp.config<ConsumersAppConfig>().consumers = saved.consumers;
      syncSavedConsumerNames(saved.consumers || []);
      await initConsumers(config, schema);
      if (config.consumers.length > 0) {
        const nextIdx = Math.max(0, currentIdx - 1);
        await restoreConsumerStateFromView(nextIdx, { tab: activeSubtab });
      }
    };
  saveCurrentConsumerAction = async () => {
      const activeElement = document.activeElement as HTMLElement | null;
      activeElement?.blur();
      const normalized = normalizeConsumerNames(config.consumers, currentIdx);
      const selectedName = normalized.selectedName;
      const selectedTab = activeSubtab;
      config.consumers = (config.consumers || []).map((consumer) => ({
        ...consumer,
        endpoint: ensureConsumerEndpointDefaults(consumer.endpoint),
      }));
      const saved = await mqbRuntime.saveConfigSection("consumers", config.consumers, false, document.getElementById("cons-save"));
      if (!saved) return;

      const normalizedSavedConsumers = (saved.consumers || []).map((consumer: ConsumerConfig) => ({
        ...consumer,
        endpoint: ensureConsumerEndpointDefaults(consumer.endpoint),
      }));
      mqbApp.config<ConsumersAppConfig>().consumers = normalizedSavedConsumers;
      config.consumers = normalizedSavedConsumers;
      syncSavedConsumerNames(saved.consumers || []);
      mqbRuntime.markSectionSaved("consumers", saved.consumers);
      const targetIdx = (mqbApp.config<ConsumersAppConfig>().consumers || []).findIndex(
        (consumer: ConsumerConfig) => consumer.name === selectedName,
      );
      getMqbState().pending_consumer_restore = {
        idx: targetIdx === -1 ? currentIdx : targetIdx,
        tab: selectedTab,
      };
      await initConsumers(mqbApp.config<ConsumersAppConfig>(), mqbApp.schema<ConsumersSchemaRoot>());

      syncConsumersPanelState();
    };
  selectConsumerSubtab = (tab) => {
    activeSubtab = tab === "response" && !consumerSupportsCustomResponse(consumers[currentIdx]) ? "definition" : tab;
    syncConsumersPanelState();
    if (activeSubtab === "messages" && !state.cons_split && mqbApp.split()) {
      state.cons_split = mqbApp.split()?.(["#cons-list-pane", "#cons-detail-pane"], {
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

    const responseHeaders = getConsumerResponseRows(currentIdx).map((row, currentIndex) =>
      currentIndex === index ? { ...row, [field]: value } : row,
    );
    consumerViewState[currentIdx] = { responseHeaders };
    persistCurrentConsumerResponse(responseHeaders);
  };
  toggleConsumerResponseHeader = (index, enabled) => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;

    const responseHeaders = getConsumerResponseRows(currentIdx).map((row, currentIndex) =>
      currentIndex === index ? { ...row, enabled } : row,
    );
    consumerViewState[currentIdx] = { responseHeaders };
    persistCurrentConsumerResponse(responseHeaders);
  };
  removeConsumerResponseHeader = (index) => {
    const current = config.consumers[currentIdx];
    if (!current || !consumerSupportsCustomResponse(current)) return;

    const responseHeaders = getConsumerResponseRows(currentIdx).filter((_, currentIndex) => currentIndex !== index);
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
    if (imported.kind !== "asyncapi") {
      throw new Error("Selected file is not a valid AsyncAPI JSON file.");
    }
    const importedConsumers = imported.requests.map((request) =>
      requestToHttpConsumer({
        name: request.name,
        method: request.method,
        url: request.url,
      }),
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
    const importedConsumersRaw = Array.isArray(importedConfig.consumers)
      ? importedConfig.consumers
      : [];
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
        if (!("response" in consumer)) {
          consumer.response = null;
        }
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

      syncRuntimeConsumerStatuses();
      const name = activeConsumer.name;
      const runtimeConsumer = getMqbState().runtime_status?.consumers?.[name];
      const knownSequence = consumerMessageSequences[name] || 0;
      const nextSequence = runtimeConsumer?.message_sequence || 0;

      syncConsumersPanelState();
      renderLiveLog();

      if (nextSequence <= knownSequence) {
        schedulePoll(runtimeConsumer?.running ? 1000 : 5000);
        return;
      }

      const response = await fetch(`/messages?consumer=${encodeURIComponent(name)}`);
      if (response.ok) {
        const data = (await response.json()) as Record<string, unknown[]>;
        let hasNew = false;
        const selectedMessages: ConsumerMessage[] = [];
        const maxMessages =
          Object.keys(data).length <= 1 ? MAX_FILTERED_CONSUMER_MESSAGES : MAX_UNFILTERED_CONSUMER_MESSAGES;
        for (const [sourceName, rawMessages] of Object.entries(data)) {
          const messages = Array.isArray(rawMessages)
            ? rawMessages.map((message) => normalizeConsumerMessage(message))
            : [];
          consumerMessages[sourceName] = [...messages, ...(consumerMessages[sourceName] || [])].slice(0, maxMessages);
          consumerMessages[sourceName].sort((a, b) => {
            const timeA = a.time || "";
            const timeB = b.time || "";
            const cmp = timeB.localeCompare(timeA);
            if (cmp !== 0) return cmp;
            return (b.id || "").localeCompare(a.id || "");
          });
          hasNew = hasNew || messages.length > 0;
          if (sourceName !== name && messages.length > 0) {
            // Collect messages from other sources to potentially add to the active consumer's log
            selectedMessages.push(...messages);
          }
        }
        if ((!data[name] || data[name].length === 0) && selectedMessages.length > 0) {
          if (!consumerMessages[name]) consumerMessages[name] = [];
          consumerMessages[name] = [...selectedMessages, ...consumerMessages[name]].slice(0, maxMessages);
          // After merging, ensure the active consumer's messages are sorted
          consumerMessages[name].sort((a, b) => {
            const timeA = a.time || "";
            const timeB = b.time || "";
            const cmp = timeB.localeCompare(timeA);
            if (cmp !== 0) return cmp;
            return (b.id || "").localeCompare(a.id || "");
          });
          hasNew = true;
        }
        consumerMessageSequences[name] = nextSequence;
        if (hasNew) {
          saveMessages();
        }

        renderLiveLog();
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
    renderLiveLog();
    if (state.active_tab === "consumers" || currentHash().startsWith("#consumers")) {
      schedulePoll(0);
    }
  };

  state.consumers_initialized = true;
  (appWindow() as any)._mqb_consumers_initialized = true;
  appWindow().restoreConsumerState = restoreConsumerState;
  restoreConsumerStateFromView = restoreConsumerState;

  renderSidebar();

  if (consumers.length > 0) {
    const pendingRestore = state.pending_consumer_restore || null;
    state.pending_consumer_restore = null;
    const initialIdx = pendingRestore?.idx ?? 0;
    const initialTab = pendingRestore?.tab || "messages";

    setActiveItem(initialIdx);
    startPolling();
    await updateUI();
    if (!hadUnsavedChangesBeforeInit) {
      settleInitialDirtyBaseline();
    }

    selectConsumerSubtab(initialTab as "definition" | "response" | "messages");
  } else {
    if (!hadUnsavedChangesBeforeInit) {
      settleInitialDirtyBaseline();
    }
  }
}
