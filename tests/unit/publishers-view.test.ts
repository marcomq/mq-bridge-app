// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { get } from "svelte/store";
import {
  addPublisherAction,
  applyPublisherPresetAction,
  addPublisherMetadataRow,
  beautifyPublisherPayloadAction,
  cloneCurrentPublisherAction,
  copyCurrentPublisherAction,
  createConsumerEndpointFromPublisherEndpoint,
  deletePublisherPresetAction,
  exportPublisherPresetsAction,
  importAsyncApiToPublisherAction,
  importMqbToPublisherAction,
  initPublishers,
  presetToPublisherAction,
  restorePublisherStateFromView,
  renamePublisherPresetAction,
  removePublisherMetadataRow,
  savePublisherPresetAction,
  saveCurrentPublisherAction,
  sendPublisherAction,
  showPublisherHistoryEntry,
  selectPublisherSubtab,
  togglePublisherMetadataRow,
  updatePublisherMetadataRow,
  updatePublisherPayload,
  updatePublisherRequestField,
} from "../../ui/src/lib/publishers-view";
import { publishersPanelState } from "../../ui/src/lib/stores";

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

function mountPublishersDom() {
  document.body.innerHTML = `
    <div id="tab-publishers" class="active">
      <div id="publishers-container">
        <input id="pub-filter" />
        <button id="pub-add"></button>
        <button id="pub-copy"></button>
        <button id="pub-clone"></button>
        <button id="pub-save"></button>
        <button id="pub-delete"></button>
        <button id="pub-send"></button>
        <button id="pub-beautify"></button>
        <button id="add-meta"></button>
        <div id="pub-list"></div>
        <div id="pub-empty-alert"></div>
        <div id="pub-main-ui"></div>
        <input id="pub-proto" />
        <div id="pub-method-wrap"></div>
        <select id="pub-method"></select>
        <div id="pub-extra-1-wrap"></div>
        <div id="pub-extra-2-wrap"></div>
        <div id="pub-url-wrap"></div>
        <span id="pub-extra-1-label"></span>
        <span id="pub-extra-2-label"></span>
        <span id="pub-url-label"></span>
        <input id="pub-extra-1" />
        <input id="pub-extra-2" />
        <input id="pub-url" />
        <div id="pub-sub-tabs">
          <button class="content-tab" id="ctab-payload" data-target="pub-payload-pane"></button>
          <button class="content-tab" id="ctab-config" data-target="pub-config-pane"></button>
          <button class="content-tab" data-target="pub-meta-pane"></button>
          <button class="content-tab" data-target="pub-history-pane"></button>
        </div>
        <div id="pub-top-content-wrapper">
          <div class="pane-top" id="pub-payload-pane"></div>
          <div class="pane-top" id="pub-meta-pane"></div>
          <div class="pane-top" id="pub-history-pane"></div>
          <div class="pane-top" id="pub-config-pane"></div>
        </div>
        <textarea id="pub-payload"></textarea>
        <table id="metadata-container"><tbody></tbody></table>
        <div id="pub-response-container"></div>
        <div id="pub-response-status"></div>
        <div id="pub-response"></div>
        <button id="pub-resp-copy"></button>
        <div id="pub-response-tab"></div>
        <div id="pub-config-form"></div>
      </div>
    </div>
  `;
}

function installPublisherWindowStubs() {
  const storage = new Map<string, string>([
    ["mqb_publisher_state", "{}"],
    ["mqb_publisher_history", "[]"],
  ]);
  window.VanillaSchemaForms = {
    h: createHyperscriptNode,
    init: vi.fn().mockResolvedValue(undefined),
  };
  window.registerDirtySection = vi.fn();
  window.refreshDirtySection = vi.fn().mockReturnValue(false);
  window.markSectionSaved = vi.fn();
  window.saveConfigSection = vi.fn().mockResolvedValue({});
  window.fetchConfigFromServer = vi.fn().mockResolvedValue({ publishers: [] });
  window.mqbAlert = vi.fn().mockResolvedValue(undefined);
  window.mqbConfirm = vi.fn().mockResolvedValue(true);
  window.mqbPrompt = vi.fn().mockResolvedValue(null);
  window.mqbChoose = vi.fn().mockResolvedValue(null);
  window.switchMain = vi.fn();
  window._mqb_saved_sections = {};
  let serverConfig: any = { publishers: [], routes: {}, consumers: [], presets: {}, env_vars: {} };
  window.appConfig = serverConfig;
  window.appSchema = {};
  window.initRoutes = vi.fn();
  window.initConsumers = vi.fn();
  window.Split = vi.fn().mockReturnValue({});
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn().mockImplementation((key: string) => storage.get(key) ?? null),
      setItem: vi.fn().mockImplementation((key: string, value: string) => {
        storage.set(key, value);
      }),
    },
    configurable: true,
  });
  globalThis.fetch = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    if (String(input) === "/config" && init?.method === "POST") {
      serverConfig = JSON.parse(String(init.body || "{}"));
      window.appConfig = serverConfig;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () => "",
        json: async () => serverConfig,
      };
    }

    if (String(input) === "/config") {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => serverConfig,
      };
    }

    return {
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => '{"status":"Ack"}',
      json: async () => ({ status: "Ack" }),
    };
  }) as any;
}

describe("initPublishers", () => {
  beforeEach(() => {
    mountPublishersDom();
    installPublisherWindowStubs();
  });

  test("renders publisher names and request bar state", () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    expect(get(publishersPanelState).items[0]?.name).toBe("orders_http");
    expect(get(publishersPanelState).selectedIndex).toBe(0);
    expect(get(publishersPanelState).endpointType).toBe("HTTP");
    expect(get(publishersPanelState).urlField.value).toBe("https://example.test/orders");
    expect(document.getElementById("pub-empty-alert")?.style.display).toBe("none");
  });

  test("shows empty state when there are no publishers", () => {
    initPublishers(
      { publishers: [], routes: {}, consumers: [] },
      { properties: { publishers: { items: {} } } },
    );

    expect(document.getElementById("pub-empty-alert")?.style.display).toBe("block");
    expect(document.getElementById("pub-main-ui")?.style.display).toBe("none");
  });

  test("creates new http publishers with usable local defaults", async () => {
    const config = { publishers: [], routes: {}, consumers: [] };
    window.mqbChoose = vi.fn().mockResolvedValue("http");

    initPublishers(config, { properties: { publishers: { items: {} } } });

    await addPublisherAction();

    expect(config.publishers).toHaveLength(1);
    expect(config.publishers[0]).toMatchObject({
      name: "http",
      endpoint: {
        http: {
          url: "http://localhost:8080",
          path: "/",
          method: "POST",
          custom_headers: {},
          fire_and_forget: false,
          compression_enabled: false,
        },
      },
      comment: "",
    });
    expect(get(publishersPanelState).endpointType).toBe("HTTP");
    expect(get(publishersPanelState).methodValue).toBe("POST");
    expect(get(publishersPanelState).urlField.value).toBe("http://localhost:8080");
  });

  test("creates new queue and topic publishers with request bar defaults", async () => {
    const config = { publishers: [], routes: {}, consumers: [] };
    window.mqbChoose = vi.fn().mockResolvedValueOnce("amqp").mockResolvedValueOnce("kafka");

    initPublishers(config, { properties: { publishers: { items: {} } } });

    await addPublisherAction();
    await addPublisherAction();

    expect(config.publishers[0]).toMatchObject({
      name: "amqp",
      endpoint: {
        amqp: {
          url: "amqp://guest:guest@localhost:5672/%2f",
          queue: "jobs",
        },
      },
    });
    expect(config.publishers[1]).toMatchObject({
      name: "kafka",
      endpoint: {
        kafka: {
          url: "localhost:9092",
          topic: "events",
        },
      },
    });
    expect(get(publishersPanelState).endpointType).toBe("KAFKA");
    expect(get(publishersPanelState).extraFieldOne.value).toBe("events");
    expect(get(publishersPanelState).urlField.value).toBe("localhost:9092");
  });

  test("falls back safely when persisted publisher localStorage is corrupted", () => {
    window.localStorage.setItem("mqb_publisher_state", "{broken-json");
    window.localStorage.setItem("mqb_publisher_history", "{broken-json");
    window.localStorage.setItem("mqb_publisher_presets", "{broken-json");
    window.localStorage.setItem("mqb_env_vars", "{broken-json");

    expect(() =>
      initPublishers(
        {
          publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
          routes: {},
          consumers: [],
        },
        {
          properties: { publishers: { items: {} } },
          $defs: { HttpConfig: { properties: { custom_headers: {} } } },
        },
      ),
    ).not.toThrow();

    expect(get(publishersPanelState).items[0]?.name).toBe("orders_http");
    expect(get(publishersPanelState).historyRows).toEqual([]);
    expect(get(publishersPanelState).presetRows).toEqual([]);
  });

  test("tracks active subtab and payload in publisher panel state", () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    selectPublisherSubtab("definition");
    updatePublisherPayload("{\"ok\":true}");

    expect(get(publishersPanelState).activeSubtab).toBe("definition");
    expect(get(publishersPanelState).requestPayload).toBe("{\"ok\":true}");
  });

  test("keeps definition tab and saves once after renaming an unsaved publisher", async () => {
    const config = {
      publishers: [
        { name: "http", endpoint: { http: { url: "http://localhost:8080", path: "/", method: "POST", custom_headers: {} } } },
      ],
      routes: {},
      consumers: [],
    };
    let formChange: ((updated: unknown) => void) | null = null;
    window.VanillaSchemaForms.init = vi.fn().mockImplementation((_container, _schema, _data, onChange) => {
      formChange = onChange;
      return Promise.resolve();
    });
    window.saveConfigSection = vi.fn().mockImplementation(async (_section: string, publishers: any[]) => ({ publishers }));

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );
    selectPublisherSubtab("definition");
    await Promise.resolve();

    formChange?.({
      name: "renamed_http",
      endpoint: { http: { url: "http://localhost:8080", path: "/", method: "POST", custom_headers: {} } },
      comment: "",
    });

    expect(config.publishers[0].name).toBe("renamed_http");
    expect(get(publishersPanelState).activeSubtab).toBe("definition");

    await saveCurrentPublisherAction(document.getElementById("pub-save"));

    expect(window.saveConfigSection).toHaveBeenCalledTimes(1);
    expect(window.saveConfigSection).toHaveBeenCalledWith(
      "publishers",
      [
        {
          name: "renamed_http",
          endpoint: { http: { url: "http://localhost:8080", path: "/", method: "POST", custom_headers: {} } },
          comment: "",
        },
      ],
      false,
      document.getElementById("pub-save"),
    );
    expect(window.fetchConfigFromServer).not.toHaveBeenCalled();
    expect(get(publishersPanelState).activeSubtab).toBe("definition");
    expect(get(publishersPanelState).items[0]?.name).toBe("renamed_http");
  });

  test("restoring a publisher updates the remembered index and hash", () => {
    initPublishers(
      {
        publishers: [
          { name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } },
          { name: "events_memory", endpoint: { memory: { topic: "events" } } },
        ],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    restorePublisherStateFromView(1, { tab: "definition" });

    expect(get(publishersPanelState).selectedIndex).toBe(1);
    expect(window.location.hash).toBe("#publishers:1");
    expect((window as any)._mqb_last_publisher_idx).toBe(1);
    expect((window as any)._mqb_last_publisher_tab).toBe("definition");
  });

  test("save keeps the selected publisher and subtab", async () => {
    let resolveSave: ((value: any) => void) | null = null;
    window.saveConfigSection = vi.fn().mockImplementation(
      async () =>
        await new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );

    initPublishers(
      {
        publishers: [
          { name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } },
          { name: "events_memory", endpoint: { memory: { topic: "events" } } },
        ],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    restorePublisherStateFromView(1, { tab: "definition" });
    const savePromise = saveCurrentPublisherAction(document.getElementById("pub-save"));
    await Promise.resolve();
    resolveSave?.({
      publishers: [
        { name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } },
        { name: "events_memory", endpoint: { memory: { topic: "events" } } },
      ],
    });
    await savePromise;
    await Promise.resolve();

    expect(get(publishersPanelState).selectedIndex).toBe(1);
    expect(get(publishersPanelState).activeSubtab).toBe("definition");
    expect((window as any)._mqb_last_publisher_idx).toBe(1);
    expect((window as any)._mqb_last_publisher_tab).toBe("definition");
  });

  test("edits actual custom headers and supports disable/delete", () => {
    const config = {
      publishers: [
        {
          name: "orders_http",
          endpoint: {
            http: {
              url: "https://example.test/orders",
              custom_headers: { authorization: "Bearer token" },
              fire_and_forget: false,
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    expect(get(publishersPanelState).metadataRows).toEqual([
      { id: expect.any(Number), key: "authorization", value: "Bearer token", enabled: true },
    ]);

    addPublisherMetadataRow();
    updatePublisherMetadataRow(1, "key", "x-trace-id");
    updatePublisherMetadataRow(1, "value", "abc-123");
    togglePublisherMetadataRow(1, false);

    expect(config.publishers[0].endpoint.http.custom_headers).toEqual({
      authorization: "Bearer token",
    });

    removePublisherMetadataRow(0);

    expect(get(publishersPanelState).metadataRows).toEqual([
      { id: expect.any(Number), key: "x-trace-id", value: "abc-123", enabled: false },
    ]);
    expect(config.publishers[0].endpoint.http.custom_headers).toEqual({});
  });

  test("keeps header row ids unique across re-init", () => {
    const config = {
      publishers: [
        {
          name: "orders_http",
          endpoint: {
            http: {
              url: "https://example.test/orders",
              custom_headers: {},
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    const schema = {
      properties: { publishers: { items: {} } },
      $defs: { HttpConfig: { properties: { custom_headers: {} } } },
    };

    initPublishers(config, schema);
    addPublisherMetadataRow();
    initPublishers(config, schema);
    addPublisherMetadataRow();

    expect(get(publishersPanelState).metadataRows.map((row) => row.id)).toEqual([1, 2]);
  });

  test("repairs duplicate persisted header row ids from local storage", () => {
    window.localStorage.setItem(
      "mqb_publisher_state",
      JSON.stringify({
        orders_http: {
          payload: "{}",
          headers: [
            { id: 1, key: "authorization", value: "Bearer token", enabled: true },
            { id: 1, key: "x-trace-id", value: "abc-123", enabled: true },
          ],
        },
      }),
    );

    initPublishers(
      {
        publishers: [
          {
            name: "orders_http",
            endpoint: {
              http: {
                url: "https://example.test/orders",
                custom_headers: { authorization: "Bearer token", "x-trace-id": "abc-123" },
              },
            },
          },
        ],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    expect(get(publishersPanelState).metadataRows.map((row) => row.id)).toEqual([1, 2]);
  });

  test("keeps http url+path edits from request bar in endpoint config", () => {
    const config = {
      publishers: [
        {
          name: "orders_http",
          endpoint: {
            http: {
              url: "https://example.test",
              path: "/orders/old",
              custom_headers: {},
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    expect(get(publishersPanelState).urlField.value).toBe("https://example.test/orders/old");

    updatePublisherRequestField("pub-url", "https://api.example.test/new/orders?mode=fast");

    expect(config.publishers[0].endpoint.http.url).toBe("https://api.example.test");
    expect(config.publishers[0].endpoint.http.path).toBe("/new/orders?mode=fast");
    expect(get(publishersPanelState).urlField.value).toBe("https://api.example.test/new/orders?mode=fast");
  });

  test("applies preset and switches back to payload tab", async () => {
    const config = {
      publishers: [
        {
          name: "orders_http",
          endpoint: {
            http: {
              url: "https://example.test/orders",
              custom_headers: {},
            },
          },
        },
      ],
      routes: {},
      consumers: [],
      presets: {
        orders_http: [
          {
            name: "preset_a",
            method: "PUT",
            url: "https://api.example.test/orders/42",
            payload: "{\"id\":42}",
            headers: [{ key: "x-test", value: "yes", enabled: true }],
          },
        ],
      },
      env_vars: {},
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    selectPublisherSubtab("presets");
    applyPublisherPresetAction(0);

    const state = get(publishersPanelState);
    expect(state.activeSubtab).toBe("payload");
    expect(state.methodValue).toBe("PUT");
    expect(state.urlField.value).toBe("https://api.example.test/orders/42");
    expect(state.requestPayload).toBe("{\"id\":42}");
    expect(config.publishers[0].endpoint.http.custom_headers).toEqual({ "x-test": "yes" });
  });

  test("restores http method and visible url field from history", async () => {
    window.localStorage.setItem(
      "mqb_publisher_history",
      JSON.stringify([
        {
          name: "orders_http",
          payload: "{\"id\":42}",
          metadata: [{ k: "x-test", v: "yes" }],
          requestMetadata: {
            http_method: "PUT",
            http_path: "/orders/42",
            "request_bar.url": "https://api.example.test/orders/42",
            "request_bar.pub-url": "https://api.example.test/orders/42",
          },
          targetLabel: "URL",
          url: "https://api.example.test/orders/42",
          ok: true,
          status: 200,
          statusText: "OK",
          duration: 12,
          time: 1,
        },
      ]),
    );
    const config = {
      publishers: [
        {
          name: "orders_http",
          endpoint: {
            http: {
              url: "https://example.test",
              path: "/old",
              method: "POST",
              custom_headers: {},
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    await showPublisherHistoryEntry(0);

    expect(get(publishersPanelState).methodValue).toBe("PUT");
    expect(get(publishersPanelState).urlField.value).toBe("https://api.example.test/orders/42");
    expect(config.publishers[0].endpoint.http.url).toBe("https://api.example.test");
    expect(config.publishers[0].endpoint.http.path).toBe("/orders/42");
    expect(config.publishers[0].endpoint.http.custom_headers).toEqual({ "x-test": "yes" });
  });

  test("restores all visible non-http request bar fields from history", async () => {
    window.localStorage.setItem(
      "mqb_publisher_history",
      JSON.stringify([
        {
          name: "events_kafka",
          payload: "event",
          metadata: [],
          requestMetadata: {
            "request_bar.topic": "orders.created",
            "request_bar.pub-extra-1": "orders.created",
            "request_bar.url": "kafka-a:9092,kafka-b:9092",
            "request_bar.pub-url": "kafka-a:9092,kafka-b:9092",
          },
          targetLabel: "BROKERS",
          url: "kafka-a:9092,kafka-b:9092",
          ok: true,
          status: 200,
          statusText: "OK",
          duration: 12,
          time: 1,
        },
      ]),
    );
    const config = {
      publishers: [
        {
          name: "events_kafka",
          endpoint: {
            kafka: {
              url: "localhost:9092",
              topic: "events",
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { KafkaConfig: { properties: {} } },
      },
    );

    await showPublisherHistoryEntry(0);

    expect(get(publishersPanelState).extraFieldOne.value).toBe("orders.created");
    expect(get(publishersPanelState).urlField.value).toBe("kafka-a:9092,kafka-b:9092");
    expect(config.publishers[0].endpoint.kafka.topic).toBe("orders.created");
    expect(config.publishers[0].endpoint.kafka.url).toBe("kafka-a:9092,kafka-b:9092");
  });

  test("records visible request bar fields in publisher history when sending", async () => {
    const config = {
      publishers: [
        {
          name: "events_kafka",
          endpoint: {
            kafka: {
              url: "localhost:9092",
              topic: "events",
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { KafkaConfig: { properties: {} } },
      },
    );

    updatePublisherRequestField("pub-extra-1", "orders.created");
    updatePublisherRequestField("pub-url", "kafka-a:9092,kafka-b:9092");
    updatePublisherPayload("event");
    await sendPublisherAction();

    const history = JSON.parse(window.localStorage.getItem("mqb_publisher_history") || "[]");
    expect(history[0].requestMetadata).toMatchObject({
      "request_bar.topic": "orders.created",
      "request_bar.pub-extra-1": "orders.created",
      "request_bar.url": "kafka-a:9092,kafka-b:9092",
      "request_bar.pub-url": "kafka-a:9092,kafka-b:9092",
    });
  });

  test("restores request bar fields from input-id fallback history metadata", async () => {
    window.localStorage.setItem(
      "mqb_publisher_history",
      JSON.stringify([
        {
          name: "jobs_amqp",
          payload: "job",
          metadata: [],
          requestMetadata: {
            "request_bar.pub-extra-1": "critical_jobs",
            "request_bar.pub-url": "amqp://guest:guest@mq.local:5672/%2f",
          },
          targetLabel: "URL",
          url: "amqp://guest:guest@mq.local:5672/%2f",
          ok: true,
          status: 200,
          statusText: "OK",
          duration: 12,
          time: 1,
        },
      ]),
    );
    const config = {
      publishers: [
        {
          name: "jobs_amqp",
          endpoint: {
            amqp: {
              url: "amqp://guest:guest@localhost:5672/%2f",
              queue: "jobs",
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { AmqpConfig: { properties: {} } },
      },
    );

    await showPublisherHistoryEntry(0);

    expect(get(publishersPanelState).extraFieldOne.value).toBe("critical_jobs");
    expect(get(publishersPanelState).urlField.value).toBe("amqp://guest:guest@mq.local:5672/%2f");
    expect(config.publishers[0].endpoint.amqp.queue).toBe("critical_jobs");
    expect(config.publishers[0].endpoint.amqp.url).toBe("amqp://guest:guest@mq.local:5672/%2f");
  });

  test("restores multi-field request bar publishers from history", async () => {
    window.localStorage.setItem(
      "mqb_publisher_history",
      JSON.stringify([
        {
          name: "messages_mongodb",
          payload: "{\"ok\":true}",
          metadata: [],
          requestMetadata: {
            "request_bar.database": "orders",
            "request_bar.collection": "outbox",
            "request_bar.url": "mongodb://mongo.local:27017",
          },
          targetLabel: "URL",
          url: "mongodb://mongo.local:27017",
          ok: true,
          status: 200,
          statusText: "OK",
          duration: 12,
          time: 1,
        },
      ]),
    );
    const config = {
      publishers: [
        {
          name: "messages_mongodb",
          endpoint: {
            mongodb: {
              url: "mongodb://localhost:27017",
              database: "app",
              collection: "messages",
            },
          },
        },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { MongoDbConfig: { properties: {} } },
      },
    );

    await showPublisherHistoryEntry(0);

    expect(get(publishersPanelState).extraFieldOne.value).toBe("orders");
    expect(get(publishersPanelState).extraFieldTwo.value).toBe("outbox");
    expect(get(publishersPanelState).urlField.value).toBe("mongodb://mongo.local:27017");
    expect(config.publishers[0].endpoint.mongodb).toMatchObject({
      database: "orders",
      collection: "outbox",
      url: "mongodb://mongo.local:27017",
    });
  });

  test("rejects non-mq-bridge import payloads", async () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    await expect(importMqbToPublisherAction(JSON.stringify({ type: "unknown" }))).rejects.toThrow(
      "Selected file is not a valid mq-bridge export/presets file.",
    );
  });

  test("imports mq-bridge presets into active publisher", async () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    await importMqbToPublisherAction(
      JSON.stringify({
        type: "mqb-presets",
        presets: {
          orders_http: [
            {
              name: "imported_preset",
              method: "POST",
              url: "https://example.test/orders",
              payload: "{\"source\":\"mqb\"}",
              headers: [{ key: "x-source", value: "mqb", enabled: true }],
            },
          ],
        },
      }),
    );

    expect(get(publishersPanelState).presetRows.map((row) => row.name)).toContain("imported_preset");
  });

  test("imports AsyncAPI requests as new publishers", async () => {
    const config = {
      publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
      routes: {},
      consumers: [],
    };
    const schema = {
      properties: { publishers: { items: {} } },
      $defs: { HttpConfig: { properties: { custom_headers: {} } } },
    };

    window.saveConfigSection = vi.fn().mockImplementation(async (_section: string, publishers: any[]) => ({ publishers }));
    window.fetchConfigFromServer = vi.fn().mockImplementation(async () => ({ publishers: config.publishers }));

    initPublishers(config, schema);

    await importAsyncApiToPublisherAction(
      JSON.stringify({
        asyncapi: "3.0.0",
        channels: {
          orderEvents: { address: "/events/orders" },
        },
        operations: {
          publishOrderEvents: {
            action: "send",
            channel: { $ref: "#/channels/orderEvents" },
            messages: [],
            title: "Order events",
          },
        },
        servers: { local: { host: "localhost:3000", protocol: "http" } },
      }),
    );

    expect(config.publishers.length).toBe(2);
    expect(config.publishers[1].name).toContain("order_events");
  });

  test("converts a preset into a persisted publisher", async () => {
    const config = {
      publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
      routes: {},
      consumers: [],
      presets: {
        orders_http: [
          {
            name: "new_http_target",
            method: "POST",
            url: "https://api.example.test/orders/new",
            payload: "{\"ok\":true}",
            headers: [{ key: "x-id", value: "42", enabled: true }],
          },
        ],
      },
      env_vars: {},
    };
    const schema = {
      properties: { publishers: { items: {} } },
      $defs: { HttpConfig: { properties: { custom_headers: {} } } },
    };

    window.saveConfigSection = vi.fn().mockImplementation(async (_section: string, publishers: any[]) => ({ publishers }));
    window.fetchConfigFromServer = vi.fn().mockImplementation(async () => ({ publishers: config.publishers }));

    initPublishers(config, schema);
    await presetToPublisherAction(0);

    expect(config.publishers.length).toBe(2);
    expect(config.publishers[1].name).toContain("new_http_target");
    expect(config.publishers[1].endpoint.http.url).toBe("https://api.example.test");
    expect(config.publishers[1].endpoint.http.path).toBe("/orders/new");
  });

  test("saves current publisher request as a preset", async () => {
    const config = {
      publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
      routes: {},
      consumers: [],
    };
    window.mqbPrompt = vi.fn().mockResolvedValue("saved_preset");

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    updatePublisherPayload("{\"hello\":true}");
    await savePublisherPresetAction();

    expect(get(publishersPanelState).presetRows.map((row) => row.name)).toContain("saved_preset");
  });

  test("renames preset and handles overwrite cancel branch", async () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
        presets: {
          orders_http: [
            { name: "a", method: "POST", url: "https://example.test/a", payload: "", headers: [] },
            { name: "b", method: "POST", url: "https://example.test/b", payload: "", headers: [] },
          ],
        },
        env_vars: {},
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    window.mqbPrompt = vi.fn().mockResolvedValue("b");
    window.mqbConfirm = vi.fn().mockResolvedValue(false);
    await renamePublisherPresetAction(0);

    expect(get(publishersPanelState).presetRows.map((row) => row.name)).toEqual(["a", "b"]);

    window.mqbPrompt = vi.fn().mockResolvedValue("renamed");
    await renamePublisherPresetAction(0);
    expect(get(publishersPanelState).presetRows.map((row) => row.name)).toEqual(["renamed", "b"]);
  });

  test("deletes preset row", async () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
        presets: {
          orders_http: [
            { name: "to_delete", method: "POST", url: "https://example.test/x", payload: "", headers: [] },
          ],
        },
        env_vars: {},
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    await deletePublisherPresetAction(0);
    expect(get(publishersPanelState).presetRows).toEqual([]);
  });

  test("beautify payload shows alert on invalid JSON", () => {
    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );
    updatePublisherPayload("{invalid");
    beautifyPublisherPayloadAction();
    expect(window.mqbAlert).toHaveBeenCalled();
  });

  test("copy publisher as route output creates route config", async () => {
    const config = {
      publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
      routes: {},
      consumers: [],
    };
    window.mqbChoose = vi.fn().mockResolvedValue("route_output");
    window.mqbPrompt = vi.fn().mockResolvedValue("orders_route");

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    await copyCurrentPublisherAction();
    expect(Object.keys(config.routes)).toContain("orders_route");
  });

  test("clone publisher duplicate name shows alert branch", () => {
    const config = {
      publishers: [
        { name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } },
        { name: "orders_http_copy", endpoint: { http: { url: "https://example.test/orders2", custom_headers: {} } } },
      ],
      routes: {},
      consumers: [],
    };

    initPublishers(
      config,
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    cloneCurrentPublisherAction();
    expect(window.mqbAlert).toHaveBeenCalled();
  });

  test("exports presets for active publisher", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    initPublishers(
      {
        publishers: [{ name: "orders_http", endpoint: { http: { url: "https://example.test/orders", custom_headers: {} } } }],
        routes: {},
        consumers: [],
      },
      {
        properties: { publishers: { items: {} } },
        $defs: { HttpConfig: { properties: { custom_headers: {} } } },
      },
    );

    exportPublisherPresetsAction();
    expect(createObjectUrlSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectUrlSpy).toHaveBeenCalled();

    clickSpy.mockRestore();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });
});

describe("publisher to consumer endpoint conversion", () => {
  test("converts http publisher URLs into consumer listen addresses", () => {
    const endpoint = createConsumerEndpointFromPublisherEndpoint({
      http: {
        url: "http://localhost:1234/api/orders/updated?mode=test",
        method: "POST",
        custom_headers: { authorization: "Bearer token" },
      },
    });

    expect(endpoint).toEqual({
      http: {
        url: "0.0.0.0:1234",
        path: "/api/orders/updated?mode=test",
        method: "POST",
        custom_headers: { authorization: "Bearer token" },
      },
    });
  });

  test("leaves non-http endpoints unchanged", () => {
    const endpoint = createConsumerEndpointFromPublisherEndpoint({
      memory: { topic: "events" },
    });

    expect(endpoint).toEqual({
      memory: { topic: "events" },
    });
  });
});
