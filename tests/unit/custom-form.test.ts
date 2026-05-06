// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";

type SchemaNode = Record<string, any>;

function getPathValue(root: any, path: Array<string | number>) {
  return path.reduce((current, segment) => current?.[segment], root);
}

function setPathValue(root: any, path: Array<string | number>, value: unknown) {
  let cursor = root;
  path.slice(0, -1).forEach((segment, index) => {
    const nextSegment = path[index + 1];
    if (cursor[segment] === undefined || cursor[segment] === null) {
      cursor[segment] = typeof nextSegment === "number" ? [] : {};
    }
    cursor = cursor[segment];
  });
  cursor[path[path.length - 1]] = value;
}

function createStore(initialData: Record<string, any>) {
  const data = structuredClone(initialData);

  return {
    data,
    getPath(path: Array<string | number>) {
      return getPathValue(data, path);
    },
    setPath(path: Array<string | number>, value: unknown) {
      setPathValue(data, path, value);
    },
  };
}

function findCheckboxByLabel(container: ParentNode, text: string) {
  const row = Array.from(container.querySelectorAll(".mqb-checkbox-row"))
    .find((element) => element.textContent?.includes(text));
  return row?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
}

function triggerCheckboxChange(input: HTMLInputElement, nextChecked: boolean) {
  input.checked = nextChecked;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function triggerTextInput(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function parseNamePath(name: string) {
  return name.split(".").filter(Boolean);
}

function createFakeForms() {
  const forms: Record<string, any> = {
    rendererConfig: {
      classes: {
        input: "field-input",
        compactRow: "vsf-wa-compact-row",
        compactLabel: "vsf-wa-compact-label",
        compactContent: "vsf-wa-compact-content",
        arrayItemRow: "array-item-row",
        arrayItemContent: "array-item-content",
        buttonDanger: "danger-button",
      },
      triggers: {
        arrayItemRow: "js-array-item-row",
        arrayItemContent: "js-array-item-content",
        removeArrayItem: "js-remove-array-item",
        removeAdditionalProperty: "js-remove-additional-property",
        additionalPropertyItems: "js-additional-property-items",
        additionalPropertyRow: "js-additional-property-row",
        additionalPropertyKey: "js-additional-property-key",
        apKeyContainer: "js-ap-key-container",
        apValueWrapper: "js-ap-value-wrapper",
        arrayTypeToggle: "js-array-type-toggle",
        arrayTypeSelect: "js-array-type-select",
      },
    },
    domRenderer: {},
    setI18n: vi.fn(),
    setConfig: vi.fn(),
    setCustomRenderers: vi.fn((renderers: Record<string, any>) => {
      forms.customRenderers = renderers;
    }),
    formatWebAwesomeLabel: (node: SchemaNode, elementId: string) =>
      String(node.title || elementId.split(".").pop() || ""),
    createTypeSelectArrayRenderer: vi.fn(() => ({
      render: () => document.createElement("div"),
    })),
    hydrateNodeWithData: (node: SchemaNode) => node,
    renderNode: () => document.createElement("div"),
    renderObject: (_context: any, _node: SchemaNode, _elementId: string, _isHeadless: boolean, dataPath: Array<string | number>) => {
      const output = document.createElement("div");
      output.dataset.path = dataPath.join(".");
      return output;
    },
    getName: (path: Array<string | number>) => path.join("."),
  };

  forms.renderProperties = (
    context: { store: ReturnType<typeof createStore> },
    properties: Record<string, SchemaNode>,
    elementId: string,
    dataPath: Array<string | number>,
  ) => {
    const fragment = document.createDocumentFragment();

    Object.entries(properties).forEach(([key, node]) => {
      const fieldPath = [...dataPath, key];
      const fieldId = `${elementId}.${key}`;

      if (node.type === "boolean") {
        fragment.appendChild(forms.domRenderer.renderBoolean(node, fieldId, forms.getName(fieldPath)));
        return;
      }

      const input = document.createElement("input");
      input.type = "text";
      input.id = fieldId;
      input.value = String(context.store.getPath(fieldPath) ?? node.defaultValue ?? "");
      input.addEventListener("input", () => {
        context.store.setPath(fieldPath, input.value);
      });

      fragment.appendChild(forms.domRenderer.renderFieldWrapper(node, fieldId, input, ""));
    });

    return fragment;
  };

  forms.domRenderer.renderBoolean = (node: SchemaNode, elementId: string, inputName: string) => {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-3 form-check";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "form-check-input";
    input.id = elementId;
    input.name = inputName;
    input.checked = Boolean(getPathValue(forms.__activeStore?.data, parseNamePath(inputName)) ?? node.defaultValue);
    input.addEventListener("change", () => {
      forms.__activeStore?.setPath(parseNamePath(inputName), input.checked);
    });

    wrapper.appendChild(input);
    return wrapper;
  };

  return forms;
}

async function loadCustomForm() {
  vi.resetModules();
  document.body.innerHTML = "";
  const forms = createFakeForms();
  (window as any).VanillaSchemaForms = forms;
  (window as any)._mqb_form_mode = "publisher";
  (window as any).appConfig = { publishers: [{ name: "pub-a" }, { name: "pub-b" }] };

  vi.doMock("../../ui/src/lib/forms/render-svelte", () => ({
    renderSvelteNode: (_component: unknown, props: Record<string, any>) => {
      if ("visibleContent" in props) {
        const root = document.createElement("div");
        root.className = "mqb-form-block";

        if (props.description) {
          const description = document.createElement("div");
          description.className = "mqb-form-description-block";
          description.textContent = String(props.description);
          root.appendChild(description);
        }

        if (props.visibleContent) {
          root.appendChild(props.visibleContent);
        }

        if (props.hiddenContent) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = "mqb-form-toggle";
          toggle.textContent = props.toggleLabel || "Show advanced";

          let expanded = false;

          const sync = () => {
            toggle.textContent = expanded ? "Hide advanced" : (props.toggleLabel || "Show advanced");
            const existing = root.querySelector(".mqb-form-advanced-block");
            existing?.remove();

            if (expanded) {
              const advanced = document.createElement("div");
              advanced.className = "mqb-form-advanced-block";
              advanced.appendChild(props.hiddenContent);
              root.appendChild(advanced);
            }
          };

          toggle.addEventListener("click", () => {
            expanded = !expanded;
            sync();
          });

          root.appendChild(toggle);
        }

        return root;
      }

      if ("content" in props && "onToggle" in props) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "mqb-inline-editor mqb-optional-section";

        const legend = document.createElement("legend");
        legend.textContent = String(props.label || "");
        fieldset.appendChild(legend);

        const row = document.createElement("div");
        row.className = "mqb-checkbox-row mqb-checkbox-row--required";

        const input = document.createElement("input");
        input.type = "checkbox";
        input.id = props.inputId || "";
        input.className = "wa-checkbox";

        const copy = document.createElement("div");
        copy.className = "mqb-checkbox-copy";
        const label = document.createElement("label");
        label.className = "mqb-checkbox-label";
        label.htmlFor = input.id;
        label.textContent = String(props.label || "");
        copy.appendChild(label);

        if (props.description) {
          const description = document.createElement("div");
          description.className = "mqb-checkbox-description";
          description.textContent = String(props.description);
          copy.appendChild(description);
        }

        row.appendChild(input);
        row.appendChild(copy);
        fieldset.appendChild(row);

        let expanded = Boolean(props.checked);

        const sync = () => {
          input.checked = expanded;
          const existing = fieldset.querySelector(".mqb-optional-section-content");
          existing?.remove();

          if (expanded && props.content) {
            const content = document.createElement("div");
            content.className = "mqb-optional-section-content";
            content.appendChild(props.content);
            fieldset.appendChild(content);
          }
        };

        input.addEventListener("change", () => {
          expanded = input.checked;
          props.onToggle?.(expanded);
          sync();
        });

        sync();
        return fieldset;
      }

      if ("control" in props && !("required" in props)) {
        const row = document.createElement("div");
        row.className = "mqb-checkbox-row";

        const control = document.createElement("div");
        control.className = "mqb-checkbox-control";
        if (props.control) {
          control.appendChild(props.control);
        }

        const copy = document.createElement("div");
        copy.className = "mqb-checkbox-copy";
        const label = document.createElement("label");
        label.className = "mqb-checkbox-label";
        label.htmlFor = props.labelFor || "";
        label.textContent = String(props.label || "");
        copy.appendChild(label);

        if (props.description) {
          const description = document.createElement("div");
          description.className = "mqb-checkbox-description";
          description.textContent = String(props.description);
          copy.appendChild(description);
        }

        row.append(control, copy);
        return row;
      }

      if ("control" in props) {
        const wrapper = document.createElement("div");
        wrapper.className = "mqb-form-row";
        const label = document.createElement("label");
        label.textContent = String(props.label || "");
        wrapper.appendChild(label);
        if (props.control) {
          wrapper.appendChild(props.control);
        }
        return wrapper;
      }

      throw new Error(`Unhandled mocked Svelte render props: ${Object.keys(props).join(", ")}`);
    },
  }));

  await import("../../ui/src/lib/forms/custom-form");
  return forms;
}

describe("custom form runtime", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("renders generic checkboxes with the app layout and writes changes back to the store", async () => {
    const forms = await loadCustomForm();
    const store = createStore({ tls: { accept_invalid_certs: false } });
    forms.__activeStore = store;

    const rendered = forms.domRenderer.renderBoolean(
      { type: "boolean", title: "Accept Invalid Certs", description: "Allow invalid TLS certs." },
      "tls.accept_invalid_certs",
      "tls.accept_invalid_certs",
    );

    document.body.appendChild(rendered);

    expect(rendered.classList.contains("mqb-checkbox-row")).toBe(true);
    expect(rendered.classList.contains("form-check")).toBe(false);

    const checkbox = rendered.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();
    expect(checkbox?.classList.contains("wa-checkbox")).toBe(true);
    expect(checkbox?.classList.contains("form-check-input")).toBe(false);

    triggerCheckboxChange(checkbox as HTMLInputElement, true);
    expect(store.getPath(["tls", "accept_invalid_certs"])).toBe(true);
  });

  test("show advanced can be toggled repeatedly without losing hidden fields or their values", async () => {
    const forms = await loadCustomForm();
    const renderHttp = forms.customRenderers.http.render as Function;
    const store = createStore({
      endpoint: {
        http: {
          url: "https://example.test",
          compression_enabled: false,
        },
      },
    });
    forms.__activeStore = store;

    const element = renderHttp(
      {
        type: "object",
        properties: {
          url: { type: "string", title: "URL" },
          compression_enabled: { type: "boolean", title: "Compression Enabled" },
        },
      },
      "",
      "HttpConfig",
      ["endpoint", "http"],
      { store },
    ) as HTMLElement;

    document.body.appendChild(element);

    const toggleButton = element.querySelector(".mqb-form-toggle") as HTMLButtonElement | null;
    expect(toggleButton?.textContent).toContain("Show advanced");
    expect(findCheckboxByLabel(element, "Compression Enabled")).toBeFalsy();

    toggleButton?.click();
    const advancedCheckbox = findCheckboxByLabel(element, "Compression Enabled");
    expect(advancedCheckbox).not.toBeNull();

    triggerCheckboxChange(advancedCheckbox as HTMLInputElement, true);
    expect(store.getPath(["endpoint", "http", "compression_enabled"])).toBe(true);

    toggleButton?.click();
    expect(findCheckboxByLabel(element, "Compression Enabled")).toBeFalsy();

    toggleButton?.click();
    const reopenedCheckbox = findCheckboxByLabel(element, "Compression Enabled");
    expect(reopenedCheckbox).not.toBeNull();
    expect((reopenedCheckbox as HTMLInputElement).checked).toBe(true);
  });

  test("optional tls sections can be toggled repeatedly and keep nested values connected to the store", async () => {
    const forms = await loadCustomForm();
    const renderTls = forms.customRenderers.tls.render as Function;
    const store = createStore({
      tls: {
        required: false,
        accept_invalid_certs: false,
        server_name: "",
      },
    });
    forms.__activeStore = store;

    const element = renderTls(
      {
        type: "object",
        title: "TLS",
        properties: {
          required: { type: "boolean", title: "Required", description: "Enable TLS." },
          accept_invalid_certs: { type: "boolean", title: "Accept Invalid Certs" },
          server_name: { type: "string", title: "Server Name" },
        },
      },
      "",
      "tls",
      ["tls"],
      { store },
    ) as HTMLElement;

    document.body.appendChild(element);

    const requiredCheckbox = findCheckboxByLabel(element, "TLS");
    expect(requiredCheckbox).not.toBeNull();
    expect(findCheckboxByLabel(element, "Accept Invalid Certs")).toBeFalsy();

    triggerCheckboxChange(requiredCheckbox as HTMLInputElement, true);
    const nestedCheckbox = findCheckboxByLabel(element, "Accept Invalid Certs");
    expect(nestedCheckbox).not.toBeNull();

    triggerCheckboxChange(nestedCheckbox as HTMLInputElement, true);
    expect(store.getPath(["tls", "accept_invalid_certs"])).toBe(true);

    const serverNameInput = element.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(serverNameInput).not.toBeNull();
    triggerTextInput(serverNameInput as HTMLInputElement, "mq.example.test");
    expect(store.getPath(["tls", "server_name"])).toBe("mq.example.test");

    triggerCheckboxChange(requiredCheckbox as HTMLInputElement, false);
    expect(findCheckboxByLabel(element, "Accept Invalid Certs")).toBeFalsy();

    triggerCheckboxChange(requiredCheckbox as HTMLInputElement, true);
    const reopenedNestedCheckbox = findCheckboxByLabel(element, "Accept Invalid Certs");
    expect(reopenedNestedCheckbox).not.toBeNull();
    expect((reopenedNestedCheckbox as HTMLInputElement).checked).toBe(true);
    expect((element.querySelector('input[type="text"]') as HTMLInputElement).value).toBe("mq.example.test");
  });
});
