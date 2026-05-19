type MutableSchema = {
  $defs?: Record<string, MutableSchema>;
  $ref?: string;
  type?: string;
  title?: string;
  properties?: Record<string, MutableSchema>;
  items?: MutableSchema;
  additionalProperties?: MutableSchema;
  required?: string[];
  oneOf?: unknown;
  anyOf?: unknown;
  allOf?: unknown;
  enum?: unknown;
  const?: unknown;
  default?: unknown;
  ["wa-no-label"]?: boolean;
};

type RootSchema = {
  properties?: Record<string, MutableSchema>;
  $defs?: Record<string, MutableSchema>;
};

function cloneSchema<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function resolveRootArrayItemSchema(rootSchema: RootSchema, propertyName: string): MutableSchema {
  const itemSchema = cloneSchema(rootSchema.properties?.[propertyName]?.items || {});
  const rootDefs = cloneSchema(rootSchema.$defs || {});
  if (itemSchema.$ref && itemSchema.$ref.startsWith("#/$defs/")) {
    const defName = itemSchema.$ref.slice("#/$defs/".length);
    const resolved = rootDefs[defName] ? cloneSchema(rootDefs[defName]) : null;
    return {
      ...(resolved || itemSchema),
      $defs: {
        ...rootDefs,
        ...(itemSchema.$defs || {}),
        ...(resolved?.$defs || {}),
      },
    };
  }
  return {
    ...itemSchema,
    $defs: {
      ...rootDefs,
      ...(itemSchema.$defs || {}),
    },
  };
}

function ensureStaticConfigDef(itemSchema: MutableSchema) {
  // Keep this shared def available for downstream schema consumers that still expect it.
  if (!itemSchema.$defs?.StaticConfig) {
    itemSchema.$defs ||= {};
    itemSchema.$defs.StaticConfig = {
      type: "object",
      properties: { static: { type: "string" } },
      required: ["static"],
    };
  }
}

export function forceRefOnlyEndpoints(itemSchema: MutableSchema): void {
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
  ensureStaticConfigDef(itemSchema);

  const forceRef = (obj: MutableSchema | undefined) => {
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
