<script lang="ts">
  import { activeMainTab, publishersPanelState } from "../lib/stores";
  import HeaderRowsEditor from "./HeaderRowsEditor.svelte";
  import CodeEditor from "./CodeEditor.svelte";
  import {
    addPublisherAction,
    addPublisherMetadataRow,
    beautifyPublisherPayloadAction,
    clearActivePublisherHistory,
    cloneCurrentPublisherAction,
    copyPublisherResponse,
    copyCurrentPublisherAction,
    deleteCurrentPublisherAction,
    removePublisherMetadataRow,
    restorePublisherStateFromView,
    saveCurrentPublisherAction,
    selectPublisherSubtab,
    sendPublisherAction,
    showPublisherHistoryEntry,
    togglePublisherMetadataRow,
    updatePublisherMetadataRow,
    updatePublisherMethod,
    updatePublisherPayload,
    updatePublisherRequestField,
  } from "../lib/publishers-view";

  let filterText = $state("");

  const visibleItems = $derived(
    $publishersPanelState.items.filter((item) =>
      item.name.toLowerCase().includes(filterText.trim().toLowerCase()),
    ),
  );

  function openPublisher(originalIndex: number) {
    restorePublisherStateFromView(originalIndex);
  }

  function openHistoryRow(historyIndex: number) {
    showPublisherHistoryEntry(historyIndex);
  }

  function clearHistory() {
    clearActivePublisherHistory();
  }

  function copyResponse() {
    copyPublisherResponse();
  }

  function handleActionKey(event: KeyboardEvent, action: () => void | Promise<void>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    action();
  }

  function openSubtab(tab: "payload" | "headers" | "history" | "definition") {
    selectPublisherSubtab(tab);
  }
</script>

<div class:active={$activeMainTab === "publishers"} class="tab-content-panel" id="tab-publishers">
  <div id="publishers-container" style="display:contents">
    <div class="sidebar">
      <div class="sidebar-header">
        <input class="sidebar-search" id="pub-filter" type="text" placeholder="Filter publishers…" bind:value={filterText} />
        <wa-button size="small" appearance="outlined" class="icon-button" id="pub-add" title="Add publisher"
          role="button"
          tabindex="0"
          onclick={addPublisherAction}
          onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void addPublisherAction())}
          >+</wa-button
        >
      </div>
      <div class="sidebar-list" id="pub-list">
        <div class="sidebar-group-label">Saved</div>
        {#each visibleItems as item (item.name)}
          <button
            type="button"
            class:active={$publishersPanelState.selectedIndex === item.originalIndex}
            class="sidebar-item pub-item"
            data-idx={item.originalIndex}
            onclick={() => openPublisher(item.originalIndex)}
          >
            <span class={`proto-badge proto-${item.endpointType.toLowerCase()}`}>{item.endpointType}</span>
            <span class="item-name">{item.name}</span>
            <span class="item-status status-off"></span>
          </button>
        {/each}
      </div>
    </div>
    <div class="main-content">
      <div id="pub-empty-alert" class="empty-state" style:display={$publishersPanelState.hasPublishers ? "none" : "block"}>
        No publishers configured. Click "+" to create one.
      </div>
      <div id="pub-main-ui" style:display={$publishersPanelState.hasPublishers ? "contents" : "none"}>
        <div class="request-bar">
          <div class="request-field" id="pub-proto-wrap">
            <span class="request-field-label" id="pub-proto-label">Type</span>
            <input class="proto-select" id="pub-proto" readonly value={$publishersPanelState.endpointType} />
          </div>
          <div class="request-field" id="pub-method-wrap" style:display={$publishersPanelState.methodVisible ? "flex" : "none"}>
            <span class="request-field-label" id="pub-method-label">Method</span>
            <select
              class="method-select"
              id="pub-method"
              value={$publishersPanelState.methodValue}
              onchange={(event) => updatePublisherMethod((event.currentTarget as HTMLSelectElement).value)}
            >
              <option>POST</option>
              <option>GET</option>
              <option>PUT</option>
              <option>DELETE</option>
            </select>
          </div>
          <div class="request-field" id="pub-extra-1-wrap" style:display={$publishersPanelState.extraFieldOne.visible ? "flex" : "none"}>
            <span class="request-field-label" id="pub-extra-1-label">{$publishersPanelState.extraFieldOne.label}</span>
            <input
              class="url-input request-field-input"
              id="pub-extra-1"
              value={$publishersPanelState.extraFieldOne.value}
              placeholder={$publishersPanelState.extraFieldOne.placeholder}
              oninput={(event) => updatePublisherRequestField("pub-extra-1", (event.currentTarget as HTMLInputElement).value)}
            />
          </div>
          <div class="request-field" id="pub-extra-2-wrap" style:display={$publishersPanelState.extraFieldTwo.visible ? "flex" : "none"}>
            <span class="request-field-label" id="pub-extra-2-label">{$publishersPanelState.extraFieldTwo.label}</span>
            <input
              class="url-input request-field-input"
              id="pub-extra-2"
              value={$publishersPanelState.extraFieldTwo.value}
              placeholder={$publishersPanelState.extraFieldTwo.placeholder}
              oninput={(event) => updatePublisherRequestField("pub-extra-2", (event.currentTarget as HTMLInputElement).value)}
            />
          </div>
          <div class="request-field request-field--wide" id="pub-url-wrap" style:display={$publishersPanelState.urlField.visible ? "flex" : "none"}>
            <span class="request-field-label" id="pub-url-label">{$publishersPanelState.urlField.label}</span>
            <input
              class="url-input request-field-input"
              id="pub-url"
              value={$publishersPanelState.urlField.value}
              placeholder={$publishersPanelState.urlField.placeholder}
              oninput={(event) => updatePublisherRequestField("pub-url", (event.currentTarget as HTMLInputElement).value)}
            />
          </div>
          <wa-button variant="brand" size="small" id="pub-send" role="button" tabindex="0" onclick={sendPublisherAction}
            onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void sendPublisherAction())}>Send</wa-button
          >
        </div>
        <div class="content-tabs" id="pub-sub-tabs">
          <button type="button" class:active={$publishersPanelState.activeSubtab === "definition"} class="content-tab" data-target="pub-config-pane" id="ctab-config" onclick={() => openSubtab("definition")}>Definition</button>
          <button type="button" class:active={$publishersPanelState.activeSubtab === "payload"} class="content-tab" data-target="pub-payload-pane" id="ctab-payload" onclick={() => openSubtab("payload")}>Body</button>
          <button type="button" class:active={$publishersPanelState.activeSubtab === "headers"} class="content-tab" data-target="pub-meta-pane" onclick={() => openSubtab("headers")}>Headers</button>
          <button type="button" class:active={$publishersPanelState.activeSubtab === "history"} class="content-tab" data-target="pub-history-pane" onclick={() => openSubtab("history")}>History</button>
          <div style="flex:1"></div>
          <div
            class="content-tab"
            id="pub-response-tab"
            style:display={$publishersPanelState.responseVisible && $publishersPanelState.activeSubtab !== "definition" ? "flex" : "none"}
            style:color={$publishersPanelState.responseStatusColor}
          >
            {$publishersPanelState.responseTabLabel}
          </div>
        </div>
        <div class="pane-container">
          <div id="pub-top-content-wrapper" style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
            <div
              class="pane-top"
              id="pub-payload-pane"
              style="flex-direction:column;"
              style:display={$publishersPanelState.activeSubtab === "payload" ? "flex" : "none"}
            >
              <div class="section-toolbar">
                <div class="section-label">Request Body</div>
                <wa-button variant="neutral" appearance="outlined" size="small" id="pub-beautify" role="button" tabindex="0"
                  onclick={beautifyPublisherPayloadAction}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void beautifyPublisherPayloadAction())}
                  >Beautify JSON</wa-button
                >
              </div>
              <CodeEditor
                id="pub-payload"
                value={$publishersPanelState.requestPayload}
                placeholder="Request body"
                language="json-auto"
                onChange={updatePublisherPayload}
              />
            </div>
            <div
              class="pane-top"
              id="pub-meta-pane"
              style="flex-direction:column;"
              style:display={$publishersPanelState.activeSubtab === "headers" ? "flex" : "none"}
            >
              <div class="section-toolbar response-editor-header">
                <div class="section-label">Headers</div>
              </div>
              <div id="metadata-container">
                <HeaderRowsEditor
                  rows={$publishersPanelState.metadataRows}
                  addLabel="+ Add Header"
                  showEnabled={true}
                  onAdd={addPublisherMetadataRow}
                  onUpdate={updatePublisherMetadataRow}
                  onToggle={togglePublisherMetadataRow}
                  onRemove={removePublisherMetadataRow}
                />
              </div>
            </div>
            <div
              class="pane-top"
              id="pub-history-pane"
              style="flex-direction:column;"
              style:display={$publishersPanelState.activeSubtab === "history" ? "flex" : "none"}
            >
              <div class="section-toolbar">
                <span class="section-label">Execution History</span>
                <wa-button variant="neutral" appearance="outlined" size="small" class="ghost-action" id="pub-clear-history"
                  role="button"
                  tabindex="0"
                  onclick={clearHistory}
                  onkeydown={(event: KeyboardEvent) => handleActionKey(event, clearHistory)}
                  >Clear</wa-button
                >
              </div>
              <div style="overflow:auto;flex:1;">
                <table class="msg-table">
                  <thead>
                    <tr>
                      <th style="width: 100px;">Time</th>
                      <th style="width: 80px;">Status</th>
                      <th>Payload Preview</th>
                    </tr>
                  </thead>
                  <tbody>
                    {#if $publishersPanelState.historyRows.length === 0}
                      <tr>
                        <td colspan="3" style="text-align:center;padding:20px;color:var(--text-dim);">
                          No history for this publisher.
                        </td>
                      </tr>
                    {:else}
                      {#each $publishersPanelState.historyRows as row (row.historyIndex)}
                        <tr class="history-row" style="cursor:zoom-in;" onclick={() => openHistoryRow(row.historyIndex)}>
                          <td class="ts">{row.timeLabel}</td>
                          <td><span class={`${row.statusClass} small fw-bold`}>{row.statusLabel}</span></td>
                          <td class="preview">{row.payloadPreview}</td>
                        </tr>
                      {/each}
                    {/if}
                  </tbody>
                </table>
              </div>
            </div>
            <div
              class="pane-top pane-top-form"
              id="pub-config-pane"
              style="flex-direction:column;"
              style:display={$publishersPanelState.activeSubtab === "definition" ? "flex" : "none"}
            >
              <div class="section-toolbar editor-action-bar editor-action-bar--compact">
                <div class="form-actions-row section-actions section-actions-right">
                  <div class="editor-action-cluster">
                    <wa-button variant="neutral" appearance="outlined" size="small" id="pub-copy" role="button" tabindex="0"
                      onclick={copyCurrentPublisherAction}
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void copyCurrentPublisherAction())}
                      >Copy to...</wa-button
                    >
                    <wa-button variant="neutral" appearance="outlined" size="small" id="pub-clone" role="button" tabindex="0"
                      onclick={cloneCurrentPublisherAction}
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, cloneCurrentPublisherAction)}
                      >Clone</wa-button
                    >
                  </div>
                  <div class="toolbar-divider" aria-hidden="true"></div>
                  <div class="editor-action-cluster">
                    <wa-button variant="brand" size="small" id="pub-save" role="button" tabindex="0"
                      onclick={(event: MouseEvent) => saveCurrentPublisherAction(event.currentTarget as HTMLElement)}
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void saveCurrentPublisherAction(document.getElementById("pub-save")))}>Save</wa-button>
                    <wa-button variant="danger" appearance="outlined" size="small" id="pub-delete" role="button" tabindex="0"
                      onclick={() => deleteCurrentPublisherAction(document.getElementById("pub-save"))}
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void deleteCurrentPublisherAction(document.getElementById("pub-save")))}
                      >Delete</wa-button
                    >
                  </div>
                </div>
              </div>
              <div class="form-scroll-wrapper">
                <div id="pub-config-form" class="field-grid"></div>
              </div>
            </div>
          </div>
          <div class="pane-divider" id="pub-pane-divider" style:display={$publishersPanelState.activeSubtab !== "definition" && $publishersPanelState.responseVisible ? "block" : "none"}></div>
          <div class="pane-bottom" id="pub-response-container" style:display={$publishersPanelState.responseVisible && $publishersPanelState.activeSubtab !== "definition" ? "flex" : "none"}>
            <div class="detail-header">
              <span id="pub-response-status">
                <span style={`color:${$publishersPanelState.responseStatusColor};font-weight:bold;padding:2px 4px;border-radius:3px;background:rgba(0,0,0,0.2);`}>
                  {$publishersPanelState.responseStatusLabel}{$publishersPanelState.responseStatusText ? ` ${$publishersPanelState.responseStatusText}` : ""}
                </span>
                {#if $publishersPanelState.responseDurationLabel}
                  <span style="margin-left:12px;opacity:0.8;">
                    Time:
                    <strong style="color:var(--text-primary);">{$publishersPanelState.responseDurationLabel}</strong>
                  </span>
                {/if}
                {#if $publishersPanelState.responseSizeLabel}
                  <span style="margin-left:12px;opacity:0.8;">
                    Size:
                    <strong style="color:var(--text-primary);">{$publishersPanelState.responseSizeLabel}</strong>
                  </span>
                {/if}
              </span>
              <span
                style="margin-left:auto; cursor:pointer; color:var(--text-dim)"
                id="pub-resp-copy"
                role="button"
                tabindex="0"
                onclick={copyResponse}
                onkeydown={(event: KeyboardEvent) => handleActionKey(event, copyResponse)}
                >⊕ copy</span
              >
            </div>
            <div class="detail-body" id="pub-response">
              {#if $publishersPanelState.requestRows.length > 0 || $publishersPanelState.requestHeaders.length > 0}
                <div class="response-meta-block">
                  <div class="section-label">Request</div>
                  {#each $publishersPanelState.requestRows as [key, value] (`req:${key}:${value}`)}
                    <div class="response-meta-row">
                      <span class="response-meta-key">{key}</span>
                      <span class="response-meta-value">{value}</span>
                    </div>
                  {/each}
                  {#if $publishersPanelState.requestHeaders.length > 0}
                    <div class="section-label" style="margin-top:10px;">Headers</div>
                    {#each $publishersPanelState.requestHeaders as [key, value] (`hdr:${key}:${value}`)}
                      <div class="response-meta-row">
                        <span class="response-meta-key">{key}</span>
                        <span class="response-meta-value">{value}</span>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
              {#if $publishersPanelState.responseHeaders.length > 0}
                <div class="response-meta-block">
                  <div class="section-label">Response Headers</div>
                  {#each $publishersPanelState.responseHeaders as [key, value] (`resp:${key}:${value}`)}
                    <div class="response-meta-row">
                      <span class="response-meta-key">{key}</span>
                      <span class="response-meta-value">{value}</span>
                    </div>
                  {/each}
                </div>
                <div class="section-label">Body</div>
              {/if}
              <div id="pub-actual-payload" style="white-space: pre-wrap; font-family: var(--font); color: var(--text-payload);">
                {$publishersPanelState.responsePayload}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
