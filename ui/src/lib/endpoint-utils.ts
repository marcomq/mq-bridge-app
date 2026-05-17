import { cloneJson } from "./utils";
import { defaultMetricsMiddleware } from "./routes";

export type EndpointRecord = Record<string, unknown>;

export type DlqMiddleware = {
  dlq: { endpoint: EndpointRecord };
};

export type Middleware = DlqMiddleware | Record<string, unknown>;

export const KNOWN_ENDPOINT_ROOT_KEYS = [
  "http",
  "websocket",
  "grpc",
  "nats",
  "memory",
  "amqp",
  "kafka",
  "mqtt",
  "mongodb",
  "sqlx",
  "zeromq",
  "file",
  "static",
  "ref",
  "sled",
  "ibmmq",
  "switch",
  "fanout",
  "reader",
  "response",
  "custom",
  "null",
  "aws",
] as const;

function unwrapRoot(endpoint: unknown): EndpointRecord | null {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    return null;
  }

  const endpointRecord = endpoint as EndpointRecord & { root?: unknown };
  if (endpointRecord.root && typeof endpointRecord.root === "object" && !Array.isArray(endpointRecord.root)) {
    return endpointRecord.root as EndpointRecord;
  }

  return endpointRecord;
}

export function createDefaultEndpoint(type: string): EndpointRecord {
  if (type === "static" || type === "ref") {
    return { [type]: "" };
  }
  if (type === "switch") {
    return { switch: { metadata_key: "type", cases: {}, default: { ref: "" } }, middlewares: [] };
  }
  if (type === "fanout") {
    return { fanout: [{ ref: "" }], middlewares: [] };
  }
  return { [type]: {}, middlewares: defaultMetricsMiddleware() };
}

export function getEndpointType(endpoint: EndpointRecord): string {
  return ["ref", "static"].find((key) => key in endpoint)
    || Object.keys(endpoint).find((key) => key !== "middlewares")
    || "http";
}

export function normalizeMiddlewares(
  middlewares: unknown,
  recurse: (endpoint: unknown) => EndpointRecord,
): Middleware[] {
  if (!Array.isArray(middlewares)) {
    return [];
  }

  return middlewares.flatMap((middleware) => {
    if (!middleware || typeof middleware !== "object" || Array.isArray(middleware)) {
      return [];
    }

    const nextMiddleware = cloneJson(middleware as Record<string, unknown>);
    const dlq = nextMiddleware.dlq;
    if (dlq && typeof dlq === "object" && !Array.isArray(dlq)) {
      const dlqRecord = dlq as Record<string, unknown>;
      dlqRecord.endpoint = recurse(dlqRecord.endpoint ?? { ref: "" });
    }

    return [nextMiddleware as Middleware];
  });
}

export function ensureEndpointDefaults(
  endpoint: unknown,
  recurse: (endpoint: unknown) => EndpointRecord,
): EndpointRecord {
  const data = unwrapRoot(endpoint);
  if (!data) {
    return createDefaultEndpoint("http");
  }

  const endpointType = getEndpointType(data);
  const normalized: EndpointRecord = {
    ...createDefaultEndpoint(endpointType),
    ...cloneJson(data),
  };

  if (endpointType === "switch") {
    const nextSwitch = normalized.switch;
    if (nextSwitch && typeof nextSwitch === "object" && !Array.isArray(nextSwitch)) {
      const switchRecord = nextSwitch as Record<string, unknown>;
      if (!switchRecord.metadata_key) {
        switchRecord.metadata_key = "type";
      }
      const rawCases = switchRecord.cases;
      const normalizedCases: Record<string, EndpointRecord> = {};
      if (rawCases && typeof rawCases === "object" && !Array.isArray(rawCases)) {
        for (const [key, value] of Object.entries(rawCases as Record<string, unknown>)) {
          normalizedCases[key] = recurse(value);
        }
      }
      switchRecord.cases = normalizedCases;
      switchRecord.default = recurse(switchRecord.default ?? { ref: "" });
    }
  } else if (endpointType === "fanout") {
    normalized.fanout = Array.isArray(normalized.fanout)
      ? (normalized.fanout as unknown[]).map((item) => recurse(item))
      : [{ ref: "" }];
  } else if (endpointType === "static" || endpointType === "ref") {
    const value = normalized[endpointType];
    normalized[endpointType] =
      typeof value === "string"
        ? value
        : value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[endpointType] === "string"
          ? String((value as Record<string, unknown>)[endpointType])
          : "";
  }

  normalized.middlewares = normalizeMiddlewares(normalized.middlewares, recurse);
  return normalized;
}

export function ensureRefOnlyEndpointDefaults(endpoint: unknown): EndpointRecord {
  const data = unwrapRoot(endpoint);
  if (typeof endpoint === "string") {
    return { ref: endpoint, middlewares: [] };
  }
  if (!data) {
    return { ref: "", middlewares: [] };
  }

  return {
    ref: typeof data.ref === "string" ? data.ref : "",
    middlewares: normalizeMiddlewares(data.middlewares, ensureRefOnlyEndpointDefaults),
  };
}

export function normalizeScalarEndpointValue(endpointType: string, value: unknown): unknown {
  if (endpointType !== "static" && endpointType !== "ref") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value) && typeof (value as Record<string, unknown>)[endpointType] === "string") {
    return (value as Record<string, unknown>)[endpointType];
  }
  return typeof value === "string" ? value : "";
}

export function prunePolymorphicEndpointKeys(normalized: EndpointRecord, endpointType: string): void {
  for (const key of KNOWN_ENDPOINT_ROOT_KEYS) {
    if (key !== endpointType && key in normalized) {
      delete normalized[key];
    }
  }
}
