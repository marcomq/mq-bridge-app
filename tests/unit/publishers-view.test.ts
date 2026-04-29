// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { get } from "svelte/store";
import {
  addPublisherMetadataRow,
  createConsumerEndpointFromPublisherEndpoint,
  initPublishers,
  removePublisherMetadataRow,
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
  window.appConfig = { publishers: [], routes: {} };
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
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    text: async () => '{"status":"Ack"}',
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
