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
import { openConsumerByIndex, openPublisherByIndex, openRouteByName } from "./view-navigation";
import { consumersPanelState } from "./stores";
import { getMqbState, mqbDialogs, mqbRuntime } from "./runtime-window";

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

type ConsumerMessage = {
  payload: unknown;
  metadata?: Record<string, string>;
  time?: string;
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

function extractUuidV7Timestamp(idStr: string): string | null {
  try {
    const hex = idStr.replace(/-/g, "");
    const milliseconds = parseInt(hex.substring(0, 12), 16);
    return new Date(milliseconds).toLocaleTimeString();
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
    window.setTimeout(() => {
      mqbRuntime.markSectionSaved("consumers", initialConsumersSnapshot);
    }, 0);
  };

  mqbRuntime.registerDirtySection("consumers", {
    buttonId: "cons-save",
    getValue: () => config.consumers,
  });
  const hadUnsavedChangesBeforeInit = mqbRuntime.refreshDirtySection("consumers");

  const updateUrlHash = () => {
    window.history.replaceState(null, "", `#consumers:${currentIdx || 0}`);
  };

  let consumerMessages: Record<string, ConsumerMessage[]> = {};
  try {
    const parsed = JSON.parse(localStorage.getItem(MSG_STORAGE_KEY) || "{}");
    consumerMessages = parsed && typeof parsed === "object" ? (parsed as Record<string, ConsumerMessage[]>) : {};
  } catch {
    consumerMessages = {};
  }
  const saveMessages = () => localStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(consumerMessages));

  const consumerStatus: Record<string, ConsumerStatus> = {};
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
      ? selectedMessage.metadata?.id
        ? extractUuidV7Timestamp(selectedMessage.metadata.id)
        : selectedMessage.time
          ? new Date(selectedMessage.time).toLocaleTimeString()
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
          (message.metadata?.id ? extractUuidV7Timestamp(message.metadata.id) : null) ||
          (message.time ? new Date(message.time).toLocaleTimeString() : "N/A"),
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
    state.consumer_poll_timer = window.setTimeout(pollLoop, delayMs);
  };

  const fetchConsumerStatus = async (name: string) => {
    if (!isSavedConsumer(name)) {
      consumerStatus[name] = { running: false, status: { healthy: false }, unsaved: true };
      return;
    }

    try {
      const response = await fetch(`/consumer-status?consumer=${encodeURIComponent(name)}`);
      if (response.ok) {
        consumerStatus[name] = (await response.json()) as ConsumerStatus;
      } else if (response.status === 404) {
        savedConsumerNames.delete(name);
        consumerStatus[name] = { running: false, status: { healthy: false }, unsaved: true };
      } else {
        const message = (await response.text()) || "Unable to fetch consumer status";
        consumerStatus[name] = {
          running: false,
          status: { healthy: false, error: message.replace(/^Internal Server Error:\s*/i, "") },
        };
      }
    } catch (error) {
      console.error("Error fetching status:", error);
      consumerStatus[name] = {
        running: false,
        status: { healthy: false, error: "Unable to fetch consumer status" },
      };
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
      syncConsumersPanelState();
      return;
    }
    currentIdx = Math.min(Math.max(0, idx), consumers.length - 1);
    selectedMessageIndex = null;
    syncConsumersPanelState();
  };

  const refreshConsumerStatuses = async () => {
    await Promise.all((config.consumers || []).map((consumer) => fetchConsumerStatus(consumer.name)));
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
      (publisherIdx, options) => window.restorePublisherState?.(publisherIdx, options),
      () => window.initPublishers?.(config, window.appSchema),
    );
  };

  const openRouteAt = (routeName: string) => {
    openRouteByName(
      config.routes,
      routeName,
      (routeIdx) => window.restoreRouteState?.(routeIdx),
      () => window.initRoutes?.(config, window.appSchema),
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
      window.appConfig.consumers = consumers;
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
        await fetchConsumerStatus(targetName);
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
    try {
      await window.VanillaSchemaForms.init(configFormContainer, itemSchema, config.consumers[currentIdx], (updated) => {
        (updated as Record<string, unknown>).response = config.consumers[currentIdx]?.response || null;
        config.consumers[currentIdx] = updated as ConsumerConfig;
        syncConsumersPanelState();
        mqbRuntime.refreshDirtySection("consumers");
      });
    } finally {
      state.form_mode = null;
    }

    renderLiveLog();
  };

  const restoreConsumerState = async (idx: number, options: { tab?: string } = {}) => {
    if (consumers.length === 0) {
      return;
    }

    setActiveItem(idx);
    await updateUI();
    const activeConsumer = consumers[currentIdx];
    if (activeConsumer && isSavedConsumer(activeConsumer.name)) {
      startPolling();
    }

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
  cloneCurrentConsumerAction = () => {
      const current = config.consumers[currentIdx];
      const cloned = cloneJson(current);
      cloned.name = nextUniqueName(
        sanitizeConsumerName(`${cloned.name}_copy`),
        (config.consumers || []).map((consumer) => consumer.name),
      );
      config.consumers.push(cloned);
      const nextIdx = config.consumers.length - 1;
      void initConsumers(config, schema).then(() => restoreConsumerStateFromView(nextIdx));
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
      window.appConfig.consumers = saved.consumers;
      syncSavedConsumerNames(saved.consumers || []);
      void initConsumers(config, schema);
      if (config.consumers.length > 0) {
        setActiveItem(Math.max(0, currentIdx - 1));
        await updateUI();
      }
    };
  saveCurrentConsumerAction = async () => {
      const normalized = normalizeConsumerNames(config.consumers, currentIdx);
      const selectedName = normalized.selectedName;
      const saved = await mqbRuntime.saveConfigSection("consumers", config.consumers, false, document.getElementById("cons-save"));
      if (!saved) return;

      window.appConfig.consumers = saved.consumers;
      config.consumers = saved.consumers;
      syncSavedConsumerNames(saved.consumers || []);
      await initConsumers(window.appConfig as ConsumersAppConfig, window.appSchema as ConsumersSchemaRoot);

      const refreshedIdx = (window.appConfig.consumers || []).findIndex(
        (consumer: ConsumerConfig) => consumer.name === selectedName,
      );
      if (refreshedIdx !== -1) {
        await restoreConsumerStateFromView(refreshedIdx);
      }
    };
  selectConsumerSubtab = (tab) => {
    activeSubtab = tab === "response" && !consumerSupportsCustomResponse(consumers[currentIdx]) ? "definition" : tab;
    syncConsumersPanelState();
    if (activeSubtab === "messages" && !window._consSplit && window.Split) {
      window._consSplit = window.Split(["#cons-list-pane", "#cons-detail-pane"], {
        direction: "vertical",
        sizes: [60, 40],
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

  const pollLoop = async () => {
    if (state.consumer_poll_nonce !== pollNonce) return;
    if (state.active_tab !== "consumers") return;

    try {
      const activeConsumer = (config.consumers || [])[currentIdx];
      if (!activeConsumer) {
        schedulePoll(1000);
        return;
      }

      await refreshConsumerStatuses();

      const name = activeConsumer.name;
      if (!consumerStatus[name]?.running) {
        schedulePoll(2000);
        return;
      }

      const response = await fetch(`/messages?consumer=${encodeURIComponent(name)}`);
      if (response.ok) {
        const data = (await response.json()) as Record<string, ConsumerMessage[]>;
        let hasNew = false;
        for (const [sourceName, messages] of Object.entries(data)) {
          if (!consumerMessages[sourceName]) consumerMessages[sourceName] = [];
          consumerMessages[sourceName] = [...messages, ...consumerMessages[sourceName]].slice(0, 1000);
          hasNew = hasNew || messages.length > 0;
        }
        if (hasNew) {
          saveMessages();
        }

        renderLiveLog();
        syncConsumersPanelState();
      }
    } catch (error) {
      console.error("Polling error:", error);
    }

    schedulePoll(1000);
  };

  const startPolling = () => {
    schedulePoll(0);
  };

  state.consumers_initialized = true;
  window.restoreConsumerState = restoreConsumerState;
  restoreConsumerStateFromView = restoreConsumerState;

  renderSidebar();

  if (consumers.length > 0) {
    const pendingRestore = state.pending_consumer_restore || null;
    state.pending_consumer_restore = null;
    const initialIdx = pendingRestore?.idx ?? 0;
    const initialTab = pendingRestore?.tab || "messages";

    setActiveItem(initialIdx);
    await updateUI();
    if (!hadUnsavedChangesBeforeInit) {
      settleInitialDirtyBaseline();
    }

    const initialConsumer = consumers[currentIdx];
    if (initialConsumer && isSavedConsumer(initialConsumer.name)) {
      startPolling();
    }

    selectConsumerSubtab(initialTab as "definition" | "response" | "messages");
  } else {
    if (!hadUnsavedChangesBeforeInit) {
      settleInitialDirtyBaseline();
    }
  }
}
