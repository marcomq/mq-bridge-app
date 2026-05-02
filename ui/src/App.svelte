<script lang="ts">
  import ConsumersPanel from "./components/ConsumersPanel.svelte";
  import MainTabs from "./components/MainTabs.svelte";
  import PublishersPanel from "./components/PublishersPanel.svelte";
  import RoutesPanel from "./components/RoutesPanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import Topbar from "./components/Topbar.svelte";
  import { mqbApp } from "./lib/runtime-window";

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

  function closeJsonModal() {
    const dialog = document.getElementById("jsonPreviewModal") as { open?: boolean } | null;
    if (dialog) {
      dialog.open = false;
    }
  }
</script>

<Topbar />
<MainTabs />

<div class="app-body">
  <RoutesPanel />
  <ConsumersPanel />
  <PublishersPanel />
  <SettingsPanel onShowJson={showJsonModal} />
</div>

<wa-dialog label="Current Configuration (JSON)" id="jsonPreviewModal">
  <pre><code id="json-output"></code></pre>
  <button slot="footer" class="wa-native-button wa-native-button--brand" type="button" onclick={closeJsonModal}>
    Close
  </button>
</wa-dialog>
