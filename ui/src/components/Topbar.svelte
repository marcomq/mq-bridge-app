<script lang="ts">
  import { runtimeStatusStore } from "../lib/stores";
  import { isRuntimeConnected, runtimeStatusLabel } from "../lib/runtime-status";
  import { onMount } from "svelte";

  type Theme = "auto" | "light" | "dark";

  let theme: Theme = "auto";
  let themeSelectorOpen = false;

  onMount(() => {
    theme = (window.getThemePreference?.() ?? "auto") as Theme;
  });

  function setTheme(value: Theme) {
    theme = value;
    window.setThemePreference?.(value);
    themeSelectorOpen = false;
  }
</script>

<div class="topbar">
  <div class="topbar-logo">
    <pre>
      ┌────── mq-bridge-configuration ──────┐
──────┴─────────────────────────────────────┴──────
</pre>
  </div>
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
      <wa-icon name={theme === "dark" ? "moon" : theme === "light" ? "sun" : "circle-half-stroke"}></wa-icon>
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
