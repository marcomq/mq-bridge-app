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
    wrapper.className = "mqb-checkbox-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "wa-checkbox";
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

      if ("control" in props && "maskedLabel" in props) {
        const wrapper = document.createElement("div");
        wrapper.className = "mqb-form-row mqb-password-field-row";

        const label = document.createElement("label");
        label.textContent = String(props.label || "");
        wrapper.appendChild(label);

        const content = document.createElement("div");
        if (props.control) {
          content.appendChild(props.control);
        }

        const button = document.createElement("button");
        button.type = "button";
        button.textContent = String(props.maskedLabel || "Show");
        button.addEventListener("click", () => {
          const input = content.querySelector("input");
          if (!(input instanceof HTMLInputElement)) {
            return;
          }

          const nextVisible = input.type === "password";
          input.type = nextVisible ? "text" : "password";
          button.textContent = nextVisible
            ? String(props.visibleLabel || "Hide")
            : String(props.maskedLabel || "Show");
        });

        content.appendChild(button);
        wrapper.appendChild(content);
        return wrapper;
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

      if ("rows" in props && "onChange" in props) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "mqb-inline-editor";

        const legend = document.createElement("legend");
        legend.textContent = String(props.title || "");
        fieldset.appendChild(legend);

        if (props.description) {
          const description = document.createElement("div");
          description.className = "mqb-form-description-block";
          description.textContent = String(props.description);
          fieldset.appendChild(description);
        }

        if (props.sectionLabel) {
          const sectionLabel = document.createElement("div");
          sectionLabel.className = "section-label";
          sectionLabel.textContent = String(props.sectionLabel || "");
          fieldset.appendChild(sectionLabel);
        }

        const rowsContainer = document.createElement("div");
        rowsContainer.className = "mqb-headers-grid";
        fieldset.appendChild(rowsContainer);

        const renderRows = () => {
          rowsContainer.innerHTML = "";

          if (!props.rows.length) {
            const empty = document.createElement("div");
            empty.className = "mqb-empty-inline-note";
            empty.textContent = String(props.emptyLabel || "");
            rowsContainer.appendChild(empty);
          }

          props.rows.forEach((row: { key: string; value: string }, index: number) => {
            const rowEl = document.createElement("div");
            rowEl.className = "response-header-row mqb-header-row";

            const keyInput = document.createElement("input");
            keyInput.className = "field-input cons-response-header-key";
            keyInput.placeholder = String(props.keyPlaceholder || "");
            keyInput.value = row.key;
            keyInput.addEventListener("input", () => {
              props.rows[index] = { ...props.rows[index], key: keyInput.value };
              props.onChange([...props.rows]);
            });

            const valueInput = document.createElement("input");
            valueInput.className = "field-input cons-response-header-value";
            valueInput.placeholder = String(props.valuePlaceholder || "");
            valueInput.value = row.value;
            valueInput.addEventListener("input", () => {
              props.rows[index] = { ...props.rows[index], value: valueInput.value };
              props.onChange([...props.rows]);
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = String(props.deleteLabel || "Delete");
            deleteButton.addEventListener("click", () => {
              props.rows = props.rows.filter((_: unknown, currentIndex: number) => currentIndex !== index);
              props.onChange([...props.rows]);
              renderRows();
            });

            rowEl.append(keyInput, valueInput, deleteButton);
            rowsContainer.appendChild(rowEl);
          });
        };

        renderRows();

        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.textContent = String(props.addLabel || "");
        addButton.addEventListener("click", () => {
          props.rows = [...props.rows, { key: "", value: "" }];
          props.onChange([...props.rows]);
          renderRows();
        });
        fieldset.appendChild(addButton);

        return fieldset;
      }

      if ("value" in props && "onChange" in props) {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "mqb-inline-editor mqb-scalar-endpoint";

        const input = document.createElement("input");
        input.type = "text";
        input.value = String(props.value || "");
        input.placeholder = String(props.placeholder || "");
        input.addEventListener("input", () => {
          props.onChange(input.value);
        });

        fieldset.appendChild(input);
        return fieldset;
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

  test("renders env vars as environment variables without advanced toggle", async () => {
    const forms = await loadCustomForm();
    const renderEnvVars = forms.customRenderers.env_vars.render as Function;
    const store = createStore({
      env_vars: {
        API_TOKEN: "secret",
      },
    });
    forms.__activeStore = store;

    const element = renderEnvVars(
      {
        type: "object",
        title: "Additional Properties",
        description: "Config environment values",
      },
      "",
      "root.env_vars",
      ["env_vars"],
      { store },
    ) as HTMLElement;

    document.body.appendChild(element);

    expect(element.querySelector("legend")?.textContent).toBe("Environment Variables");
    expect(element.querySelector(".section-label")).toBeNull();
    expect(element.querySelector(".mqb-form-toggle")).toBeNull();

    const deleteButton = Array.from(element.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Delete")) as HTMLButtonElement | undefined;
    deleteButton?.click();
    expect(store.getPath(["env_vars"])).toEqual({});
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
      { store, layout: {} },
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

  test("scalar endpoint renderers write string values back through the form store", async () => {
    const forms = await loadCustomForm();
    const renderStatic = forms.customRenderers.static.render as Function;
    const store = createStore({
      endpoint: {
        middlewares: [],
        static: "",
      },
    });
    forms.__activeStore = store;

    const element = renderStatic(
      {
        type: "object",
        title: "Static",
        description: "Inline payload",
      },
      "",
      "root.endpoint.static",
      ["endpoint"],
      { store, data: store.data, onChange: vi.fn() },
    ) as HTMLElement;

    document.body.appendChild(element);

    const input = element.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();

    triggerTextInput(input as HTMLInputElement, "hello world");

    expect(store.getPath(["endpoint", "static"])).toBe("hello world");
  });

  test("wraps password-format fields with a show-hide toggle", async () => {
    const forms = await loadCustomForm();
    const input = document.createElement("input");
    input.type = "text";
    input.id = "root.secret";

    const rendered = forms.domRenderer.renderFieldWrapper(
      { type: "string", format: "password", title: "Secret Token" },
      "root.secret",
      input,
      "",
    ) as HTMLElement;

    document.body.appendChild(rendered);

    const passwordInput = rendered.querySelector("input") as HTMLInputElement | null;
    const toggle = rendered.querySelector("button") as HTMLButtonElement | null;

    expect(passwordInput?.type).toBe("password");
    expect(toggle?.textContent).toBe("Show");

    toggle?.click();
    expect(passwordInput?.type).toBe("text");
    expect(toggle?.textContent).toBe("Hide");

    toggle?.click();
    expect(passwordInput?.type).toBe("password");
    expect(toggle?.textContent).toBe("Show");
  });
});
