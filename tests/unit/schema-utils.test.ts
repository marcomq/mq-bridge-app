import { describe, expect, test } from "vitest";
import { forceRefOnlyEndpoints } from "../../ui/src/lib/schema-utils";

describe("schema-utils", () => {
  test("forces nested endpoint schemas to ref-only configs", () => {
    const schema: any = {
      $defs: {
        DlqConfig: { properties: { endpoint: { oneOf: [{ type: "string" }] } } },
        FanoutConfig: { items: { anyOf: [{ type: "string" }] } },
        SwitchConfig: {
          properties: {
            default: { properties: { http: {} } },
            cases: { additionalProperties: { enum: ["http"] } },
          },
        },
      },
    };

    forceRefOnlyEndpoints(schema);

    expect(schema.$defs.RefConfig.properties.ref.type).toBe("string");
    expect(schema.$defs.DlqConfig.properties.endpoint).toMatchObject({
      $ref: "#/$defs/RefConfig",
      type: "object",
    });
    expect(schema.$defs.FanoutConfig.items).toMatchObject({
      $ref: "#/$defs/RefConfig",
      type: "object",
    });
    expect(schema.$defs.SwitchConfig.properties.default).toMatchObject({
      $ref: "#/$defs/RefConfig",
      type: "object",
    });
    expect(schema.$defs.SwitchConfig.properties.cases.additionalProperties).toMatchObject({
      $ref: "#/$defs/RefConfig",
      type: "object",
    });
    expect(schema.$defs.DlqConfig.properties.endpoint).not.toHaveProperty("oneOf");
    expect(schema.$defs.FanoutConfig.items).not.toHaveProperty("anyOf");
    expect(schema.$defs.SwitchConfig.properties.default).not.toHaveProperty("properties");
  });

  test("is safe when defs are missing or incomplete and stays idempotent", () => {
    const emptySchema = {};
    expect(() => forceRefOnlyEndpoints(emptySchema as never)).not.toThrow();
    expect(emptySchema).toEqual({
      $defs: {
        RefConfig: {
          type: "object",
          title: "",
          properties: { ref: { type: "string" } },
          required: ["ref"],
          "wa-no-label": true,
        },
        StaticConfig: {
          type: "object",
          properties: { static: { type: "string" } },
          required: ["static"],
        },
      },
    });

    const schema: any = {
      $defs: {
        Existing: { type: "string" },
        DlqConfig: { properties: { endpoint: { oneOf: [{ type: "string" }], properties: { http: {} } } } },
        SwitchConfig: { properties: { default: { anyOf: [{ type: "string" }] } } },
      },
    };

    forceRefOnlyEndpoints(schema);
    const once = JSON.parse(JSON.stringify(schema));
    forceRefOnlyEndpoints(schema);

    expect(schema).toEqual(once);
    expect(schema.$defs.RefConfig.properties.ref.type).toBe("string");
    expect(schema.$defs.Existing).toEqual({ type: "string" });
    expect(schema.$defs.DlqConfig.properties.endpoint).toEqual({
      $ref: "#/$defs/RefConfig",
      type: "object",
    });
    expect(schema.$defs.SwitchConfig.properties.default).toEqual({
      $ref: "#/$defs/RefConfig",
      type: "object",
    });
  });
});
