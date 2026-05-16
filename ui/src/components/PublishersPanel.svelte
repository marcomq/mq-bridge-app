<script lang="ts">
  import { get } from "svelte/store";
  import { activeMainTab, publishersPanelState } from "../lib/stores";
  import type { PublisherTreeNode } from "../lib/publisher-grouping";
  import HeaderRowsEditor from "./HeaderRowsEditor.svelte";
  import "@awesome.me/webawesome/dist/components/button/button.js";
  import "@awesome.me/webawesome/dist/components/details/details.js";
  import PayloadDisplay from "./PayloadDisplay.svelte"; // Use new PayloadDisplay component
  import { onMount } from "svelte";
  import { PUBLISHER_TYPE_OPTIONS } from "../lib/publishers-view";
  import {
    addPublisherAction,
    addPublisherMetadataRow,
    beautifyPublisherPayloadAction,
    clearActivePublisherHistory,
    copyPublisherResponse,
    copyPublisherResponseJson,
    copyPublisherAsCurl,
    copyCurrentPublisherAction,
    importAsyncApiToPublisherAction,
    importMqbToPublisherAction,
    importOpenApiToPublisherAction,
    importPostmanToPublisherAction,
    resendPublisherHistoryAction,
    deleteCurrentPublisherAction,
    removePublisherMetadataRow,
    restorePublisherStateFromView,
    saveCurrentPublisherVariantAction,
    savePublisherHistoryAsPublisherAction,
    selectPublisherSubtab,
    sendPublisherAction,
    showPublisherHistoryEntry,
    togglePublisherMetadataRow,
    updatePublisherMetadataRow,
    updatePublisherMethod,
    updatePublisherPayload,
    updatePublisherRequestField,
  } from "../lib/publishers-view";
  import { handleActionKey, getEntityDisplayLabel } from "../lib/utils";
  import { getMqbState, mqbDialogs } from "../lib/runtime-window";

  let filterText = $state("");
  let addMenuOpen = $state(false);
  let historyFilterText = $state("");
  let copyFeedback = $state("");
  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let importInputEl: HTMLInputElement | null = null;
  let publishersContainerEl: HTMLDivElement | null = null;
  let selectedImportKind = $state<"postman" | "openapi" | "asyncapi" | "mqb">("postman");
  let expandedGroupIds = $state<Set<string>>(new Set());
  let knownGroupIds = $state<Set<string>>(new Set());
  let sidebarWidth = $state<number | null>(null);

  type VisibleTreeRow =
    | { kind: "group"; id: string; label: string; depth: number; expanded: boolean; endpointType?: string; tooltip?: string }
    | { kind: "publisher"; id: string; label: string; depth: number; endpointType: string; publisherIndex: number; tooltip?: string };

  function getPublisherLabel(node: any) {
    if (node.label && node.label.trim()) return node.label;
    const pub = node.publisher;
    if (!pub) return "Unnamed Publisher";
    return getEntityDisplayLabel(pub.name, pub.endpoint);
  }

  function collectDefaultExpanded(nodes: PublisherTreeNode[], depth = 0, acc = new Set<string>()) {
    for (const node of nodes) {
      if (node.kind === "group") {
        acc.add(node.id);
        collectDefaultExpanded(node.children, depth + 1, acc);
      }
    }
    return acc;
  }

  function filterTree(nodes: PublisherTreeNode[], query: string): PublisherTreeNode[] {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;

    const result: PublisherTreeNode[] = [];
    for (const node of nodes) {
      if (node.kind === "publisher") {
        const label = getPublisherLabel(node);
        const matches = label.toLowerCase().includes(q)
          || String(node.tooltip || "").toLowerCase().includes(q);
        if (matches) {
          result.push(node);
        }
        continue;
      }

      const children = filterTree(node.children, query);
      if (children.length > 0 || (node.label || "").toLowerCase().includes(q) || String(node.tooltip || "").toLowerCase().includes(q)) {
        result.push({ ...node, children });
      }
    }
    return result;
  }

  function subtreeHasMatch(node: PublisherTreeNode, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return false;

    if (node.kind === "publisher") {
      const label = getPublisherLabel(node);
      return label.toLowerCase().includes(q) || String(node.tooltip || "").toLowerCase().includes(q);
    }

    return (node.label || "").toLowerCase().includes(q) 
      || String(node.tooltip || "").toLowerCase().includes(q) 
      || node.children.some((child) => subtreeHasMatch(child, query));
  }

  function flattenTree(nodes: PublisherTreeNode[], depth = 0): VisibleTreeRow[] {
    const rows: VisibleTreeRow[] = [];
    const isFiltering = filterText.trim().length > 0;
    for (const node of nodes) {
      if (node.kind === "group") {
        const expanded = expandedGroupIds.has(node.id) || (isFiltering && subtreeHasMatch(node, filterText));
        rows.push({
          kind: "group",
          id: node.id,
          label: node.label,
          depth,
          expanded,
          endpointType: node.endpointType,
          tooltip: node.tooltip,
        });
        if (expanded) {
          rows.push(...flattenTree(node.children, depth + 1));
        }
        continue;
      }

      rows.push({
        kind: "publisher",
        id: node.id,
        label: node.label,
        depth,
        endpointType: node.endpointType,
        publisherIndex: node.publisherIndex,
        tooltip: node.tooltip,
      });
    }
    return rows;
  }

  $effect(() => {
    const defaults = collectDefaultExpanded($publishersPanelState.groupedItems || []);
    const nextKnown = new Set(knownGroupIds);
    const merged = new Set(expandedGroupIds);
    let changed = false;

    for (const groupId of defaults) {
      if (!nextKnown.has(groupId)) {
        nextKnown.add(groupId);
        merged.add(groupId);
        changed = true;
      }
    }

    if (changed) {
      knownGroupIds = nextKnown;
      expandedGroupIds = merged;
    }
  });

  const visibleTreeRows = $derived.by(() =>
    flattenTree(filterTree($publishersPanelState.groupedItems || [], filterText)));

  onMount(() => {
    const handler = (e: MouseEvent) => {
      if (addMenuOpen && !(e.target as HTMLElement).closest(".add-menu-container")) {
        addMenuOpen = false;
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  });

  function openPublisher(originalIndex: number) {
    getMqbState().last_publisher_idx = originalIndex;
    (window as any)._mqb_last_publisher_idx = originalIndex;
    window.history.replaceState(null, "", `#publishers:${originalIndex}`);
    restorePublisherStateFromView(originalIndex);
  }

  function handleAdd(type: string) {
    void addPublisherAction(type);
    addMenuOpen = false;
  }

  function openHistoryRow(historyIndex: number) {
    showPublisherHistoryEntry(historyIndex);
  }

  function clearHistory() {
    clearActivePublisherHistory();
  }

  function copyResponse() {
    copyPublisherResponse();
    showCopyFeedback("Copied");
  }

  function copyResponseJson() {
    copyPublisherResponseJson();
    showCopyFeedback("Copied JSON");
  }

  function copyAsCurl() {
    copyPublisherAsCurl();
    showCopyFeedback("Copied curl");
  }

  function showCopyFeedback(text: string) {
    copyFeedback = text;
    if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer);
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback = "";
      copyFeedbackTimer = null;
    }, 1200);
  }

  const filteredHistoryRows = $derived(
    $publishersPanelState.historyRows.filter((row) => {
      const q = historyFilterText.trim().toLowerCase();
      if (!q) return true;
      return (
        row.timeLabel.toLowerCase().includes(q) ||
        row.statusLabel.toLowerCase().includes(q) ||
        row.payloadPreview.toLowerCase().includes(q)
      );
    }),
  );
  function openSubtab(tab: "payload" | "headers" | "history" | "definition") {
    selectPublisherSubtab(tab);
  }

  function openImportPicker(kind: "postman" | "openapi" | "asyncapi" | "mqb") {
    selectedImportKind = kind;
    importInputEl?.click();
  }

  async function handleImportSelected(event: Event) {
    const target = event.currentTarget as HTMLInputElement | null;
    const file = target?.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      if (selectedImportKind === "postman") {
        await importPostmanToPublisherAction(text);
      } else if (selectedImportKind === "openapi") {
        await importOpenApiToPublisherAction(text);
      } else if (selectedImportKind === "asyncapi") {
        await importAsyncApiToPublisherAction(text);
      } else {
        await importMqbToPublisherAction(text);
      }

      // Force a fresh restore pass so sidebar + detail always reflect imported state.
      const selectedIndex = get(publishersPanelState).selectedIndex || 0;
      void restorePublisherStateFromView(selectedIndex, { tab: "definition" });

      await mqbDialogs.alert("✅ Import completed successfully.", "Import Success");
      openSubtab("definition");
    } catch (error) {
      await mqbDialogs.alert(`Import failed: ${(error as Error).message}`, "Import");
    } finally {
      if (target) target.value = "";
    }
  }

  function toggleGroup(groupId: string) {
    const next = new Set(expandedGroupIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    expandedGroupIds = next;
  }

  function startSidebarResize(event: MouseEvent) {
    event.preventDefault();
    const containerRect = publishersContainerEl?.getBoundingClientRect();
    if (!containerRect) return;

    const minWidth = 220;
    const maxWidth = Math.max(minWidth, Math.min(640, Math.floor(containerRect.width * 0.6)));

    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, moveEvent.clientX - containerRect.left));
      sidebarWidth = nextWidth;
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
</script>

<div class:active={$activeMainTab === "publishers"} class="tab-content-panel" id="tab-publishers">
  <div bind:this={publishersContainerEl} id="publishers-container" class="publishers-layout">
    <div class="sidebar" style={`width:${sidebarWidth ?? 280}px;`}>
      <div class="sidebar-header">
        <input class="sidebar-search" id="pub-filter" type="text" placeholder="Filter publishers…" bind:value={filterText} />
        <div class="add-menu-container">
          <wa-button
            size="small"
            appearance="outlined"
            class="icon-button"
            id="pub-add"
            title="Add publisher"
            role="button"
            tabindex="0"
            onclick={() => (addMenuOpen = !addMenuOpen)}
            onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => (addMenuOpen = !addMenuOpen))}
            >+</wa-button>
          {#if addMenuOpen}
            <div class="add-menu">
              {#each PUBLISHER_TYPE_OPTIONS as type (type)}
                <button type="button" onclick={() => handleAdd(type)}>{type.toUpperCase()}</button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
      <div class="sidebar-list" id="pub-list">
        <div class="sidebar-group-label">Saved</div>
        {#each visibleTreeRows as row, i (row.id + '-' + i)}
          {#if row.kind === "group"}
            <button
              type="button"
              class="sidebar-item sidebar-item--group"
              title={row.tooltip}
              onclick={() => toggleGroup(row.id)}
              onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => toggleGroup(row.id))}
            >
              <span class="tree-guide" aria-hidden="true" style={`width:${row.depth * 14}px;`}></span>
              {#if row.depth === 0 && row.endpointType}
                <span class={`proto-badge proto-${row.endpointType.toLowerCase()}`}>{row.endpointType}</span>
              {/if}
              <span class="tree-caret">{row.expanded ? "▾" : "▸"}</span>
              <span class="item-name">{row.label}</span>
            </button>
          {:else}
            <button
              type="button"
              class:active={$publishersPanelState.selectedIndex === row.publisherIndex}
              class="sidebar-item pub-item"
              data-idx={row.publisherIndex}
              title={row.tooltip}
              onclick={() => openPublisher(row.publisherIndex)}
            >
              <span class="tree-guide" aria-hidden="true" style={`width:${row.depth * 14}px;`}></span>
              {#if row.depth === 0}
                <span class={`proto-badge proto-${row.endpointType.toLowerCase()}`}>{row.endpointType}</span>
              {/if}
              <span class="item-name">{getPublisherLabel(row)}</span>
              <span class="item-status status-off"></span>
            </button>
          {/if}
        {/each}
      </div>
      <div class="sidebar-import-actions">
        <button class="wa-native-button wa-native-button--neutral sidebar-import-button" type="button" onclick={() => openImportPicker("postman")}>
          Import Postman
        </button>
        <button class="wa-native-button wa-native-button--neutral sidebar-import-button" type="button" onclick={() => openImportPicker("openapi")}>
          Import OpenAPI
        </button>
        <button class="wa-native-button wa-native-button--neutral sidebar-import-button" type="button" onclick={() => openImportPicker("asyncapi")}>
          Import AsyncAPI
        </button>
        <button class="wa-native-button wa-native-button--neutral sidebar-import-button" type="button" onclick={() => openImportPicker("mqb")}>
          Import mq-bridge
        </button>
        <input
          bind:this={importInputEl}
          type="file"
          accept=".json,application/json"
          style="display:none"
          onchange={handleImportSelected}
        />
      </div>
    </div>
    <button
      type="button"
      class="sidebar-resizer"
      aria-label="Resize publisher sidebar"
      tabindex="0"
      onmousedown={startSidebarResize}
    ></button>
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
              onchange={(event: any) => updatePublisherMethod((event.currentTarget as HTMLSelectElement).value)}
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
              oninput={(event: any) => updatePublisherRequestField("pub-extra-1", (event.currentTarget as HTMLInputElement).value)}
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
              <PayloadDisplay
                id="pub-payload"
                label="Request Body"
                payload={$publishersPanelState.requestPayload}
                contentType={$publishersPanelState.requestContentType || ''}
                readOnly={false}
                onChange={updatePublisherPayload}
              >
              </PayloadDisplay>
            </div>
            <div
              class="pane-top"
              id="pub-meta-pane"
              style="flex-direction:column;"
              style:display={$publishersPanelState.activeSubtab === "headers" ? "flex" : "none"}
            >
              <div id="metadata-container" style="flex: 1; overflow: auto;">
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
                <input class="sidebar-search" style="max-width:220px;" placeholder="Filter history..." bind:value={historyFilterText} />
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
                    {#if filteredHistoryRows.length === 0}
                      <tr>
                        <td colspan="3" style="text-align:center;padding:20px;color:var(--text-dim);">
                          No history for this publisher.
                        </td>
                      </tr>
                    {:else}
                      {#each filteredHistoryRows as row (row.historyIndex)}
                        <tr
                          class="history-row"
                          style="cursor:pointer;"
                          role="button"
                          tabindex="0"
                          onclick={() => openHistoryRow(row.historyIndex)}
                          onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => openHistoryRow(row.historyIndex))}
                        >
                          <td class="ts">{row.timeLabel}</td>
                          <td>
                            <span class={`${row.statusClass} small fw-bold`}>{row.statusLabel}</span>
                          </td>
                          <td class="preview">
                            <div class="history-preview-row">
                              <span class="history-preview-text">{row.payloadPreview}</span>
                              <span class="history-preview-actions">
                              <wa-button
                                size="small"
                                appearance="outlined"
                                variant="neutral"
                                role="button"
                                tabindex="0"
                                onclick={(event: MouseEvent) => { event.stopPropagation(); void savePublisherHistoryAsPublisherAction(row.historyIndex); }}
                                onkeydown={(event: KeyboardEvent) => { event.stopPropagation(); handleActionKey(event, () => void savePublisherHistoryAsPublisherAction(row.historyIndex)); }}
                              >Save As Publisher</wa-button>
                              <wa-button
                                size="small"
                                appearance="outlined"
                                variant="neutral"
                                role="button"
                                tabindex="0"
                                onclick={(event: MouseEvent) => { event.stopPropagation(); void resendPublisherHistoryAction(row.historyIndex); }}
                                onkeydown={(event: KeyboardEvent) => { event.stopPropagation(); handleActionKey(event, () => void resendPublisherHistoryAction(row.historyIndex)); }}
                              >Resend</wa-button>
                              </span>
                            </div>
                          </td>
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
                    <wa-button 
                      variant="neutral" 
                      appearance="outlined" 
                      size="small" 
                      id="pub-copy" 
                      onclick={copyCurrentPublisherAction} 
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void copyCurrentPublisherAction())} 
                      role="button" 
                      tabindex="0"
                      >Copy to Consumer</wa-button
                    >
                    <wa-button
                      variant="neutral"
                      appearance="outlined"
                      size="small"
                      id="pub-save-variant"
                      onclick={saveCurrentPublisherVariantAction}
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void saveCurrentPublisherVariantAction())}
                      role="button"
                      tabindex="0"
                    >Save As New</wa-button>
                  </div>
                  <div class="toolbar-divider" aria-hidden="true"></div>
                  <div class="editor-action-cluster">
                    <wa-button variant="danger" appearance="outlined" size="small" id="pub-delete"
                      role="button" tabindex="0"
                      onclick={() => deleteCurrentPublisherAction()}
                      onkeydown={(event: KeyboardEvent) => handleActionKey(event, () => void deleteCurrentPublisherAction())}
                      >Delete</wa-button
                    >
                  </div>
                </div>
              </div>
              <div class="form-scroll-wrapper">
                <div class="section-label">Definition</div>
                <div id="pub-config-form" class="field-grid"></div>
              </div>
            </div>
          </div>
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
              {#if copyFeedback}
                <span style="margin-left:10px;color:var(--accent-http);font-weight:600;">{copyFeedback}</span>
              {/if}
              <span
                style="margin-left:10px; cursor:pointer; color:var(--text-dim)"
                role="button"
                tabindex="0"
                onclick={copyResponseJson}
                onkeydown={(event: KeyboardEvent) => handleActionKey(event, copyResponseJson)}
                >json</span
              >
              <span
                style="margin-left:10px; cursor:pointer; color:var(--text-dim)"
                role="button"
                tabindex="0"
                onclick={copyAsCurl}
                onkeydown={(event: KeyboardEvent) => handleActionKey(event, copyAsCurl)}
                >curl</span
              >
            </div>
            <div class="detail-body" id="pub-response">
              {#if $publishersPanelState.requestRows.length > 0 || $publishersPanelState.requestHeaders.length > 0}
                <wa-details summary="Request" open 
                  class="response-meta-block" 
                  icon-placement="start">
                  <span slot="expand-icon">▸</span>
                  <span slot="collapse-icon">▸</span>
                  {#each $publishersPanelState.requestRows as [key, value], i (`req:${key}:${value}-${i}`)}
                    <div class="response-meta-row">
                      <span class="response-meta-key">{key}</span>
                      <span class="response-meta-value">{value}</span>
                    </div>
                  {/each}
                  {#if $publishersPanelState.requestHeaders.length > 0}
                    <div class="section-label" style="margin-top:10px;">Headers</div>
                    {#each $publishersPanelState.requestHeaders as [key, value], i (`hdr:${key}:${value}-${i}`)}
                      <div class="response-meta-row">
                        <span class="response-meta-key">{key}</span>
                        <span class="response-meta-value">{value}</span>
                      </div>
                    {/each}
                  {/if}
                </wa-details>
              {/if}
              {#if $publishersPanelState.responseHeaders.length > 0}
                <wa-details summary="Response Headers" open 
                  class="response-meta-block" 
                  icon-placement="start">
                    <span slot="expand-icon">▸</span>
                    <span slot="collapse-icon">▸</span>
                    {#each $publishersPanelState.responseHeaders as [key, value], i (`resp:${key}:${value}-${i}`)}
                    <div class="response-meta-row">
                      <span class="response-meta-key">{key}</span>
                      <span class="response-meta-value">{value}</span>
                    </div>
                  {/each}
                </wa-details>
              {/if}
              <PayloadDisplay 
                id="pub-actual-payload"
                label="Response Body"
                payload={$publishersPanelState.responsePayload}
                contentType={$publishersPanelState.responseContentType || ''}
                readOnly={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
