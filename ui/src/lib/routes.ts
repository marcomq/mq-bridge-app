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
  id?: string;
  enabled: boolean;
  input: RouteEndpoint;
  output: RouteEndpoint;
  description?: string;
  concurrency?: number;
  batch_size?: number;
  commit_concurrency_limit?: number;
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
  return [];
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
    delete properties.id;
    delete properties.enabled;
    delete properties.description;
  }

  if (Array.isArray(routeSchema.required)) {
    routeSchema.required = routeSchema.required.filter(
      (key) => key !== "id" && key !== "enabled" && key !== "description",
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
