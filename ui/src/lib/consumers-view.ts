import { tick } from "svelte";
import { get } from "svelte/store";
import { appShell, getAppState, workspaceRuntime } from "./app-shell";
import { browserWindow, replaceHash } from "./browser";
import { createLocalEntityId, getEntityDisplayLabel, normalizeConsumerNames, normalizeConsumerResponse, sanitizeConsumerName } from "./utils";
import { CONSUMER_TYPE_OPTIONS, RESPONSE_CAPABLE_CONSUMER_TYPES } from "./endpoint-metadata";
import { createDefaultEndpoint, createPublisherEndpointFromConsumerEndpoint, ensureEndpointDefaults, getEndpointType, normalizeScalarEndpointValue } from "./endpoint-utils";
import { consumersPanelState } from "./stores";
import { extractImportedRequests } from "./import-export";
import { forceRefOnlyEndpoints, resolveRootArrayItemSchema } from "./schema-utils";
import { applyEndpointSchemaDefaults } from "./routes";
import type {
  ConsumerConfig,
  ConsumerMessage,
  ConsumerMessageCaptureConfig,
  ConsumerOutputConfig,
  ConsumerResponseConfig,
  ConsumerResponseHeaderRow,
  ConsumerStatus,
  ConsumersAppConfig,
  ConsumersSchemaRoot,
  PublisherConfig,
} from "./panel-types";

const MESSAGE_STORAGE_KEY = "mqb_consumer_messages";
const DEFAULT_CAPTURE: Required<ConsumerMessageCaptureConfig> = { enabled: true, keep_last: 100 };
const EMPTY_STATUS: ConsumerStatus = { running: false, status: { healthy: false } } as ConsumerStatus;
const CONSUMER_ENDPOINT_DEFAULTS: Record<string, Record<string, unknown> | string> = {
  http: { url: "0.0.0.0:8080", path: "/api/messages", method: "POST" },
  websocket: { url: "0.0.0.0:8080", path: "/socket" },
  grpc: { url: "0.0.0.0:50051" },
  nats: { url: "nats://localhost:4222", subject: "events.created" },
  memory: { topic: "events" },
  amqp: { url: "amqp://guest:guest@localhost:5672/%2f", queue: "jobs" },
  kafka: { url: "kafka:9092", topic: "events" },
  mqtt: { url: "tcp://localhost:1883", topic: "events/updates" },
  mongodb: { url: "mongodb://localhost:27017", database: "app", collection: "messages" },
  sqlx: { url: "postgres://user:pass@localhost/db", table: "events" },
  zeromq: { url: "tcp://127.0.0.1:5555", topic: "events" },
  file: { path: "/tmp/messages.jsonl" },
  static: "",
};

let activeConfig: ConsumersAppConfig = { consumers: [], routes: {}, publishers: [] };
let activeSchema: ConsumersSchemaRoot = {};
let formDrafts = new Map<number, ConsumerConfig>();
let messagesByConsumer: Record<string, ConsumerMessage[]> = {};
let nextResponseHeaderId = 1;
let pollTimer: number | null = null;
let lastMessageSequenceByConsumer: Record<string, number> = {};
let consumerErrorByKey: Record<string, string> = {};
const DETAIL_METADATA_ORDER = ["content-length", "host", "http_method", "http_path", "http_query", "http_version", "content-type"];

function formatLocalTimeFromIso(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatTimeAgoLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Select a message to view details";
  const deltaSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const deltaMinutes = Math.round(deltaSeconds / 60);
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;
  const deltaHours = Math.round(deltaMinutes / 60);
  return `${deltaHours}h ago`;
}

const normalizeEndpointRecord = (endpoint: unknown) => ensureEndpointDefaults(endpoint, normalizeEndpointRecord);

export { CONSUMER_TYPE_OPTIONS, normalizeConsumerNames, sanitizeConsumerName };

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function getRuntimeKey(consumer: ConsumerConfig): string {
  return String(consumer.id || sanitizeConsumerName(consumer.name || "") || "consumer");
}

function getStorageKey(consumer: ConsumerConfig): string {
  return String(consumer.id || consumer.name || "");
}

function getConsumerLookupKeys(consumer: ConsumerConfig): string[] {
  const keys = [getRuntimeKey(consumer), getStorageKey(consumer), String(consumer.name || "")]
    .map((value) => value.trim())
    .filter(Boolean);
  return Array.from(new Set(keys));
}

function getLivePublishers(): PublisherConfig[] {
  const localPublishers = Array.isArray(activeConfig.publishers) ? activeConfig.publishers : [];
  if (localPublishers.length > 0) return localPublishers;
  const livePublishers = (appShell.config<Record<string, unknown>>()?.publishers || []) as PublisherConfig[];
  return Array.isArray(livePublishers) ? livePublishers : [];
}

function createDefaultConsumerEndpoint(endpointType: string): Record<string, unknown> {
  const endpoint = createDefaultEndpoint(endpointType);
  const defaults = CONSUMER_ENDPOINT_DEFAULTS[endpointType];
  if (endpointType === "static") {
    endpoint.static = typeof defaults === "string" ? defaults : "";
    return endpoint;
  }
  Object.assign(endpoint[endpointType] as Record<string, unknown>, defaults ?? {});
  return endpoint;
}

function normalizeMessageCapture(input: ConsumerMessageCaptureConfig | null | undefined): Required<ConsumerMessageCaptureConfig> {
  return {
    enabled: input?.enabled ?? DEFAULT_CAPTURE.enabled,
    keep_last: Number.isFinite(input?.keep_last) ? Math.max(1, Number(input?.keep_last)) : DEFAULT_CAPTURE.keep_last,
  };
}

function normalizeOutput(input: ConsumerOutputConfig | null | undefined): ConsumerOutputConfig {
  if (!input || typeof input !== "object") return { mode: "none" };
  const mode = input.mode;
  if (mode === "publisher") return { mode, publisher: String((input as any).publisher || "") };
  if (mode === "response") return { mode, response: (input as any).response ?? { payload: "", headers: {} } };
  return { mode: "none" };
}

function normalizeConsumerConfig(input: ConsumerConfig): ConsumerConfig {
  const next = deepClone(input);
  next.id = String(next.id || "").trim() || createLocalEntityId("consumer");
  next.name = String(next.name ?? "");
  next.endpoint = normalizeEndpointRecord(next.endpoint);
  next.message_capture = normalizeMessageCapture(next.message_capture);
  next.output = normalizeOutput(next.output);
  next.response = normalizeConsumerResponse(next.response) ?? null;
  return next;
}

function parseStructuredValue(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[") && !trimmed.startsWith("\"")) {
    return raw;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function normalizeStringMap(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => [key, String(value ?? "")] as const);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sortDetailMetadataEntries(entries: Array<[string, string]>) {
  return entries
    .sort(([leftKey], [rightKey]) => {
      const leftIndex = DETAIL_METADATA_ORDER.indexOf(leftKey);
      const rightIndex = DETAIL_METADATA_ORDER.indexOf(rightKey);
      if (leftIndex !== -1 || rightIndex !== -1) {
        if (leftIndex === -1) return 1;
        if (rightIndex === -1) return -1;
        return leftIndex - rightIndex;
      }
      return leftKey.localeCompare(rightKey);
    });
}

export function normalizeConsumerMessage(raw: unknown, fallbackTime = new Date().toISOString()): ConsumerMessage {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const metadata = normalizeStringMap(record.metadata);
    const responseMetadata = normalizeStringMap(record.response_metadata);
    if ("payload" in record || "id" in record || "time" in record || "response" in record) {
      return {
        id: record.id == null ? undefined : String(record.id),
        payload: "payload" in record ? parseStructuredValue(record.payload) : raw,
        metadata,
        time: typeof record.time === "string" ? record.time : fallbackTime,
        response: parseStructuredValue(record.response),
        response_metadata: responseMetadata,
      };
    }
  }
  return { payload: raw, time: fallbackTime };
}

function readStoredMessages(): Record<string, ConsumerMessage[]> {
  const preloaded = getAppState().storage_cache?.consumer_messages;
  if (preloaded && typeof preloaded === "object" && !Array.isArray(preloaded)) {
    return preloaded as Record<string, ConsumerMessage[]>;
  }
  try {
    const raw = browserWindow().localStorage?.getItem(MESSAGE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistMessages() {
  browserWindow().localStorage?.setItem(MESSAGE_STORAGE_KEY, JSON.stringify(messagesByConsumer));
}

function consumerMessagesFor(consumer: ConsumerConfig): ConsumerMessage[] {
  const byId = messagesByConsumer[getStorageKey(consumer)];
  if (Array.isArray(byId)) return byId;
  const byName = messagesByConsumer[String(consumer.name || "")];
  if (Array.isArray(byName)) return byName;
  return [];
}

function setConsumerMessages(consumer: ConsumerConfig, rows: ConsumerMessage[]) {
  const keepLast = normalizeMessageCapture(consumer.message_capture).keep_last;
  const storageKey = getStorageKey(consumer);
  const legacyNameKey = String(consumer.name || "");
  messagesByConsumer[storageKey] = rows.slice(0, keepLast);
  if (legacyNameKey && legacyNameKey !== storageKey) {
    delete messagesByConsumer[legacyNameKey];
  }
  persistMessages();
}

function getConsumerStatus(consumer: ConsumerConfig): ConsumerStatus {
  const runtime = (browserWindow()._mqb_runtime_status?.consumers || {}) as Record<string, ConsumerStatus>;
  return runtime[getRuntimeKey(consumer)] || EMPTY_STATUS;
}

function formatThroughput(consumer: ConsumerConfig): string {
  const status = getConsumerStatus(consumer) as any;
  const throughput = Number(status?.throughput || 0);
  if (!status?.running || throughput <= 0) return "";
  return `${throughput.toFixed(1)} msg/s`;
}

function getStatusClass(consumer: ConsumerConfig): string {
  if (consumerErrorByKey[getRuntimeKey(consumer)]) return "status-error";
  const status = getConsumerStatus(consumer);
  if (!status.running) return "status-off";
  if (status.status?.healthy === false) return "status-error";
  return "status-ok";
}

function buildSidebarItems() {
  return activeConfig.consumers.map((consumer, index) => ({
    name: String(consumer.name || ""),
    displayName: getEntityDisplayLabel(consumer.name, consumer.endpoint, getEndpointType(consumer.endpoint)),
    inputProto: getEndpointType(consumer.endpoint).toUpperCase(),
    statusClass: getStatusClass(consumer),
    messageCount: consumerMessagesFor(consumer).length,
    throughputLabel: formatThroughput(consumer),
    originalIndex: index,
    id: consumer.id,
  }));
}

function currentConsumer(): ConsumerConfig | null {
  const idx = get(consumersPanelState).selectedIndex;
  if (idx < 0 || idx >= activeConfig.consumers.length) return null;
  return activeConfig.consumers[idx];
}

function nextPublisherOptions() {
  return getLivePublishers().map((publisher) => ({
    value: String(publisher.name || ""),
    label: String(publisher.name || ""),
  }));
}

function responseRowsFromConsumer(consumer: ConsumerConfig): ConsumerResponseHeaderRow[] {
  const response = normalizeConsumerResponse(consumer.response) ?? { headers: {}, payload: "" };
  return Object.entries(response.headers || {}).map(([key, value]) => ({
    id: nextResponseHeaderId++,
    key,
    value,
    enabled: true,
  }));
}

function applyResponseStateToConsumer(consumer: ConsumerConfig) {
  const state = get(consumersPanelState);
  const enabledHeaders = Object.fromEntries(
    state.responseHeaders
      .filter((row) => row.enabled && row.key.trim())
      .map((row) => [row.key.trim(), row.value]),
  );
  const nextResponse = { payload: state.responsePayload, headers: enabledHeaders };
  consumer.response = nextResponse;
  consumer.output = { mode: "response", response: nextResponse };
}

function renderMessageDetails() {
  const consumer = currentConsumer();
  if (!consumer) return;
  const rows = consumerMessagesFor(consumer);
  const selected = rows[get(consumersPanelState).selectedMessageIndex] || null;
  consumersPanelState.update((state) => ({
    ...state,
    detailInfo: selected ? formatTimeAgoLabel(selected.time || new Date().toISOString()) : "Select a message to view details",
    detailRequestPayload: selected ? JSON.stringify(selected.payload, null, 2) : "",
    detailRequestHeaders: selected ? sortDetailMetadataEntries(Object.entries(selected.metadata || {})) : [],
    detailResponsePayload: selected && selected.response !== undefined ? JSON.stringify(selected.response) : "",
    detailResponseHeaders: selected ? sortDetailMetadataEntries(Object.entries(selected.response_metadata || {})) : [],
    detailRequestContentType: selected?.metadata?.["content-type"] || "",
    detailResponseContentType: selected?.response_metadata?.["content-type"] || "",
    hasResponse: Boolean(selected?.response !== undefined),
  }));
}

function renderSelectedConsumer() {
  const consumer = currentConsumer();
  if (!consumer) {
    consumersPanelState.set({
      ...get(consumersPanelState),
      hasConsumers: false,
      items: [],
      currentConsumerKey: null,
      messages: [],
    });
    return;
  }

  const capture = normalizeMessageCapture(consumer.message_capture);
  const output = normalizeOutput(consumer.output);
  const rows = consumerMessagesFor(consumer);
  const status = getConsumerStatus(consumer);
  const runtimeKey = getRuntimeKey(consumer);
  const runtimeError = consumerErrorByKey[runtimeKey];
  const responseCapable = RESPONSE_CAPABLE_CONSUMER_TYPES.has(getEndpointType(consumer.endpoint));
  const publisherOptions = nextPublisherOptions();
  const responseRows = responseRowsFromConsumer(consumer);
  const responseValue = normalizeConsumerResponse(consumer.response) ?? { headers: {}, payload: "" };

  consumersPanelState.update((state) => ({
    ...state,
    hasConsumers: activeConfig.consumers.length > 0,
    items: buildSidebarItems(),
    currentConsumerKey: getRuntimeKey(consumer),
    selectedIndex: activeConfig.consumers.indexOf(consumer),
    isNew: !isSavedConsumer(consumer),
    deleteLabel: "Delete",
    messageCaptureEnabled: capture.enabled,
    messageCaptureKeepLast: capture.keep_last,
    responseEnabled: responseCapable,
    outputMode: (output.mode as any) || "none",
    publisherOptions,
    selectedPublisher: output.mode === "publisher" ? String((output as any).publisher || "") : "",
    responseSupported: responseCapable,
    responseHeaders: responseRows,
    responsePayload: responseValue.payload || "",
    liveStatusText: runtimeError || (!status.running ? "Consumer Stopped" : status.status?.healthy === false ? "Consumer Error" : "Connected"),
    liveStatusVariant: runtimeError ? "danger" : !status.running ? "neutral" : status.status?.healthy === false ? "danger" : "success",
    toggleLabel: !status.running ? "Start" : "Stop",
    toggleVariant: !status.running ? "success" : "danger",
    toggleBusy: false,
      messages: rows.map((message, index) => ({
        timeLabel: formatLocalTimeFromIso(message.time || new Date().toISOString()),
        payloadPreview: typeof message.payload === "string" ? message.payload : JSON.stringify(message.payload),
        messageIndex: index,
        selected: index === state.selectedMessageIndex,
      })),
  }));
  renderMessageDetails();
}

function markRememberedSelection(idx: number, tab: "definition" | "response" | "messages") {
  const appState = getAppState();
  appState.last_consumer_idx = idx;
  appState.last_consumer_tab = tab;
  browserWindow()._mqb_last_consumer_idx = idx;
  browserWindow()._mqb_last_consumer_tab = tab;
}

function isSavedConsumer(consumer: ConsumerConfig): boolean {
  const saved = (browserWindow()._mqb_saved_sections?.consumers || []) as ConsumerConfig[];
  return saved.some((item) => String(item.id || "") === String(consumer.id || ""));
}

function hasUnsavedConsumers(): boolean {
  if (!browserWindow()._mqb_saved_sections || !("consumers" in browserWindow()._mqb_saved_sections)) {
    return false;
  }
  const saved = JSON.stringify((browserWindow()._mqb_saved_sections?.consumers || []) as ConsumerConfig[]);
  const current = JSON.stringify(activeConfig.consumers);
  return saved !== current;
}

async function saveConsumersSection(sectionValue = activeConfig.consumers) {
  const saved = browserWindow().saveConfigSection
    ? await browserWindow().saveConfigSection("consumers", sectionValue, false, undefined)
    : await workspaceRuntime.saveConfigSection("consumers", sectionValue, false, undefined);
  if (saved && Array.isArray((saved as any).consumers)) {
    activeConfig.consumers = (saved as any).consumers.map(normalizeConsumerConfig);
    browserWindow()._mqb_saved_sections = {
      ...(browserWindow()._mqb_saved_sections || {}),
      consumers: deepClone(activeConfig.consumers),
    };
  }
  return saved;
}

async function flushPendingFormDraft() {
  const activeElement = document.activeElement as { blur?: () => void } | null;
  if (activeElement?.blur && activeElement !== document.body) {
    activeElement.blur();
    await Promise.resolve();
    await Promise.resolve();
  }
}

function createConsumerFormSchema(): Record<string, unknown> {
  const itemSchema = resolveRootArrayItemSchema(activeSchema as Record<string, any>, "consumers");
  applyEndpointSchemaDefaults(itemSchema as any);
  forceRefOnlyEndpoints(itemSchema as any);
  return itemSchema;
}

async function renderConsumerForm() {
  const consumer = currentConsumer();
  const container = document.getElementById("cons-config-form");
  if (!consumer || !container) return;
  const forms = appShell.forms() as any;
  getAppState().form_mode = "consumer";
  (window as any)._mqb_form_mode = "consumer";
  await forms.init(container, createConsumerFormSchema(), deepClone(consumer), (updated: ConsumerConfig) => {
    formDrafts.set(get(consumersPanelState).selectedIndex, updated);
  });
}

async function fetchNewMessagesForRunningConsumers() {
  const runtimeConsumers = (browserWindow()._mqb_runtime_status?.consumers || {}) as Record<string, any>;
  for (const consumer of activeConfig.consumers) {
    const runtimeKey = getRuntimeKey(consumer);
    const runtime = runtimeConsumers[runtimeKey];
    if (!runtime?.running) continue;
    const capture = normalizeMessageCapture(consumer.message_capture);
    if (!capture.enabled) continue;
    const messageSequence = Number(runtime.message_sequence || 0);
    const lastSeen = Number(lastMessageSequenceByConsumer[runtimeKey] || 0);
    if (messageSequence <= lastSeen && consumerMessagesFor(consumer).length > 0) continue;
    const response = await fetch(`/messages?consumer_id=${encodeURIComponent(runtimeKey)}`);
    if (!response.ok) continue;
    const payload = await response.json();
    const rawRows = getConsumerLookupKeys(consumer)
      .map((key) => payload?.[key])
      .find((value) => Array.isArray(value)) || [];
    const existing = consumerMessagesFor(consumer);
    const merged = rawRows.map((row: unknown) => normalizeConsumerMessage(row)).concat(existing);
    messagesByConsumer[getStorageKey(consumer)] = merged.slice(0, capture.keep_last);
    lastMessageSequenceByConsumer[runtimeKey] = messageSequence;
    persistMessages();
  }
}

function scheduleMessagePolling() {
  if (pollTimer != null) {
    window.clearTimeout(pollTimer);
  }
  pollTimer = window.setTimeout(async () => {
    await fetchNewMessagesForRunningConsumers();
    renderSelectedConsumer();
    scheduleMessagePolling();
  }, 2000) as unknown as number;
}

export async function restoreConsumerStateFromView(idx: number, options?: { tab?: string }) {
  const clamped = Math.min(Math.max(idx, 0), Math.max(activeConfig.consumers.length - 1, 0));
  const nextTab = (options?.tab as "definition" | "response" | "messages" | undefined) || get(consumersPanelState).activeSubtab || "messages";
  markRememberedSelection(clamped, nextTab);
  consumersPanelState.update((state) => ({ ...state, selectedIndex: clamped, selectedMessageIndex: -1, activeSubtab: nextTab }));
  replaceHash(`#consumers:${clamped}`);
  renderSelectedConsumer();
  await renderConsumerForm();
  renderSelectedConsumer();
}

export function selectConsumerSubtab(tab: "definition" | "response" | "messages") {
  consumersPanelState.update((state) => ({ ...state, activeSubtab: tab }));
  markRememberedSelection(get(consumersPanelState).selectedIndex, tab);
  renderSelectedConsumer();
}

export async function addConsumerAction(endpointType: string) {
  activeConfig.consumers.push(normalizeConsumerConfig({
    id: createLocalEntityId("consumer"),
    name: "",
    endpoint: createDefaultConsumerEndpoint(endpointType),
    response: null,
    output: { mode: "none" },
    message_capture: { ...DEFAULT_CAPTURE },
  } as ConsumerConfig));
  await restoreConsumerStateFromView(activeConfig.consumers.length - 1, { tab: "definition" });
}

export function setConsumerOutputModeAction(mode: "none" | "publisher" | "response") {
  const consumer = currentConsumer();
  if (!consumer) return;
  if (mode === "publisher") {
    const options = nextPublisherOptions();
    if (options.length === 0) {
      void browserWindow().mqbAlert?.("Create or select a publisher first.");
      consumer.output = { mode: "none" };
      renderSelectedConsumer();
      return;
    }
    const selectedPublisher = options.length === 1 ? options[0].value : (consumer.output?.mode === "publisher" ? String((consumer.output as any).publisher || "") : "");
    consumer.output = { mode: "publisher", publisher: selectedPublisher };
    consumersPanelState.update((state) => ({ ...state, outputMode: "publisher", publisherOptions: options, selectedPublisher }));
    return;
  }
  if (mode === "response") {
    applyResponseStateToConsumer(consumer);
    consumersPanelState.update((state) => ({ ...state, outputMode: "response" }));
    return;
  }
  consumer.output = { mode: "none" };
  consumersPanelState.update((state) => ({ ...state, outputMode: "none", selectedPublisher: "" }));
}

export function setConsumerOutputPublisherAction(publisher: string) {
  const consumer = currentConsumer();
  if (!consumer) return;
  consumer.output = { mode: "publisher", publisher };
  consumersPanelState.update((state) => ({ ...state, selectedPublisher: publisher }));
}

export function setConsumerMessageCaptureEnabledAction(enabled: boolean) {
  const consumer = currentConsumer();
  if (!consumer) return;
  consumer.message_capture = { ...normalizeMessageCapture(consumer.message_capture), enabled };
  consumersPanelState.update((state) => ({ ...state, messageCaptureEnabled: enabled }));
}

export function setConsumerMessageCaptureKeepLastAction(keepLast: number) {
  const consumer = currentConsumer();
  if (!consumer) return;
  const nextKeepLast = Math.max(1, keepLast);
  consumer.message_capture = { ...normalizeMessageCapture(consumer.message_capture), keep_last: nextKeepLast };
  const key = getStorageKey(consumer);
  const legacyNameKey = String(consumer.name || "");
  messagesByConsumer[key] = consumerMessagesFor(consumer).slice(0, nextKeepLast);
  if (legacyNameKey && legacyNameKey !== key) {
    delete messagesByConsumer[legacyNameKey];
  }
  persistMessages();
  consumersPanelState.update((state) => ({ ...state, messageCaptureKeepLast: nextKeepLast }));
}

export function addConsumerResponseHeader() {
  consumersPanelState.update((state) => ({
    ...state,
    responseHeaders: [...state.responseHeaders, { id: nextResponseHeaderId++, key: "", value: "", enabled: true }],
  }));
  const consumer = currentConsumer();
  if (consumer) applyResponseStateToConsumer(consumer);
}

export function updateConsumerResponseHeader(index: number, field: "key" | "value", value: string) {
  consumersPanelState.update((state) => {
    const responseHeaders = state.responseHeaders.map((row, rowIndex) => rowIndex === index ? { ...row, [field]: value } : row);
    return { ...state, responseHeaders };
  });
  const consumer = currentConsumer();
  if (consumer) applyResponseStateToConsumer(consumer);
}

export function toggleConsumerResponseHeader(index: number, enabled: boolean) {
  consumersPanelState.update((state) => ({
    ...state,
    responseHeaders: state.responseHeaders.map((row, rowIndex) => rowIndex === index ? { ...row, enabled } : row),
  }));
  const consumer = currentConsumer();
  if (consumer) applyResponseStateToConsumer(consumer);
}

export function removeConsumerResponseHeader(index: number) {
  consumersPanelState.update((state) => ({
    ...state,
    responseHeaders: state.responseHeaders.filter((_, rowIndex) => rowIndex !== index),
  }));
  const consumer = currentConsumer();
  if (consumer) applyResponseStateToConsumer(consumer);
}

export function updateConsumerResponsePayload(value: string) {
  consumersPanelState.update((state) => ({ ...state, responsePayload: value }));
  const consumer = currentConsumer();
  if (consumer) applyResponseStateToConsumer(consumer);
}

export function showConsumerMessageDetails(_name: string, msgIdx: number) {
  consumersPanelState.update((state) => ({ ...state, selectedMessageIndex: msgIdx }));
  renderSelectedConsumer();
}

export function clearActiveConsumerHistory() {
  const consumer = currentConsumer();
  if (!consumer) return;
  messagesByConsumer[getStorageKey(consumer)] = [];
  consumersPanelState.update((state) => ({ ...state, selectedMessageIndex: -1 }));
  persistMessages();
  renderSelectedConsumer();
}

export async function copyCurrentConsumerAction() {
  const consumer = currentConsumer();
  if (!consumer) return;
  const publisherName = await browserWindow().mqbPrompt?.("Choose a name for the publisher.", "Copy Consumer to Publisher");
  if (!publisherName) return;
  const publishers = Array.isArray(activeConfig.publishers) ? activeConfig.publishers : (activeConfig.publishers = []);
  publishers.push({
    id: createLocalEntityId("publisher"),
    name: publisherName,
    endpoint: createPublisherEndpointFromConsumerEndpoint(consumer.endpoint),
    headers: [],
  } as PublisherConfig);
  browserWindow().refreshDirtySection?.("publishers");
  browserWindow().initPublishers?.(activeConfig as any, appShell.schema());
}

export function cloneCurrentConsumerAction() {}

export async function deleteCurrentConsumerAction() {}

export async function saveCurrentConsumerAction() {
  const consumer = currentConsumer();
  if (!consumer) return;
  await flushPendingFormDraft();
  const draft = formDrafts.get(get(consumersPanelState).selectedIndex);
  if (draft) {
    const normalizedDraft = normalizeConsumerConfig({ ...consumer, ...deepClone(draft) });
    normalizedDraft.output = consumer.output;
    normalizedDraft.message_capture = consumer.message_capture;
    normalizedDraft.response = consumer.response;
    const endpointType = getEndpointType(normalizedDraft.endpoint);
    if (endpointType === "static" || endpointType === "ref") {
      normalizedDraft.endpoint[endpointType] = normalizeScalarEndpointValue(endpointType, normalizedDraft.endpoint[endpointType]);
    }
    activeConfig.consumers[get(consumersPanelState).selectedIndex] = normalizedDraft;
  }
  const saved = await saveConsumersSection(activeConfig.consumers);
  if (saved) {
    await restoreConsumerStateFromView(get(consumersPanelState).selectedIndex, { tab: get(consumersPanelState).activeSubtab });
  }
  return saved;
}

export async function toggleActiveConsumer() {
  let consumer = currentConsumer();
  if (!consumer) return;
  const status = getConsumerStatus(consumer);
  const currentlyRunning = Boolean(status.running);
  consumersPanelState.update((state) => ({
    ...state,
    toggleBusy: true,
    toggleLabel: currentlyRunning ? "Stopping..." : "Starting...",
  }));
  try {
    let runtimeKey = getRuntimeKey(consumer);
    if (!currentlyRunning && hasUnsavedConsumers()) {
      const saved = await saveConsumersSection(activeConfig.consumers);
      if (saved && Array.isArray((saved as any).consumers)) {
        const rawSavedConsumer = (saved as any).consumers[get(consumersPanelState).selectedIndex];
        runtimeKey = rawSavedConsumer?.id ? String(rawSavedConsumer.id) : String(rawSavedConsumer?.name || runtimeKey);
        consumer = currentConsumer();
        if (!consumer) return;
        renderSelectedConsumer();
      }
    }
    const response = await fetch(`/${currentlyRunning ? "consumer-stop" : "consumer-start"}?consumer_id=${encodeURIComponent(runtimeKey)}`, { method: "POST" });
    if (!response.ok) {
      const message = await response.text();
      consumerErrorByKey[runtimeKey] = message;
      void browserWindow().mqbAlert?.(message);
      consumersPanelState.update((state) => ({
        ...state,
        liveStatusText: message,
        liveStatusVariant: "danger",
        toggleBusy: false,
        toggleLabel: currentlyRunning ? "Stop" : "Start",
      }));
      return;
    }
    delete consumerErrorByKey[runtimeKey];
    await browserWindow().pollRuntimeStatus?.();
    browserWindow().renderConsumersRuntimeStatus?.();
  } finally {
    consumersPanelState.update((state) => ({ ...state, toggleBusy: false }));
    renderSelectedConsumer();
  }
}

export async function importAsyncApiToConsumerAction(jsonText: string) {
  const imported = extractImportedRequests(jsonText);
  const existingNames = new Set(activeConfig.consumers.map((consumer) => consumer.name));
  for (const request of imported.requests) {
    const parsed = (() => {
      try {
        return new URL(String((request as any).url || "http://localhost/"));
      } catch {
        return new URL(`http://localhost${String((request as any).url || "/")}`);
      }
    })();
    const baseName = sanitizeConsumerName(String((request as any).name || "imported_consumer")).toLowerCase();
    let uniqueName = baseName;
    let index = 1;
    while (existingNames.has(uniqueName)) {
      uniqueName = `${baseName}_${index++}`;
    }
    existingNames.add(uniqueName);
    activeConfig.consumers.push(normalizeConsumerConfig({
      id: createLocalEntityId("consumer"),
      name: uniqueName,
      endpoint: {
        middlewares: [],
        http: { url: "0.0.0.0:8080", path: parsed.pathname || "/" },
      },
      response: null,
      output: { mode: "none" },
      message_capture: { ...DEFAULT_CAPTURE },
    } as ConsumerConfig));
  }
  renderSelectedConsumer();
}

export async function importMqbToConsumerAction(jsonText: string) {
  const parsed = JSON.parse(jsonText) as any;
  const importedConsumers = Array.isArray(parsed?.config?.consumers) ? parsed.config.consumers : [];
  const existingNames = new Set(activeConfig.consumers.map((consumer) => consumer.name));
  for (const raw of importedConsumers) {
    const next = normalizeConsumerConfig(raw as ConsumerConfig);
    const baseName = String(next.name || "consumer");
    let candidate = baseName;
    let index = 1;
    while (existingNames.has(candidate)) {
      candidate = `${baseName}_${index++}`;
    }
    next.name = candidate;
    existingNames.add(candidate);
    activeConfig.consumers.push(next);
  }
  renderSelectedConsumer();
}

export async function initConsumers(config: ConsumersAppConfig, schema: ConsumersSchemaRoot) {
  activeConfig = config;
  activeSchema = schema;
  messagesByConsumer = readStoredMessages();
  consumerErrorByKey = {};
  formDrafts = new Map();
  nextResponseHeaderId = 1;
  lastMessageSequenceByConsumer = {};
  activeConfig.consumers = (activeConfig.consumers || []).map(normalizeConsumerConfig);
  activeConfig.publishers = Array.isArray(activeConfig.publishers) ? activeConfig.publishers : [];
  const initialConsumersSnapshot = deepClone(activeConfig.consumers);
  if (!browserWindow()._mqb_saved_sections?.consumers) {
    await tick();
    browserWindow().markSectionSaved?.("consumers", initialConsumersSnapshot);
  }
  browserWindow().registerDirtySection?.("consumers", {
    buttonId: "workspace-save-button",
    getValue: () => activeConfig.consumers,
  });

  browserWindow().renderConsumersRuntimeStatus = () => {
    renderSelectedConsumer();
    void fetchNewMessagesForRunningConsumers().then(() => {
      renderSelectedConsumer();
    });
    scheduleMessagePolling();
  };
  browserWindow().restoreConsumerState = restoreConsumerStateFromView;

  const hashMatch = browserWindow().location.hash.match(/^#consumers:(\d+)$/);
  const selectedIndex = hashMatch ? Number(hashMatch[1]) : Math.min(getAppState().last_consumer_idx ?? 0, Math.max(activeConfig.consumers.length - 1, 0));
  consumersPanelState.update((state) => ({
    ...state,
    hasConsumers: activeConfig.consumers.length > 0,
    items: buildSidebarItems(),
    selectedIndex,
    selectedMessageIndex: -1,
    activeSubtab: "messages",
    messages: [],
  }));
  await restoreConsumerStateFromView(selectedIndex, { tab: getAppState().last_consumer_tab || "messages" });
  renderSelectedConsumer();
}
