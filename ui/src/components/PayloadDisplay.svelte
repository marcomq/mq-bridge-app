<script lang="ts">
  import CodeEditor from "./CodeEditor.svelte";
  import { isPrintableAscii, toHexString, fromHexString, uint8ArrayToString, stringToUint8ArrayLatin1 } from "../lib/utils";

  export type PayloadViewMode = "auto" | "text" | "json" | "hex";

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

  let displayPayload = $state("");
  let editorLanguage = $state<"text" | "json" | "json-auto">("text");

  // New state to hold user's raw hex input when actively editing
  let userHexInput: string | null = $state(null);
  let isEditingHex = $state(false);


  // Utility to check if a string is valid JSON
  function isValidJson(str: string): boolean {
    const trimmed = str.trim();
    // Only consider it JSON if it starts and ends with { } or [ ]
    if (!((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
          (trimmed.startsWith("[") && trimmed.endsWith("]")))) {
      return false;
    }
    try {
      JSON.parse(trimmed);
      return true;
    } catch (e) {
      return false;
    }
  }

  function toHexPreview(bytes: Uint8Array): string {
    const hex = toHexString(bytes);
    const ascii = Array.from(bytes)
      .map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : "."))
      .join("");
    return `${hex}  |  ${ascii}`;
  }

  function stringToBytes(str: string): Uint8Array {
    try {
      return new TextEncoder().encode(str);
    } catch {
      const bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
      }
      return bytes;
    }
  }

  // Converts the payload prop (string or Uint8Array) into a Uint8Array
  function getPayloadAsBytes(p: string | Uint8Array | null | undefined): Uint8Array {
    if (p === null || p === undefined) {
      return new Uint8Array(0);
    }
    if (p instanceof Uint8Array) {
      return p;
    }
    // If it's a string, try to interpret it.
    // If it's a hex string, convert from hex.
    // Otherwise, treat as Latin1 string to preserve bytes.
    const trimmed = p.trim();
    if (trimmed.match(/^[0-9a-fA-F\s]*$/) && trimmed.length > 0) {
      try {
        return fromHexString(trimmed.replace(/\s/g, ''));
      } catch (e) {
        // Fallback if fromHexString fails (e.g., odd length hex string)
        return stringToUint8ArrayLatin1(p);
      }
    }
    return stringToUint8ArrayLatin1(p);
  }
  
  // Function to determine the best view mode and format the payload
  function formatPayload(
    rawPayload: string | Uint8Array | null | undefined, // Explicitly allow null/undefined
    mode: PayloadViewMode,
    currentContentType: string,
    currentShowWhitespace: boolean,
    currentShowLineEndings: boolean,
  ): { formatted: string; language: "text" | "json" | "json-auto" } {
    let payloadAsString = "";
    if (rawPayload === null || rawPayload === undefined) {
      rawPayload = ""; // Treat null/undefined as empty string for processing
    }

    let isBinaryData = false;
    let originalBytes: Uint8Array | null = null;

    if (rawPayload instanceof Uint8Array) {
      originalBytes = rawPayload;
      payloadAsString = uint8ArrayToString(rawPayload);
      if (payloadAsString === "[BINARY DATA]" && rawPayload.length > 0) {
        isBinaryData = true;
      }
    } else {
      payloadAsString = rawPayload;
      // Check if string contains non-printable ASCII characters, suggesting binary
      if (payloadAsString.length > 0 && !isPrintableAscii(payloadAsString)) {
         isBinaryData = true;
      }
      // If the string itself is a hex representation, we should treat it as binary data
      if (payloadAsString.match(/^[0-9a-fA-F\s]*$/) && payloadAsString.trim().length > 0) {
        isBinaryData = true;
      }
    }

    let effectiveMode = mode;
    if (mode === "auto") {
      if (currentContentType.includes("json") && isValidJson(payloadAsString)) {
        effectiveMode = "json";
      } else if (isValidJson(payloadAsString)) {
        effectiveMode = "json";
      } else if (isBinaryData) {
        effectiveMode = "hex";
      } else {
        effectiveMode = "text";
      }
    }

    let formatted = payloadAsString;
    let language: "text" | "json" | "json-auto" = "text";

    if (effectiveMode === "json") {
      try {
        formatted = JSON.stringify(JSON.parse(payloadAsString), null, 2);
        language = "json";
      } catch (e) {
        // Fallback to text if not valid JSON
        formatted = payloadAsString;
        language = "text";
        if (mode === "json") { // If user explicitly chose JSON, log debug message
            console.debug("Payload is not valid JSON, displaying as plain text:", e);
        }
      }
    } else if (effectiveMode === "hex") {
      let bytesToFormat: Uint8Array;
      if (rawPayload instanceof Uint8Array) {
        bytesToFormat = rawPayload;
      } else if (typeof rawPayload === 'string' && rawPayload.match(/^[0-9a-fA-F\s]*$/)) {
        // If the rawPayload is already a hex string (from store), convert it to bytes
        bytesToFormat = fromHexString(rawPayload);
      } else {
        // If it's a regular string (text mode content), encode it to bytes
        // We use latin1 here to ensure every character maps to a byte,
        // as the store expects a string representation of the bytes.
        bytesToFormat = stringToUint8ArrayLatin1(payloadAsString);
      }
      formatted = toHexPreview(bytesToFormat);
      language = "text"; // Hex view is text, not JSON
    } else { // text mode or auto fallback to text
      formatted = payloadAsString;
      language = "text";
    }

    // Apply whitespace/line ending visibility for text/json modes
    // For hex, we usually don't want these visual cues as it's already a formatted representation.
    if (effectiveMode !== "hex") {
        if (currentShowWhitespace) {
            // Replace spaces with middle dot, tabs with right arrow
            formatted = formatted.replace(/ /g, '·').replace(/\t/g, '→');
        }
        if (currentShowLineEndings) {
            // Replace CR+LF with ␍↵, LF with ↵, CR with ␍
            formatted = formatted.replace(/\r\n/g, '␍↵\r\n').replace(/(?<!\r)\n/g, '↵\n').replace(/\r(?![\n])/g, '␍\r');
        }
    }

    return { formatted, language };
  }

  $effect(() => {
    // Convert the raw payload (which might be a hex string) into bytes first
    const payloadBytes = getPayloadAsBytes(payload); // Ensure payload is in bytes for consistent processing
    const { formatted, language } = formatPayload(payloadBytes, currentViewMode, contentType, showWhitespace, showLineEndings);
    if (displayPayload !== formatted) {
      displayPayload = formatted;
    }
    editorLanguage = language;
  });

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
      // Always try to decode as UTF-8. If it fails, store as Latin1 string.
      const decodedString = uint8ArrayToString(bytes);
      onChange(decodedString !== "[BINARY DATA]" ? decodedString : new TextDecoder("latin1").decode(bytes));
      currentViewMode = decodedString !== "[BINARY DATA]" ? "text" : "hex";
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
      value={isEditingHex && userHexInput !== null ? userHexInput : displayPayload}
      language={editorLanguage}
      onChange={handleEditorChange}
      onBlur={handleEditorBlur}
      readOnly={readOnly}
      wrapLines={wrapLines}
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