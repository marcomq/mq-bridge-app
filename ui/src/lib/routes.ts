export interface RouteMiddleware {
  metrics?: Record<string, never>;
  [key: string]: unknown;
}

export interface RouteEndpoint {
  middlewares?: RouteMiddleware[];
  ref?: string;
  [key: string]: unknown;
}

export interface RouteDefinition {
  enabled?: boolean;
  input?: RouteEndpoint;
  output?: RouteEndpoint;
  [key: string]: unknown;
}

export interface RouteSchema {
  $defs?: Record<string, { properties?: Record<string, Record<string, unknown>> }>;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface SplitRouteFormDataResult {
  nextName: string;
  routeData: Record<string, unknown>;
}

export function defaultMetricsMiddleware(): Array<{ metrics: Record<string, never> }> {
  return [{ metrics: {} }];
}

export function isRouteEnabled(route: Pick<RouteDefinition, "enabled"> | null | undefined): boolean {
  return route?.enabled !== false;
}

export function hasMetricsMiddleware(
  route: Pick<RouteDefinition, "input" | "output"> | null | undefined,
): boolean {
  const hasMetrics = (endpoint: RouteEndpoint | null | undefined) =>
    (endpoint?.middlewares || []).some((middleware) =>
      Object.prototype.hasOwnProperty.call(middleware || {}, "metrics"),
    );

  return hasMetrics(route?.input) || hasMetrics(route?.output);
}

export function formatThroughput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 msg/s";
  if (value >= 100) return `${Math.round(value)} msg/s`;
  if (value >= 10) return `${value.toFixed(1)} msg/s`;
  return `${value.toFixed(2)} msg/s`;
}

export function applyEndpointSchemaDefaults(routeSchema: RouteSchema): void {
  const fileConfigSchema = routeSchema.$defs?.FileConfig;
  if (fileConfigSchema?.properties?.format) {
    fileConfigSchema.properties.format.default = "raw";
  }

  const mongoDbConfigSchema = routeSchema.$defs?.MongoDbConfig;
  if (mongoDbConfigSchema?.properties?.format) {
    mongoDbConfigSchema.properties.format.default = "raw";
  }

  const properties = routeSchema.properties;
  if (properties && typeof properties === "object") {
    delete properties.enabled;
    delete properties.description;
  }

  if (Array.isArray(routeSchema.required)) {
    routeSchema.required = routeSchema.required.filter(
      (key) => key !== "enabled" && key !== "description",
    );
  }
}

export function nextUniqueName(baseName: string, existingNames: Iterable<string>): string {
  const names = new Set(existingNames);
  let candidate = baseName;
  let index = 1;

  while (names.has(candidate)) {
    candidate = `${baseName}_${index}`;
    index += 1;
  }

  return candidate;
}

export function createRefInputEndpoint(refName: string): RouteEndpoint {
  return {
    middlewares: defaultMetricsMiddleware(),
    ref: refName,
  };
}

export function createEmptyRouteConfig(): RouteDefinition {
  return {
    enabled: true,
    input: { middlewares: defaultMetricsMiddleware(), null: null },
    output: { middlewares: defaultMetricsMiddleware(), null: null },
  };
}

export function splitRouteFormData(
  routeName: string,
  updated: { name?: unknown } | null | undefined,
): SplitRouteFormDataResult {
  const nextName = typeof updated?.name === "string" ? updated.name.trim() : "";
  const routeData = { ...(updated || {}) };
  delete routeData.name;

  return {
    nextName: nextName || routeName,
    routeData,
  };
}
