import AdditionalPropertyRow from "./AdditionalPropertyRow.svelte";
import ArrayItemRow from "./ArrayItemRow.svelte";
import BasicAuthEditor from "./BasicAuthEditor.svelte";
import CheckboxField from "./CheckboxField.svelte";
import CollapsibleFields from "./CollapsibleFields.svelte";
import FormField from "./FormField.svelte";
import GenericAdditionalPropertyRow from "./GenericAdditionalPropertyRow.svelte";
import HeadersEditor from "./HeadersEditor.svelte";
import OptionalSectionField from "./OptionalSectionField.svelte";
import ScalarEndpointInput from "./ScalarEndpointInput.svelte";
import { renderSvelteNode } from "./render-svelte";
import { mqbApp } from "../runtime-window";

type SchemaNode = Record<string, any>;
type RendererContext = Record<string, any>;

const forms = window.VanillaSchemaForms as any;

const {
  renderObject,
  renderProperties,
  domRenderer,
  setI18n,
  setConfig,
  setCustomRenderers,
  renderNode,
  createTypeSelectArrayRenderer,
  formatWebAwesomeLabel,
  hydrateNodeWithData,
  rendererConfig,
} = forms;

Object.assign(rendererConfig.classes, {
  buttonPrimary: "wa-native-button wa-native-button--brand",
  buttonSecondary: "wa-native-button wa-native-button--neutral",
  buttonDanger: "wa-native-button wa-native-button--danger",
});

setI18n({
  keys: {
    Map_of_Route: "Routes",
  },
});

setConfig({
  visibility: {
    hiddenPaths: ["publishers", "consumers", "routes", "presets", "env_vars", "history"],
    customVisibility: (node: SchemaNode, path: string) => {
      const description = String(node.description || "");
      const lowerPath = path.toLowerCase();
      const formMode = String((window as any)._mqb_form_mode || "");
      const fieldName = lowerPath.split(".").pop() || "";

      if (formMode === "publisher" && ["url", "method", "queue", "topic", "database"].includes(fieldName)) {
        return false;
      }

      const isPubCtx = lowerPath.includes("publishers") || lowerPath.includes(".output") || formMode === "publisher";
      const isConsCtx = lowerPath.includes("consumers") || lowerPath.includes(".input") || formMode === "consumer";

      if (isPubCtx && /\(Consumer only\)/i.test(description)) {
        return false;
      }
      if (isConsCtx && /\(Publisher only\)/i.test(description)) {
        return false;
      }

      return true;
    },
  },
  sorting: {
    defaultRenderLast: ["middlewares"],
    defaultPriority: [
      "input",
      "output",
      "name",
      "id",
      "title",
      "type",
      "enabled",
      "active",
      "url",
      "brokers",
      "username",
      "password",
      "topic",
      "group",
      "path",
      "key",
      "value",
      "required",
      "description",
      "routes",
    ],
  },
});

function createWrappedContainer(content: Node, className = "") {
  const wrapper = document.createElement("div");
  wrapper.className = className;
  wrapper.appendChild(content);
  return wrapper;
}

function addClassTokens(element: Element | null, ...classNames: Array<string | undefined>) {
  if (!element) return;
  const tokens = classNames
    .flatMap((value) => String(value || "").split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length > 0) {
    element.classList.add(...tokens);
  }
}

function stripClassTokens(element: Element | null, ...classNames: Array<string | undefined>) {
  if (!element) return;
  const tokens = classNames
    .flatMap((value) => String(value || "").split(/\s+/))
    .map((value) => value.trim())
    .filter(Boolean);

  if (tokens.length > 0) {
    element.classList.remove(...tokens);
  }
}

function sanitizeCheckboxControl(input: HTMLInputElement, inputElement: HTMLElement) {
  [input, inputElement, input.parentElement, input.closest(".form-check")].forEach((element) => {
    stripClassTokens(
      element,
      "form-check",
      "form-check-input",
      "form-switch",
      "mb-3",
      "vsf-wa-field",
      rendererConfig.classes.compactRow,
      rendererConfig.classes.compactContent,
      rendererConfig.classes.compactLabel,
    );
  });
}

function formatLabel(node: SchemaNode, elementId: string) {
  const segments = String(elementId || "").split(".");
  const fieldKey = segments[segments.length - 1] || "";
  const parentKey = segments[segments.length - 2] || "";
  const indexedFieldLabels: Record<string, string[]> = {
    basic_auth: ["Username", "Password"],
  };

  if (/^\d+$/.test(fieldKey)) {
    const explicitLabel = indexedFieldLabels[parentKey]?.[Number(fieldKey)];
    if (explicitLabel) return explicitLabel;
  }

  return formatWebAwesomeLabel(node, elementId);
}

const baseRenderBoolean = typeof domRenderer.renderBoolean === "function"
  ? domRenderer.renderBoolean.bind(domRenderer)
  : null;

if (baseRenderBoolean) {
  domRenderer.renderBoolean = (
    node: SchemaNode,
    elementId: string,
    inputName: string,
    ...rest: unknown[]
  ) => {
    const rendered = baseRenderBoolean(node, elementId, inputName, ...rest) as HTMLElement;
    const input = rendered?.querySelector?.('input[type="checkbox"]') as HTMLInputElement | null;

    if (!input) {
      return rendered;
    }

    sanitizeCheckboxControl(input, rendered);
    input.classList.add("wa-checkbox");

    return renderSvelteNode(CheckboxField, {
      label: formatLabel(node, elementId),
      description: String(node.description || ""),
      labelFor: input.id || elementId,
      control: input,
    });
  };
}

domRenderer.renderFieldWrapper = (
  node: SchemaNode,
  elementId: string,
  inputElement: HTMLElement,
  wrapperClass?: string,
) => {
  const input = (inputElement.querySelector?.("input, select, textarea") as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null)
    || inputElement;
  const isCheckbox = input instanceof HTMLInputElement && input.type === "checkbox";

  if (input?.classList) {
    if (isCheckbox) {
      sanitizeCheckboxControl(input as HTMLInputElement, inputElement);
      input.classList.add("wa-checkbox");
    } else {
      input.classList.add("field-input");
    }

    const isTechnical = ["url", "brokers", "topic", "group", "key"].some((token) =>
      elementId.toLowerCase().includes(token),
    );
    if (!isCheckbox && isTechnical) {
      input.style.fontFamily = "var(--font)";
    }
  }

  if (node.type === "object" || node.type === "array" || node.oneOf) {
    return createWrappedContainer(inputElement, wrapperClass || "");
  }

  if (isCheckbox) {
    return renderSvelteNode(CheckboxField, {
      label: formatLabel(node, elementId),
      description: String(node.description || ""),
      labelFor: input instanceof HTMLElement ? input.id : undefined,
      control: input,
    });
  }

  return renderSvelteNode(FormField, {
    label: formatLabel(node, elementId),
    description: String(node.description || ""),
    labelFor: input instanceof HTMLElement ? input.id : undefined,
    control: inputElement,
    wrapperClass: wrapperClass || "",
    required: Boolean(node.required),
  });
};

const tlsBaseRenderer = {
  render: (node: SchemaNode, _path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    const requiredNode = node.properties?.required;
    if (!requiredNode) {
      return renderObject(context, node, elementId, false, dataPath);
    }

    const valuePath = [...dataPath, "required"];
    const checkboxId = `${elementId}.required`;
    const currentValue = Boolean(context.store.getPath(valuePath) ?? requiredNode.defaultValue);

    const restProperties = { ...(node.properties || {}) };
    delete restProperties.required;

    return renderSvelteNode(OptionalSectionField, {
      label: String(node.title || "Options"),
      description: String(requiredNode.description || node.description || ""),
      checked: currentValue,
      inputId: checkboxId,
      onToggle: (nextChecked: boolean) => {
        context.store.setPath(valuePath, nextChecked);
      },
      content: createWrappedContainer(
        renderProperties(context, restProperties, elementId, dataPath),
        "mqb-optional-section-fields",
      ),
    });
  },
};

const getArrayItemNameField = (container: ParentNode | null) =>
  container?.querySelector?.(
    'input[id$=".name"], input[name$="[name]"], input[name="name"], textarea[id$=".name"], textarea[name$="[name]"], textarea[name="name"]',
  ) || null;

const getArrayItemLegend = (arrayItem: ParentNode | null) => {
  if (!(arrayItem instanceof Element)) return null;
  const directContent = arrayItem.querySelector(`:scope > .${rendererConfig.triggers.arrayItemContent}`);
  return directContent?.querySelector?.(":scope > fieldset > legend") || arrayItem.querySelector("legend");
};

const updateArrayItemLabel = (arrayItem: ParentNode | null) => {
  const legend = getArrayItemLegend(arrayItem);
  const nameField = getArrayItemNameField(arrayItem);
  if (!(arrayItem instanceof Element) || !legend || !nameField) return;

  const currentLabel = String(legend.textContent || "").trim();
  const fallbackLabel = arrayItem.getAttribute("data-default-label") || currentLabel || "Item";

  if (!arrayItem.getAttribute("data-default-label") && /^Item\s+\d+$/i.test(currentLabel)) {
    arrayItem.setAttribute("data-default-label", currentLabel);
  }

  legend.textContent = String((nameField as HTMLInputElement).value || "").trim() || fallbackLabel;
};

const syncNamedArrayItemLabels = (root: ParentNode = document) => {
  root.querySelectorAll?.(`.${rendererConfig.triggers.arrayItemRow}`).forEach((row) => {
    updateArrayItemLabel(row);
  });
};

domRenderer.renderArrayItem = (content: Node, options?: { isRemovable?: boolean }) => {
  const element = renderSvelteNode(ArrayItemRow, {
    content,
    removable: options?.isRemovable !== false,
    removeClassName: `${rendererConfig.classes.buttonDanger} ${rendererConfig.triggers.removeArrayItem} mqb-array-item-delete`,
  });

  addClassTokens(
    element,
    rendererConfig.classes.arrayItemRow,
    rendererConfig.triggers.arrayItemRow,
    "mqb-array-item-row",
  );

  const contentHost = element.querySelector(".mqb-array-item-content");
  addClassTokens(
    contentHost,
    rendererConfig.classes.arrayItemContent,
    rendererConfig.triggers.arrayItemContent,
  );

  const legend = element.querySelector("legend");
  if (legend?.textContent?.trim()) {
    element.setAttribute("data-default-label", legend.textContent.trim());
  }

  window.setTimeout(() => updateArrayItemLabel(element), 0);
  window.setTimeout(() => updateArrayItemLabel(element), 50);
  return element;
};

if (!(window as any)._mqb_array_item_name_sync_installed) {
  (window as any)._mqb_array_item_name_sync_installed = true;

  document.addEventListener("input", (event) => {
    const input = (event.target as Element | null)?.closest?.(
      'input[id$=".name"], input[name$="[name]"], input[name="name"]',
    );
    if (!input) return;
    updateArrayItemLabel(input.closest(`.${rendererConfig.triggers.arrayItemRow}`));
  });

  const target = document.body || document.documentElement;
  if (target instanceof Node) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(`.${rendererConfig.triggers.arrayItemRow}`)) {
            updateArrayItemLabel(node);
            window.setTimeout(() => updateArrayItemLabel(node), 50);
            return;
          }
          syncNamedArrayItemLabels(node);
          window.setTimeout(() => syncNamedArrayItemLabels(node), 50);
        });
      }
    });

    observer.observe(target, { childList: true, subtree: true });
  }
}

function fixNullBooleans(node: SchemaNode, dataPath: Array<string | number>, context: RendererContext) {
  if (!node.properties) return;
  const store = context.store;
  const data = store.getPath(dataPath);

  if (!data || typeof data !== "object") return;

  const hasNullBooleans = Object.entries(node.properties).some(([key, prop]) => prop?.type === "boolean" && data[key] === null);
  if (!hasNullBooleans) return;

  window.setTimeout(() => {
    const currentData = { ...(store.getPath(dataPath) || {}) };
    let changed = false;

    for (const [key, prop] of Object.entries(node.properties)) {
      if (prop?.type === "boolean" && currentData[key] === null) {
        currentData[key] = false;
        changed = true;
      }
    }

    if (changed) {
      store.setPath(dataPath, currentData);
    }
  }, 0);
}

const tlsRenderer = {
  render: (node: SchemaNode, path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    fixNullBooleans(node, dataPath, context);
    const element = tlsBaseRenderer.render(node, path, elementId, dataPath, context) as HTMLElement;
    element?.classList?.add("ui_tls");
    return element;
  },
};

const basicAuthRenderer = {
  render: (_node: SchemaNode, _path: string, _elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    const store = context.store;
    const currentValue = store.getPath(dataPath);
    const tuple = Array.isArray(currentValue) ? currentValue : ["", ""];

    return renderSvelteNode(BasicAuthEditor, {
      title: "Basic Auth",
      description: "",
      username: String(tuple[0] || ""),
      password: String(tuple[1] || ""),
      onChange: ({ username, password }: { username: string; password: string }) => {
        const next = [username, password];
        const hasAnyValue = next.some((item) => item.trim().length > 0);
        store.setPath(dataPath, hasAnyValue ? next : null);
      },
    });
  },
};

const customHeadersRenderer = {
  render: (node: SchemaNode, _path: string, _elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    const store = context.store;
    const currentValue = store.getPath(dataPath) ?? node.defaultValue ?? {};
    const rows = Object.entries(currentValue)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({ key: String(key), value: String(value ?? "") }));

    return renderSvelteNode(HeadersEditor, {
      title: String(node.title || "Custom Headers"),
      description: String(node.description || ""),
      rows,
      onChange: (nextRows: Array<{ key: string; value: string }>) => {
        const nextValue = Object.fromEntries(
          nextRows
            .filter((row) => row.key.trim().length > 0)
            .map((row) => [row.key.trim(), row.value]),
        );
        store.setPath(dataPath, nextValue);
      },
    });
  },
};

const createCustomCollapsibleRenderer = (visibleKeys: string[]) => ({
  render: (node: SchemaNode, _path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    fixNullBooleans(node, dataPath, context);
    if (!node.properties) {
      return document.createDocumentFragment();
    }

    const visibleProps: Record<string, unknown> = {};
    const hiddenProps: Record<string, unknown> = {};
    const primaryKeys = new Set(visibleKeys);

    Object.entries(node.properties).forEach(([key, prop]) => {
      if (primaryKeys.has(key) || (prop as SchemaNode).required) {
        visibleProps[key] = prop;
      } else {
        hiddenProps[key] = prop;
      }
    });

    return renderSvelteNode(CollapsibleFields, {
      description: String(node.description || ""),
      visibleContent: createWrappedContainer(
        renderProperties(context, visibleProps, elementId, dataPath),
        "mqb-collapsible-visible-fields",
      ),
      hiddenContent: Object.keys(hiddenProps).length > 0
        ? createWrappedContainer(
          renderProperties(context, hiddenProps, elementId, dataPath),
          "mqb-collapsible-hidden-fields",
        )
        : null,
      toggleLabel: "Show advanced",
    });
  },
});

const routeObjectRenderer = createCustomCollapsibleRenderer(["input", "output"]);

const routesRenderer = {
  render: (node: SchemaNode, _path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    const wrapper = domRenderer.renderAdditionalProperties(
      { ...node, defaultValue: {} },
      elementId,
      { title: null },
    ) as HTMLElement;

    const itemsContainer = wrapper.querySelector(`.${rendererConfig.triggers.additionalPropertyItems}`);
    const currentRoutes = context.store.getPath(dataPath) ?? node.defaultValue;

    if (itemsContainer && node.additionalProperties && currentRoutes && typeof currentRoutes === "object") {
      const definedProps = new Set(node.properties ? Object.keys(node.properties) : []);
      let apIndex = 0;

      Object.keys(currentRoutes).forEach((key) => {
        if (definedProps.has(key)) return;

        const valueNode = hydrateNodeWithData(node.additionalProperties, currentRoutes[key]);
        const routePath = `${elementId}.__ap_${apIndex}`;
        const routeDataPath = [...dataPath, key];
        const valueHtml = renderNode(context, valueNode, routePath, true, routeDataPath);
        const rowNode = routesRenderer.renderAdditionalPropertyRow(
          valueHtml,
          key,
          `${routePath}_key`,
        );

        itemsContainer.appendChild(rowNode);
        apIndex += 1;
      });
    }

    return domRenderer.renderObject(node, elementId, wrapper);
  },
  getDefaultKey: (index: number) => `Route ${index + 1}`,
  renderAdditionalPropertyRow: (valueHtml: Node, defaultKey: string, uniqueId: string) =>
    renderSvelteNode(AdditionalPropertyRow, {
      inputId: uniqueId,
      value: defaultKey,
      placeholder: "Route name",
      valueContent: valueHtml,
      removeClassName: `btn-remove-ap ${rendererConfig.classes.buttonDanger} ${rendererConfig.triggers.removeAdditionalProperty}`,
    }),
};

domRenderer.renderAdditionalPropertyRow = (
  valueHtml: Node,
  defaultKey = "",
  uniqueId = "",
) => renderSvelteNode(GenericAdditionalPropertyRow, {
  inputId: uniqueId || undefined,
  value: defaultKey,
  placeholder: "Header name",
  valueContent: valueHtml,
  removeClassName: `${rendererConfig.classes.buttonDanger} ${rendererConfig.triggers.removeAdditionalProperty} cons-response-header-delete`,
});

const ADVANCED_KEYS = [
  "queue",
  "group_id",
  "topic",
  "stream",
  "subject",
  "path",
  "topic_arn",
  "collection",
  "queue_url",
  "endpoint_url",
  "routes",
  "input",
  "output",
  "description",
  "extract_secrets",
];

const CONSUMER_VISIBLE_ENDPOINT_KEYS: Record<string, string[]> = {
  http: ["tls", "basic_auth", "path"],
};

const ENDPOINT_PRIMARY_KEYS: Record<string, string[]> = {
  aws: ["queue_url", "topic_arn", "endpoint_url"],
  kafka: ["url", "topic", "group_id", "tls", "basic_auth"],
  nats: ["url", "subject", "stream", "tls", "basic_auth"],
  file: ["path"],
  static: [],
  memory: ["topic"],
  amqp: ["url", "queue", "topic", "tls", "basic_auth"],
  mongodb: ["url", "database", "collection", "username", "password", "tls"],
  mqtt: ["url", "topic", "tls", "basic_auth"],
  http: ["url", "method", "path", "tls", "basic_auth", "custom_headers"],
  sled: ["path", "tree"],
  htmx: ["routes"],
  ref: [],
  ibmmq: ["url", "queue", "topic", "tls", "basic_auth"],
  zeromq: ["url", "topic"],
  switch: ["metadata_key", "cases", "default"],
  response: [],
  custom: [],
};

const createEndpointRenderer = (type: string) => ({
  render: (node: SchemaNode, path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    fixNullBooleans(node, dataPath, context);
    const formMode = String((window as any)._mqb_form_mode || "");
    const visibleKeys = formMode === "consumer"
      ? (CONSUMER_VISIBLE_ENDPOINT_KEYS[type] || ENDPOINT_PRIMARY_KEYS[type] || [])
      : (ENDPOINT_PRIMARY_KEYS[type] || []);
    return createCustomCollapsibleRenderer(visibleKeys).render(node, path, elementId, dataPath, context);
  },
});

const createScalarEndpointRenderer = (
  type: "static" | "ref",
  options: { title: string; placeholder: string; suggestions?: () => string[] },
) => ({
  render: (node: SchemaNode, _path: string, _elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    const store = context.store;
    const currentValue = store.getPath(dataPath);
    const suggestions = options.suggestions ? options.suggestions() : [];

    return renderSvelteNode(ScalarEndpointInput, {
      title: String(node.title || options.title),
      description: String(node.description || ""),
      value: typeof currentValue === "string"
        ? currentValue
        : (typeof node.defaultValue === "string" ? node.defaultValue : ""),
      placeholder: options.placeholder,
      suggestions,
      onChange: (next: string) => {
        store.setPath(dataPath, next);
      },
    });
  },
});

const appConfigRenderer = createCustomCollapsibleRenderer(ADVANCED_KEYS);

const rootRenderer = {
  render: (node: SchemaNode, path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
    const formMode = String((window as any)._mqb_form_mode || "");

    if (formMode === "publisher" || formMode === "consumer") {
      return createCustomCollapsibleRenderer(["name", "endpoint"]).render(node, path, elementId, dataPath, context);
    }

    if (formMode === "settings") {
      return appConfigRenderer.render(node, path, elementId, dataPath, context);
    }

    return renderObject(context, node, elementId, false, dataPath);
  },
};

const baseMiddlewaresRenderer = createTypeSelectArrayRenderer({
  buttonLabel: "Add Middleware",
  itemLabel: "Middleware",
});

const middlewaresRenderer = {
  render: (node: SchemaNode, path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext, isHeadless = false) => {
    const element = baseMiddlewaresRenderer.render(node, path, elementId, dataPath, context, isHeadless) as HTMLElement;
    const toggleButton = element.querySelector(`.${rendererConfig.triggers.arrayTypeToggle}`) as HTMLElement | null;
    const typeSelect = element.querySelector(`.${rendererConfig.triggers.arrayTypeSelect}`) as HTMLSelectElement | null;

    if (toggleButton && typeSelect) {
      toggleButton.classList.remove(rendererConfig.triggers.arrayTypeToggle);
      toggleButton.onclick = (event) => {
        event.preventDefault();
        toggleButton.style.display = "none";
        typeSelect.style.display = "inline-block";
        typeSelect.focus();
        typeSelect.getBoundingClientRect();

        try {
          typeSelect.showPicker?.();
        } catch {
          window.requestAnimationFrame(() => {
            try {
              typeSelect.showPicker?.();
            } catch {
              // ignore
            }
          });
        }
      };

      typeSelect.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (!typeSelect.value) {
            typeSelect.style.display = "none";
            toggleButton.style.display = "";
          }
        }, 0);
      });
    }

    return element;
  },
};

const descriptionRenderer = {
  render: (node: SchemaNode, _path: string, elementId: string, dataPath: Array<string | number>) => {
    const textarea = document.createElement("textarea");
    textarea.className = rendererConfig.classes.input;
    textarea.id = elementId;
    textarea.name = forms.getName(dataPath);
    textarea.rows = 3;
    textarea.value = node.defaultValue !== undefined ? String(node.defaultValue) : "";
    if (node.readOnly) textarea.disabled = true;
    if (node.required) textarea.required = true;
    return domRenderer.renderFieldWrapper(node, elementId, textarea);
  },
};

const CUSTOM_RENDERERS: Record<string, unknown> = {
  Route: routeObjectRenderer,
  tls: tlsRenderer,
  basic_auth: basicAuthRenderer,
  custom_headers: customHeadersRenderer,
  routes: routesRenderer,
  middlewares: middlewaresRenderer,
  description: descriptionRenderer,
  "output.mode": { render: () => document.createDocumentFragment() },
  value: {
    render: (node: SchemaNode, _path: string, elementId: string, dataPath: Array<string | number>, context: RendererContext) => {
      if (elementId.startsWith("Routes.")) {
        const props = node.properties
          ? renderProperties(context, node.properties, elementId, dataPath)
          : document.createDocumentFragment();
        const ap = domRenderer.renderAdditionalProperties(node, elementId);
        const oneOf = domRenderer.renderOneOf(node, elementId);
        const content = document.createDocumentFragment();
        content.append(props, ap, oneOf);
        return domRenderer.renderHeadlessObject(elementId, content);
      }
      return renderObject(context, node, elementId, false, dataPath);
    },
  },
};

[
  "aws",
  "kafka",
  "nats",
  "file",
  "memory",
  "amqp",
  "mongodb",
  "mqtt",
  "http",
  "sled",
  "htmx",
  "ibmmq",
  "zeromq",
  "switch",
  "response",
  "custom",
].forEach((type) => {
  CUSTOM_RENDERERS[type] = createEndpointRenderer(type);
});

CUSTOM_RENDERERS.static = createScalarEndpointRenderer("static", {
  title: "Static",
  placeholder: "Static value",
});

CUSTOM_RENDERERS.ref = createScalarEndpointRenderer("ref", {
  title: "Ref",
  placeholder: "publisher_name",
  suggestions: () =>
    Array.from(
      new Set(
        ((mqbApp.config<Record<string, any>>()?.publishers || []) as Array<{ name?: string }>)
          .map((publisher) => String(publisher?.name || "").trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b)),
});

CUSTOM_RENDERERS.AppConfig = appConfigRenderer;
CUSTOM_RENDERERS.route = routeObjectRenderer;
CUSTOM_RENDERERS.root = rootRenderer;

setCustomRenderers(CUSTOM_RENDERERS);
