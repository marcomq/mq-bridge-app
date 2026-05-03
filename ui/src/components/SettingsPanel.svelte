<script lang="ts">
  import { activeMainTab } from "../lib/stores";
  import { exportFullBundle, importAppConfigFromJsonText, resetAppConfigToDefaults } from "../lib/import-export";
  import { mqbDialogs, mqbApp } from "../lib/runtime-window";
  import { EditorView, basicSetup } from "codemirror";
  import { json } from "@codemirror/lang-json";

  let isJsonModalOpen = $state(false);
  let editorContainer = $state<HTMLElement | null>(null);
  let editorView: EditorView | null = null;

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

  function openJsonModal() {
    isJsonModalOpen = true;
    const configData = JSON.stringify(mqbApp.config(), null, 2);

    // Ensure the container is available before initializing CodeMirror
    setTimeout(() => {
      if (!editorContainer) return;
      if (!editorView) {
        editorView = new EditorView({
          doc: configData,
          extensions: [
            basicSetup,
            json(),
            EditorView.editable.of(false),
            EditorView.theme({
              "&": { height: "60vh", fontSize: "13px" },
              ".cm-scroller": { overflow: "auto" },
            }),
          ],
          parent: editorContainer,
        });
      } else {
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: configData },
        });
      }
    }, 0);
  }
</script>

<div class:active={$activeMainTab === "config"} class="tab-content-panel" id="tab-config">
  <div
    id="form-actions"
    class="section-toolbar editor-action-bar editor-action-bar--config editor-action-bar--compact"
    style="display: none;"
  >
    <div class="form-actions-row section-actions">
      <div class="section-actions-right">
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
          <button
            class="wa-native-button wa-native-button--neutral"
            id="js-show-json"
            type="button"
            title="Show current configuration as JSON"
            onclick={openJsonModal}>{`{?} JSON`}</button
          >
          <div class="toolbar-divider" aria-hidden="true"></div>
          <wa-button variant="brand" size="small" id="js-submit">Save</wa-button>
        </div>
      </div>
    </div>
  </div>
  <div class="form-scroll-wrapper">
    <div id="form-container" class="field-grid"></div>
  </div>
</div>

<wa-dialog label="Current Configuration (JSON)" open={isJsonModalOpen} onwa-hide={() => (isJsonModalOpen = false)}>
  <div bind:this={editorContainer} class="json-preview-container"></div>
  <wa-button slot="footer" variant="brand" size="small" 
    role="button"
    tabindex="0"
    onclick={() => (isJsonModalOpen = false)} 
    onkeydown={(e) => e.key === 'Enter' && (isJsonModalOpen = false)}>Close</wa-button>
</wa-dialog>

<style>
  .json-preview-container {
    border: 1px solid var(--wa-color-neutral-border);
    border-radius: var(--wa-border-radius-medium);
    background: var(--wa-color-neutral-surface);
    overflow: hidden;
  }

  :global(.cm-editor) {
    outline: none !important;
  }
</style>
