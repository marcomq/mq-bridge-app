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
import type { MainTab } from "./lib/types";

function setActiveTab(name: MainTab) {
  activeMainTab.set(name);
  window._mqb_active_tab = name;
}

function initTabIfNeeded(name: MainTab) {
  if (name === "routes" && window.initRoutes && !window._mqb_routes_initialized) {
    window.initRoutes(window.appConfig, window.appSchema);
    window._mqb_routes_initialized = true;
  }
  if (name === "consumers" && window.initConsumers && !window._mqb_consumers_initialized) {
    window.initConsumers(window.appConfig, window.appSchema);
    window._mqb_consumers_initialized = true;
  }
  if (name === "publishers" && window.initPublishers && !window._mqb_publishers_initialized) {
    window.initPublishers(window.appConfig, window.appSchema);
    window._mqb_publishers_initialized = true;
  }
  if (name === "config" && !window._mqb_config_initialized) {
    initSettings(window.appConfig, window.appSchema);
    window._mqb_config_initialized = true;
  }
}

function restoreTabState(name: MainTab) {
  if (name === "routes") {
    const pending = window._mqb_pending_route_restore || null;
    window._mqb_pending_route_restore = null;
    const match = window.location.hash.match(/^#routes:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : 0);
    restoreRouteStateFromView(idx);
    return;
  }

  if (name === "consumers") {
    const pending = window._mqb_pending_consumer_restore || null;
    window._mqb_pending_consumer_restore = null;
    const match = window.location.hash.match(/^#consumers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : 0);
    restoreConsumerStateFromView(idx, { tab: pending?.tab });
    return;
  }

  if (name === "publishers") {
    const pending = window._mqb_pending_publisher_restore || null;
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
  const tracker = window._mqb_dirty_sections?.[sectionName];
  if (!tracker) return false;

  const button = document.getElementById(tracker.buttonId);
  if (!button) return false;

  const dirty = isDirty(tracker);
  button.dataset.dirty = dirty ? "true" : "false";
  syncSaveButtonLabel(button);
  return dirty;
}

function renderRuntimeStatus() {
  runtimeStatusStore.set(window._mqb_runtime_status || EMPTY_RUNTIME_STATUS);
}

const runtimeStatusPoller = createRuntimeStatusPoller({
  onStatus: (status) => {
    window._mqb_runtime_status = status;
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
  window._mqb_runtime_status = { ...EMPTY_RUNTIME_STATUS };
  window._mqb_dirty_sections = {};
  window._mqb_saved_sections = {};
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
      window._mqb_dirty_sections[sectionName],
      window._mqb_saved_sections,
    );
    window._mqb_dirty_sections[key] = tracker;
    refreshDirtySection(sectionName);
  };

  window.markSectionSaved = (sectionName, savedValue = undefined) => {
    const tracker = window._mqb_dirty_sections?.[sectionName];
    const nextSavedValue = savedValue === undefined ? tracker?.getValue?.() : savedValue;
    window._mqb_saved_sections[sectionName] = cloneSectionState(nextSavedValue);
    if (!tracker) return;

    tracker.baseline = JSON.stringify(window._mqb_saved_sections[sectionName]);
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
  window._mqb_saved_sections = {
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
    window._mqb_runtime_status.active_routes || [],
    config.default_tab,
  );
  switchMain(defaultTab);

  runtimeStatusPoller.stop();
  runtimeStatusPoller.start();
  window._mqb_runtime_poll_timer = 1;
}
