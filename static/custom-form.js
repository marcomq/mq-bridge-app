const {
  h,
  renderObject,
  renderProperties,
  domRenderer,
  setI18n,
  setConfig,
  setCustomRenderers,
  generateDefaultData,
  renderNode,
  resolvePath,
  getName,
  createTypeSelectArrayRenderer,
  createOptionalRenderer,
  hydrateNodeWithData,
  rendererConfig,
} = window.VanillaSchemaForms;

Object.assign(rendererConfig.classes, {
  buttonPrimary: "wa-native-button wa-native-button--brand",
  buttonSecondary: "wa-native-button wa-native-button--neutral",
  buttonDanger: "wa-native-button wa-native-button--danger",
});

// Apply global I18N overrides
setI18n({
  keys: {
    Map_of_Route: "Routes", // Rename "Map of Route" to "Routes" in the UI
  },
});

// Configure global visibility rules
setConfig({
  visibility: {
    hiddenPaths: ["publishers", "consumers", "routes"],
    customVisibility: (node, path) => {
      const description = node.description || "";
      const lowerPath = path.toLowerCase();
      const formMode = window._mqb_form_mode || "";

      if (formMode === "publisher" && description.includes("Consumer only")) {
        return false;
      }
      if (formMode === "consumer" && description.includes("Publisher only")) {
        return false;
      }

      if (
        formMode === "route" &&
        lowerPath.includes(".input") &&
        description.includes("Publisher only")
      ) {
        return false;
      }
      if (
        formMode === "route" &&
        lowerPath.includes(".output") &&
        description.includes("Consumer only")
      ) {
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
      "key",
      "value",
      "required",
      "description",
      "routes",
    ],
  },
});

/**
 * Core form-row renderer override.
 * Transforms each scalar field into:
 * <div class="wa-form-row">
 *   <label class="wa-form-label">...</label>
 *   <div class="wa-form-col">
 *     <input class="field-input">
 *     <div class="form-description">...</div>
 *   </div>
 * </div>
 */
domRenderer.renderFieldWrapper = (node, elementId, inputElement, wrapperClass) => {
  const input = inputElement.querySelector?.("input, select, textarea") || inputElement;
  const isCheckbox = input?.tagName === "INPUT" && input.type === "checkbox";
  if (input?.classList) {
    if (isCheckbox) {
      input.classList.add("wa-checkbox");
    } else {
      input.classList.add("field-input");
    }
    const isTechnical = ["url", "brokers", "topic", "group", "key"].some((k) =>
      elementId.toLowerCase().includes(k),
    );
    if (!isCheckbox && isTechnical) {
      input.style.fontFamily = "var(--font)";
    }
  }

  if (node.type === "object" || node.type === "array" || node.oneOf) {
    return h(
      "div",
      { className: wrapperClass || "" },
      inputElement,
    );
  }

  const formatLabelText = () => {
    if (node.title) {
      return node.title;
    }

    const segments = String(elementId || "").split(".");
    const fieldKey = segments[segments.length - 1] || "";
    const parentKey = segments[segments.length - 2] || "";
    const indexedFieldLabels = {
      basic_auth: ["Username", "Password"],
    };

    if (/^\d+$/.test(fieldKey)) {
      const index = Number(fieldKey);
      const explicitLabel = indexedFieldLabels[parentKey]?.[index];
      if (explicitLabel) {
        return explicitLabel;
      }
      return `Item ${Number(fieldKey) + 1}`;
    }

    return fieldKey
      .replace(/^__var_/, "")
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Value";
  };

  const labelText = formatLabelText();
  const labelAttrs = { className: "wa-form-label" };
  if (input?.id) {
    labelAttrs.for = input.id;
  }
  const label = h("label", labelAttrs, labelText);

  const controlChildren = [inputElement];
  if (node.description) {
    controlChildren.push(h("div", { className: "form-description" }, node.description));
  }
  const control = h("div", { className: "wa-form-col" }, ...controlChildren);

  return h(
    "div",
    { className: ["wa-form-row", wrapperClass].filter(Boolean).join(" ") },
    label,
    control,
  );
};

/**
 * Custom renderer for TLS configuration.
 * It renders a checkbox for the 'required' property and toggles the visibility of other properties.
 */
const tlsBaseRenderer = createOptionalRenderer("required");

const toggleDisclosure = (e, targetId) => {
  const target = document.getElementById(targetId);
  if (!target) return;

  const isHidden = target.style.display === "none";
  target.style.display = isHidden ? "block" : "none";
  e.currentTarget.textContent = isHidden ? "Hide" : "Show more...";
};

// Helper to fix null booleans
const fixNullBooleans = (node, dataPath, context) => {
  if (!node.properties) return;
  const store = context.store;
  const data = store.getPath(dataPath);

  if (data && typeof data === "object") {
    let changed = false;
    for (const key in node.properties) {
      const prop = node.properties[key];
      if (prop.type === "boolean" && data[key] === null) {
        changed = true;
        break;
      }
    }

    if (changed) {
      setTimeout(() => {
        const currentData = store.getPath(dataPath) || {};
        const newData = { ...currentData };
        let hasChanges = false;
        for (const key in node.properties) {
          const prop = node.properties[key];
          if (prop.type === "boolean" && newData[key] === null) {
            console.warn(`[Auto-Fix] Converting null to false for boolean field: "${key}" at path:`, dataPath);
            newData[key] = false;
            hasChanges = true;
          }
        }
        if (hasChanges) {
          store.setPath(dataPath, newData);
        }
      }, 0);
    }
  }
};

const tlsRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    fixNullBooleans(node, dataPath, context);
    const element = tlsBaseRenderer.render(
      node,
      path,
      elementId,
      dataPath,
      context,
    );
    if (element && element.classList) element.classList.add("ui_tls");
    return element;
  },
};

const basicAuthRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    const store = context.store;
    const currentValue = store.getPath(dataPath) ?? node.defaultValue ?? null;
    const tuple = Array.isArray(currentValue)
      ? currentValue
      : currentValue && typeof currentValue === "object"
        ? [currentValue[0] ?? "", currentValue[1] ?? ""]
        : ["", ""];

    const syncValue = (index, value) => {
      const next = [tuple[0] ?? "", tuple[1] ?? ""];
      next[index] = value;
      tuple[index] = value;
      const hasAnyValue = next.some((item) => String(item || "").trim() !== "");
      store.setPath(dataPath, hasAnyValue ? next : null);
    };

    const usernameInput = h("input", {
      className: "field-input",
      type: "text",
      value: tuple[0] ?? "",
      oninput: (event) => syncValue(0, event.currentTarget.value),
    });
    usernameInput.style.fontFamily = "var(--font-ui)";

    const passwordInput = h("input", {
      className: "field-input",
      type: "password",
      value: tuple[1] ?? "",
      oninput: (event) => syncValue(1, event.currentTarget.value),
    });
    passwordInput.style.fontFamily = "var(--font-ui)";

    const descriptionBlock = node.description
      ? h("div", { className: "form-description form-description-block" }, node.description)
      : document.createTextNode("");

    return h(
      "fieldset",
      { className: "ui_basic_auth", id: elementId },
      h("legend", {}, node.title || "Basic Auth"),
      descriptionBlock,
      h(
        "div",
        { className: "wa-form-row" },
        h("label", { className: "wa-form-label" }, "Username"),
        h("div", { className: "wa-form-col" }, usernameInput),
      ),
      h(
        "div",
        { className: "wa-form-row" },
        h("label", { className: "wa-form-label" }, "Password"),
        h("div", { className: "wa-form-col" }, passwordInput),
      ),
    );
  },
};

const createCustomCollapsibleRenderer = (visibleKeys) => ({
  render: (node, path, elementId, dataPath, context) => {
    fixNullBooleans(node, dataPath, context);
    if (!node.properties) {
      return domRenderer.renderFragment([]);
    }

    const visibleProps = {};
    const hiddenProps = {};
    const mainKeys = new Set(visibleKeys);

    Object.keys(node.properties).forEach((key) => {
      const prop = node.properties[key];
      if (mainKeys.has(key) || prop.required) {
        visibleProps[key] = prop;
      } else {
        hiddenProps[key] = prop;
      }
    });

    const visibleContent = renderProperties(
      context,
      visibleProps,
      elementId,
      dataPath
    );

    let hiddenContent = null;
    let toggleBtn = null;

    if (Object.keys(hiddenProps).length > 0) {
      const hiddenId = `${elementId}-advanced`;
      hiddenContent = h(
        "div",
        { id: hiddenId, style: "display: none;", className: "form-advanced-block" },
        renderProperties(context, hiddenProps, elementId, dataPath)
      );

      toggleBtn = h(
        "wa-button",
        {
          size: "small",
          variant: "neutral",
          appearance: "plain",
          className: "btn-linkish",
          onclick: (e) => toggleDisclosure(e, hiddenId),
        },
        "Show more..."
      );
    }

    const descriptionBlock = node.description
      ? h("div", { className: "form-description form-description-block" }, node.description)
      : document.createTextNode("");

    return domRenderer.renderFragment([
      descriptionBlock,
      visibleContent,
      toggleBtn || document.createTextNode(""),
      hiddenContent || document.createTextNode(""),
    ]);
  },
});

/**
 * This is the renderer for the Route object itself. It makes fields
 * other than 'input' and 'output' collapsible under a "Show more..." button.
 */
const routeObjectRenderer = createCustomCollapsibleRenderer(["input", "output"]);

/**
 * Custom renderer for Routes (Map/Dictionary).
 * It handles dynamic keys for additional properties and provides a custom UI for adding/removing routes.
 */
const routesRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    // This custom render function for 'routes' will manually handle rendering
    // its children (the individual Route objects) so that we can apply a
    // specific collapsible renderer to each one.

    // 1. Get the standard container (wrapper + add button) from the default renderer.
    // We pass an empty defaultValue so it doesn't render the items automatically.
    // This wrapper contains the 'data-element-id' attribute required for events.
    const nodeForButton = { ...node, defaultValue: {} };
    const wrapper = domRenderer.renderAdditionalProperties(
      nodeForButton,
      elementId,
      { title: null },
    );

    // 2. Find the items container within the wrapper where we will inject our custom rows.
    const itemsContainer = wrapper.querySelector(
      `.${rendererConfig.triggers.additionalPropertyItems}`,
    );

    // 3. Render existing routes from data manually
    if (
      itemsContainer &&
      node.additionalProperties &&
      node.defaultValue &&
      typeof node.defaultValue === "object"
    ) {
      const definedProps = new Set(
        node.properties ? Object.keys(node.properties) : [],
      );
      let apIndex = 0;

      Object.keys(node.defaultValue).forEach((key) => {
        if (definedProps.has(key)) return;

        const valueSchema = node.additionalProperties;
        const valueNode = hydrateNodeWithData(
          valueSchema,
          node.defaultValue[key],
        );

        const routePath = `${elementId}.__ap_${apIndex}`;
        const routeDataPath = [...dataPath, key];

        // Use renderNode to correctly render the content and populate all internal registries.
        // The system will automatically find and use the custom 'Route' renderer.
        const valueHtml = renderNode(
          context,
          valueNode,
          routePath,
          true,
          routeDataPath,
        );
        const keyInputId = `${routePath}_key`;

        // Then, wrap this custom content in the standard row structure.
        const rowNode = routesRenderer.renderAdditionalPropertyRow(
          valueHtml,
          key,
          keyInputId,
          routeDataPath,
          context,
        );

        itemsContainer.appendChild(rowNode);
        apIndex++;
      });
    }

    // 4. Assemble the final content and wrap in the standard object fieldset
    return domRenderer.renderObject(node, elementId, wrapper);
  },
  getDefaultKey: (index) => `Route ${index + 1}`,
  renderAdditionalPropertyRow: (
    valueHtml,
    defaultKey,
    uniqueId,
    _dataPath,
    _context,
  ) => {
    const keyInputAttrs = {
      type: "text",
      className: "ap-key js-ap-key",
      placeholder: "Route name",
      value: defaultKey,
      "data-original-key": defaultKey,
    };
    if (uniqueId) keyInputAttrs.id = uniqueId;

    const labelAttrs = { className: "form-label" };
    if (uniqueId) labelAttrs.for = uniqueId;

    return h(
      "div",
      { className: "ap-row js-ap-row", style: "grid-column: span 2" },
      h(
        "div",
        { className: "ap-row-header" },
        h(
          "div",
          { className: "ap-row-key" },
          h("label", labelAttrs, "Route Name"),
          h("input", keyInputAttrs),
        ),
        h(
          "wa-button",
          {
            variant: "danger",
            appearance: "outlined",
            size: "small",
            className: `btn-remove-ap ${rendererConfig.triggers.removeAdditionalProperty}`,
          },
          "Remove Route",
        ),
      ),
      h("div", { className: "ap-row-body" }, valueHtml),
    );
  },
};

const ADVANCED_KEYS = [
  "queue",
  "group_id",
  "topic",
  "stream",
  "subject",
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

const ENDPOINT_PRIMARY_KEYS = {
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

const createEndpointRenderer = (type) => ({
  render: (node, path, elementId, dataPath, context) => {
    fixNullBooleans(node, dataPath, context);
    return createCustomCollapsibleRenderer(ENDPOINT_PRIMARY_KEYS[type] || []).render(
      node,
      path,
      elementId,
      dataPath,
      context,
    );
  },
});

const appConfigRenderer = createCustomCollapsibleRenderer(ADVANCED_KEYS);

/**
 * Custom renderer for Middlewares array.
 * Replaces the standard "Add Item" button with an "Add Middleware" button that opens a select.
 */
const middlewaresRenderer = createTypeSelectArrayRenderer({
  buttonLabel: "Add Middleware",
  itemLabel: "Middleware",
});

/**
 * Custom renderer for description field to use a textarea.
 */
const descriptionRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    const name = getName(dataPath);
    const attributes = {
      className: rendererConfig.classes.input,
      id: elementId,
      name: name,
      rows: 3,
    };
    if (node.readOnly) {
      attributes.disabled = true;
    }
    if (node.required) {
      attributes.required = true;
    }

    const textarea = h(
      "textarea",
      attributes,
      node.defaultValue !== undefined ? String(node.defaultValue) : "",
    );

    return domRenderer.renderFieldWrapper(node, elementId, textarea);
  },
};

/**
 * Registry of custom renderers.
 */
const CUSTOM_RENDERERS = {
  Route: routeObjectRenderer,
  tls: tlsRenderer,
  basic_auth: basicAuthRenderer,
  routes: routesRenderer,
  middlewares: middlewaresRenderer,
  description: descriptionRenderer,
  "output.mode": { render: () => document.createDocumentFragment() },
  value: {
    render: (node, path, elementId, dataPath, context) => {
      // Only render "Value" headless if it is part of the Routes list
      if (elementId.startsWith("Routes.")) {
        const props = node.properties
          ? renderProperties(context, node.properties, elementId, dataPath)
          : domRenderer.renderFragment([]);
        const ap = domRenderer.renderAdditionalProperties(node, elementId);
        const oneOf = domRenderer.renderOneOf(node, elementId);
        const content = domRenderer.renderFragment([props, ap, oneOf]);
        return domRenderer.renderHeadlessObject(elementId, content);
      }
      // Fallback for other "Value" nodes
      return renderObject(context, node, elementId, false, dataPath);
    },
  },
};

// Add endpoint renderers
const endpointTypes = [
  "aws",
  "kafka",
  "nats",
  "file",
  "static",
  "memory",
  "amqp",
  "mongodb",
  "mqtt",
  "http",
  "sled",
  "htmx",
  "ref",
  "ibmmq",
  "zeromq",
  "switch",
  "response",
  "custom",
];
endpointTypes.forEach((type) => {
  CUSTOM_RENDERERS[type] = createEndpointRenderer(type);
});
CUSTOM_RENDERERS["AppConfig"] = appConfigRenderer;
CUSTOM_RENDERERS["route"] = routeObjectRenderer;

// 4. Apply the renderers
setCustomRenderers(CUSTOM_RENDERERS);
