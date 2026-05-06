<script lang="ts">
  import { basicSetup } from "codemirror";
  import { EditorState, Compartment, RangeSetBuilder } from "@codemirror/state";
  import {
    Decoration,
    EditorView,
    ViewPlugin,
    WidgetType,
    highlightWhitespace,
    keymap,
    placeholder as cmPlaceholder,
  } from "@codemirror/view";
  import { historyKeymap } from "@codemirror/commands";
  import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
  import { json } from "@codemirror/lang-json";
  import { tags } from "@lezer/highlight";
  import { onDestroy } from "svelte";

  type EditorLanguage = "text" | "json" | "json-auto" | "xml";

  let {
    id = "",
    value = "",
    placeholder = "",
    language = "json-auto",
    readOnly = false,
    wrapLines = true,
    showWhitespace = false,
    showLineEndings = false,
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
    showWhitespace?: boolean;
    showLineEndings?: boolean;
    onBlur?: () => void;
  } = $props();

  let container: HTMLDivElement | null = null;
  let editorView: EditorView | null = null;
  let applyingExternalUpdate = false;

  const languageCompartment = new Compartment();
  const readOnlyCompartment = new Compartment();
  const wrapLinesCompartment = new Compartment();
  const whitespaceCompartment = new Compartment();
  const lineEndingsCompartment = new Compartment();
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

  class LineEndingWidget extends WidgetType {
    private marker: string;

    constructor(marker: string) {
      super();
      this.marker = marker;
    }

    toDOM() {
      const span = document.createElement("span");
      span.className = "cm-line-ending-marker";
      span.textContent = this.marker;
      span.setAttribute("aria-hidden", "true");
      return span;
    }
  }

  function lineEndingMarkers() {
    return ViewPlugin.fromClass(
      class {
        decorations;

        constructor(view: EditorView) {
          this.decorations = this.buildDecorations(view);
        }

        update(update: { docChanged: boolean; viewportChanged: boolean; view: EditorView }) {
          if (update.docChanged || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
          }
        }

        buildDecorations(view: EditorView) {
          const builder = new RangeSetBuilder<Decoration>();
          for (const range of view.visibleRanges) {
            let line = view.state.doc.lineAt(range.from);
            while (line.from <= range.to) {
              if (line.to < view.state.doc.length) {
                const next = view.state.doc.sliceString(line.to, Math.min(line.to + 2, view.state.doc.length));
                builder.add(line.to, line.to, Decoration.widget({ widget: new LineEndingWidget(next.startsWith("\r\n") ? "CRLF" : next.startsWith("\r") ? "CR" : "LF"), side: 1 }));
              }
              if (line.to >= range.to || line.number >= view.state.doc.lines) break;
              line = view.state.doc.line(line.number + 1);
            }
          }
          return builder.finish();
        }
      },
      {
        decorations: (plugin) => plugin.decorations,
      },
    );
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
          whitespaceCompartment.of(showWhitespace ? highlightWhitespace() : []),
          lineEndingsCompartment.of(showLineEndings ? lineEndingMarkers() : []),
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
        wrapLinesCompartment.reconfigure(wrapLines ? EditorView.lineWrapping : []),
        whitespaceCompartment.reconfigure(showWhitespace ? highlightWhitespace() : []),
        lineEndingsCompartment.reconfigure(showLineEndings ? lineEndingMarkers() : []),
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
  :global(.cm-line-ending-marker) {
    color: var(--text-dim);
    font-size: 0.72em;
    margin-left: 4px;
    opacity: 0.75;
    user-select: none;
  }
</style>
