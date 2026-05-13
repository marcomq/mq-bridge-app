import { describe, expect, test } from "vitest";
import {
  createDefaultEndpoint,
  ensureEndpointDefaults,
  ensureRefOnlyEndpointDefaults,
  getEndpointType,
  normalizeMiddlewares,
} from "../../ui/src/lib/endpoint-utils";

describe("endpoint-utils", () => {
  test("creates basic defaults", () => {
    expect(createDefaultEndpoint("ref")).toEqual({ ref: "" });
    expect(createDefaultEndpoint("switch")).toEqual({
      switch: { metadata_key: "type", cases: {}, default: { ref: "" } },
      middlewares: [],
    });
    expect(createDefaultEndpoint("fanout")).toEqual({
      fanout: [{ ref: "" }],
      middlewares: [],
    });
  });

  test("detects endpoint types with ref priority", () => {
    expect(getEndpointType({ ref: "", http: {} })).toBe("ref");
    expect(getEndpointType({ middlewares: [], mqtt: {} })).toBe("mqtt");
    expect(getEndpointType({ middlewares: [] })).toBe("http");
  });

  test("normalizes dlq middlewares and skips invalid rows", () => {
    const middlewares = normalizeMiddlewares(
      [{ dlq: {} }, null, { metrics: {} }],
      ensureRefOnlyEndpointDefaults,
    );

    expect(middlewares).toEqual([
      { dlq: { endpoint: { ref: "", middlewares: [] } } },
      { metrics: {} },
    ]);
  });

  test("keeps saved fanout entries and normalizes nested refs", () => {
    const normalized = ensureEndpointDefaults(
      {
        fanout: ["one", { ref: "two" }],
        middlewares: [{ dlq: {} }],
      },
      ensureRefOnlyEndpointDefaults,
    );

    expect(normalized).toEqual({
      fanout: [
        { ref: "one", middlewares: [] },
        { ref: "two", middlewares: [] },
      ],
      middlewares: [{ dlq: { endpoint: { ref: "", middlewares: [] } } }],
    });
  });

  test("normalizes switch defaults and scalar refs", () => {
    const normalizedSwitch = ensureEndpointDefaults(
      {
        switch: {
          cases: { ok: "publisher.orders" },
        },
      },
      ensureRefOnlyEndpointDefaults,
    );
    const normalizedRef = ensureEndpointDefaults(
      { ref: { ref: "publisher.orders" } },
      ensureRefOnlyEndpointDefaults,
    );

    expect(normalizedSwitch).toEqual({
      switch: {
        metadata_key: "type",
        cases: { ok: { ref: "publisher.orders", middlewares: [] } },
        default: { ref: "", middlewares: [] },
      },
      middlewares: [],
    });
    expect(normalizedRef).toEqual({ ref: "publisher.orders", middlewares: [] });
  });
});
