export function forceRefOnlyEndpoints(itemSchema: any) {
  if (!itemSchema.$defs) itemSchema.$defs = {};
  if (!itemSchema.$defs.RefConfig) {
    itemSchema.$defs.RefConfig = {
      type: "object",
      title: "",
      properties: { ref: { type: "string" } },
      required: ["ref"],
      "wa-no-label": true,
    };
  }
  if (!itemSchema.$defs.StaticConfig) {
    itemSchema.$defs.StaticConfig = {
      type: "object",
      properties: { static: { type: "string" } },
      required: ["static"],
    };
  }

  const forceRef = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    obj.$ref = "#/$defs/RefConfig";
    delete obj.oneOf;
    delete obj.anyOf;
    delete obj.allOf;
    delete obj.properties;
    delete obj.enum;
    delete obj.const;
    delete obj.default;
    obj.type = "object";
  };

  const dlq = itemSchema.$defs.DlqConfig;
  if (dlq?.properties?.endpoint) {
    forceRef(dlq.properties.endpoint);
  }

  const fanout = itemSchema.$defs.FanoutConfig || itemSchema.$defs.FanOutConfig;
  if (fanout) {
    const endpoints = fanout.items || fanout.properties?.endpoints?.items;
    if (endpoints) {
      forceRef(endpoints);
    }
  }

  const sw = itemSchema.$defs.SwitchConfig;
  if (sw?.properties) {
    if (sw.properties.default) {
      forceRef(sw.properties.default);
    }
    if (sw.properties.cases?.additionalProperties) {
      forceRef(sw.properties.cases.additionalProperties);
    }
  }
}
