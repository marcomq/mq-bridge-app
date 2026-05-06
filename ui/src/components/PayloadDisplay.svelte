<script lang="ts">
  import CodeEditor from "./CodeEditor.svelte";
  import { formatPayload, type PayloadViewMode } from "../lib/payload-format";

  export type { PayloadViewMode };

  let {
    id = "",
    payload = "",
    contentType = "",
    readOnly = true,
    label = "",
    onChange = (_value: string) => {},
  }: {
    id?: string;
    payload?: string | Uint8Array | null;
    contentType?: string;
    readOnly?: boolean;
    label?: string;
    onChange?: (value: string) => void;
  } = $props();

  let currentViewMode = $state<PayloadViewMode>("auto");
  let showWhitespace = $state(false);
  let showLineEndings = $state(false);
  let wrapLines = $state(true);

  let formattedPayload = $derived(formatPayload(payload, currentViewMode, contentType));

  // New state to hold user's raw hex input when actively editing
  let userHexInput: string | null = $state(null);
  let isEditingHex = $state(false);

  function handleEditorChange(newValue: string) {
    if (readOnly) return;

    if (currentViewMode === "hex") {
      isEditingHex = true;
      userHexInput = newValue;
      try {
        // Strip the ASCII preview and clean whitespace from the hex part
        const hexPart = newValue.split("|")[0] || "";
        const cleanedHex = hexPart.replace(/\s/g, "");
        // Only sync back to store if we have complete byte pairs (even length)
        if (cleanedHex.length > 0 && cleanedHex.length % 2 === 0) {
          onChange(cleanedHex);
        }
      } catch (e) {
        /* ignore partial hex while typing */
      }
    } else {
      isEditingHex = false;
      userHexInput = null;
      onChange(newValue);
    }
  }

  function handleEditorBlur() {
    if (currentViewMode === "hex" && isEditingHex && userHexInput !== null) {
      try {
        const hexPart = userHexInput.split("|")[0] || "";
        const cleanedHex = hexPart.replace(/\s/g, "");
        if (cleanedHex.length > 0) {
          onChange(cleanedHex);
        }
      } catch (e) {
        console.error("Failed to commit hex on blur", e);
      }
    }
    isEditingHex = false;
    userHexInput = null;
  }

  function setViewMode(mode: PayloadViewMode) {
    currentViewMode = mode;
    isEditingHex = false;
    userHexInput = null;
  }

  function handleImportFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const decodedString = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      onChange(decodedString);
      currentViewMode = "text";
    };
    input.click();
  }
</script>

<div {id} class="payload-display-container">
  <div class="payload-toolbar">
    <div class="view-mode-selector">
      {#if label}<span class="toolbar-label">{label}</span>{/if}
      <button class:active={currentViewMode === 'auto'} type="button" onclick={() => setViewMode('auto')}>Auto</button>
      <button class:active={currentViewMode === 'text'} type="button" onclick={() => setViewMode('text')}>Text</button>
      <button class:active={currentViewMode === 'json'} type="button" onclick={() => setViewMode('json')}>JSON</button>
      <button class:active={currentViewMode === 'xml'} type="button" onclick={() => setViewMode('xml')}>XML</button>
      <button class:active={currentViewMode === 'hex'} type="button" onclick={() => setViewMode('hex')}>Hex</button>
    </div>

    <div class="display-options">
      <label title="Show whitespace">
        <input type="checkbox" bind:checked={showWhitespace} /> <span>Whitespace</span>
      </label>
      <label title="Show line endings">
        <input type="checkbox" bind:checked={showLineEndings} /> <span>Endings</span>
      </label>
      <label title="Toggle line wrapping">
        <input type="checkbox" bind:checked={wrapLines} /> <span>Wrap</span>
      </label>

      {#if !readOnly}
        <div class="toolbar-divider"></div>
        <button class="toolbar-btn" type="button" onclick={handleImportFile} title="Load from file">
          Import
        </button>
      {/if}
    </div>
  </div>

  <div class="payload-content">
    <CodeEditor
      id={id ? `${id}-editor` : ""}
      value={isEditingHex && userHexInput !== null ? userHexInput : formattedPayload.formatted}
      language={formattedPayload.language}
      onChange={handleEditorChange}
      onBlur={handleEditorBlur}
      readOnly={readOnly}
      wrapLines={wrapLines}
      showWhitespace={showWhitespace}
      showLineEndings={showLineEndings}
    />
  </div>
</div>

<style>
  .payload-display-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
  }

  .payload-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 4px;
    background-color: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    gap: 8px;
  }

  .view-mode-selector, .display-options {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .toolbar-label {
    font-size: 10px;
    font-weight: bold;
    color: var(--text-dim);
    text-transform: uppercase;
    margin-right: 4px;
  }

  .view-mode-selector button, .toolbar-btn {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 500;
    transition: all 0.1s ease;
  }

  .view-mode-selector button.active {
    background-color: var(--accent-color) !important;
    color: var(--text-on-accent);
    border-color: var(--accent-color-dark, var(--accent-color));
    box-shadow: inset 0 1px 2px var(--shadow-color);;
    font-weight: 700;
  }

  .display-options label {
    font-size: 9px;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    color: var(--text-dim);
    text-transform: uppercase;
    user-select: none;
    white-space: nowrap; /* Prevent labels from wrapping */
    min-width: 60px; /* Ensure consistent width to prevent movement */
    padding: 0 2px; /* Small horizontal padding for labels */
  }

  .display-options input[type="checkbox"] {
    margin: 0;
    width: 11px;
    height: 11px;
  }

  .toolbar-divider {
    width: 1px;
    height: 12px;
    background-color: var(--border-color);
    margin: 0 4px;
  }

  .payload-content {
    flex: 1;
    overflow: auto;
    background-color: var(--bg-editor);
    color: var(--text-payload);
    min-height: 0;
    border: 1px solid var(--border-color);
    border-top: none;
   }
</style>
