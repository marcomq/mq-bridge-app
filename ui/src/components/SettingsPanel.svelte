<script lang="ts">
  import { activeMainTab } from "../lib/stores";
  import { exportConfigOnly, exportFullBundle } from "../lib/import-export";

  let {
    onShowJson,
  }: {
    onShowJson: () => void;
  } = $props();
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
          title="Export only app config"
          onclick={exportConfigOnly}>Export Config</button
        >
        <button
          class="wa-native-button wa-native-button--neutral"
          type="button"
          title="Export config + presets + env vars"
          onclick={exportFullBundle}>Export All</button
        >
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
