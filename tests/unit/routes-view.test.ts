// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { get } from "svelte/store";
import { initRoutes, restoreRouteStateFromView, toggleCurrentRouteAction } from "../../ui/src/lib/routes-view";
import { routesPanelState } from "../../ui/src/lib/stores";

function createHyperscriptNode(tag: string, props?: Record<string, unknown>, ...children: unknown[]) {
  const element = document.createElement(tag);
  Object.entries(props || {}).forEach(([key, value]) => {
    if (key === "className") {
      element.className = String(value);
      return;
    }

    element.setAttribute(key, String(value));
  });

  children.flat().forEach((child) => {
    if (child instanceof Node) {
      element.appendChild(child);
    } else if (child !== null && child !== undefined) {
      element.appendChild(document.createTextNode(String(child)));
    }
  });

  return element;
}

function mountRoutesDom() {
  document.body.innerHTML = `
    <div id="routes-container">
      <input id="route-filter" />
      <button id="route-add"></button>
      <div id="route-list"></div>
      <div id="route-empty-alert"></div>
      <div id="route-main-ui"></div>
      <div id="route-config-form"></div>
      <button id="route-copy"></button>
      <button id="route-clone"></button>
      <button id="route-save"></button>
      <button id="route-toggle"></button>
      <button id="route-delete"></button>
    </div>
  `;
}

function installRouteWindowStubs() {
  window.VanillaSchemaForms = {
    h: createHyperscriptNode,
    init: vi.fn().mockResolvedValue(undefined),
  };
  window.registerDirtySection = vi.fn();
  window.refreshDirtySection = vi.fn().mockReturnValue(false);
  window.markSectionSaved = vi.fn();
  window.syncSaveButtonLabel = vi.fn();
  window.pollRuntimeStatus = vi.fn().mockResolvedValue(undefined);
  window.fetchConfigFromServer = vi.fn().mockResolvedValue({ routes: {} });
  window.saveConfigSection = vi.fn().mockResolvedValue({});
  window.mqbAlert = vi.fn().mockResolvedValue(undefined);
  window.mqbConfirm = vi.fn().mockResolvedValue(true);
  window.mqbPrompt = vi.fn().mockResolvedValue(null);
  window.mqbChoose = vi.fn().mockResolvedValue(null);
  window.switchMain = vi.fn();
  window._mqb_runtime_status = {
    active_consumers: [],
    active_routes: [],
    route_throughput: { alpha: 42.34 },
  };
  window.appConfig = { routes: {} };
  window.appSchema = {};
}

describe("initRoutes", () => {
  beforeEach(() => {
    mountRoutesDom();
    installRouteWindowStubs();
  });

  test("renders route names and runtime throughput badges", async () => {
    const config = {
      routes: {
        alpha: {
          enabled: true,
          input: { middlewares: [{ metrics: {} }], http: {} },
          output: { middlewares: [{ metrics: {} }], kafka: {} },
        },
      },
    };
    const schema = {
      properties: {
        routes: {
          additionalProperties: {
            properties: {
              name: { type: "string" },
              input: { type: "object" },
              output: { type: "object" },
            },
          },
        },
      },
    };

    await initRoutes(config, schema);

    const state = get(routesPanelState);
    expect(state.items[0]?.name).toBe("alpha");
    expect(state.items[0]?.throughputLabel).toBe("42.3 msg/s");
    expect(state.hasRoutes).toBe(true);
    expect(state.toggleLabel).toBe("Disable");
    expect(window.renderRoutesRuntimeMetrics).toBeTypeOf("function");
  });

  test("shows empty state when there are no routes", async () => {
    await initRoutes(
      { routes: {} },
      {
        properties: {
          routes: {
            additionalProperties: {},
          },
        },
      },
    );

    const state = get(routesPanelState);
    expect(state.hasRoutes).toBe(false);
    expect(state.toggleVisible).toBe(false);
  });

  test("updates toggle state through exported route action", async () => {
    window.saveConfigSection = vi.fn().mockResolvedValue(true);
    window.fetchConfigFromServer = vi.fn().mockResolvedValue({
      routes: {
        alpha: {
          enabled: false,
          input: { middlewares: [{ metrics: {} }], http: {} },
          output: { middlewares: [{ metrics: {} }], kafka: {} },
        },
      },
    });

    const config = {
      routes: {
        alpha: {
          enabled: true,
          input: { middlewares: [{ metrics: {} }], http: {} },
          output: { middlewares: [{ metrics: {} }], kafka: {} },
        },
      },
    };

    await initRoutes(config, {
      properties: {
        routes: {
          additionalProperties: {
            properties: {
              name: { type: "string" },
              input: { type: "object" },
              output: { type: "object" },
            },
          },
        },
      },
    });

    await toggleCurrentRouteAction(document.getElementById("route-toggle"));

    expect(window.saveConfigSection).toHaveBeenCalled();
  });

  test("restoring a route updates the remembered index and hash", async () => {
    await initRoutes(
      {
        routes: {
          alpha: {
            enabled: true,
            input: { middlewares: [{ metrics: {} }], http: {} },
            output: { middlewares: [{ metrics: {} }], kafka: {} },
          },
          beta: {
            enabled: true,
            input: { middlewares: [{ metrics: {} }], memory: {} },
            output: { middlewares: [{ metrics: {} }], mqtt: {} },
          },
        },
      },
      {
        properties: {
          routes: {
            additionalProperties: {
              properties: {
                name: { type: "string" },
                input: { type: "object" },
                output: { type: "object" },
              },
            },
          },
        },
      },
    );

    await restoreRouteStateFromView(1);

    expect(get(routesPanelState).selectedIndex).toBe(1);
    expect(window.location.hash).toBe("#routes:1");
    expect((window as any)._mqb_last_route_idx).toBe(1);
  });

  test("injects an editable route name field when schema additionalProperties omit it", async () => {
    await initRoutes(
      {
        routes: {
          alpha: {
            enabled: true,
            input: { middlewares: [{ metrics: {} }], http: {} },
            output: { middlewares: [{ metrics: {} }], kafka: {} },
          },
        },
      },
      {
        properties: {
          routes: {
            additionalProperties: {
              properties: {
                input: { type: "object" },
                output: { type: "object" },
              },
            },
          },
        },
      },
    );

    expect(window.VanillaSchemaForms.init).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        properties: expect.objectContaining({
          name: expect.objectContaining({ type: "string", title: "Name" }),
        }),
        required: expect.arrayContaining(["name"]),
      }),
      expect.anything(),
      expect.any(Function),
    );
  });
});
