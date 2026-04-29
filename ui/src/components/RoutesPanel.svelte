<script lang="ts">
  import { activeMainTab } from "../lib/stores";
  import { routesPanelState } from "../lib/stores";
  import {
    addRouteAction,
    cloneCurrentRouteAction,
    copyCurrentRouteAction,
    deleteCurrentRouteAction,
    renameCurrentRouteAction,
    restoreRouteStateFromView,
    saveCurrentRouteAction,
    toggleCurrentRouteAction,
  } from "../lib/routes-view";

  let filterText = $state("");
  let routeNameDraft = $state("");
  let lastSyncedRouteName = $state("");

  const visibleItems = $derived(
    $routesPanelState.items.filter((item) => item.name.toLowerCase().includes(filterText.trim().toLowerCase())),
  );

  function openRoute(index: number) {
    restoreRouteStateFromView(index);
  }

  $effect(() => {
    const currentName = $routesPanelState.currentRouteName || "";
    if (currentName !== lastSyncedRouteName) {
      routeNameDraft = currentName;
      lastSyncedRouteName = currentName;
    }
  });

  function commitRouteName() {
    lastSyncedRouteName = routeNameDraft.trim();
    void renameCurrentRouteAction(routeNameDraft);
  }

  function handleActionKey(event: KeyboardEvent, action: () => void | Promise<void>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void action();
  }
</script>

<div class:active={$activeMainTab === "routes"} class="tab-content-panel" id="tab-routes">
  <div id="routes-container" style="display:contents">
    <div class="sidebar">
      <div class="sidebar-header">
        <input class="sidebar-search" id="route-filter" type="text" placeholder="Filter routes…" bind:value={filterText} />
        <wa-button size="small" appearance="outlined" class="icon-button" id="route-add" title="Add route"
          role="button"
          tabindex="0"
          onclick={addRouteAction}
          onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void addRouteAction())}
          >+</wa-button
        >
      </div>
      <div class="sidebar-list" id="route-list">
        <div class="sidebar-group-label">Routes</div>
        {#each visibleItems as item (item.name)}
          <button
            type="button"
            class:active={$routesPanelState.selectedIndex === item.originalIndex}
            class:is-disabled={item.isDisabled}
            class="sidebar-item route-item"
            data-idx={item.originalIndex}
            onclick={() => openRoute(item.originalIndex)}
          >
            <span class={`proto-badge proto-${item.inputProto.toLowerCase()}`}>{item.inputProto.substring(0, 4)}</span>
            <span class="item-name">{item.name}</span>
            {#if item.showMetrics}
              <span class="route-throughput">{item.throughputLabel}</span>
            {/if}
            {#if item.isDisabled}
              <span class="route-disabled-tag">OFF</span>
            {/if}
            <span class={`proto-badge proto-${item.outputProto.toLowerCase()}`} style="margin-left:auto;">
              {item.outputProto.substring(0, 4)}
            </span>
          </button>
        {/each}
      </div>
    </div>
    <div class="main-content">
      <div id="route-empty-alert" class="empty-state" style:display={$routesPanelState.hasRoutes ? "none" : "block"}>
        No routes configured. Click "+" to create one.
      </div>
      <div id="route-main-ui" class="pane-container" style:display={$routesPanelState.hasRoutes ? "flex" : "none"}>
        <div class="pane-top pane-top-form" style="padding:12px;">
          <div class="section-toolbar editor-action-bar editor-action-bar--compact">
            <div class="form-actions-row section-actions section-actions-right">
              <div class="editor-action-cluster">
                <wa-button variant="neutral" appearance="outlined" size="small" id="route-copy"
                  role="button"
                  tabindex="0"
                  onclick={copyCurrentRouteAction}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void copyCurrentRouteAction())}
                  >Copy to...</wa-button
                >
                <wa-button variant="neutral" appearance="outlined" size="small" id="route-clone"
                  role="button"
                  tabindex="0"
                  onclick={cloneCurrentRouteAction}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void cloneCurrentRouteAction())}
                  >Clone</wa-button
                >
              </div>
              <div class="toolbar-divider" aria-hidden="true"></div>
              <div class="editor-action-cluster">
                <wa-button variant="brand" size="small" id="route-save"
                  role="button"
                  tabindex="0"
                  onclick={(event: MouseEvent) => saveCurrentRouteAction(event.currentTarget as HTMLElement)}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void saveCurrentRouteAction(document.getElementById("route-save")))}>Save</wa-button>
                <wa-button
                  variant={$routesPanelState.toggleVariant}
                  appearance={$routesPanelState.toggleAppearance}
                  size="small"
                  id="route-toggle"
                  style:display={$routesPanelState.toggleVisible ? "inline-flex" : "none"}
                  role="button"
                  tabindex="0"
                  onclick={() => toggleCurrentRouteAction(document.getElementById("route-toggle"))}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void toggleCurrentRouteAction(document.getElementById("route-toggle")))}
                  >{$routesPanelState.toggleLabel}</wa-button
                >
                <wa-button variant="danger" appearance="outlined" size="small" id="route-delete"
                  role="button"
                  tabindex="0"
                  onclick={() => deleteCurrentRouteAction(document.getElementById("route-save"))}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void deleteCurrentRouteAction(document.getElementById("route-save")))}
                  >Delete</wa-button
                >
              </div>
            </div>
          </div>
          <div class="form-scroll-wrapper">
            <div class="section-label">Definition</div>
            <div class="wa-form-row field-grid">
              <label class="wa-form-label" for="root.name">Name</label>
              <div class="wa-form-col">
                <input
                  id="root.name"
                  name="root.name"
                  class="field-input"
                  value={routeNameDraft}
                  oninput={(event) => (routeNameDraft = (event.currentTarget as HTMLInputElement).value)}
                  onblur={commitRouteName}
                  onkeydown={(event: KeyboardEvent) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    commitRouteName();
                  }}
                />
              </div>
            </div>
            <div id="route-config-form" class="field-grid"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
