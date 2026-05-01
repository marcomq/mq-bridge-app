<script lang="ts">
  import { activeMainTab } from "../lib/stores";
  import { exportFullBundle, importAppConfigFromJsonText, resetAppConfigToDefaults } from "../lib/import-export";
  import { mqbDialogs } from "../lib/runtime-window";

  let {
    onShowJson,
  }: {
    onShowJson: () => void;
  } = $props();

  let importInputEl = $state<HTMLInputElement | null>(null);

  function openImportPicker() {
    importInputEl?.click();
  }

  async function handleImportSelected(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const result = await importAppConfigFromJsonText(text);
      await mqbDialogs.alert(
        `Imported ${result.importedPublishers} publishers, ${result.importedConsumers} consumers, ${result.importedRoutes} routes.`,
        "Import complete",
      );
      window.location.reload();
    } catch (error) {
      await mqbDialogs.alert(`Import failed: ${(error as Error).message}`, "Import");
    } finally {
      target.value = "";
    }
  }

  async function resetConfig() {
    const confirmed = await mqbDialogs.confirm(
      "Reset publishers, consumers and routes? Existing entries will be removed.",
      "Reset App Config",
    );
    if (!confirmed) return;
    await resetAppConfigToDefaults();
    window.location.reload();
  }
</script>

<div class:active={$activeMainTab === "config"} class="tab-content-panel" id="tab-config">
  <div
    id="form-actions"
    class="section-toolbar editor-action-bar editor-action-bar--config editor-action-bar--compact"
    style="display: none;"
  >
    <div class="form-actions-row section-actions">
      <div class="editor-action-cluster">
        <button
          class="wa-native-button wa-native-button--neutral"
          type="button"
          title="Export app config + presets + env vars"
          onclick={exportFullBundle}>Export</button
        >
        <button
          class="wa-native-button wa-native-button--neutral"
          type="button"
          title="Import app config and merge data"
          onclick={openImportPicker}>Import</button
        >
        <button
          class="wa-native-button wa-native-button--danger"
          type="button"
          title="Reset publishers, consumers and routes"
          onclick={resetConfig}>Reset</button
        >
        <input bind:this={importInputEl} type="file" accept=".json,application/json" style="display:none" onchange={handleImportSelected} />
      </div>
      <div class="toolbar-divider" aria-hidden="true"></div>
      <div class="section-actions-right">
      <div class="editor-action-cluster">
        <button
          class="wa-native-button wa-native-button--neutral"
          id="js-show-json"
          type="button"
          title="Show current configuration as JSON"
          onclick={onShowJson}>{`{?} JSON`}</button
        >
      </div>
      <div class="toolbar-divider" aria-hidden="true"></div>
      <div class="editor-action-cluster">
        <wa-button variant="brand" size="small" id="js-submit">Save</wa-button>
      </div>
      </div>
    </div>
  </div>
  <div class="form-scroll-wrapper">
    <div id="form-container" class="field-grid"></div>
  </div>
</div>
