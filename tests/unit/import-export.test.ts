// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { exportFullBundle, importFromJsonText } from "../../ui/src/lib/import-export";

function installStorage() {
  const storage = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      getItem: vi.fn().mockImplementation((key: string) => storage.get(key) ?? null),
      setItem: vi.fn().mockImplementation((key: string, value: string) => storage.set(key, value)),
    },
    configurable: true,
  });
  return storage;
}

describe("import-export", () => {
  const readFixture = (name: string) =>
    readFileSync(join(process.cwd(), "tests/fixtures/import-export", name), "utf8");

  beforeEach(() => {
    installStorage();
    window.appConfig = { publishers: [{ name: "orders_http" }], routes: {}, consumers: [] };
    globalThis.fetch = vi.fn().mockImplementation((input: string, init?: RequestInit) => {
      if (String(input) === "/config" && init?.method === "POST") {
        return Promise.resolve({ ok: true, text: async () => "" });
      }
      if (String(input) === "/config") {
        return Promise.resolve({
          json: async () => ({ publishers: [{ name: "saved_pub" }], routes: { r1: {} }, consumers: [] }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }) as any;
  });

  test("imports native preset bundle into target local storage keys", async () => {
    const file = readFixture("mqb-presets.sample.json");

    const result = await importFromJsonText(file, {
      includeConfig: false,
      includePresets: true,
      targetPublisherName: "orders_http",
    });

    expect(result.importedKind).toBe("mqb-presets");
    expect(result.importedPresetCount).toBe(1);
    expect(JSON.parse(window.localStorage.getItem("mqb_publisher_presets") || "{}")).toEqual({
      orders_http: [{ name: "preset_1", method: "POST", url: "https://api.local/orders", payload: "{\"order\":1}", headers: [] }],
    });
    expect(JSON.parse(window.localStorage.getItem("mqb_env_vars") || "{}")).toEqual({
      baseUrl: "https://api.local",
    });
  });

  test("imports postman collection items into presets", async () => {
    const postmanCollection = readFixture("postman.collection.sample.json");

    const result = await importFromJsonText(postmanCollection, {
      includeConfig: false,
      includePresets: true,
      targetPublisherName: "orders_http",
    });

    expect(result.importedKind).toBe("postman");
    expect(result.importedPresetCount).toBe(1);
    const presets = JSON.parse(window.localStorage.getItem("mqb_publisher_presets") || "{}");
    expect(presets.orders_http[0]).toMatchObject({
      name: "Create order",
      method: "POST",
      url: "https://api.test/orders",
      payload: "{\"order\":1}",
    });
  });

  test("imports openapi paths as presets and captures baseUrl env var", async () => {
    const openApi = readFixture("openapi.sample.json");

    const result = await importFromJsonText(openApi, {
      includeConfig: false,
      includePresets: true,
      targetPublisherName: "orders_http",
    });

    expect(result.importedKind).toBe("openapi");
    const presets = JSON.parse(window.localStorage.getItem("mqb_publisher_presets") || "{}");
    expect(presets.orders_http[0]).toMatchObject({
      name: "Create order",
      method: "POST",
      url: "${baseUrl}/orders",
    });
    expect(JSON.parse(window.localStorage.getItem("mqb_env_vars") || "{}").baseUrl).toBe("https://openapi.example");
  });

  test("imports asyncapi channels as presets", async () => {
    const asyncApi = readFixture("asyncapi.sample.json");

    const result = await importFromJsonText(asyncApi, {
      includeConfig: false,
      includePresets: true,
      targetPublisherName: "orders_http",
    });

    expect(result.importedKind).toBe("asyncapi");
    const presets = JSON.parse(window.localStorage.getItem("mqb_publisher_presets") || "{}");
    expect(presets.orders_http[0]).toMatchObject({
      name: "Publish order created",
      method: "POST",
      url: "${baseUrl}/orders/created",
    });
    expect(JSON.parse(window.localStorage.getItem("mqb_env_vars") || "{}").baseUrl).toBe("mqtt://broker.local:1883");
  });

  test("imports config payload and replaces appConfig with refreshed server config", async () => {
    const bundle = readFixture("mqb-export.sample.json");

    await importFromJsonText(bundle, {
      includeConfig: true,
      includePresets: false,
      targetPublisherName: "orders_http",
    });

    expect(window.appConfig.publishers[0].name).toBe("saved_pub");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/config",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("exports full bundle as downloadable JSON", () => {
    window.localStorage.setItem("mqb_publisher_presets", JSON.stringify({ orders_http: [] }));
    window.localStorage.setItem("mqb_env_vars", JSON.stringify({ baseUrl: "https://x" }));

    const createObjectURL = vi.fn().mockReturnValue("blob:test");
    const revokeObjectURL = vi.fn();
    const click = vi.fn();

    globalThis.URL.createObjectURL = createObjectURL as any;
    globalThis.URL.revokeObjectURL = revokeObjectURL as any;
    const createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      const element = document.createElementNS("http://www.w3.org/1999/xhtml", tagName) as any;
      if (tagName.toLowerCase() === "a") {
        element.click = click;
      }
      return element;
    });

    exportFullBundle();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    createElementSpy.mockRestore();
  });
});
