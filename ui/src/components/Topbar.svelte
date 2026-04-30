<script lang="ts">
  import { runtimeStatusStore } from "../lib/stores";
  import { isRuntimeConnected, runtimeStatusLabel } from "../lib/runtime-status";
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
</div>
