import {
  applyEndpointSchemaDefaults,
  createRefInputEndpoint,
  defaultMetricsMiddleware,
  formatThroughput,
  hasMetricsMiddleware,
  isRouteEnabled,
  nextUniqueName,
  splitRouteFormData,
  type RouteDefinition,
} from "./routes";
import { cloneJson } from "./utils";
import { openConsumerByIndex, openPublisherByIndex, openRouteByName } from "./view-navigation";
import { appWindow, getMqbState, mqbApp, mqbDialogs, mqbRuntime } from "./runtime-window";
import { routesPanelState, type RouteSidebarItem } from "./stores";

export let restoreRouteStateFromView: (idx: number) => void | Promise<void> = () => {};
export let addRouteAction: () => void | Promise<void> = () => {};
export let copyCurrentRouteAction: () => void | Promise<void> = () => {};
export let cloneCurrentRouteAction: () => void | Promise<void> = () => {};
export let saveCurrentRouteAction: (button?: HTMLElement | null) => void | Promise<void> = () => {};
export let toggleCurrentRouteAction: (button?: HTMLElement | null) => void | Promise<void> = () => {};
export let deleteCurrentRouteAction: (button?: HTMLElement | null) => void | Promise<void> = () => {};
export let renameCurrentRouteAction: (nextName: string) => void | Promise<void> = () => {};

type RouteConfigMap = Record<string, RouteDefinition>;

interface RouteEntry extends RouteDefinition {
  name: string;
}

interface RouteAppConfig {
  routes: RouteConfigMap;
  consumers?: Array<{ name: string; endpoint?: Record<string, unknown>; comment?: string; response?: unknown }>;
  publishers?: Array<{ name: string; endpoint?: Record<string, unknown>; comment?: string }>;
}

interface RouteSchemaRoot {
  properties?: {
    routes?: {
      additionalProperties?: Record<string, unknown>;
    };
  };
  $defs?: Record<string, unknown>;
}

interface HyperscriptElement extends HTMLElement {
  variant?: string;
  appearance?: string;
}

interface ValidationObserverRoot extends HTMLElement {
  _routeValidationNoiseObserver?: MutationObserver;
}

const ROUTE_VALIDATION_NOISE = [
  "Schema: must have required property 'name'",
  "Schema: must have required property 'endpoint'",
];

function normalizeRouteName(name: string): string {
  return String(name || "").trim().replace(/\s+/g, "_").toLowerCase();
}

function buildRoutesArray(routes: RouteConfigMap | undefined): RouteEntry[] {
  return Object.entries(routes || {}).map(([name, details]) => ({ name, ...details }));
}

function createDefaultRoute(): RouteDefinition {
  return {
    enabled: true,
    input: { middlewares: defaultMetricsMiddleware(), null: null },
    output: { middlewares: defaultMetricsMiddleware(), null: null },
  };
}

function getProtocolLabel(endpoint: Record<string, unknown> | undefined): string {
  return Object.keys(endpoint || {})
    .filter((key) => key !== "middlewares")[0]
    ?.toUpperCase() || "N/A";
}

function scrubRouteValidationNoise(root: ParentNode | null) {
  if (!root) return;

  root.querySelectorAll("div, small, span").forEach((node) => {
    const text = node.textContent?.trim();
    if (!text || !ROUTE_VALIDATION_NOISE.some((message) => text.includes(message))) {
      return;
    }

    const removable = node.closest(
      "[data-validation-for], #form-global-errors > *, .invalid-feedback, .js-validation-error",
    );
    if (removable) {
      removable.remove();
      return;
    }

    node.remove();
  });
}

function watchRouteValidationNoise(root: ValidationObserverRoot | null) {
  if (!root) return;

  root._routeValidationNoiseObserver?.disconnect();
  scrubRouteValidationNoise(root);

  const observer = new MutationObserver(() => scrubRouteValidationNoise(root));
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  root._routeValidationNoiseObserver = observer;
}

export async function initRoutes(config: RouteAppConfig, schema: RouteSchemaRoot) {
  const lib = mqbApp.forms();
  const container = document.getElementById("routes-container") as HTMLElement | null;
  const routeToggleButton = document.getElementById("route-toggle") as (HyperscriptElement & {
    title?: string;
  }) | null;
  const routeMainUi = document.getElementById("route-main-ui") as HTMLElement | null;
  const routeEmptyAlert = document.getElementById("route-empty-alert") as HTMLElement | null;
  const configFormContainer = document.getElementById("route-config-form") as ValidationObserverRoot | null;

  if (!container || !routeMainUi || !routeEmptyAlert || !configFormContainer) {
    return;
  }

  container.style.display = "contents";

  const routesArray = buildRoutesArray(config.routes);
  let currentIdx = 0;

  mqbRuntime.registerDirtySection("routes", {
    buttonId: "route-save",
    getValue: () => config.routes,
  });

  const syncRoutesArrayFromConfig = (routesConfig: RouteConfigMap | undefined) => {
    routesArray.splice(0, routesArray.length, ...buildRoutesArray(routesConfig));
  };

  const settleRouteSavedState = () => {
    appWindow().setTimeout(() => {
      mqbRuntime.markSectionSaved("routes");
      const saveButton = document.getElementById("route-save");
      if (saveButton) {
        saveButton.dataset.dirty = "false";
        appWindow().syncSaveButtonLabel(saveButton);
      }
    }, 0);
  };

  const getCurrentRouteEntry = () => routesArray[currentIdx] || null;

  const setActiveItem = (idx: number) => {
    currentIdx = idx;
    syncRoutesPanelState();
  };

  const showRouteEmptyState = (isEmpty: boolean) => {
    routeEmptyAlert.style.display = isEmpty ? "block" : "none";
    routeMainUi.style.display = isEmpty ? "none" : "flex";
  };

  const createRouteSidebarItem = (
    route: RouteEntry,
    throughputMap: Record<string, number>,
    originalIndex: number,
  ): RouteSidebarItem => {
    const inputProto = getProtocolLabel(route.input as Record<string, unknown> | undefined);
    const outputProto = getProtocolLabel(route.output as Record<string, unknown> | undefined);
    const showMetrics = isRouteEnabled(route) && hasMetricsMiddleware(route);
    return {
      name: route.name,
      inputProto,
      outputProto,
      isDisabled: !isRouteEnabled(route),
      showMetrics,
      throughputLabel: showMetrics ? formatThroughput(Number(throughputMap[route.name] || 0)) : "0 msg/s",
      originalIndex,
    };
  };

  const syncRoutesPanelState = () => {
    const runtimeStatus = getMqbState().runtime_status || {};
    const throughputMap = runtimeStatus.route_throughput || {};
    const currentRoute = routesArray[currentIdx];
    const enabled = currentRoute ? isRouteEnabled(currentRoute) : true;
    routesPanelState.set({
      hasRoutes: routesArray.length > 0,
      items: routesArray.map((route, index) => createRouteSidebarItem(route, throughputMap, index)),
      selectedIndex: currentIdx,
      currentRouteName: currentRoute?.name || "",
      toggleVisible: routesArray.length > 0,
      toggleLabel: enabled ? "Disable" : "Enable",
      toggleVariant: enabled ? "danger" : "success",
      toggleAppearance: enabled ? "outlined" : "filled",
    });
  };

  const renderSidebar = () => {
    syncRoutesPanelState();
    showRouteEmptyState(routesArray.length === 0);
  };

  const renderRuntimeMetrics = () => {
    syncRoutesPanelState();
  };

  const syncRouteToggleButton = () => {
    const route = routesArray[currentIdx];
    if (!routeToggleButton || !route) return;

    const enabled = isRouteEnabled(route);
    routeToggleButton.variant = enabled ? "danger" : "success";
    routeToggleButton.appearance = enabled ? "outlined" : "filled";
    routeToggleButton.title = enabled
      ? "Disable this route and stop deploying it on save"
      : "Enable this route and deploy it again on save";
  };

  const openRouteAt = (routeName: string) => {
    openRouteByName(config.routes, routeName, restoreRouteStateFromView, () => {
      void initRoutes(config, schema);
    });
  };

  const openConsumerAt = (idx: number, tab = "definition") => {
    openConsumerByIndex(
      idx,
      tab as "messages" | "definition" | "response",
      (consumerIdx, options) => mqbApp.restore.consumer(consumerIdx, options),
      () => mqbApp.init.consumers(config, mqbApp.schema()),
    );
  };

  const openPublisherAt = (idx: number, tab = "definition") => {
    openPublisherByIndex(
      idx,
      tab as "payload" | "headers" | "history" | "definition",
      (publisherIdx, options) => mqbApp.restore.publisher(publisherIdx, options),
      () => mqbApp.init.publishers(config, mqbApp.schema()),
    );
  };

  const copyCurrentRoute = async () => {
    const current = getCurrentRouteEntry();
    if (!current) return;

    const choice = await mqbDialogs.choose("Choose what to create from this route.", "Copy Route", {
      choices: [
        {
          value: "input_consumer",
          label: "Input -> New Consumer",
          description: "Copies the current route input into a consumer.",
        },
        {
          value: "output_publisher",
          label: "Output -> New Publisher",
          description: "Copies the current route output into a publisher.",
        },
        {
          value: "output_ref",
          label: "Output -> New Ref Route",
          description: "Creates a new route with a ref input and this output.",
        },
      ],
    });
    if (!choice) return;

    if (choice === "input_consumer") {
      const consumerName = await mqbDialogs.prompt("Choose a name for the new consumer.", "Copy Route Input", {
        confirmLabel: "Create",
        value: nextUniqueName(
          `${current.name}_consumer`,
          (config.consumers || []).map((consumer) => consumer.name),
        ),
        placeholder: "route_consumer",
      });
      if (!consumerName) return;
      if ((config.consumers || []).some((consumer) => consumer.name === consumerName)) {
        await mqbDialogs.alert("Consumer already exists");
        return;
      }

      config.consumers ||= [];
      config.consumers.push({
        name: consumerName,
        endpoint: cloneJson(current.input),
        comment: "",
        response: null,
      });
      mqbRuntime.refreshDirtySection("consumers");
      openConsumerAt(config.consumers.length - 1, "definition");
      return;
    }

    if (choice === "output_publisher") {
      const publisherName = await mqbDialogs.prompt("Choose a name for the new publisher.", "Copy Route Output", {
        confirmLabel: "Create",
        value: nextUniqueName(
          `${current.name}_publisher`,
          (config.publishers || []).map((publisher) => publisher.name),
        ),
        placeholder: "route_publisher",
      });
      if (!publisherName) return;
      if ((config.publishers || []).some((publisher) => publisher.name === publisherName)) {
        await mqbDialogs.alert("Publisher already exists");
        return;
      }

      config.publishers ||= [];
      config.publishers.push({
        name: publisherName,
        endpoint: cloneJson(current.output),
        comment: "",
      });
      mqbRuntime.refreshDirtySection("publishers");
      openPublisherAt(config.publishers.length - 1, "definition");
      return;
    }

    const refTarget = await mqbDialogs.prompt(
      "Choose the ref input name for the new route.",
      "Copy Route Output as Ref",
      {
        confirmLabel: "Next",
        value: current.name,
        placeholder: "route_ref",
      },
    );
    if (!refTarget) return;

    const routeNameInput = await mqbDialogs.prompt("Choose a name for the new route.", "Copy Route Output as Ref", {
      confirmLabel: "Create",
      value: nextUniqueName(`${current.name}_ref_route`, Object.keys(config.routes || {})),
      placeholder: "ref_route",
    });
    const routeName = normalizeRouteName(routeNameInput || "");
    if (!routeName) return;
    if (config.routes[routeName]) {
      await mqbDialogs.alert("Route already exists");
      return;
    }

    config.routes[routeName] = {
      enabled: true,
      input: createRefInputEndpoint(refTarget),
      output: cloneJson(current.output),
    };
    mqbRuntime.refreshDirtySection("routes");
    openRouteAt(routeName);
  };

  const updateUI = async () => {
    if (routesArray.length === 0) return;

    const idx = currentIdx;
    const routeName = routesArray[idx]?.name;
    if (!routeName) return;

    configFormContainer.innerHTML = "";
    const routeSchema = cloneJson({
      ...(schema.properties?.routes?.additionalProperties || {}),
      $defs: schema.$defs,
    }) as Record<string, any>;
    routeSchema.properties ||= {};
    if (!routeSchema.properties.name) {
      routeSchema.properties.name = {
        type: "string",
        title: "Name",
        minLength: 1,
      };
    }
    if (!Array.isArray(routeSchema.required)) {
      routeSchema.required = [];
    }
    if (!routeSchema.required.includes("name")) {
      routeSchema.required = ["name", ...routeSchema.required];
    }
    applyEndpointSchemaDefaults(routeSchema);
    syncRouteToggleButton();
    getMqbState().form_mode = "route";

    try {
      await lib.init(
        configFormContainer,
        routeSchema,
        { name: routeName, ...config.routes[routeName] },
        (updated: Record<string, unknown>) => {
          const oldName = routeName;
          const { nextName, routeData } = splitRouteFormData(oldName, updated);
          const newName = normalizeRouteName(nextName);

          if (newName !== oldName) {
            if (!newName.trim()) {
              void mqbDialogs.alert("Route name cannot be empty");
              return;
            }
            if (config.routes[newName]) {
              void mqbDialogs.alert("Route already exists");
              return;
            }
            delete config.routes[oldName];
            config.routes[newName] = routeData as RouteDefinition;
            mqbRuntime.refreshDirtySection("routes");
            void initRoutes(config, schema);
            const newIdx = Object.keys(config.routes).indexOf(newName);
            if (newIdx !== -1) {
              setActiveItem(newIdx);
            }
            return;
          }

          config.routes[oldName] = routeData as RouteDefinition;
          routesArray[idx] = { name: oldName, ...(routeData as RouteDefinition) };
          renderSidebar();
          renderRuntimeMetrics();
          setActiveItem(idx);
          syncRouteToggleButton();
          mqbRuntime.refreshDirtySection("routes");
        },
      );
    } finally {
      getMqbState().form_mode = null;
    }

    watchRouteValidationNoise(configFormContainer);
  };

  const restoreRouteState = async (idx: number) => {
    if (routesArray.length === 0) {
      addRouteAction = handleAddRoute;
      return;
    }

    routeEmptyAlert.style.display = "none";
    routeMainUi.style.display = "flex";
    setActiveItem(idx);
    await updateUI();
  };

  const handleAddRoute = async () => {
    const nameInput = await mqbDialogs.prompt("Choose a name for the new route.", "Add Route", {
      placeholder: "my_route",
    });
    const name = normalizeRouteName(nameInput || "");
    if (!name) return;
    if (config.routes[name]) {
      await mqbDialogs.alert("Route already exists");
      return;
    }

    config.routes[name] = createDefaultRoute();
    await initRoutes(config, schema);
    const newIdx = Object.keys(config.routes).indexOf(name);
    if (newIdx !== -1) {
      await restoreRouteStateFromView(newIdx);
    }
  };
  addRouteAction = handleAddRoute;
  copyCurrentRouteAction = copyCurrentRoute;
  cloneCurrentRouteAction = async () => {
    const currentRoute = getCurrentRouteEntry();
    if (!currentRoute) return;

    const currentName = currentRoute.name;
    const newName = `${currentName}_copy`;
    if (config.routes[newName]) {
      void mqbDialogs.alert("Cloned route name already exists. Please choose a different name.");
      return;
    }

    config.routes[newName] = cloneJson(config.routes[currentName]);
    await initRoutes(config, schema);
    const keys = Object.keys(config.routes);
    const newIndex = keys.indexOf(newName);
    if (newIndex !== -1) {
      await restoreRouteStateFromView(newIndex);
    }
  };
  deleteCurrentRouteAction = async (button = document.getElementById("route-save")) => {
    if (!(await mqbDialogs.confirm("Delete this route?", "Delete Route"))) {
      return;
    }

    const currentRoute = getCurrentRouteEntry();
    if (!currentRoute) return;

    const removedRoute = cloneJson(config.routes[currentRoute.name]);
    delete config.routes[currentRoute.name];
    const nextIdx = Math.max(0, currentIdx - 1);
    const saved = await mqbRuntime.saveConfigSection("routes", config.routes, false, button);
    if (!saved) {
      config.routes[currentRoute.name] = removedRoute;
      syncRoutesArrayFromConfig(config.routes);
      renderSidebar();
      renderRuntimeMetrics();
      return;
    }

    const refreshedConfig = await mqbRuntime.fetchConfigFromServer<RouteAppConfig>();
    mqbApp.config<RouteAppConfig>().routes = refreshedConfig.routes;
    config.routes = refreshedConfig.routes;
    syncRoutesArrayFromConfig(refreshedConfig.routes);
    mqbRuntime.markSectionSaved("routes", refreshedConfig.routes);
    await appWindow().pollRuntimeStatus();
    renderSidebar();
    renderRuntimeMetrics();

    if (Object.keys(mqbApp.config<RouteAppConfig>().routes || {}).length > 0) {
      setActiveItem(nextIdx);
      await updateUI();
    } else {
      showRouteEmptyState(true);
    }

    settleRouteSavedState();
  };
  toggleCurrentRouteAction = async (button = null) => {
    const currentRouteEntry = getCurrentRouteEntry();
    if (!currentRouteEntry) return;

    const routeName = currentRouteEntry.name;
    const currentRoute = config.routes[routeName];
    if (!currentRoute) return;

    const previousEnabled = isRouteEnabled(currentRoute);
    currentRoute.enabled = !previousEnabled;
    routesArray[currentIdx] = { name: routeName, ...currentRoute };
    renderSidebar();
    renderRuntimeMetrics();
    setActiveItem(currentIdx);
    syncRouteToggleButton();

    const saved = await mqbRuntime.saveConfigSection("routes", config.routes, false, button);

    if (!saved) {
      currentRoute.enabled = previousEnabled;
      routesArray[currentIdx] = { name: routeName, ...currentRoute };
      renderSidebar();
      renderRuntimeMetrics();
      setActiveItem(currentIdx);
      syncRouteToggleButton();
      return;
    }

    const refreshedConfig = await mqbRuntime.fetchConfigFromServer<RouteAppConfig>();
    mqbApp.config<RouteAppConfig>().routes = refreshedConfig.routes;
    await appWindow().pollRuntimeStatus();
    void initRoutes(mqbApp.config<RouteAppConfig>(), mqbApp.schema<RouteSchemaRoot>());
    const refreshedIdx = Object.keys(mqbApp.config<RouteAppConfig>().routes || {}).indexOf(routeName);
    if (refreshedIdx !== -1) {
      void restoreRouteStateFromView(refreshedIdx);
    }
  };
  saveCurrentRouteAction = async (button = null) => {
    const currentRoute = getCurrentRouteEntry();
    const selectedName = currentRoute?.name || null;
    const saved = await mqbRuntime.saveConfigSection("routes", config.routes, false, button);
    if (!saved) return;

    const refreshedConfig = await mqbRuntime.fetchConfigFromServer<RouteAppConfig>();
    mqbApp.config<RouteAppConfig>().routes = refreshedConfig.routes;
    config.routes = refreshedConfig.routes;
    syncRoutesArrayFromConfig(refreshedConfig.routes);
    mqbRuntime.markSectionSaved("routes", refreshedConfig.routes);
    await appWindow().pollRuntimeStatus();

    const refreshedIdx = selectedName
      ? Object.keys(mqbApp.config<RouteAppConfig>().routes || {}).indexOf(selectedName)
      : 0;

    if (refreshedIdx !== -1) {
      renderSidebar();
      renderRuntimeMetrics();
      setActiveItem(refreshedIdx);
      await updateUI();
      settleRouteSavedState();
    }
  };
  renameCurrentRouteAction = async (rawNextName: string) => {
    const currentRoute = getCurrentRouteEntry();
    if (!currentRoute) return;
    const nextName = normalizeRouteName(rawNextName || "");
    if (!nextName || nextName === currentRoute.name) {
      syncRoutesPanelState();
      return;
    }
    if (config.routes[nextName]) {
      await mqbDialogs.alert("Route already exists");
      syncRoutesPanelState();
      return;
    }
    const routeData = cloneJson(config.routes[currentRoute.name]);
    delete config.routes[currentRoute.name];
    config.routes[nextName] = routeData;
    syncRoutesArrayFromConfig(config.routes);
    currentIdx = Object.keys(config.routes).indexOf(nextName);
    mqbRuntime.refreshDirtySection("routes");
    renderSidebar();
    await updateUI();
  };

  renderSidebar();
  renderRuntimeMetrics();
  appWindow().renderRoutesRuntimeMetrics = renderRuntimeMetrics;
  getMqbState().routes_initialized = true;
  appWindow().restoreRouteState = restoreRouteState;
  restoreRouteStateFromView = restoreRouteState;

  if (routesArray.length > 0) {
    setActiveItem(0);
    await updateUI();
  } else {
    showRouteEmptyState(true);
  }
}
