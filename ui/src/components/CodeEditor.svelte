<script lang="ts">
  import { basicSetup } from "codemirror";
  import { EditorState, Compartment } from "@codemirror/state";
  import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { json } from "@codemirror/lang-json";
  import { onDestroy } from "svelte";

  type EditorLanguage = "text" | "json-auto";

  let {
    id = "",
    value = "",
    placeholder = "",
    language = "json-auto",
    onChange = (_value: string) => {},
  }: {
    id?: string;
    value?: string;
    placeholder?: string;
    language?: EditorLanguage;
    onChange?: (value: string) => void;
  } = $props();

  let container: HTMLDivElement | null = null;
  let editorView: EditorView | null = null;
  let applyingExternalUpdate = false;

  const languageCompartment = new Compartment();

  function shouldUseJsonLanguage(text: string) {
    const trimmed = text.trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  }

  function languageExtensionFor(text: string, mode: EditorLanguage) {
    if (mode === "json-auto" && shouldUseJsonLanguage(text)) {
      return json();
    }
    return [];
  }

  $effect(() => {
    if (!container || editorView) return;
    const initialValue = String(value ?? "");
    const languageExtension = languageExtensionFor(initialValue, language);

    editorView = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          cmPlaceholder(placeholder),
          languageCompartment.of(languageExtension),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || applyingExternalUpdate) return;
            onChange(update.state.doc.toString());
          }),
        ],
      }),
      parent: container,
    });
  });

  $effect(() => {
    if (!editorView) return;
    const nextValue = String(value ?? "");
    const currentValue = editorView.state.doc.toString();
    if (nextValue !== currentValue) {
      applyingExternalUpdate = true;
      editorView.dispatch({
        changes: { from: 0, to: currentValue.length, insert: nextValue },
      });
      applyingExternalUpdate = false;
    }

    editorView.dispatch({
      effects: languageCompartment.reconfigure(languageExtensionFor(nextValue, language)),
    });
  });

  onDestroy(() => {
    editorView?.destroy();
    editorView = null;
  });
</script>

<div id={id} class="code-editor body-editor" bind:this={container}></div>
