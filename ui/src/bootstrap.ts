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
import {
  appWindow,
  clearLegacyPendingRestoreGlobals,
  currentHash,
  getMqbState,
  mqbApp,
  mqbDialogs,
  onHashChange,
  replaceHash,
} from "./lib/runtime-window";
import type { MainTab } from "./lib/runtime-status";

function setActiveTab(name: MainTab) {
  activeMainTab.set(name);
  getMqbState().active_tab = name;
}

function initTabIfNeeded(name: MainTab) {
  const state = getMqbState();
  if (name === "routes" && !state.routes_initialized) {
    mqbApp.init.routes(mqbApp.config(), mqbApp.schema());
    state.routes_initialized = true;
  }
  if (name === "consumers" && !state.consumers_initialized) {
    mqbApp.init.consumers(mqbApp.config(), mqbApp.schema());
    state.consumers_initialized = true;
  }
  if (name === "publishers" && !state.publishers_initialized) {
    mqbApp.init.publishers(mqbApp.config(), mqbApp.schema());
    state.publishers_initialized = true;
  }
  if (name === "config" && !state.config_initialized) {
    initSettings(mqbApp.config(), mqbApp.schema());
    state.config_initialized = true;
  }
}

function restoreTabState(name: MainTab) {
  const state = getMqbState();
  if (name === "routes") {
    const pending = state.pending_route_restore || null;
    state.pending_route_restore = null;
    clearLegacyPendingRestoreGlobals();
    const match = currentHash().match(/^#routes:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : (state.last_route_idx ?? 0));
    state.last_route_idx = idx;
    restoreRouteStateFromView(idx);
    return;
  }

  if (name === "consumers") {
    const pending = state.pending_consumer_restore || null;
    state.pending_consumer_restore = null;
    clearLegacyPendingRestoreGlobals();
    const match = currentHash().match(/^#consumers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : (state.last_consumer_idx ?? 0));
    state.last_consumer_idx = idx;
    restoreConsumerStateFromView(idx, { tab: pending?.tab });
    return;
  }

  if (name === "publishers") {
    const pending = state.pending_publisher_restore || null;
    state.pending_publisher_restore = null;
    clearLegacyPendingRestoreGlobals();
    const match = currentHash().match(/^#publishers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : (state.last_publisher_idx ?? 0));
    state.last_publisher_idx = idx;
    restorePublisherStateFromView(idx, { tab: pending?.tab });
  }
}

export function switchMain(name: MainTab) {
  setActiveTab(name);
  initTabIfNeeded(name);
  restoreTabState(name);
  replaceHash(nextHashForTab(currentHash(), name));
}

function showJsonModal() {
  const output = document.getElementById("json-output");
  const dialog = document.getElementById("jsonPreviewModal") as { open?: boolean } | null;
  if (output) {
    output.textContent = JSON.stringify(mqbApp.config(), null, 2);
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

function renderRuntimeStatus(status?: typeof EMPTY_RUNTIME_STATUS) {
  runtimeStatusStore.set(status || getMqbState().runtime_status || EMPTY_RUNTIME_STATUS);
}

const runtimeStatusPoller = createRuntimeStatusPoller({
  onStatus: (status) => {
    // Keep window/global mirror in sync first so a subsequent getMqbState() call
    // cannot resurrect a stale idle snapshot from legacy globals.
    (appWindow() as unknown as { _mqb_runtime_status?: typeof status })._mqb_runtime_status = status;
    getMqbState().runtime_status = status;
    renderRuntimeStatus(status);
    if (appWindow().renderRoutesRuntimeMetrics) {
      appWindow().renderRoutesRuntimeMetrics();
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
      appWindow().setTimeout(() => {
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
    await mqbDialogs.alert(`Error saving: ${(error as Error).message}`);
    return null;
  }
}

function installGlobals() {
  installDialogs();
  const state = getMqbState();
  state.runtime_status = { ...EMPTY_RUNTIME_STATUS };
  state.dirty_sections = {};
  state.saved_sections = {};
  appWindow().switchMain = switchMain;
  appWindow().initRoutes = initRoutes;
  appWindow().initConsumers = initConsumers;
  appWindow().initPublishers = initPublishers;
  appWindow().showJsonModal = showJsonModal;
  appWindow().syncSaveButtonLabel = syncSaveButtonLabel;
  appWindow().refreshDirtySection = refreshDirtySection;
  appWindow().renderRuntimeStatus = renderRuntimeStatus;
  appWindow().pollRuntimeStatus = () => runtimeStatusPoller.poll();
  appWindow().runSaveButtonAction = runSaveButtonAction;
  appWindow().fetchConfigFromServer = <T>() => fetchConfigFromServer<T>(fetch);

  appWindow().registerDirtySection = (sectionName, options) => {
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

  appWindow().markSectionSaved = (sectionName, savedValue = undefined) => {
    const tracker = state.dirty_sections?.[sectionName];
    const nextSavedValue = savedValue === undefined ? tracker?.getValue?.() : savedValue;
    state.saved_sections[sectionName] = cloneSectionState(nextSavedValue);
    if (!tracker) return;

    tracker.baseline = JSON.stringify(state.saved_sections[sectionName]);
    refreshDirtySection(sectionName);
  };

  appWindow().saveConfig = async (silent = false, button = null) => {
    const doSave = async () => {
      const appConfig = mqbApp.config<Record<string, unknown>>();
      const refreshedConfig = await saveWholeConfig(fetch, appConfig);
      Object.assign(appConfig, refreshedConfig);
      appWindow().markSectionSaved("config", appConfig);
      return true;
    };

    if (button) {
      return Boolean(await runSaveButtonAction(button, doSave));
    }

    try {
      return await doSave();
    } catch (error) {
      if (!silent) {
        await mqbDialogs.alert(`Error saving: ${(error as Error).message}`);
      }
      return false;
    }
  };

  appWindow().saveConfigSection = async (sectionName, sectionValue, silent = false, button = null) => {
    const doSave = async () => {
      const appConfig = mqbApp.config<Record<string, unknown>>();
      const refreshedConfig = await persistConfigSection<Record<string, unknown>, string>(
        fetch,
        sectionName,
        sectionValue,
      );
      appConfig[sectionName] = (refreshedConfig as Record<string, unknown>)[sectionName];
      appWindow().markSectionSaved(sectionName, (refreshedConfig as Record<string, unknown>)[sectionName]);
      return refreshedConfig;
    };

    if (button) {
      return await runSaveButtonAction(button, doSave);
    }

    try {
      return await doSave();
    } catch (error) {
      if (!silent) {
        await mqbDialogs.alert(`Error saving: ${(error as Error).message}`);
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

  if (mqbApp.isDesktop()) {
    delete config.extract_secrets;
    if (schema?.properties) {
      delete schema.properties.extract_secrets;
    }
  }

  mqbApp.setConfig(config);
  mqbApp.setSchema(schema);
  const state = getMqbState();
  state.saved_sections = {
    routes: cloneSectionState(config.routes),
    consumers: cloneSectionState(config.consumers),
    publishers: cloneSectionState(config.publishers),
    config: cloneSectionState(config),
  };

  onHashChange(() => {
    const targetTab = resolveTabFromHash(currentHash());
    if (targetTab) {
      switchMain(targetTab);
    }
  });

  renderRuntimeStatus();
  await runtimeStatusPoller.poll();

  const defaultTab = pickDefaultTab(
    currentHash(),
    state.runtime_status.active_routes || [],
    config.default_tab,
  );
  switchMain(defaultTab);

  runtimeStatusPoller.stop();
  runtimeStatusPoller.start();
  state.runtime_poll_timer = 1;
}
