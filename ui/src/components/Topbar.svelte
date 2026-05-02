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
<style>
.theme {
  position: relative;
  display: inline-flex;
}

.theme-trigger {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #666;
  cursor: pointer;
}

.theme-trigger:hover,
.theme-trigger:focus-visible {
  background: rgb(0 0 0 / 0.08);
  outline: none;
}

.theme-menu {
  position: absolute;
  top: 34px;
  right: 0;
  z-index: 1000;
  min-width: 90px;
  padding: 4px;
  border: 1px solid #ccc;
  border-radius: 8px;
  background: var(--wa-color-surface-default, white);
  box-shadow: 0 6px 18px rgb(0 0 0 / 0.14);
}

.theme-menu button {
  display: block;
  width: 100%;
  border: 0;
  border-radius: 5px;
  padding: 6px 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.theme-menu button:hover,
.theme-menu button.active {
  background: rgb(0 0 0 / 0.08);
}
</style>

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
