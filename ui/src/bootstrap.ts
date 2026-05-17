import {
  activeMainTab,
  runtimeStatusStore,
  storageSecurityStore,
  workspaceDirtyStore,
  workspaceSavingStore,
} from "./lib/stores";
import { createDirtyTracker, cloneSectionState, isDirty, serializeSectionState } from "./lib/dirty-state";
import {
  saveWholeConfig,
  saveConfigSection as persistConfigSection,
  fetchConfigFromServer,
  fetchConfigRecoveryFromServer,
  fetchStorageSecurityFromServer,
  postResetConfigRecovery,
} from "./lib/config-api";
import { initConsumers, restoreConsumerStateFromView } from "./lib/consumers-view";
import { initPublishers, restorePublisherStateFromView } from "./lib/publishers-view";
import { EMPTY_RUNTIME_STATUS, createRuntimeStatusPoller } from "./lib/runtime-status";
import { nextHashForTab, pickDefaultTab, resolveTabFromHash } from "./lib/routing";
import { extractSettingsConfig, initSettings } from "./lib/settings";
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
import { EMPTY_STORAGE_SECURITY, normalizeStorageSecurityInfo } from "./lib/storage-security";
import { getStoredJson } from "./lib/encrypted-json-storage";

type ConfigRecoveryStatus = {
  mode?: string;
  reason?: string;
  message?: string;
  detail?: string;
} | null;

function replaceLiveConfig<T extends Record<string, unknown>>(appConfig: T, refreshedConfig: T | null | undefined) {
  if (!refreshedConfig) return;
  Object.keys(appConfig).forEach((key) => {
    delete appConfig[key];
  });
  Object.assign(appConfig, refreshedConfig);
}

async function maybeHandleConfigRecovery(fetchImpl: typeof fetch): Promise<void> {
  const recovery = await fetchConfigRecoveryFromServer<ConfigRecoveryStatus>(fetchImpl).catch(() => null);
  if (!recovery?.message) {
    return;
  }

  const choice = await mqbDialogs.choose(
    `${recovery.message}${recovery.detail ? `\n\n${recovery.detail}` : ""}`,
    "Encrypted Config Recovery",
    {
      confirmLabel: "Continue",
      cancelLabel: "Close",
      choices: [
        {
          value: "continue",
          label: "Continue",
          description: "Open the app with a temporary empty config for now.",
        },
        {
          value: "reset",
          label: "Reset Config",
          description: "Back up the unreadable config and replace it with a fresh default config.",
        },
      ],
    },
  );

  if (choice === "reset") {
    while (true) {
      try {
        const result = await postResetConfigRecovery<{ backup_path?: string }>(fetchImpl);
        await mqbDialogs.alert(
          result?.backup_path
            ? `The unreadable config was backed up to:\n${result.backup_path}`
            : "The unreadable config was reset.",
          "Encrypted Config Reset",
        );
        break;
      } catch (error) {
        console.error("Failed to reset encrypted config recovery state", error);
        const retry = await mqbDialogs.confirm(
          `Resetting the unreadable config failed: ${(error as Error).message}\n\nTry again?`,
          "Encrypted Config Reset Failed",
        );
        if (!retry) {
          break;
        }
      }
    }
  }
}

function setActiveTab(name: MainTab) {
  activeMainTab.set(name);
  getMqbState().active_tab = name;
}

function rememberedIndexForTab(name: MainTab): number | undefined {
  const state = getMqbState();
  if (name === "consumers") return state.last_consumer_idx ?? 0;
  if (name === "publishers") return state.last_publisher_idx ?? 0;
  return undefined;
}

function rememberSelectionFromHash(hash: string) {
  const state = getMqbState();
  const publisherMatch = hash.match(/^#publishers:(\d+)$/);
  const consumerMatch = hash.match(/^#consumers:(\d+)$/);

  if (publisherMatch) {
    state.last_publisher_idx = parseInt(publisherMatch[1], 10);
  }
  if (consumerMatch) {
    state.last_consumer_idx = parseInt(consumerMatch[1], 10);
  }
}

async function initTabIfNeeded(name: MainTab) {
  const state = getMqbState();
  const win = appWindow() as any;
  if (name === "consumers" && !state.consumers_initialized) {
    await mqbApp.init.consumers(mqbApp.config(), mqbApp.schema());
    state.consumers_initialized = true;
    win._mqb_consumers_initialized = true;
  }
  if (name === "publishers" && !state.publishers_initialized) {
    await mqbApp.init.publishers(mqbApp.config(), mqbApp.schema());
    state.publishers_initialized = true;
    win._mqb_publishers_initialized = true;
  }
  if (name === "config" && !state.config_initialized) {
    await initSettings(mqbApp.config(), mqbApp.schema());
    state.config_initialized = true;
    win._mqb_config_initialized = true;
  }
}

async function restoreTabState(name: MainTab) {
  const state = getMqbState();
  if (name === "consumers") {
    const pending = state.pending_consumer_restore || null;
    state.pending_consumer_restore = null;
    clearLegacyPendingRestoreGlobals();
    const match = currentHash().match(/^#consumers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : (state.last_consumer_idx ?? 0));
    state.last_consumer_idx = idx;
    await restoreConsumerStateFromView(idx, { tab: pending?.tab ?? state.last_consumer_tab });
    return;
  }

  if (name === "publishers") {
    const pending = state.pending_publisher_restore || null;
    state.pending_publisher_restore = null;
    clearLegacyPendingRestoreGlobals();
    const match = currentHash().match(/^#publishers:(\d+)$/);
    const idx = pending?.idx ?? (match ? parseInt(match[1], 10) : (state.last_publisher_idx ?? 0));
    state.last_publisher_idx = idx;
    await restorePublisherStateFromView(idx, { tab: pending?.tab ?? state.last_publisher_tab });
  }
}

export async function switchMain(name: MainTab) {
  rememberSelectionFromHash(currentHash());
  setActiveTab(name);
  await initTabIfNeeded(name);
  await restoreTabState(name);
  replaceHash(nextHashForTab(currentHash(), name, rememberedIndexForTab(name)));
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
  const baseLabel = button.dataset.baseLabel || button.textContent?.trim() || "Save";
  button.dataset.baseLabel = baseLabel;

  if (button.dataset.saving === "true") return;

  const dirty = button.dataset.dirty === "true";
  if (button.dataset.iconOnly !== "true") {
    button.textContent = dirty ? `${baseLabel} *` : baseLabel;
  }
  button.classList.toggle("is-dirty", dirty);
}

function computeWorkspaceDirty(): boolean {
  return Object.values(getMqbState().dirty_sections || {}).some((tracker) => isDirty(tracker));
}

function renderWorkspaceDirty() {
  const dirty = computeWorkspaceDirty();
  workspaceDirtyStore?.set(dirty);
  const saveButton = document.getElementById("workspace-save-button");
  if (saveButton) {
    saveButton.dataset.dirty = dirty ? "true" : "false";
    syncSaveButtonLabel(saveButton);
  }
  return dirty;
}

function syncAllDirtyBaselinesToCurrentState() {
  const state = getMqbState();
  for (const [sectionName, tracker] of Object.entries(state.dirty_sections || {})) {
    const currentValue = tracker.getValue();
    state.saved_sections[sectionName] = cloneSectionState(currentValue);
    tracker.baseline = serializeSectionState(currentValue);
    refreshDirtySection(sectionName);
  }
}

function refreshDirtySection(sectionName: string): boolean {
  const tracker = getMqbState().dirty_sections?.[sectionName];
  if (!tracker) return false;

  const dirty = isDirty(tracker);
  const button = document.getElementById(tracker.buttonId);
  if (button) {
    button.dataset.dirty = dirty ? "true" : "false";
    syncSaveButtonLabel(button);
  }
  renderWorkspaceDirty();
  return dirty;
}

function renderRuntimeStatus(status?: typeof EMPTY_RUNTIME_STATUS) {
  runtimeStatusStore.set(status || getMqbState().runtime_status || EMPTY_RUNTIME_STATUS);
}

function warnMissingRuntimeRenderer(
  name: "renderRoutesRuntimeMetrics" | "renderConsumersRuntimeStatus",
) {
  console.warn(`[mqb] Missing runtime renderer: ${name}`);
}

function renderStorageSecurity() {
  storageSecurityStore.set(getMqbState().storage_security || { ...EMPTY_STORAGE_SECURITY });
}

async function replaceConfigFromSave(appConfig: Record<string, unknown>) {
  const refreshedConfig = await saveWholeConfig(fetch, appConfig);
  const refreshedStorageSecurity = await fetchStorageSecurityFromServer(fetch).catch(() => null);
  replaceLiveConfig(appConfig, refreshedConfig);
  if (refreshedStorageSecurity) {
    const normalizedStorageSecurity = normalizeStorageSecurityInfo(refreshedStorageSecurity);
    const state = getMqbState();
    state.storage_security = normalizedStorageSecurity;
    (appWindow() as any)._mqb_storage_security = normalizedStorageSecurity;
    renderStorageSecurity();
  }
  return refreshedConfig;
}

async function runSaveAction<T>(
  button: HTMLElement | null,
  silent: boolean,
  action: () => Promise<T>,
  options: { trackWorkspaceSaving?: boolean } = {},
): Promise<T | null> {
  if (button) {
    return await runSaveButtonAction(button, action);
  }

  try {
    if (options.trackWorkspaceSaving) workspaceSavingStore?.set(true);
    return await action();
  } catch (error) {
    if (!silent) {
      await mqbDialogs.alert(`Error saving: ${(error as Error).message}`);
    }
    return null;
  } finally {
    if (options.trackWorkspaceSaving) workspaceSavingStore?.set(false);
  }
}

const runtimeStatusPoller = createRuntimeStatusPoller({
  onStatus: (status) => {
    // Keep window/global mirror in sync first so a subsequent getMqbState() call
    // cannot resurrect a stale idle snapshot from legacy globals.
    (appWindow() as unknown as { _mqb_runtime_status?: typeof status })._mqb_runtime_status = status;
    getMqbState().runtime_status = status;
    renderRuntimeStatus(status);
    const windowRef = appWindow();
    if (typeof windowRef.renderRoutesRuntimeMetrics === "function") {
      windowRef.renderRoutesRuntimeMetrics();
    } else {
      warnMissingRuntimeRenderer("renderRoutesRuntimeMetrics");
    }
    if (typeof windowRef.renderConsumersRuntimeStatus === "function") {
      windowRef.renderConsumersRuntimeStatus();
    } else {
      warnMissingRuntimeRenderer("renderConsumersRuntimeStatus");
    }
  },
});

async function runSaveButtonAction<T>(button: any, action: () => Promise<T>): Promise<T | null> {
  workspaceSavingStore?.set(true);
  const originalLabel = button?.dataset?.baseLabel || button?.textContent?.trim() || "Save";
  const originalDisabled = button?.disabled;
  const originalLoading = button?.loading;
  const iconOnly = button?.dataset?.iconOnly === "true";

  if (button) {
    button.dataset.baseLabel = originalLabel;
    button.dataset.saving = "true";
    button.disabled = true;
    if ("loading" in button) button.loading = true;
    if (!iconOnly) {
      button.textContent = "Saving...";
    }
  }

  try {
    const result = await action();

    if (button) {
      if ("loading" in button) button.loading = false;
      if (!iconOnly) {
        button.textContent = "Saved";
      }
      appWindow().setTimeout(() => {
        button.dataset.saving = "false";
        button.disabled = originalDisabled ?? false;
        if ("loading" in button) button.loading = originalLoading ?? false;
        syncSaveButtonLabel(button);
      }, 1200);
    }

    workspaceSavingStore?.set(false);
    return result;
  } catch (error) {
    if (button) {
      button.dataset.saving = "false";
      if ("loading" in button) button.loading = false;
      button.disabled = originalDisabled ?? false;
      syncSaveButtonLabel(button);
    }
    workspaceSavingStore?.set(false);
    await mqbDialogs.alert(`Error saving: ${(error as Error).message}`);
    return null;
  }
}

async function reinitializeWorkspaceViews() {
  const state = getMqbState();
  if (state.publishers_initialized) {
    await initPublishers(mqbApp.config(), mqbApp.schema());
  }
  if (state.consumers_initialized) {
    await initConsumers(mqbApp.config(), mqbApp.schema());
  }
  if (state.config_initialized) {
    await initSettings(mqbApp.config(), mqbApp.schema());
  }
}

export function saveWorkspace(button?: HTMLElement | null, silent = false) {
  return appWindow().saveWorkspace(silent, button);
}

function installGlobals() {
  installDialogs();
  const state = getMqbState();
  state.runtime_status = { ...EMPTY_RUNTIME_STATUS };
  state.storage_security = { ...EMPTY_STORAGE_SECURITY };
  renderStorageSecurity();
  state.dirty_sections = {};
  state.saved_sections = {};
  state.before_workspace_save_hooks = {};
  state.after_workspace_save_hooks = {};
  workspaceDirtyStore?.set(false);
  workspaceSavingStore?.set(false);
  appWindow().switchMain = switchMain;
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

  appWindow().registerBeforeWorkspaceSave = (key, callback) => {
    if (!key || typeof callback !== "function") return;
    state.before_workspace_save_hooks[key] = callback;
  };

  appWindow().registerAfterWorkspaceSave = (key, callback) => {
    if (!key || typeof callback !== "function") return;
    state.after_workspace_save_hooks[key] = callback;
  };

  appWindow().markSectionSaved = (sectionName, savedValue = undefined) => {
    const tracker = state.dirty_sections?.[sectionName];
    const nextSavedValue = savedValue === undefined ? tracker?.getValue?.() : savedValue;
    state.saved_sections[sectionName] = cloneSectionState(nextSavedValue);
    if (!tracker) return;

    tracker.baseline = JSON.stringify(state.saved_sections[sectionName]);
    refreshDirtySection(sectionName);
  };

  appWindow().saveWorkspace = async (silent = false, button = null) => {
    const doSave = async (): Promise<Record<string, unknown> | null> => {
      for (const hook of Object.values(state.before_workspace_save_hooks)) {
        await hook();
      }

      const appConfig = mqbApp.config<Record<string, unknown>>();
      const refreshedConfig = await replaceConfigFromSave(appConfig);

      appWindow().markSectionSaved("publishers", appConfig.publishers ?? []);
      appWindow().markSectionSaved("consumers", appConfig.consumers ?? []);
      appWindow().markSectionSaved("config", extractSettingsConfig(appConfig));

      for (const hook of Object.values(state.after_workspace_save_hooks)) {
        await hook(appConfig);
      }

      await reinitializeWorkspaceViews();
      syncAllDirtyBaselinesToCurrentState();
      renderWorkspaceDirty();
      return refreshedConfig;
    };

    return await runSaveAction(button, silent, doSave, { trackWorkspaceSaving: true });
  };

  appWindow().saveConfig = async (silent = false, button = null) => {
    const doSave = async (): Promise<Record<string, unknown> | null> => {
      const appConfig = mqbApp.config<Record<string, unknown>>();
      const refreshedConfig = await replaceConfigFromSave(appConfig);
      appWindow().markSectionSaved("config", appConfig);
      return refreshedConfig;
    };

    return await runSaveAction(button, silent, doSave);
  };

  appWindow().saveConfigSection = async (sectionName, sectionValue, silent = false, button = null) => {
    const doSave = async () => {
      const appConfig = mqbApp.config<Record<string, unknown>>();
      const refreshedConfig = await persistConfigSection<Record<string, unknown>, string>(
        fetch,
        appConfig,
        sectionName,
        sectionValue,
      );
      appConfig[sectionName] = (refreshedConfig as Record<string, unknown>)[sectionName];
      appWindow().markSectionSaved(sectionName, (refreshedConfig as Record<string, unknown>)[sectionName]);
      return refreshedConfig;
    };

    return await runSaveAction(button, silent, doSave);
  };
}

export async function bootstrapApp() {
  installGlobals();

  await maybeHandleConfigRecovery(fetch);

  const [config, schema, storageSecurityRaw] = await Promise.all([
    fetchConfigFromServer<Record<string, any>>(fetch),
    fetch("/schema.json").then((response) => response.json()),
    fetchStorageSecurityFromServer(fetch).catch(() => EMPTY_STORAGE_SECURITY),
  ]);
  const storageSecurity = normalizeStorageSecurityInfo(storageSecurityRaw);

  if (mqbApp.isDesktop()) {
    delete config.extract_secrets;
    if (schema?.properties) {
      delete schema.properties.extract_secrets;
    }
  }

  delete config.routes;
  mqbApp.setConfig(config);
  mqbApp.setSchema(schema);
  const state = getMqbState();
  state.storage_security = storageSecurity;
  (appWindow() as any)._mqb_storage_security = storageSecurity;
  renderStorageSecurity();
  state.storage_cache = {
    publisher_state: await getStoredJson("mqb_publisher_state", {}, storageSecurity),
    publisher_history: await getStoredJson("mqb_publisher_history", {}, storageSecurity),
    consumer_messages: await getStoredJson("mqb_consumer_messages", {}, storageSecurity),
  };
  (appWindow() as any)._mqb_storage_cache = state.storage_cache;
  state.saved_sections = {
    consumers: cloneSectionState(config.consumers),
    publishers: cloneSectionState(config.publishers),
    config: cloneSectionState(config),
  };
  renderWorkspaceDirty();

  onHashChange(() => {
    const targetTab = resolveTabFromHash(currentHash());
    if (targetTab) {
      void switchMain(targetTab);
    }
  });

  renderRuntimeStatus();
  await runtimeStatusPoller.poll();

  const defaultTab = pickDefaultTab(
    currentHash(),
    state.runtime_status.active_routes || [],
    config.default_tab,
  );
  await switchMain(defaultTab);

  runtimeStatusPoller.stop();
  runtimeStatusPoller.start();
  state.runtime_poll_timer = 1;
}
