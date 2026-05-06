import { writable } from "svelte/store";
import type { MainTab, RuntimeStatus } from "./runtime-status";
import { EMPTY_RUNTIME_STATUS } from "./runtime-status";

export const activeMainTab = writable<MainTab>("publishers");
export const runtimeStatusStore = writable<RuntimeStatus>(EMPTY_RUNTIME_STATUS);

export interface RouteSidebarItem {
  name: string;
  inputProto: string;
  outputProto: string;
  isDisabled: boolean;
  showMetrics: boolean;
  throughputLabel: string;
  originalIndex: number;
}

export interface RoutesPanelState {
  hasRoutes: boolean;
  items: RouteSidebarItem[];
  selectedIndex: number;
  currentRouteName: string;
  toggleVisible: boolean;
  toggleLabel: string;
  toggleVariant: "danger" | "success";
  toggleAppearance: "outlined" | "filled";
}

export const routesPanelState = writable<RoutesPanelState>({
  hasRoutes: false,
  items: [],
  selectedIndex: 0,
  currentRouteName: "",
  toggleVisible: false,
  toggleLabel: "Disable",
  toggleVariant: "danger",
  toggleAppearance: "outlined",
});

export interface ConsumerSidebarItem {
  name: string;
  inputProto: string;
  statusClass: string;
  messageCount: number;
  throughputLabel: string;
  originalIndex: number;
}

export interface ConsumerLogItem {
  timeLabel: string;
  payloadPreview: string;
  messageIndex: number;
  selected: boolean;
}

export interface ConsumersPanelState {
  hasConsumers: boolean;
  currentConsumerName: string | null;
  items: ConsumerSidebarItem[];
  selectedIndex: number;
  activeSubtab: "definition" | "response" | "messages";
  messageCaptureEnabled: boolean;
  messageCaptureKeepLast: number;
  responseEnabled: boolean;
  outputMode: "none" | "publisher" | "response";
  publisherOptions: string[];
  selectedPublisher: string;
  responseSupported: boolean;
  responseHeaders: Array<{ id: number; key: string; value: string; enabled: boolean }>;
  responsePayload: string;
  liveStatusText: string;
  liveStatusVariant: "success" | "danger" | "neutral";
  toggleLabel: string;
  toggleVariant: "success" | "danger" | "neutral";
  toggleBusy: boolean;
  messages: ConsumerLogItem[];
  detailInfo: string;
  detailPayload: string;
  detailMetadata: Array<[string, string]>;
}

export const consumersPanelState = writable<ConsumersPanelState>({
  hasConsumers: false,
  currentConsumerName: null,
  items: [],
  selectedIndex: 0,
  activeSubtab: "messages",
  messageCaptureEnabled: true,
  messageCaptureKeepLast: 100,
  responseEnabled: false,
  outputMode: "none",
  publisherOptions: [],
  selectedPublisher: "",
  responseSupported: false,
  responseHeaders: [],
  responsePayload: "",
  liveStatusText: "Consumer Stopped",
  liveStatusVariant: "neutral",
  toggleLabel: "Start",
  toggleVariant: "success",
  toggleBusy: false,
  messages: [],
  detailInfo: "Select a message to view details",
  detailPayload: "",
  detailMetadata: [],
});

export interface PublisherSidebarItem {
  name: string;
  endpointType: string;
  originalIndex: number;
}

export interface PublisherHistoryRow {
  historyIndex: number;
  timeLabel: string;
  statusLabel: string;
  statusClass: string;
  payloadPreview: string;
  pinned: boolean;
}

export interface PublisherPresetRow {
  presetIndex: number;
  name: string;
  method: string;
  url: string;
  bodyPreview: string;
}

export interface PublisherRequestFieldState {
  label: string;
  placeholder: string;
  value: string;
  visible: boolean;
}

export interface PublisherHeaderRow {
  id: number;
  key: string;
  value: string;
  enabled: boolean;
}

export interface PublishersPanelState {
  hasPublishers: boolean;
  items: PublisherSidebarItem[];
  selectedIndex: number;
  activeSubtab: "payload" | "headers" | "history" | "presets" | "definition";
  endpointType: string;
  methodVisible: boolean;
  methodValue: string;
  extraFieldOne: PublisherRequestFieldState;
  extraFieldTwo: PublisherRequestFieldState;
  urlField: PublisherRequestFieldState;
  requestPayload: string;
  metadataRows: PublisherHeaderRow[];
  responseVisible: boolean;
  responseTabLabel: string;
  responseStatusLabel: string;
  responseStatusText: string;
  responseStatusColor: string;
  responseDurationLabel: string;
  responseSizeLabel: string;
  requestRows: Array<[string, string]>;
  requestHeaders: Array<[string, string]>;
  responseHeaders: Array<[string, string]>;
  responsePayload: string;
  historyRows: PublisherHistoryRow[];
  presetRows: PublisherPresetRow[];
}

export const publishersPanelState = writable<PublishersPanelState>({
  hasPublishers: false,
  items: [],
  selectedIndex: 0,
  activeSubtab: "payload",
  endpointType: "",
  methodVisible: false,
  methodValue: "POST",
  extraFieldOne: { label: "Target", placeholder: "", value: "", visible: false },
  extraFieldTwo: { label: "Target", placeholder: "", value: "", visible: false },
  urlField: { label: "URL", placeholder: "", value: "", visible: true },
  requestPayload: "",
  metadataRows: [],
  responseVisible: true,
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
  historyRows: [],
  presetRows: [],
});
