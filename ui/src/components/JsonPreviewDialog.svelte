<script lang="ts">
  import "@awesome.me/webawesome/dist/components/button/button.js";
  import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
  import { tick } from "svelte";
  import { EditorView, basicSetup } from "codemirror";
  import { json } from "@codemirror/lang-json";

  let {
    open = false,
    title = "JSON",
    value = "",
    onClose = () => {},
  }: {
    open?: boolean;
    title?: string;
    value?: string;
    onClose?: () => void;
  } = $props();

  let editorContainer = $state<HTMLElement | null>(null);
  let copyLabel = $state("Copy");
  let editorView: EditorView | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (open) {
      void renderJson(value);
    }
  });

  async function renderJson(doc: string) {
    await tick();
    if (!editorContainer) return;
    if (!editorView) {
      editorView = new EditorView({
        doc,
        extensions: [
          basicSetup,
          json(),
          EditorView.editable.of(false),
          EditorView.theme({
            "&": { height: "min(64vh, 680px)", fontSize: "13px" },
            ".cm-scroller": { overflow: "auto" },
          }),
        ],
        parent: editorContainer,
      });
      return;
    }
    editorView.dispatch({
      changes: { from: 0, to: editorView.state.doc.length, insert: doc },
    });
  }

  async function copyJson() {
    await navigator.clipboard.writeText(value);
    copyLabel = "Copied";
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyLabel = "Copy";
      copyTimer = null;
    }, 1200);
  }
</script>

<wa-dialog label={title} open={open} class="json-preview-dialog" onwa-hide={onClose}>
  <div bind:this={editorContainer} class="json-preview-container"></div>
  <div slot="footer" class="json-preview-actions">
    <wa-button
      variant="neutral"
      appearance="outlined"
      role="button"
      tabindex="0"
      onclick={() => void copyJson()}
      onkeydown={(event: KeyboardEvent) => event.key === "Enter" && void copyJson()}>{copyLabel}</wa-button
    >
    <wa-button
      variant="brand"
      role="button"
      tabindex="0"
      onclick={onClose}
      onkeydown={(event: KeyboardEvent) => event.key === "Enter" && onClose()}>Close</wa-button
    >
  </div>
</wa-dialog>

<style>
  :global(wa-dialog.json-preview-dialog::part(panel)) {
    width: min(920px, calc(100vw - 32px));
  }

  .json-preview-container {
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg-editor);
    overflow: hidden;
  }

  .json-preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  :global(.cm-editor) {
    outline: none !important;
  }
</style>
