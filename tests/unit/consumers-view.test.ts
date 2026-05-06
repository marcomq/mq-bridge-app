// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { get } from "svelte/store";
import {
  addConsumerResponseHeader,
  copyCurrentConsumerAction,
  importAsyncApiToConsumerAction,
  importMqbToConsumerAction,
  initConsumers,
  normalizeConsumerNames,
  normalizeConsumerMessage,
  restoreConsumerStateFromView,
  removeConsumerResponseHeader,
  sanitizeConsumerName,
  saveCurrentConsumerAction,
  selectConsumerSubtab,
  setConsumerMessageCaptureEnabledAction,
  setConsumerMessageCaptureKeepLastAction,
  setConsumerOutputModeAction,
  setConsumerOutputPublisherAction,
  toggleConsumerResponseHeader,
  toggleActiveConsumer,
  updateConsumerResponseHeader,
  updateConsumerResponsePayload,
} from "../../ui/src/lib/consumers-view";
import { consumersPanelState } from "../../ui/src/lib/stores";

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

function mountConsumersDom() {
  document.body.innerHTML = `
    <div id="consumers-container">
      <input id="cons-filter" />
      <button id="cons-add"></button>
      <button id="cons-copy"></button>
      <button id="cons-clone"></button>
      <button id="cons-save"></button>
      <button id="cons-delete"></button>
      <div id="cons-list"></div>
      <div id="cons-empty-alert"></div>
      <div id="cons-main-ui"></div>
      <div id="cons-sub-tabs">
        <button class="content-tab" id="ctab-def" data-target="cons-def-panel"></button>
        <button class="content-tab" id="cons-response-tab" data-target="cons-response-panel"></button>
        <button class="content-tab" id="ctab-msg" data-target="cons-msg-panel"></button>
      </div>
      <div id="cons-def-panel"></div>
      <div id="cons-response-panel"></div>
      <div id="cons-msg-panel"></div>
      <div id="cons-config-form"></div>
      <div id="cons-response-editor"></div>
      <div id="cons-live-title"></div>
      <table><tbody id="consumer-log-body"></tbody></table>
      <button id="cons-clear-history"></button>
      <button id="cons-toggle"></button>
      <div id="cons-list-pane"></div>
      <div id="cons-detail-pane"></div>
      <div id="cons-msg-detail-info"></div>
      <div id="cons-msg-details-content"></div>
      <button id="cons-msg-copy-btn"></button>
    </div>
  `;
}

function installConsumerWindowStubs() {
  window.VanillaSchemaForms = {
    h: createHyperscriptNode,
    init: vi.fn().mockResolvedValue(undefined),
  };
  window.registerDirtySection = vi.fn();
  window.refreshDirtySection = vi.fn().mockReturnValue(false);
  window.markSectionSaved = vi.fn();
  window.saveConfigSection = vi.fn().mockResolvedValue({});
  window.fetchConfigFromServer = vi.fn().mockResolvedValue({ consumers: [] });
  window.mqbAlert = vi.fn().mockResolvedValue(undefined);
  window.mqbConfirm = vi.fn().mockResolvedValue(true);
  window.mqbPrompt = vi.fn().mockResolvedValue(null);
  window.mqbChoose = vi.fn().mockResolvedValue(null);
  window.switchMain = vi.fn();
  window.pollRuntimeStatus = vi.fn().mockImplementation(async () => {
    const current = (window._mqb_runtime_status || {
      active_consumers: [],
      active_routes: [],
      route_throughput: {},
      consumers: {},
    }) as any;
    window._mqb_runtime_status = current;
    return current;
  });
  window._mqb_active_tab = "consumers";
  window.location.hash = "#consumers:0";
  window._mqb_runtime_status = {
    active_consumers: [],
    active_routes: [],
    route_throughput: {},
    consumers: {},
  };
  window._mqb_saved_sections = {};
  window.appConfig = { consumers: [], routes: {} };
  window.appSchema = {};
  window.initRoutes = vi.fn();
  window.initPublishers = vi.fn();
  window.Split = undefined;
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    },
    configurable: true,
  });
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ running: false, status: { healthy: false } }),
  }) as any;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("initConsumers", () => {
  beforeEach(() => {
    delete (window as any).__mqb_state;
    mountConsumersDom();
    installConsumerWindowStubs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("renders consumer names and waiting log state", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
        },
      ],
      routes: {},
      publishers: [],
    };
    const schema = {
      properties: {
        consumers: {
          items: {
            properties: {
              response: {},
            },
          },
        },
      },
      $defs: {
        HttpConfig: {
          properties: {
            custom_headers: {},
          },
        },
      },
    };

    await initConsumers(config, schema);

    const state = get(consumersPanelState);
    expect(state.items[0]?.name).toBe("orders_http");
    expect(state.hasConsumers).toBe(true);
    expect(state.messages).toEqual([]);
  });

  test("shows empty state when there are no consumers", async () => {
    await initConsumers(
      {
        consumers: [],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {},
          },
        },
      },
    );

    const state = get(consumersPanelState);
    expect(state.hasConsumers).toBe(false);
    expect(state.items).toEqual([]);
  });

  test("tracks response editor state for response-capable consumers", async () => {
    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: { headers: { "content-type": "application/json" }, payload: "{\"ok\":true}" },
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    selectConsumerSubtab("response");

    expect(get(consumersPanelState).responseEnabled).toBe(true);
    expect(get(consumersPanelState).activeSubtab).toBe("response");
    expect(get(consumersPanelState).responseHeaders).toEqual([
      { id: expect.any(Number), key: "content-type", value: "application/json", enabled: true },
    ]);
    expect(get(consumersPanelState).responsePayload).toBe("{\"ok\":true}");
  });

  test("switches consumer output modes and persists publisher selection", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
          output: { mode: "none" },
        },
      ],
      routes: {},
      publishers: [{ name: "orders_pub", endpoint: { http: { url: "https://example.com" } } }],
    };

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                output: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    setConsumerOutputModeAction("publisher");
    expect(get(consumersPanelState).outputMode).toBe("publisher");
    expect(get(consumersPanelState).selectedPublisher).toBe("orders_pub");
    expect(config.consumers[0].output).toEqual({ mode: "publisher", publisher: "orders_pub" });

    setConsumerOutputModeAction("none");
    expect(get(consumersPanelState).outputMode).toBe("none");
    expect(config.consumers[0].output).toEqual({ mode: "none" });
  });

  test("keeps publisher mode visible until a publisher is selected", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
          output: { mode: "none" },
        },
      ],
      routes: {},
      publishers: [
        { name: "orders_pub", endpoint: { memory: { topic: "orders" } } },
        { name: "audit_pub", endpoint: { memory: { topic: "audit" } } },
      ],
    };

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                output: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    setConsumerOutputModeAction("publisher");

    expect(get(consumersPanelState).outputMode).toBe("publisher");
    expect(get(consumersPanelState).publisherOptions).toEqual(["orders_pub", "audit_pub"]);
    expect(get(consumersPanelState).selectedPublisher).toBe("");
    expect(config.consumers[0].output).toEqual({ mode: "publisher", publisher: "" });
  });

  test("reads publisher options from the live app config when local consumer config is stale", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
          output: { mode: "none" },
        },
      ],
      routes: {},
      publishers: [],
    };
    window.appConfig = {
      consumers: config.consumers,
      routes: {},
      publishers: [{ name: "orders_pub", endpoint: { memory: { topic: "orders" } } }],
    } as any;

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                output: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    setConsumerOutputModeAction("publisher");

    expect(get(consumersPanelState).publisherOptions).toEqual(["orders_pub"]);
    expect(get(consumersPanelState).selectedPublisher).toBe("orders_pub");
    expect(config.consumers[0].output).toEqual({ mode: "publisher", publisher: "orders_pub" });
  });

  test("keeps consumer output unchanged when publisher mode is selected without publishers", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
          output: { mode: "none" },
        },
      ],
      routes: {},
      publishers: [],
    };

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                output: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    setConsumerOutputModeAction("publisher");

    expect(window.mqbAlert).toHaveBeenCalledWith("Create or select a publisher first.");
    expect(get(consumersPanelState).outputMode).toBe("none");
    expect(config.consumers[0].output).toEqual({ mode: "none" });
  });

  test("saves consumer output configuration instead of dropping it", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
          output: { mode: "none" },
        },
      ],
      routes: {},
      publishers: [
        { name: "orders_pub", endpoint: { memory: { topic: "orders" } } },
        { name: "audit_pub", endpoint: { memory: { topic: "audit" } } },
      ],
    };
    (window.saveConfigSection as any).mockImplementation(async (_section: string, consumers: any[]) => ({ consumers }));

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                output: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    setConsumerOutputModeAction("publisher");
    setConsumerOutputPublisherAction("audit_pub");
    await saveCurrentConsumerAction();

    const savedConsumers = (window.saveConfigSection as any).mock.calls.at(-1)?.[1];
    expect(savedConsumers[0].output).toEqual({ mode: "publisher", publisher: "audit_pub" });
    expect(savedConsumers[0].response).toBeNull();
  });

  test("persists message capture settings and trims the stored buffer", async () => {
    (window.localStorage.getItem as any).mockReturnValue(JSON.stringify({
      orders_http: Array.from({ length: 20 }, (_, index) => ({ payload: `message-${index}` })),
    }));
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
          output: { mode: "none" },
        },
      ],
      routes: {},
      publishers: [],
    };
    (window.saveConfigSection as any).mockImplementation(async (_section: string, consumers: any[]) => ({ consumers }));

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                output: {},
                message_capture: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    setConsumerMessageCaptureEnabledAction(false);
    setConsumerMessageCaptureKeepLastAction(10);
    await saveCurrentConsumerAction();

    const savedConsumers = (window.saveConfigSection as any).mock.calls.at(-1)?.[1];
    expect(savedConsumers[0].message_capture).toEqual({ enabled: false, keep_last: 10 });
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      "mqb_consumer_messages",
      expect.stringContaining("message-9"),
    );
    const persistedPayload = (window.localStorage.setItem as any).mock.calls.at(-1)?.[1] as string;
    expect(JSON.parse(persistedPayload).orders_http).toHaveLength(10);
  });

  test("skips message fetches when capture is disabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ orders_http: [{ payload: "ignored" }] }),
    });
    globalThis.fetch = fetchMock as any;
    window._mqb_runtime_status = {
      active_consumers: ["orders_http"],
      active_routes: [],
      route_throughput: {},
      consumers: {
        orders_http: {
          running: true,
          status: { healthy: true },
          message_sequence: 3,
          capture_enabled: false,
          capture_keep_last: 10,
        },
      },
    };

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
            message_capture: { enabled: false, keep_last: 10 },
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
                message_capture: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    await Promise.resolve();
    await Promise.resolve();

    expect(fetchMock).not.toHaveBeenCalledWith("/messages?consumer=orders_http");
    expect(get(consumersPanelState).messageCaptureEnabled).toBe(false);
    expect(get(consumersPanelState).messageCaptureKeepLast).toBe(10);
  });

  test("polling refreshes consumer status and reschedules message polling", async () => {
    const scheduled: Array<() => void | Promise<void>> = [];
    const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler) => {
      if (typeof handler === "function") {
        scheduled.push(handler as () => void);
      }
      return 1 as any;
    }) as any);
    window._mqb_runtime_status = {
      active_consumers: ["orders_http"],
      active_routes: [],
      route_throughput: {},
      consumers: {
        orders_http: {
          running: true,
          status: { healthy: true },
          message_sequence: 1,
        },
      },
    };

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/messages")) {
        return {
          ok: true,
          json: async () => ({
            orders_http: [{ ok: true, source: "memory" }],
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as any;
    }) as any;

    try {
      await initConsumers(
        {
          consumers: [
            {
              name: "orders_http",
              endpoint: { middlewares: [{ metrics: {} }], http: {} },
              response: null,
            },
          ],
          routes: {},
          publishers: [],
        },
        {
          properties: {
            consumers: {
              items: {
                properties: {
                  response: {},
                },
              },
            },
          },
          $defs: {
            HttpConfig: {
              properties: {
                custom_headers: {},
              },
            },
          },
        },
      );
      window.renderConsumersRuntimeStatus?.();

      expect(scheduled.length).toBeGreaterThan(0);
      for (let i = 0; i < 10 && scheduled.length > 0; i += 1) {
        const callback = scheduled.shift();
        if (callback) {
          await callback();
        }
      }
      await Promise.resolve();
      await Promise.resolve();

      expect(get(consumersPanelState).items[0]?.statusClass).toBe("status-ok");
      expect(globalThis.fetch).not.toHaveBeenCalledWith("/consumer-status?consumer=orders_http");
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  test("normalizes raw backend message payloads into displayable consumer messages", () => {
    expect(normalizeConsumerMessage({ ok: true, source: "memory" }, "2026-04-30T12:00:00.000Z")).toEqual({
      payload: { ok: true, source: "memory" },
      time: "2026-04-30T12:00:00.000Z",
    });
  });

  test("copy consumer creates a publisher", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: { url: "127.0.0.1:8080" } },
          response: null,
        },
      ],
      routes: {},
      publishers: [],
    };
    window.mqbPrompt = vi.fn().mockResolvedValue("orders_publisher");

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    await copyCurrentConsumerAction();
    expect(config.publishers).toEqual([
      expect.objectContaining({
        name: "orders_publisher",
        endpoint: expect.objectContaining({ http: expect.any(Object) }),
      }),
    ]);
  });

  test("restoring a consumer updates the remembered index and hash", async () => {
    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
          {
            name: "events_memory",
            endpoint: { middlewares: [{ metrics: {} }], memory: { topic: "events" } },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    await restoreConsumerStateFromView(1, { tab: "definition" });

    expect(get(consumersPanelState).selectedIndex).toBe(1);
    expect(window.location.hash).toBe("#consumers:1");
    expect((window as any)._mqb_last_consumer_idx).toBe(1);
    expect((window as any)._mqb_last_consumer_tab).toBe("definition");
  });

  test("save keeps the selected consumer and subtab", async () => {
    let resolveSave: ((value: any) => void) | null = null;
    window.saveConfigSection = vi.fn().mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
          {
            name: "events_memory",
            endpoint: { middlewares: [{ metrics: {} }], memory: { topic: "events" } },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    await restoreConsumerStateFromView(1, { tab: "definition" });
    const savePromise = saveCurrentConsumerAction();
    resolveSave?.({
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          output: { mode: "none" },
          response: null,
        },
        {
          name: "events_memory",
          endpoint: { middlewares: [{ metrics: {} }], memory: { topic: "events" } },
          output: { mode: "none" },
          response: null,
        },
      ],
    });
    await savePromise;
    await Promise.resolve();

    expect(get(consumersPanelState).selectedIndex).toBe(1);
    expect(get(consumersPanelState).activeSubtab).toBe("definition");
    expect((window as any)._mqb_last_consumer_idx).toBe(1);
    expect((window as any)._mqb_last_consumer_tab).toBe("definition");
  });

  test("throughput label is only shown while consumer is running", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/consumer-status")) {
        return {
          ok: true,
          json: async () => ({ running: false, status: { healthy: false } }),
        } as any;
      }
      if (url.startsWith("/messages")) {
        return {
          ok: true,
          json: async () => ({ orders_http: [] }),
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    const state = get(consumersPanelState);
    expect(state.items[0]?.throughputLabel).toBe("");
  });

  test("computes throughput from fetched message count", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-01T00:00:00Z"));

    const messageResponses = [
      { orders_http: [{ payload: "first" }] },
      {
        orders_http: Array.from({ length: 30 }, (_, index) => ({
          payload: `message-${index}`,
        })),
      },
    ];

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/messages")) {
        return {
          ok: true,
          json: async () => messageResponses.shift() ?? { orders_http: [] },
        } as any;
      }
      return { ok: true, json: async () => ({}) } as any;
    }) as any;

    window._mqb_runtime_status = {
      active_consumers: ["orders_http"],
      active_routes: [],
      route_throughput: {},
      consumers: {
        orders_http: {
          running: true,
          status: { healthy: true },
          message_sequence: 1,
        },
      },
    };

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    await Promise.resolve();
    window._mqb_runtime_status.consumers.orders_http.message_sequence = 2;
    vi.setSystemTime(new Date("2025-01-01T00:00:01Z"));
    await vi.advanceTimersByTimeAsync(1000);

    expect(parseFloat(get(consumersPanelState).items[0]?.throughputLabel || "0")).toBeGreaterThan(5);
  });

  test("keeps editable response header rows in local state and persists filtered headers", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          response: null,
        },
      ],
      routes: {},
      publishers: [],
    };

    await initConsumers(
      config,
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    addConsumerResponseHeader();
    expect(get(consumersPanelState).responseHeaders).toEqual([
      { id: expect.any(Number), key: "", value: "", enabled: true },
    ]);

    updateConsumerResponseHeader(0, "key", "x-test");
    updateConsumerResponseHeader(0, "value", "ready");
    updateConsumerResponsePayload("ready");

    expect(get(consumersPanelState).responseHeaders).toEqual([
      { id: expect.any(Number), key: "x-test", value: "ready", enabled: true },
    ]);
    expect(get(consumersPanelState).responsePayload).toBe("ready");
    expect(config.consumers[0].response).toEqual({ payload: "ready", headers: { "x-test": "ready" } });
    expect(config.consumers[0].output).toEqual({
      mode: "response",
      response: { payload: "ready", headers: { "x-test": "ready" } },
    });

    toggleConsumerResponseHeader(0, false);

    expect(get(consumersPanelState).responseHeaders).toEqual([
      { id: expect.any(Number), key: "x-test", value: "ready", enabled: false },
    ]);
    expect(config.consumers[0].response).toEqual({ payload: "ready", headers: {} });
    expect(config.consumers[0].output).toEqual({
      mode: "response",
      response: { payload: "ready", headers: {} },
    });

    removeConsumerResponseHeader(0);

    expect(get(consumersPanelState).responseHeaders).toEqual([]);
    expect(config.consumers[0].response).toEqual({ payload: "ready", headers: {} });
  });

  test("imports AsyncAPI requests as http consumers", async () => {
    const config = {
      consumers: [],
      routes: {},
      publishers: [],
    };
    (window.saveConfigSection as any).mockImplementation(async (_section: string, consumers: any[]) => ({ consumers }));

    await initConsumers(
      config,
      {
        properties: {
          consumers: { items: {} },
        },
        $defs: {
          HttpConfig: { properties: { custom_headers: {} } },
        },
      },
    );

    const asyncApi = JSON.stringify({
      asyncapi: "3.0.0",
      channels: {
        userSignedUp: { address: "/events/user/signed-up" },
      },
      operations: {
        onUserSignedUp: {
          action: "receive",
          channel: { $ref: "#/channels/userSignedUp" },
          messages: [],
          title: "User signup event",
        },
      },
      servers: {
        local: { host: "localhost:3000", protocol: "http" },
      },
    });

    await importAsyncApiToConsumerAction(asyncApi);

    expect(config.consumers.length).toBe(1);
    expect(config.consumers[0].name).toContain("user_signup_event");
    expect(config.consumers[0].endpoint.http.url).toBe("0.0.0.0:8080");
    expect(config.consumers[0].endpoint.http.path).toBe("/events/user/signed-up");
  });

  test("imports mq-bridge config consumers and keeps names unique", async () => {
    const config = {
      consumers: [
        {
          name: "orders_http",
          endpoint: { middlewares: [{ metrics: {} }], http: { url: "0.0.0.0:3000", path: "/orders" } },
          response: null,
        },
      ],
      routes: {},
      publishers: [],
    };
    (window.saveConfigSection as any).mockImplementation(async (_section: string, consumers: any[]) => ({ consumers }));

    await initConsumers(
      config,
      {
        properties: {
          consumers: { items: {} },
        },
        $defs: {
          HttpConfig: { properties: { custom_headers: {} } },
        },
      },
    );

    const mqbImport = JSON.stringify({
      type: "mqb-export",
      config: {
        consumers: [
          {
            name: "orders_http",
            endpoint: { http: { url: "0.0.0.0:4000", path: "/orders/new" } },
          },
        ],
      },
    });

    await importMqbToConsumerAction(mqbImport);

    expect(config.consumers.length).toBe(2);
    expect(config.consumers[1].name).toMatch(/^orders_http/);
    expect(config.consumers[1].name).not.toBe("orders_http");
    expect(config.consumers[1].endpoint.http.url).toBe("0.0.0.0:4000");
    expect(config.consumers[1].endpoint.http.path).toBe("/orders/new");
  });

  test("shows starting state while toggling the active consumer", async () => {
    const startRequest = createDeferred<{ ok: boolean }>();
    let statusCallCount = 0;
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.startsWith("/consumer-start")) {
        return startRequest.promise;
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ running: false, status: { healthy: false } }),
      });
    });
    globalThis.fetch = fetchMock as any;
    window._mqb_active_tab = "publishers";
    window.pollRuntimeStatus = vi.fn().mockImplementation(async () => {
      statusCallCount += 1;
      window._mqb_runtime_status = {
        active_consumers: ["orders_http"],
        active_routes: [],
        route_throughput: {},
        consumers: {
          orders_http: {
            running: statusCallCount > 0,
            status: { healthy: statusCallCount > 0 },
            message_sequence: 0,
          },
        },
      };
      return window._mqb_runtime_status;
    });

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    toggleActiveConsumer();

    expect(get(consumersPanelState).toggleBusy).toBe(true);
    expect(get(consumersPanelState).toggleLabel).toBe("Starting...");

    startRequest.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(get(consumersPanelState).toggleBusy).toBe(false);
    expect(get(consumersPanelState).toggleLabel).toBe("Stop");
  });

  test("saves unsaved consumers before attempting to start them", async () => {
    const startRequest = createDeferred<{ ok: boolean }>();
    const savedConsumers = [
      {
        name: "orders_http",
        endpoint: { middlewares: [{ metrics: {} }], http: {} },
        response: null,
      },
    ];

    window.saveConfigSection = vi.fn().mockResolvedValue({ consumers: savedConsumers });
    globalThis.fetch = vi.fn().mockImplementation((input: string) => {
      if (input.startsWith("/consumer-start")) {
        return startRequest.promise;
      }

      if (input.startsWith("/consumer-status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ running: true, status: { healthy: true } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ running: false, status: { healthy: false } }),
      });
    }) as any;
    window._mqb_saved_sections = { consumers: [] } as any;
    window._mqb_active_tab = "publishers";

    await initConsumers(
      {
        consumers: [...savedConsumers],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    toggleActiveConsumer();

    await Promise.resolve();
    await Promise.resolve();

    expect(window.saveConfigSection).toHaveBeenCalledWith(
      "consumers",
      expect.any(Array),
      false,
      document.getElementById("cons-save"),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith("/consumer-start?consumer=orders_http", { method: "POST" });

    startRequest.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
  });

  test("sanitizes unsafe consumer names before saving and starting", async () => {
    const startRequest = createDeferred<{ ok: boolean }>();
    const fetchMock = vi.fn().mockImplementation((input: string) => {
      if (input.startsWith("/consumer-start")) {
        return startRequest.promise;
      }

      if (input.startsWith("/consumer-status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ running: true, status: { healthy: true } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ running: false, status: { healthy: false } }),
      });
    });

    globalThis.fetch = fetchMock as any;
    window._mqb_active_tab = "publishers";
    window._mqb_saved_sections = { consumers: [] } as any;
    window.saveConfigSection = vi.fn().mockImplementation(async (_sectionName, sectionValue) => ({
      consumers: structuredClone(sectionValue),
    }));

    await initConsumers(
      {
        consumers: [
          {
            name: "Mémory Consumer 2",
            endpoint: { middlewares: [{ metrics: {} }], memory: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    toggleActiveConsumer();

    await Promise.resolve();
    await Promise.resolve();

    expect(window.saveConfigSection).toHaveBeenCalledWith(
      "consumers",
      [
        {
          name: "Memory_Consumer_2",
          endpoint: { middlewares: [{ metrics: {} }], memory: {} },
          message_capture: { enabled: true, keep_last: 100 },
          output: { mode: "none" },
          response: null,
        },
      ],
      false,
      document.getElementById("cons-save"),
    );
    expect(fetchMock).toHaveBeenCalledWith("/consumer-start?consumer=Memory_Consumer_2", { method: "POST" });

    startRequest.resolve({ ok: true });
    await Promise.resolve();
    await Promise.resolve();
  });

  test("saves through shared consumer action", async () => {
    window.saveConfigSection = vi.fn().mockResolvedValue({
      consumers: [{ name: "orders_http", endpoint: { middlewares: [{ metrics: {} }], http: {} }, response: null }],
    });
    window.fetchConfigFromServer = vi.fn();

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    await saveCurrentConsumerAction();

    expect(window.saveConfigSection).toHaveBeenCalledWith(
      "consumers",
      expect.any(Array),
      false,
      document.getElementById("cons-save"),
    );
    expect(window.fetchConfigFromServer).not.toHaveBeenCalled();
  });

  test("surfaces backend start errors in the UI", async () => {
    globalThis.fetch = vi.fn().mockImplementation((input: string) => {
      if (input.startsWith("/consumer-start")) {
        return Promise.resolve({
          ok: false,
          text: async () =>
            "Internal Server Error: route 'ui_collector_route_http' failed: Invalid listen address: http://localhost:1234/api/orders/updated. Reconnecting in 5 seconds...",
        });
      }

      if (input.startsWith("/consumer-status")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ running: false, status: { healthy: false } }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({ running: false, status: { healthy: false } }),
      });
    }) as any;
    window._mqb_active_tab = "publishers";

    await initConsumers(
      {
        consumers: [
          {
            name: "orders_http",
            endpoint: { middlewares: [{ metrics: {} }], http: { url: "0.0.0.0:1234" } },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    toggleActiveConsumer();
    await Promise.resolve();
    await Promise.resolve();

    expect(window.mqbAlert).toHaveBeenCalledWith(
      "Internal Server Error: route 'ui_collector_route_http' failed: Invalid listen address: http://localhost:1234/api/orders/updated. Reconnecting in 5 seconds...",
    );
    expect(get(consumersPanelState).liveStatusVariant).toBe("danger");
    expect(get(consumersPanelState).liveStatusText).toContain("Invalid listen address");
  });

  test("does not poll status for unsaved consumers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ running: false, status: { healthy: false } }),
    });
    globalThis.fetch = fetchMock as any;
    window._mqb_saved_sections = {
      consumers: [{
        name: "saved_http",
        endpoint: { middlewares: [{ metrics: {} }], http: {} },
        output: { mode: "none" },
        response: null,
      }],
    } as any;

    await initConsumers(
      {
        consumers: [
          {
            name: "saved_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
          {
            name: "memory_consumer 2",
            endpoint: { middlewares: [{ metrics: {} }], memory: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      },
      {
        properties: {
          consumers: {
            items: {
              properties: {
                response: {},
              },
            },
          },
        },
        $defs: {
          HttpConfig: {
            properties: {
              custom_headers: {},
            },
          },
        },
      },
    );

    expect(fetchMock).not.toHaveBeenCalledWith("/messages?consumer=memory_consumer%202");
  });

  test("freezes the initial saved baseline before later local edits", async () => {
    vi.useFakeTimers();
    try {
      window._mqb_active_tab = "publishers";
      window.location.hash = "#publishers";
      const config = {
        consumers: [
          {
            name: "saved_http",
            endpoint: { middlewares: [{ metrics: {} }], http: {} },
            response: null,
          },
        ],
        routes: {},
        publishers: [],
      };

      const initPromise = initConsumers(
        config,
        {
          properties: {
            consumers: {
              items: {
                properties: {
                  response: {},
                },
              },
            },
          },
          $defs: {
            HttpConfig: {
              properties: {
                custom_headers: {},
              },
            },
          },
        },
      );

      config.consumers.push({
        name: "memory_consumer 2",
        endpoint: { middlewares: [{ metrics: {} }], memory: {} },
        response: null,
      });

      await initPromise;
      await vi.runOnlyPendingTimersAsync();

      expect(window.markSectionSaved).toHaveBeenCalledWith("consumers", [
        {
          name: "saved_http",
          endpoint: { middlewares: [{ metrics: {} }], http: {} },
          message_capture: { enabled: true, keep_last: 100 },
          output: { mode: "none" },
          response: null,
        },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("consumer name normalization", () => {
  test("sanitizes whitespace and non-ascii characters", () => {
    expect(sanitizeConsumerName(" Mémory Consumer 2 ")).toBe("Memory_Consumer_2");
  });

  test("deduplicates normalized consumer names", () => {
    const consumers = [
      { name: "Mémory Consumer", endpoint: {}, response: null },
      { name: "Memory   Consumer", endpoint: {}, response: null },
    ];

    const result = normalizeConsumerNames(consumers as any, 1);

    expect(result.changed).toBe(true);
    expect(consumers.map((consumer) => consumer.name)).toEqual(["Memory_Consumer", "Memory_Consumer_1"]);
    expect(result.selectedName).toBe("Memory_Consumer_1");
  });
});
