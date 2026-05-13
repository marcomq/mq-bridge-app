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
  });
});
