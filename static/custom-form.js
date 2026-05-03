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
  formatWebAwesomeLabel,
  hydrateNodeWithData,
  rendererConfig,
} = window.VanillaSchemaForms;

// mq-bridge-specific layer on top of vanilla-schema-forms.
// Keep this file focused on app UX decisions: compact rows, visibility rules,
// endpoint-specific renderers, and custom editors for shapes that are awkward
// with the generic schema renderer.

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

      // 1. Hide transport fields ONLY in the top-level Publisher tab view
      // because they are handled by the separate Request Bar UI.
      if (
        formMode === "publisher" &&
        ["url", "method", "queue", "topic", "database"].includes(lowerPath.split(".").pop())
      ) {
        return false;
      }

      // 2. Identify context (nested objects in Routes/Settings or top-level tabs)
      const isPubCtx = lowerPath.includes("publishers") || lowerPath.includes(".output") || formMode === "publisher";
      const isConsCtx = lowerPath.includes("consumers") || lowerPath.includes(".input") || formMode === "consumer";

      // 3. Hide cross-platform specific fields based on description markers
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
    }

    return formatWebAwesomeLabel(node, elementId);
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

const toggleDisclosure = (button, targetId) => {
  const target = document.getElementById(targetId);
  if (!target || !button) return;

  const isHidden = target.style.display === "none";
  target.style.display = isHidden ? "block" : "none";
  button.setAttribute("aria-expanded", isHidden ? "true" : "false");
  button.textContent = isHidden
    ? (
      button.getAttribute("data-expanded-label")
      || button.getAttribute("data-label-collapse")
      || "Hide"
    )
    : (
      button.getAttribute("data-collapsed-label")
      || button.getAttribute("data-label-expand")
      || "Show more..."
    );
};

const syncToggleTarget = (input) => {
  if (!input?.hasAttribute?.("data-toggle-target")) return;
  const targetId = input.getAttribute("data-toggle-target");
  const target = targetId ? document.getElementById(targetId) : null;
  if (!target) return;
  target.style.display = input.checked ? "block" : "none";
};

// Small delegated fallback for our own custom disclosure/toggle markup.
// The library already handles most standard controls, but these listeners keep
// custom sections working even when schema subtrees are rebuilt after type switches.
const installFormInteractionDelegates = () => {
  if (window._mqb_form_interactions_installed) return;
  window._mqb_form_interactions_installed = true;

  document.addEventListener("change", (event) => {
    const input = event.target.closest?.("[data-toggle-target]");
    if (input) {
      syncToggleTarget(input);
    }
  });
};

installFormInteractionDelegates();

// App-config list items are rebuilt often and default to generic labels such as
// "Item 1". We sync the visible legend from each row's `name` field so arrays of
// publishers/consumers/routes are easier to scan.
const getArrayItemNameField = (container) =>
  container?.querySelector?.(
    'input[id$=".name"], input[name$="[name]"], input[name="name"], textarea[id$=".name"], textarea[name$="[name]"], textarea[name="name"]',
  ) || null;

const getArrayItemLegend = (arrayItem) => {
  if (!arrayItem?.querySelector) return null;

  const directContent = arrayItem.querySelector(
    `:scope > .${rendererConfig.triggers.arrayItemContent}`,
  );
  const directLegend = directContent?.querySelector?.(":scope > fieldset > legend");
  if (directLegend) {
    return directLegend;
  }

  return arrayItem.querySelector("legend");
};

const updateArrayItemLabel = (arrayItem) => {
  if (!arrayItem) return;

  const legend = getArrayItemLegend(arrayItem);
  const nameField = getArrayItemNameField(arrayItem);
  if (!legend || !nameField) return;

  const currentLabel = String(legend.textContent || "").trim();
  const fallbackLabel = arrayItem.getAttribute("data-default-label")
    || currentLabel
    || "Item";

  if (!arrayItem.getAttribute("data-default-label") && /^Item\s+\d+$/i.test(currentLabel)) {
    arrayItem.setAttribute("data-default-label", currentLabel);
  }

  const nextLabel = String(nameField.value || "").trim() || fallbackLabel;
  legend.textContent = nextLabel;
};

const syncNamedArrayItemLabels = (root = document) => {
  root.querySelectorAll?.(`.${rendererConfig.triggers.arrayItemRow}`).forEach((row) => {
    updateArrayItemLabel(row);
  });
};

domRenderer.renderArrayItem = (content, options) => {
  const isRemovable = options?.isRemovable !== false;
  const contentWrapper = h(
    "div",
    {
      className: `${rendererConfig.classes.arrayItemContent} ${rendererConfig.triggers.arrayItemContent} mqb-array-item-content`,
    },
    content,
  );

  if (isRemovable) {
    contentWrapper.appendChild(
      h(
        "button",
        {
          type: "button",
          className: `${rendererConfig.classes.buttonDanger} ${rendererConfig.triggers.removeArrayItem} mqb-array-item-delete`,
        },
        "Remove",
      ),
    );
  }

  const row = h(
    rendererConfig.elements.arrayItem || "div",
    {
      className: `${rendererConfig.classes.arrayItemRow} ${rendererConfig.triggers.arrayItemRow} mqb-array-item-row`,
    },
    contentWrapper,
  );

  const legend = row.querySelector("legend");
  if (legend) {
    const label = legend.textContent?.trim();
    if (label) {
      row.setAttribute("data-default-label", label);
    }
  }

  setTimeout(() => updateArrayItemLabel(row), 0);
  setTimeout(() => updateArrayItemLabel(row), 50);
  return row;
};

const installArrayItemNameSync = () => {
  if (window._mqb_array_item_name_sync_installed) return;
  window._mqb_array_item_name_sync_installed = true;

  document.addEventListener("input", (event) => {
    const input = event.target.closest?.(
      'input[id$=".name"], input[name$="[name]"], input[name="name"]',
    );
    if (!input) return;
    updateArrayItemLabel(
      input.closest(`.${rendererConfig.triggers.arrayItemRow}`),
    );
  });

  const startObserver = () => {
    const target = document.body || document.documentElement;
    if (!(target instanceof Node)) return false;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches?.(`.${rendererConfig.triggers.arrayItemRow}`)) {
            updateArrayItemLabel(node);
            setTimeout(() => updateArrayItemLabel(node), 50);
          } else {
            syncNamedArrayItemLabels(node);
            setTimeout(() => syncNamedArrayItemLabels(node), 50);
          }
        });
      }
    });

    observer.observe(target, { childList: true, subtree: true });
    return true;
  };

  if (!startObserver()) {
    document.addEventListener(
      "DOMContentLoaded",
      () => {
        startObserver();
        syncNamedArrayItemLabels();
      },
      { once: true },
    );
  }
};

installArrayItemNameSync();

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

// These custom renderers are intentionally narrow. They exist only where the
// schema-native UI is too noisy or does not match the stored data shape well.
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

const customHeadersRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    const store = context.store;
    const currentValue = store.getPath(dataPath) ?? node.defaultValue ?? {};
    const headers = currentValue && typeof currentValue === "object" ? currentValue : {};

    const itemsContainer = h("div", { className: "response-editor-grid" });

    const syncHeaders = () => {
      const next = {};
      itemsContainer.querySelectorAll(".response-header-row").forEach((row) => {
        const key = row.querySelector(".cons-response-header-key")?.value?.trim() || "";
        const value = row.querySelector(".cons-response-header-value")?.value?.trim() || "";
        if (key) next[key] = value;
      });
      store.setPath(dataPath, next);
    };

    const appendHeaderRow = (key = "", value = "") => {
      const keyInput = h("input", {
        className: "field-input cons-response-header-key",
        type: "text",
        placeholder: "Header name",
        value: key,
      });

      const valueInput = h("input", {
        className: "field-input cons-response-header-value",
        type: "text",
        placeholder: "Header value",
        value,
      });

      const deleteButton = h("wa-button", { className: "cons-response-header-delete" }, "Delete");
      deleteButton.setAttribute("variant", "neutral");
      deleteButton.setAttribute("appearance", "outlined");
      deleteButton.setAttribute("size", "small");

      const row = h(
        "div",
        { className: "response-header-row" },
        keyInput,
        valueInput,
        deleteButton,
      );

      deleteButton.onclick = (event) => {
        event.preventDefault();
        row.remove();
        syncHeaders();
      };

      [keyInput, valueInput].forEach((input) => {
        input.addEventListener("input", syncHeaders);
      });

      itemsContainer.appendChild(row);
      return row;
    };

    Object.entries(headers).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => {
      appendHeaderRow(String(key), String(value ?? ""));
    });

    const addButton = h("wa-button", { className: "mqb-custom-headers-add" }, "Add Header");
    addButton.setAttribute("variant", "neutral");
    addButton.setAttribute("appearance", "outlined");
    addButton.setAttribute("size", "small");
    addButton.onclick = (event) => {
      event.preventDefault();
      const row = appendHeaderRow("", "");
      syncHeaders();
      row.querySelector(".cons-response-header-key")?.focus();
    };

    const descriptionBlock = node.description
      ? h("div", { className: "form-description form-description-block" }, node.description)
      : document.createTextNode("");

    return h(
      "fieldset",
      { className: "ui_custom_headers", id: elementId },
      h("legend", {}, node.title || "Custom Headers"),
      descriptionBlock,
      h("div", { className: "section-label" }, "Headers"),
      itemsContainer,
      h("div", { className: "response-editor-actions" }, addButton),
    );
  },
};

// Reusable compact object renderer: keep a few important fields visible and move
// the rest behind a small disclosure without changing the underlying schema.
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
      dataPath,
    );

    let hiddenContent = null;
    let toggleBtn = null;

    if (Object.keys(hiddenProps).length > 0) {
      const hiddenId = `${elementId}-advanced`;
      hiddenContent = h(
        "div",
        { id: hiddenId, style: "display: none;", className: "form-advanced-block" },
        renderProperties(context, hiddenProps, elementId, dataPath),
      );

      toggleBtn = h(
        "button",
        {
          type: "button",
          size: "small",
          className: "btn-linkish js-disclosure-toggle",
          "data-disclosure-target": hiddenId,
          "data-collapsed-label": "Show more...",
          "data-expanded-label": "Hide",
          "data-label-expand": "Show more...",
          "data-label-collapse": "Hide",
          "aria-expanded": "false",
          onclick: (event) => {
            event.preventDefault();
            event.stopPropagation(); // Fix double-toggle in WebKit/Tauri by stopping bubble to delegate
            toggleDisclosure(event.currentTarget, hiddenId);
          },
        },
        "Show more...",
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
    const currentRoutes = context.store.getPath(dataPath) ?? node.defaultValue;

    if (
      itemsContainer &&
      node.additionalProperties &&
      currentRoutes &&
      typeof currentRoutes === "object"
    ) {
      const definedProps = new Set(
        node.properties ? Object.keys(node.properties) : [],
      );
      let apIndex = 0;

      Object.keys(currentRoutes).forEach((key) => {
        if (definedProps.has(key)) return;

        const valueSchema = node.additionalProperties;
        const valueNode = hydrateNodeWithData(
          valueSchema,
          currentRoutes[key],
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
          "button",
          {
            type: "button",
            className: `btn-remove-ap ${rendererConfig.classes.buttonDanger} ${rendererConfig.triggers.removeAdditionalProperty}`,
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

const CONSUMER_VISIBLE_ENDPOINT_KEYS = {
  http: ["tls", "basic_auth", "path"],
};

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
    const formMode = window._mqb_form_mode || "";
    const visibleKeys = formMode === "consumer"
      ? (CONSUMER_VISIBLE_ENDPOINT_KEYS[type] || ENDPOINT_PRIMARY_KEYS[type] || [])
      : (ENDPOINT_PRIMARY_KEYS[type] || []);
    return createCustomCollapsibleRenderer(visibleKeys).render(
      node,
      path,
      elementId,
      dataPath,
      context,
    );
  },
});

const appConfigRenderer = createCustomCollapsibleRenderer(ADVANCED_KEYS);

const rootRenderer = {
  render: (node, path, elementId, dataPath, context) => {
    const formMode = window._mqb_form_mode || "";

    if (formMode === "publisher") {
      return createCustomCollapsibleRenderer(["name", "endpoint"]).render(
        node,
        path,
        elementId,
        dataPath,
        context,
      );
    }

    if (formMode === "consumer") {
      return createCustomCollapsibleRenderer(["name", "endpoint"]).render(
        node,
        path,
        elementId,
        dataPath,
        context,
      );
    }

    if (formMode === "settings") {
      return appConfigRenderer.render(node, path, elementId, dataPath, context);
    }

    return renderObject(context, node, elementId, false, dataPath);
  },
};

/**
 * Custom renderer for Middlewares array.
 * Replaces the standard "Add Item" button with an "Add Middleware" button that opens a select.
 */
const baseMiddlewaresRenderer = createTypeSelectArrayRenderer({
  buttonLabel: "Add Middleware",
  itemLabel: "Middleware",
});

const middlewaresRenderer = {
  render: (node, path, elementId, dataPath, context, isHeadless = false) => {
    const element = baseMiddlewaresRenderer.render(
      node,
      path,
      elementId,
      dataPath,
      context,
      isHeadless,
    );

    const toggleButton = element.querySelector?.(
      `.${rendererConfig.triggers.arrayTypeToggle}`,
    );
    const typeSelect = element.querySelector?.(
      `.${rendererConfig.triggers.arrayTypeSelect}`,
    );

    if (toggleButton && typeSelect) {
      toggleButton.classList.remove(rendererConfig.triggers.arrayTypeToggle);
      toggleButton.onclick = (event) => {
        event.preventDefault();
        toggleButton.style.display = "none";
        typeSelect.style.display = "inline-block";
        typeSelect.focus();

        // Mirror the upstream one-click behavior first, but flush layout before
        // opening the picker because hidden selects can fail the rendered-state
        // check in some browsers. If that still fails, retry on the next frame
        // and otherwise leave the select visible as a manual fallback.
        typeSelect.getBoundingClientRect();

        const tryShowPicker = () => {
          try {
            if (typeof typeSelect.showPicker === "function") {
              typeSelect.showPicker();
              return true;
            }
          } catch {
            // Fall through to the next fallback.
          }

          return false;
        };

        if (!tryShowPicker()) {
          window.requestAnimationFrame(() => {
            tryShowPicker();
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
 * Prefer putting app-specific behavior here before overriding global renderer
 * internals. That keeps upgrades of vanilla-schema-forms less painful.
 */
const CUSTOM_RENDERERS = {
  Route: routeObjectRenderer,
  tls: tlsRenderer,
  basic_auth: basicAuthRenderer,
  custom_headers: customHeadersRenderer,
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
CUSTOM_RENDERERS.root = rootRenderer;

// 4. Apply the renderers
setCustomRenderers(CUSTOM_RENDERERS);
