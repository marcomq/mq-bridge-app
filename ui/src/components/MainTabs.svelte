<script lang="ts">
  import { activeMainTab } from "../lib/stores";
  import { switchMain } from "../bootstrap";
</script>

<div class="main-tabs" id="mainTabs">
  <button
    class:active={$activeMainTab === "publishers"}
    class="main-tab"
    id="mtab-publishers"
    type="button"
    onclick={() => switchMain("publishers")}
  >
    <span class="tab-icon">↑</span> Publishers
  </button>
  <button
    class:active={$activeMainTab === "consumers"}
    class="main-tab"
    id="mtab-consumers"
    type="button"
    onclick={() => switchMain("consumers")}
  >
    <span class="tab-icon">↓</span> Consumers
  </button>
  <button
    class:active={$activeMainTab === "routes"}
    class="main-tab"
    id="mtab-routes"
    type="button"
    onclick={() => switchMain("routes")}
  >
    <span class="tab-icon">⇄</span> Routes
  </button>
  <button
    class:active={$activeMainTab === "config"}
    class="main-tab"
    id="mtab-config"
    type="button"
    onclick={() => switchMain("config")}
  >
    <span class="tab-icon">⚙</span> App Config
  </button>
</div>
