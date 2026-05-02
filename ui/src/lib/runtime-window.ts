export function appWindow() {
  return window;
}

export function currentHash() {
  return appWindow().location.hash;
}

export function replaceHash(nextHash: string) {
  appWindow().history.replaceState(null, "", nextHash);
}

export function onHashChange(listener: () => void) {
  appWindow().addEventListener("hashchange", listener);
}

export function clearLegacyPendingRestoreGlobals() {
  const w = appWindow() as any;
  w._mqb_pending_route_restore = null;
  w._mqb_pending_consumer_restore = null;
  w._mqb_pending_publisher_restore = null;
}

export type MqbState = {
  active_tab?: "publishers" | "consumers" | "routes" | "config";
  routes_initialized?: boolean;
  consumers_initialized?: boolean;
  publishers_initialized?: boolean;
  config_initialized?: boolean;
  pending_route_restore?: { idx: number } | null;
  pending_consumer_restore?: { idx: number; tab?: string } | null;
  pending_publisher_restore?: { idx: number; tab?: string } | null;
  last_route_idx?: number;
  last_consumer_idx?: number;
  last_publisher_idx?: number;
  runtime_status: {
    active_consumers: string[];
    active_routes: string[];
    route_throughput: Record<string, number>;
    consumers: Record<string, { running: boolean; status: { healthy: boolean; error?: string }; message_sequence: number }>;
  };
  dirty_sections: Record<string, { buttonId: string; getValue: () => unknown; baseline: string }>;
  saved_sections: Record<string, unknown>;
  runtime_poll_timer?: number;
  consumer_poll_timer?: number | null;
  consumer_poll_nonce?: number;
  form_mode?: string | null;
  cons_split?: unknown;
};

export function getMqbState(): MqbState {
  const w = appWindow() as any;
  if (!w.__mqb_state) {
    w.__mqb_state = {
      active_tab: w._mqb_active_tab,
      routes_initialized: w._mqb_routes_initialized ?? false,
      consumers_initialized: w._mqb_consumers_initialized ?? false,
      publishers_initialized: w._mqb_publishers_initialized ?? false,
      config_initialized: w._mqb_config_initialized ?? false,
      pending_route_restore: w._mqb_pending_route_restore ?? null,
      pending_consumer_restore: w._mqb_pending_consumer_restore ?? null,
      pending_publisher_restore: w._mqb_pending_publisher_restore ?? null,
      last_route_idx: Number.isFinite(w._mqb_last_route_idx) ? w._mqb_last_route_idx : 0,
      last_consumer_idx: Number.isFinite(w._mqb_last_consumer_idx) ? w._mqb_last_consumer_idx : 0,
      last_publisher_idx: Number.isFinite(w._mqb_last_publisher_idx) ? w._mqb_last_publisher_idx : 0,
      runtime_status: w._mqb_runtime_status ?? {
        active_consumers: [],
        active_routes: [],
        route_throughput: {},
        consumers: {},
      },
      dirty_sections: w._mqb_dirty_sections ?? {},
      saved_sections: w._mqb_saved_sections ?? {},
      runtime_poll_timer: w._mqb_runtime_poll_timer,
      consumer_poll_timer: w._mqb_consumer_poll_timer ?? null,
      consumer_poll_nonce: w._mqb_consumer_poll_nonce ?? 0,
      form_mode: w._mqb_form_mode ?? null,
      cons_split: w._consSplit,
    } as MqbState;
  }
  const state = w.__mqb_state as MqbState;

  // Keep migration compatibility with remaining legacy test/setup assignments.
  if (w._mqb_active_tab !== undefined) state.active_tab = w._mqb_active_tab;
  if (w._mqb_routes_initialized !== undefined) state.routes_initialized = w._mqb_routes_initialized;
  if (w._mqb_consumers_initialized !== undefined) state.consumers_initialized = w._mqb_consumers_initialized;
  if (w._mqb_publishers_initialized !== undefined) state.publishers_initialized = w._mqb_publishers_initialized;
  if (w._mqb_config_initialized !== undefined) state.config_initialized = w._mqb_config_initialized;
  if (w._mqb_pending_route_restore !== undefined) state.pending_route_restore = w._mqb_pending_route_restore;
  if (w._mqb_pending_consumer_restore !== undefined) state.pending_consumer_restore = w._mqb_pending_consumer_restore;
  if (w._mqb_pending_publisher_restore !== undefined) state.pending_publisher_restore = w._mqb_pending_publisher_restore;
  if (w._mqb_last_route_idx !== undefined) state.last_route_idx = w._mqb_last_route_idx;
  if (w._mqb_last_consumer_idx !== undefined) state.last_consumer_idx = w._mqb_last_consumer_idx;
  if (w._mqb_last_publisher_idx !== undefined) state.last_publisher_idx = w._mqb_last_publisher_idx;
  if (w._mqb_runtime_status !== undefined) state.runtime_status = w._mqb_runtime_status;
  if (w._mqb_dirty_sections !== undefined) state.dirty_sections = w._mqb_dirty_sections;
  if (w._mqb_saved_sections !== undefined) state.saved_sections = w._mqb_saved_sections;
  if (w._mqb_runtime_poll_timer !== undefined) state.runtime_poll_timer = w._mqb_runtime_poll_timer;
  if (w._mqb_consumer_poll_timer !== undefined) state.consumer_poll_timer = w._mqb_consumer_poll_timer;
  if (w._mqb_consumer_poll_nonce !== undefined) state.consumer_poll_nonce = w._mqb_consumer_poll_nonce;
  if (w._mqb_form_mode !== undefined) state.form_mode = w._mqb_form_mode;
  if (w._consSplit !== undefined) state.cons_split = w._consSplit;

  w._mqb_active_tab = state.active_tab;
  w._mqb_routes_initialized = state.routes_initialized;
  w._mqb_consumers_initialized = state.consumers_initialized;
  w._mqb_publishers_initialized = state.publishers_initialized;
  w._mqb_config_initialized = state.config_initialized;
  w._mqb_pending_route_restore = state.pending_route_restore;
  w._mqb_pending_consumer_restore = state.pending_consumer_restore;
  w._mqb_pending_publisher_restore = state.pending_publisher_restore;
  w._mqb_last_route_idx = state.last_route_idx;
  w._mqb_last_consumer_idx = state.last_consumer_idx;
  w._mqb_last_publisher_idx = state.last_publisher_idx;
  w._mqb_runtime_status = state.runtime_status;
  w._mqb_dirty_sections = state.dirty_sections;
  w._mqb_saved_sections = state.saved_sections;
  w._mqb_runtime_poll_timer = state.runtime_poll_timer;
  w._mqb_consumer_poll_timer = state.consumer_poll_timer;
  w._mqb_consumer_poll_nonce = state.consumer_poll_nonce;
  w._mqb_form_mode = state.form_mode;
  w._consSplit = state.cons_split;

  return state;
}

export const mqbDialogs = {
  alert(message: string, title?: string) {
    return title === undefined ? appWindow().mqbAlert(message) : appWindow().mqbAlert(message, title);
  },
  confirm(message: string, title?: string) {
    return title === undefined ? appWindow().mqbConfirm(message) : appWindow().mqbConfirm(message, title);
  },
  prompt(
    message: string,
    title?: string,
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      value?: string;
      placeholder?: string;
    },
  ) {
    if (title === undefined && options === undefined) return appWindow().mqbPrompt(message);
    if (options === undefined) return appWindow().mqbPrompt(message, title);
    return appWindow().mqbPrompt(message, title, options);
  },
  choose(
    message: string,
    title?: string,
    options?: {
      confirmLabel?: string;
      cancelLabel?: string;
      choices?: Array<{ value: string; label: string; description?: string }>;
    },
  ) {
    if (title === undefined && options === undefined) return appWindow().mqbChoose(message);
    if (options === undefined) return appWindow().mqbChoose(message, title);
    return appWindow().mqbChoose(message, title, options);
  },
};

export const mqbRuntime = {
  state() {
    return getMqbState();
  },
  refreshDirtySection(sectionName: string) {
    return appWindow().refreshDirtySection(sectionName);
  },
  registerDirtySection(sectionName: string, options: { buttonId: string; getValue: () => unknown }) {
    appWindow().registerDirtySection(sectionName, options);
  },
  markSectionSaved(sectionName: string, savedValue?: unknown) {
    appWindow().markSectionSaved(sectionName, savedValue);
  },
  saveConfigSection(sectionName: string, sectionValue: unknown, silent = false, button?: HTMLElement | null) {
    return appWindow().saveConfigSection(sectionName, sectionValue, silent, button);
  },
  fetchConfigFromServer<T>() {
    return appWindow().fetchConfigFromServer<T>();
  },
};

export const mqbApp = {
  config<T extends Record<string, any>>() {
    return appWindow().appConfig as T;
  },
  setConfig(value: Record<string, any>) {
    appWindow().appConfig = value;
  },
  schema<T extends Record<string, any>>() {
    return appWindow().appSchema as T;
  },
  setSchema(value: Record<string, any>) {
    appWindow().appSchema = value;
  },
  init: {
    routes(config: Record<string, any>, schema: Record<string, any>) {
      return appWindow().initRoutes?.(config, schema);
    },
    consumers(config: Record<string, any>, schema: Record<string, any>) {
      return appWindow().initConsumers?.(config, schema);
    },
    publishers(config: Record<string, any>, schema: Record<string, any>) {
      return appWindow().initPublishers?.(config, schema);
    },
  },
  restore: {
    route(idx: number) {
      appWindow().restoreRouteState?.(idx);
    },
    consumer(idx: number, options?: { tab?: string }) {
      appWindow().restoreConsumerState?.(idx, options);
    },
    publisher(idx: number, options?: { tab?: string }) {
      appWindow().restorePublisherState?.(idx, options);
    },
  },
  split() {
    return appWindow().Split;
  },
  forms() {
    return appWindow().VanillaSchemaForms;
  },
  isDesktop() {
    return Boolean(appWindow().__MQB_DESKTOP__);
  },
};
