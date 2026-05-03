<script lang="ts">
  import ConsumersPanel from "./components/ConsumersPanel.svelte";
  import MainTabs from "./components/MainTabs.svelte";
  import PublishersPanel from "./components/PublishersPanel.svelte";
  import RoutesPanel from "./components/RoutesPanel.svelte";
  import SettingsPanel from "./components/SettingsPanel.svelte";
  import Topbar from "./components/Topbar.svelte";
</script>

<Topbar />
<MainTabs />

<div class="app-body">
  <RoutesPanel />
  <ConsumersPanel />
  <PublishersPanel />
  <SettingsPanel />
</div>
