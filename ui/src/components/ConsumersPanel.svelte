<script lang="ts">
  import { activeMainTab, consumersPanelState } from "../lib/stores";
  import HeaderRowsEditor from "./HeaderRowsEditor.svelte";
  import CodeEditor from "./CodeEditor.svelte";
  import {
    addConsumerAction,
    addConsumerResponseHeader,
    clearActiveConsumerHistory,
    cloneCurrentConsumerAction,
    copyCurrentConsumerAction,
    deleteCurrentConsumerAction,
    restoreConsumerStateFromView,
    saveCurrentConsumerAction,
    selectConsumerSubtab,
    showConsumerMessageDetails,
    toggleConsumerResponseHeader,
    toggleActiveConsumer,
    removeConsumerResponseHeader,
    updateConsumerResponseHeader,
    updateConsumerResponsePayload,
  } from "../lib/consumers-view";

  let filterText = $state("");

  const visibleItems = $derived(
    $consumersPanelState.items.filter((item) =>
      item.name.toLowerCase().includes(filterText.trim().toLowerCase()),
    ),
  );

  function openConsumer(originalIndex: number) {
    restoreConsumerStateFromView(originalIndex);
  }

  function openMessage(messageIndex: number) {
    if ($consumersPanelState.currentConsumerName) {
      showConsumerMessageDetails($consumersPanelState.currentConsumerName, messageIndex);
    }
  }

  function toggleConsumer() {
    toggleActiveConsumer();
  }

  function clearHistory() {
    clearActiveConsumerHistory();
  }

  async function copyMessageDetails() {
    if (!$consumersPanelState.detailPayload) return;
    await navigator.clipboard.writeText($consumersPanelState.detailPayload);
  }

  function handleActionKey(event: KeyboardEvent, action: () => void | Promise<void>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void action();
  }

  function addConsumer() {
    addConsumerAction();
  }

  function copyCurrentConsumer() {
    copyCurrentConsumerAction();
  }

  function cloneCurrentConsumer() {
    cloneCurrentConsumerAction();
  }

  function saveCurrentConsumer() {
    saveCurrentConsumerAction();
  }

  function deleteCurrentConsumer() {
    deleteCurrentConsumerAction();
  }

  function openSubtab(tab: "definition" | "response" | "messages") {
    selectConsumerSubtab(tab);
  }
</script>

<div
  class:active={$activeMainTab === "consumers"}
  class="tab-content-panel"
  id="tab-consumers"
  style="width: 100%"
>
  <div id="consumers-container" style="display:contents">
    <div class="sidebar">
      <div class="sidebar-header">
        <input class="sidebar-search" id="cons-filter" type="text" placeholder="Filter consumers…" bind:value={filterText} />
        <wa-button
          size="small"
          appearance="outlined"
          class="icon-button"
          id="cons-add"
          title="Add consumer"
          role="button"
          tabindex="0"
          onclick={addConsumer}
          onkeydown={(event: KeyboardEvent) => handleActionKey(event, addConsumer)}
          >+</wa-button
        >
      </div>
      <div class="sidebar-list" id="cons-list">
        <div class="sidebar-group-label">Saved</div>
        {#each visibleItems as item (item.name)}
          <button
            type="button"
            class:active={$consumersPanelState.selectedIndex === item.originalIndex}
            class="sidebar-item cons-item"
            data-idx={item.originalIndex}
            onclick={() => openConsumer(item.originalIndex)}
          >
            <span class={`proto-badge proto-${item.inputProto.toLowerCase()}`}>{item.inputProto}</span>
            <span class="item-name">{item.name}</span>
            <span class="msg-count" style="margin-left:auto;">{item.messageCount}</span>
            <span class={`item-status ${item.statusClass}`}></span>
          </button>
        {/each}
      </div>
    </div>
    <div class="main-content">
      <div id="cons-empty-alert" class="empty-state" style:display={$consumersPanelState.hasConsumers ? "none" : "block"}>
        No consumers configured. Click "+" to create one.
      </div>
      <div id="cons-main-ui" style:display={$consumersPanelState.hasConsumers ? "contents" : "none"}>
        <div class="content-tabs" id="cons-sub-tabs">
          <button
            type="button"
            class:active={$consumersPanelState.activeSubtab === "definition"}
            class="content-tab"
            data-target="cons-def-panel"
            id="ctab-def"
            onclick={() => openSubtab("definition")}>Definition</button
          >
          <button
            type="button"
            class:active={$consumersPanelState.activeSubtab === "response"}
            class="content-tab"
            data-target="cons-response-panel"
            id="cons-response-tab"
            style:display={$consumersPanelState.responseEnabled ? "flex" : "none"}
            onclick={() => openSubtab("response")}
          >
            Response
          </button>
          <button
            type="button"
            class:active={$consumersPanelState.activeSubtab === "messages"}
            class="content-tab"
            data-target="cons-msg-panel"
            id="ctab-msg"
            onclick={() => openSubtab("messages")}>Messages</button
          >
        </div>
        <div
          class="pane-container"
          id="cons-def-panel"
          style:display={$consumersPanelState.activeSubtab === "definition" ? "flex" : "none"}
        >
          <div class="pane-top pane-top-form" style="padding:12px;">
            <div class="section-toolbar editor-action-bar editor-action-bar--compact">
              <div class="form-actions-row section-actions section-actions-right">
                <div class="editor-action-cluster">
                  <wa-button
                    variant="neutral"
                    appearance="outlined"
                    size="small"
                    id="cons-copy"
                    role="button"
                    tabindex="0"
                    onclick={copyCurrentConsumer}
                    onkeydown={(event: KeyboardEvent) => handleActionKey(event, copyCurrentConsumer)}
                    >Copy to...</wa-button
                  >
                  <wa-button
                    variant="neutral"
                    appearance="outlined"
                    size="small"
                    id="cons-clone"
                    role="button"
                    tabindex="0"
                    onclick={cloneCurrentConsumer}
                    onkeydown={(event: KeyboardEvent) => handleActionKey(event, cloneCurrentConsumer)}
                    >Clone</wa-button
                  >
                </div>
                <div class="toolbar-divider" aria-hidden="true"></div>
                <div class="editor-action-cluster">
                  <wa-button
                    variant="brand"
                    size="small"
                    id="cons-save"
                    role="button"
                    tabindex="0"
                    onclick={saveCurrentConsumer}
                    onkeydown={(event: KeyboardEvent) => handleActionKey(event, saveCurrentConsumer)}
                    >Save</wa-button
                  >
                  <wa-button
                    variant="danger"
                    appearance="outlined"
                    size="small"
                    id="cons-delete"
                    role="button"
                    tabindex="0"
                    onclick={deleteCurrentConsumer}
                    onkeydown={(event: KeyboardEvent) => handleActionKey(event, deleteCurrentConsumer)}
                    >Delete</wa-button
                  >
                </div>
              </div>
            </div>
            <div class="form-scroll-wrapper">
              <div id="cons-config-form" class="field-grid"></div>
            </div>
          </div>
        </div>
        <div
          class="pane-container"
          id="cons-response-panel"
          style:display={$consumersPanelState.activeSubtab === "response" && $consumersPanelState.responseEnabled
            ? "flex"
            : "none"}
        >
          <div class="pane-top" style="padding:12px;">
            <div id="cons-response-editor">
              <div class="section-toolbar response-editor-header">
                <div class="section-label">Custom Response</div>
                <span class="form-description">
                  Returned to request-response consumer endpoints after the message is logged.
                </span>
              </div>
              <div class="response-editor-grid">
                <div class="section-label">Headers</div>
                <div id="cons-response-headers">
                  <HeaderRowsEditor
                    rows={$consumersPanelState.responseHeaders}
                    addLabel="Add Header"
                    showEnabled={true}
                    onAdd={addConsumerResponseHeader}
                    onUpdate={updateConsumerResponseHeader}
                    onToggle={toggleConsumerResponseHeader}
                    onRemove={removeConsumerResponseHeader}
                  />
                </div>
                <div class="section-label">Payload</div>
                <CodeEditor
                  id="cons-response-payload"
                  value={$consumersPanelState.responsePayload}
                  placeholder="Response body"
                  language="json-auto"
                  onChange={updateConsumerResponsePayload}
                />
              </div>
            </div>
          </div>
        </div>
        <div
          class="pane-container"
          id="cons-msg-panel"
          style:display={$consumersPanelState.activeSubtab === "messages" ? "flex" : "none"}
        >
          <div class="pane-top" id="cons-list-pane">
            <div class="msg-table-header">
              <span class="msg-table-title" id="cons-live-title">
                Incoming Messages:
                <wa-badge variant={$consumersPanelState.liveStatusVariant}>{$consumersPanelState.liveStatusText}</wa-badge>
              </span>
              <wa-button
                variant="neutral"
                appearance="outlined"
                size="small"
                class="ghost-action"
                id="cons-clear-history"
                role="button"
                tabindex="0"
                onclick={clearHistory}
                onkeydown={(event: KeyboardEvent) => handleActionKey(event, clearHistory)}>Clear</wa-button
              >
              <wa-button
                variant={$consumersPanelState.toggleVariant}
                id="cons-toggle"
                size="small"
                loading={$consumersPanelState.toggleBusy}
                disabled={$consumersPanelState.toggleBusy}
                role="button"
                tabindex={$consumersPanelState.toggleBusy ? "-1" : "0"}
                onclick={toggleConsumer}
                onkeydown={(event: KeyboardEvent) => handleActionKey(event, toggleConsumer)}
              >
                {$consumersPanelState.toggleLabel}
              </wa-button>
            </div>
            <div style="overflow:auto;flex:1;" id="consumer-log-body-wrapper">
              <table class="msg-table">
                <thead>
                  <tr>
                    <th style="width: 120px;">Time</th>
                    <th>Payload Preview</th>
                  </tr>
                </thead>
                <tbody id="consumer-log-body">
                  {#if $consumersPanelState.messages.length === 0}
                    <tr>
                      <td colspan="2" style="text-align:center;padding:20px;color:var(--text-dim);">
                        Waiting for messages...
                      </td>
                    </tr>
                  {:else}
                    {#each $consumersPanelState.messages as message (message.messageIndex)}
                      <tr
                        class:selected={message.selected}
                        style="cursor:zoom-in;"
                        onclick={() => openMessage(message.messageIndex)}
                      >
                        <td class="text-muted small">{message.timeLabel}</td>
                        <td class="font-monospace small text-break text-truncate" style="max-width: 400px;">
                          {message.payloadPreview}
                        </td>
                      </tr>
                    {/each}
                  {/if}
                </tbody>
              </table>
            </div>
          </div>
          <div class="pane-divider" id="cons-pane-divider"></div>
          <div class="pane-bottom" id="cons-detail-pane">
            <div class="detail-header">
              <span id="cons-msg-detail-info">{$consumersPanelState.detailInfo}</span>
              <span
                style="margin-left:auto;cursor:pointer;color:var(--text-dim)"
                id="cons-msg-copy-btn"
                role="button"
                tabindex="0"
                onclick={copyMessageDetails}
                onkeydown={(event: KeyboardEvent) => handleActionKey(event, copyMessageDetails)}
                >⊕ copy</span
              >
            </div>
            <div class="detail-body" id="cons-msg-details-content">
              {#if $consumersPanelState.detailMetadata.length > 0}
                <div class="response-meta-block">
                  <div class="section-label">Headers</div>
                  {#each $consumersPanelState.detailMetadata as [key, value] (`${key}:${value}`)}
                    <div class="response-meta-row">
                      <span class="response-meta-key">{key}</span>
                      <span class="response-meta-value">{value}</span>
                    </div>
                  {/each}
                </div>
                <div class="section-label">Body</div>
              {/if}
              <div id="cons-msg-payload" style="white-space: pre-wrap; font-family: var(--font); color: var(--text-payload);">
                {$consumersPanelState.detailPayload}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
