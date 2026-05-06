<script lang="ts">
  import { activeMainTab } from "../lib/stores";
  import { switchMain } from "../bootstrap";
  import { runtimeStatusStore } from "../lib/stores";
  import { isRuntimeConnected, runtimeStatusLabel } from "../lib/runtime-status";
  import { onMount } from "svelte";

  type Theme = "auto" | "light" | "dark";

  let theme = $state<Theme>("auto");
  let themeSelectorOpen = $state(false);

  onMount(() => {
    theme = (window.getThemePreference?.() ?? "auto") as Theme;
  });

  function setTheme(value: Theme) {
    theme = value;
    window.setThemePreference?.(value);
    themeSelectorOpen = false;
  }
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
    class:active={$activeMainTab === "config"}
    class="main-tab"
    id="mtab-config"
    type="button"
    onclick={() => switchMain("config")}
  >
    <span class="tab-icon">⚙</span> App Config
  </button>


  <div class="topbar">
    <div class="topbar-spacer"></div>
    <div
      class:topbar-status-live={isRuntimeConnected($runtimeStatusStore)}
      class:topbar-status-idle={!isRuntimeConnected($runtimeStatusStore)}
      class="topbar-status"
      id="runtime-status"
      hidden={!isRuntimeConnected($runtimeStatusStore)}
    >
      <div class="status-dot" id="runtime-status-dot"></div>
      <span id="runtime-status-label">{runtimeStatusLabel($runtimeStatusStore)}</span>
    </div>
    <div class="theme">
      <button
        type="button"
        class="theme-trigger"
        onclick={() => (themeSelectorOpen = !themeSelectorOpen)}
        title={`Theme: ${theme}`}
        aria-label={`Theme: ${theme}`}
      >
      {theme === "dark" ? "☾" : theme === "light" ? "☼" : "◐"}
      </button>

      {#if themeSelectorOpen}
        <div class="theme-menu">
          <button class:active={theme === "light"} onclick={() => setTheme("light")}>Light</button>
          <button class:active={theme === "auto"} onclick={() => setTheme("auto")}>Auto</button>
          <button class:active={theme === "dark"} onclick={() => setTheme("dark")}>Dark</button>
        </div>
      {/if}
    </div>
  </div>
  
</div>
