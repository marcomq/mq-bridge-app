import { activeMainTab, runtimeStatusStore } from "./lib/stores";
import { createDirtyTracker, cloneSectionState, isDirty } from "./lib/dirty-state";
import { saveWholeConfig, saveConfigSection as persistConfigSection, fetchConfigFromServer } from "./lib/config-api";
import { initConsumers, restoreConsumerStateFromView } from "./lib/consumers-view";
import { initPublishers, restorePublisherStateFromView } from "./lib/publishers-view";
import { EMPTY_RUNTIME_STATUS, createRuntimeStatusPoller } from "./lib/runtime-status";
import { nextHashForTab, pickDefaultTab, resolveTabFromHash } from "./lib/routing";
import { initRoutes, restoreRouteStateFromView } from "./lib/routes-view";
import { initSettings } from "./lib/settings";
import { installDialogs } from "./lib/dialogs";
import { getMqbState } from "./lib/runtime-window";
import type { MainTab } from "./lib/runtime-status";

function setActiveTab(name: MainTab) {
  activeMainTab.set(name);
  getMqbState().active_tab = name;
}

function initTabIfNeeded(name: MainTab) {
  const state = getMqbState();
  if (name === "routes" && window.initRoutes && !state.routes_initialized) {
    window.initRoutes(window.appConfig, window.appSchema);
    state.routes_initialized = true;
  }
  if (name === "consumers" && window.initConsumers && !state.consumers_initialized) {
    window.initConsumers(window.appConfig, window.appSchema);
    state.consumers_initialized = true;
  }
  if (name === "publishers" && window.initPublishers && !state.publishers_initialized) {
    window.initPublishers(window.appConfig, window.appSchema);
    state.publishers_initialized = true;
  }
  if (name === "config" && !state.config_initialized) {
    initSettings(window.appConfig, window.appSchema);
    state.config_initialized = true;
  }
}

function restoreTabState(name: MainTab) {
  const state = getMqbState();
  if (name === "routes") {
    const pending = state.pending_route_restore || null;
    state.pending_route_restore = null;
    window._mqb_pending_route_restore = null;
    const match = window.location.hash.match(/^#routes:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : 0);
    restoreRouteStateFromView(idx);
    return;
  }

  if (name === "consumers") {
    const pending = state.pending_consumer_restore || null;
    state.pending_consumer_restore = null;
    window._mqb_pending_consumer_restore = null;
    const match = window.location.hash.match(/^#consumers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : 0);
    restoreConsumerStateFromView(idx, { tab: pending?.tab });
    return;
  }

  if (name === "publishers") {
    const pending = state.pending_publisher_restore || null;
    state.pending_publisher_restore = null;
    window._mqb_pending_publisher_restore = null;
    const match = window.location.hash.match(/^#publishers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : 0);
    restorePublisherStateFromView(idx, { tab: pending?.tab });
  }
}

export function switchMain(name: MainTab) {
  setActiveTab(name);
  initTabIfNeeded(name);
  restoreTabState(name);
  history.replaceState(null, "", nextHashForTab(window.location.hash, name));
}

function showJsonModal() {
  const output = document.getElementById("json-output");
  const dialog = document.getElementById("jsonPreviewModal") as { open?: boolean } | null;
  if (output) {
    output.textContent = JSON.stringify(window.appConfig, null, 2);
  }
  if (dialog) {
    dialog.open = true;
  }
}

function syncSaveButtonLabel(button: HTMLElement | null) {
  if (!button) return;
  const baseLabel =
    button.dataset.baseLabel || button.textContent?.trim() || "Save";
  button.dataset.baseLabel = baseLabel;

  if (button.dataset.saving === "true") return;

  const dirty = button.dataset.dirty === "true";
  button.textContent = dirty ? `${baseLabel} *` : baseLabel;
  button.title = dirty ? "Unsaved changes" : "";
  button.classList.toggle("is-dirty", dirty);
}

function refreshDirtySection(sectionName: string): boolean {
  const tracker = getMqbState().dirty_sections?.[sectionName];
  if (!tracker) return false;

  const button = document.getElementById(tracker.buttonId);
  if (!button) return false;

  const dirty = isDirty(tracker);
  button.dataset.dirty = dirty ? "true" : "false";
  syncSaveButtonLabel(button);
  return dirty;
}

function renderRuntimeStatus() {
  runtimeStatusStore.set(getMqbState().runtime_status || EMPTY_RUNTIME_STATUS);
}

const runtimeStatusPoller = createRuntimeStatusPoller({
  onStatus: (status) => {
    getMqbState().runtime_status = status;
    renderRuntimeStatus();
    if (window.renderRoutesRuntimeMetrics) {
      window.renderRoutesRuntimeMetrics();
    }
  },
});

async function runSaveButtonAction<T>(button: any, action: () => Promise<T>): Promise<T | null> {
  const originalLabel = button?.dataset?.baseLabel || button?.textContent?.trim() || "Save";
  const originalDisabled = button?.disabled;
  const originalLoading = button?.loading;

  if (button) {
    button.dataset.baseLabel = originalLabel;
    button.dataset.saving = "true";
    button.disabled = true;
    if ("loading" in button) button.loading = true;
    button.textContent = "Saving...";
  }

  try {
    const result = await action();

    if (button) {
      if ("loading" in button) button.loading = false;
      button.textContent = "Saved";
      window.setTimeout(() => {
        button.dataset.saving = "false";
        button.disabled = originalDisabled ?? false;
        if ("loading" in button) button.loading = originalLoading ?? false;
        syncSaveButtonLabel(button);
      }, 1200);
    }

    return result;
  } catch (error) {
    if (button) {
      button.dataset.saving = "false";
      if ("loading" in button) button.loading = false;
      button.disabled = originalDisabled ?? false;
      syncSaveButtonLabel(button);
    }
    await window.mqbAlert(`Error saving: ${(error as Error).message}`);
    return null;
  }
}

function installGlobals() {
  installDialogs();
  const state = getMqbState();
  state.runtime_status = { ...EMPTY_RUNTIME_STATUS };
  state.dirty_sections = {};
  state.saved_sections = {};
  window.switchMain = switchMain;
  window.initRoutes = initRoutes;
  window.initConsumers = initConsumers;
  window.initPublishers = initPublishers;
  window.showJsonModal = showJsonModal;
  window.syncSaveButtonLabel = syncSaveButtonLabel;
  window.refreshDirtySection = refreshDirtySection;
  window.renderRuntimeStatus = renderRuntimeStatus;
  window.pollRuntimeStatus = () => runtimeStatusPoller.poll();
  window.runSaveButtonAction = runSaveButtonAction;
  window.fetchConfigFromServer = <T>() => fetchConfigFromServer<T>(fetch);

  window.registerDirtySection = (sectionName, options) => {
    if (!sectionName || !options?.buttonId || typeof options.getValue !== "function") return;
    const [key, tracker] = createDirtyTracker(
      sectionName,
      options.buttonId,
      options.getValue,
      state.dirty_sections[sectionName],
      state.saved_sections,
    );
    state.dirty_sections[key] = tracker;
    refreshDirtySection(sectionName);
  };

  window.markSectionSaved = (sectionName, savedValue = undefined) => {
    const tracker = state.dirty_sections?.[sectionName];
    const nextSavedValue = savedValue === undefined ? tracker?.getValue?.() : savedValue;
    state.saved_sections[sectionName] = cloneSectionState(nextSavedValue);
    if (!tracker) return;

    tracker.baseline = JSON.stringify(state.saved_sections[sectionName]);
    refreshDirtySection(sectionName);
  };

  window.saveConfig = async (silent = false, button = null) => {
    const doSave = async () => {
      const refreshedConfig = await saveWholeConfig(fetch, window.appConfig);
      Object.assign(window.appConfig, refreshedConfig);
      window.markSectionSaved("config", window.appConfig);
      return true;
    };

    if (button) {
      return Boolean(await runSaveButtonAction(button, doSave));
    }

    try {
      return await doSave();
    } catch (error) {
      if (!silent) {
        await window.mqbAlert(`Error saving: ${(error as Error).message}`);
      }
      return false;
    }
  };

  window.saveConfigSection = async (sectionName, sectionValue, silent = false, button = null) => {
    const doSave = async () => {
      const appConfig = window.appConfig as Record<string, unknown>;
      const refreshedConfig = await persistConfigSection<Record<string, unknown>, string>(
        fetch,
        sectionName,
        sectionValue,
      );
      appConfig[sectionName] = (refreshedConfig as Record<string, unknown>)[sectionName];
      window.markSectionSaved(sectionName, (refreshedConfig as Record<string, unknown>)[sectionName]);
      return refreshedConfig;
    };

    if (button) {
      return await runSaveButtonAction(button, doSave);
    }

    try {
      return await doSave();
    } catch (error) {
      if (!silent) {
        await window.mqbAlert(`Error saving: ${(error as Error).message}`);
      }
      return null;
    }
  };
}

export async function bootstrapApp() {
  installGlobals();

  const [config, schema] = await Promise.all([
    fetchConfigFromServer<Record<string, any>>(fetch),
    fetch("/schema.json").then((response) => response.json()),
  ]);

  if (window.__MQB_DESKTOP__) {
    delete config.extract_secrets;
    if (schema?.properties) {
      delete schema.properties.extract_secrets;
    }
  }

  window.appConfig = config;
  window.appSchema = schema;
  const state = getMqbState();
  state.saved_sections = {
    routes: cloneSectionState(config.routes),
    consumers: cloneSectionState(config.consumers),
    publishers: cloneSectionState(config.publishers),
    config: cloneSectionState(config),
  };

  window.addEventListener("hashchange", () => {
    const targetTab = resolveTabFromHash(window.location.hash);
    if (targetTab) {
      switchMain(targetTab);
    }
  });

  renderRuntimeStatus();
  await runtimeStatusPoller.poll();

  const defaultTab = pickDefaultTab(
    window.location.hash,
    state.runtime_status.active_routes || [],
    config.default_tab,
  );
  switchMain(defaultTab);

  runtimeStatusPoller.stop();
  runtimeStatusPoller.start();
  state.runtime_poll_timer = 1;
}
