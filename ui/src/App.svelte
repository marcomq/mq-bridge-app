<script lang="ts">
  import ConsumersPanel from "./components/ConsumersPanel.svelte";
  import MainTabs from "./components/MainTabs.svelte";
  import PublishersPanel from "./components/PublishersPanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
</script>

<MainTabs />

<div class="app-body">
  <ConsumersPanel />
  <PublishersPanel />
  <SettingsPanel />
</div>
