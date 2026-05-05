<script lang="ts">
  import { basicSetup } from "codemirror";
  import { EditorState, Compartment } from "@codemirror/state";
  import { EditorView, keymap, placeholder as cmPlaceholder } from "@codemirror/view";
  import { historyKeymap } from "@codemirror/commands";
  import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
  import { json } from "@codemirror/lang-json";
  import { tags } from "@lezer/highlight";
  import { onDestroy } from "svelte";

  type EditorLanguage = "text" | "json" | "json-auto";

  let {
    id = "",
    value = "",
    placeholder = "",
    language = "json-auto",
    readOnly = false,
    wrapLines = true,
    onChange = (_value: string) => {},
    onBlur = () => {},
  }: {
    id?: string;
    value?: string;
    placeholder?: string;
    language?: EditorLanguage;
    onChange?: (value: string) => void;
    readOnly?: boolean;
    wrapLines?: boolean;
    onBlur?: () => void;
  } = $props();

  let container: HTMLDivElement | null = null;
  let editorView: EditorView | null = null;
  let applyingExternalUpdate = false;

  const languageCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const wrapLinesCompartment = new Compartment();
  const highlightStyle = HighlightStyle.define([
    { tag: tags.propertyName, color: "var(--json-key)" },
    { tag: tags.string, color: "var(--json-string)" },
    { tag: tags.number, color: "var(--json-number)" },
    { tag: [tags.bool, tags.keyword], color: "var(--json-bool)" },
    { tag: tags.null, color: "var(--json-null)" },
  ]);

  function isLikelyJson(text: string) {
    const trimmed = text.trim();
    return (trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"));
  }

  function languageExtensionFor(text: string, mode: EditorLanguage) {
    if (mode === "json" || (mode === "json-auto" && isLikelyJson(text))) {
      return json({ indentUnit: 2 });
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
          keymap.of([...historyKeymap]),
          cmPlaceholder(placeholder),
          syntaxHighlighting(highlightStyle),
          languageCompartment.of(languageExtension),
          readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
          wrapLinesCompartment.of(wrapLines ? EditorView.lineWrapping : []),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || applyingExternalUpdate) return;
            onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            blur: onBlur,
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
      effects: [
        languageCompartment.reconfigure(languageExtensionFor(nextValue, language)),
        readOnlyCompartment.reconfigure(EditorState.readOnly.of(readOnly)),
        wrapLinesCompartment.reconfigure(wrapLines ? EditorView.lineWrapping : [])
      ]
    });
  });

  onDestroy(() => {
    editorView?.destroy();
    editorView = null;
  });
</script>

<div id={id} class="code-editor body-editor" bind:this={container}></div>

<style>
  .code-editor {
    flex: 1;
    min-height: 0;
  }
  :global(.cm-editor) {
    height: 100% !important;
  }
</style>
