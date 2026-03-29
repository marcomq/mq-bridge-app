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
  createAdvancedOptionsRenderer,
  createOptionalRenderer,
  renderCompactFieldWrapper,
  hydrateNodeWithData,
  rendererConfig,
} = window.VanillaSchemaForms;

// Apply global I18N overrides
setI18n({
  keys: {
    Map_of_Route: "Routes", // Rename "Map of Route" to "Routes" in the UI
  },
});

// Configure global visibility rules
setConfig({
  visibility: {
    // Custom visibility logic based on node description and path
    customVisibility: (node, path) => {
      const description = node.description || "";
      const lowerPath = path.toLowerCase();

      if (
        lowerPath.includes(".input") &&
        description.includes("Publisher only")
      ) {
        return false;
      }
      if (
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

// Override renderFieldWrapper for compact layout
const originalRenderFieldWrapper = domRenderer.renderFieldWrapper;
domRenderer.renderFieldWrapper = (
  node,
  elementId,
  inputElement,
  wrapperClass,
) => {
  if (node.oneOf) {
    const select = inputElement.querySelector("select");
    const content = inputElement.querySelector(".oneof-container");
    if (select && content) {
      const compactSection = renderCompactFieldWrapper(node, elementId, select);
      const container = h("div", { className: wrapperClass || "" });
      container.appendChild(compactSection);
      container.appendChild(content);
      return container;
    }
  }
  if (
    ["string", "number", "integer", "boolean"].includes(node.type) ||
    node.enum
  ) {
    return renderCompactFieldWrapper(node, elementId, inputElement);
  }
  return originalRenderFieldWrapper(
    node,
    elementId,
    inputElement,
    wrapperClass,
  );
};

/**
 * Custom renderer for TLS configuration.
 * It renders a checkbox for the 'required' property and toggles the visibility of other properties.
 */
const tlsBaseRenderer = createOptionalRenderer("required");

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
        { id: hiddenId, style: "display: none;", className: "mt-3" },
        renderProperties(context, hiddenProps, elementId, dataPath)
      );

      toggleBtn = h(
        "button",
        {
          type: "button",
          className: "btn btn-sm btn-link p-0 text-decoration-none mt-2",
          onclick: (e) => {
            const el = document.getElementById(hiddenId);
            if (el) {
              const isHidden = el.style.display === "none";
              el.style.display = isHidden ? "block" : "none";
              e.currentTarget.textContent = isHidden ? "Hide" : "Show more...";
            }
          },
        },
        "Show more..."
      );
    }

    return domRenderer.renderFragment([
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
      className: "form-control form-control-sm fw-bold ap-key js-ap-key",
      placeholder: "Route name",
      value: defaultKey,
      "data-original-key": defaultKey,
    };
    if (uniqueId) keyInputAttrs.id = uniqueId;

    const labelAttrs = { className: "form-label fw-bold mb-0 text-nowrap" };
    if (uniqueId) labelAttrs.for = uniqueId;

    return h(
      "div",
      { className: "mb-4 border rounded shadow-sm ap-row js-ap-row" },
      h(
        "div",
        {
          className:
            "d-flex align-items-center justify-content-between p-3 bg-light border-bottom rounded-top",
        },
        h(
          "div",
          {
            className: "d-flex align-items-center gap-2 flex-grow-1",
            style: "max-width: 70%;",
          },
          h("label", labelAttrs, "Route Name:"),
          h("input", keyInputAttrs),
        ),
        h(
          "button",
          {
            type: "button",
            className: `btn btn-sm btn-outline-danger btn-remove-ap ${rendererConfig.triggers.removeAdditionalProperty}`,
          },
          "Remove Route",
        ),
      ),
      h("div", { className: "p-3 flex-grow-1" }, valueHtml),
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

// Advanced Options Renderer (Collapse)
const advancedOptionsRendererBase = createAdvancedOptionsRenderer(ADVANCED_KEYS);

const advancedOptionsRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    fixNullBooleans(node, dataPath, context);
    return advancedOptionsRendererBase.render(
      node,
      path,
      elementId,
      dataPath,
      context,
    );
  },
};

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
  CUSTOM_RENDERERS[type] = advancedOptionsRenderer;
});
CUSTOM_RENDERERS["AppConfig"] = appConfigRenderer;
CUSTOM_RENDERERS["route"] = advancedOptionsRenderer;

// 4. Apply the renderers
setCustomRenderers(CUSTOM_RENDERERS);
