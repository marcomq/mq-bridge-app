import { saveWholeConfig } from "./config-api";
import { mqbApp } from "./runtime-window";
import {
  ensureWorkspaceCollections,
  sanitizeEnvVars,
  sanitizePresets,
  type EnvVars,
  type PresetsByPublisher,
  type PublisherPreset,
} from "./workspace-config";

export type ImportedRequest = PublisherPreset;

type ExportBundle = {
  type: "mqb-export";
  version: 1;
  exportedAt: string;
  config: Record<string, unknown>;
  presets: PresetsByPublisher;
  envVars: EnvVars;
};

function getWorkspaceConfig() {
  return ensureWorkspaceCollections(mqbApp.config<Record<string, unknown>>());
}

function triggerJsonDownload(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isoDateCompact() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function exportFullBundle() {
  const config = structuredClone(getWorkspaceConfig());
  const bundle: ExportBundle = {
    type: "mqb-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    config,
    presets: sanitizePresets(config.presets),
    envVars: sanitizeEnvVars(config.env_vars),
  };
  triggerJsonDownload(`mqb-export-${isoDateCompact()}.json`, bundle);
}

export function exportConfigOnly() {
  const payload = {
    type: "mqb-config",
    version: 1,
    exportedAt: new Date().toISOString(),
    config: structuredClone(mqbApp.config()),
  };
  triggerJsonDownload(`mqb-config-${isoDateCompact()}.json`, payload);
}

function nextUniqueName(base: string, existing: Set<string>) {
  let index = 1;
  let candidate = base;
  while (existing.has(candidate)) {
    candidate = `${base}_${index++}`;
  }
  existing.add(candidate);
  return candidate;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeNamedArray<T extends { name?: unknown }>(value: unknown): Array<T & { name: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const obj = row as Record<string, unknown>;
      return { ...(obj as T), name: String(obj.name || "") };
    })
    .filter((row) => row.name.trim().length > 0);
}

function mergeNamedEntries(
  currentRows: Array<Record<string, unknown>>,
  incomingRows: Array<Record<string, unknown>>,
) {
  const existingNames = new Set(currentRows.map((row) => String(row?.name || "")));
  const merged = [...currentRows];
  for (const raw of incomingRows) {
    const row = asObject(raw);
    const baseName = String(row.name || "imported");
    const name = existingNames.has(baseName)
      ? nextUniqueName(baseName, existingNames)
      : (existingNames.add(baseName), baseName);
    merged.push({ ...row, name });
  }
  return merged;
}

export async function importAppConfigFromJsonText(text: string) {
  const parsed = JSON.parse(text) as unknown;
  const currentConfig = asObject(structuredClone(getWorkspaceConfig()));
  const currentPublishers = normalizeNamedArray<Record<string, unknown>>(currentConfig.publishers);
  const currentConsumers = normalizeNamedArray<Record<string, unknown>>(currentConfig.consumers);
  const currentPresets = sanitizePresets(currentConfig.presets);
  const currentEnvVars = sanitizeEnvVars(currentConfig.env_vars);

  const obj = asObject(parsed);
  const type = String(obj.type || "");
  const incomingConfig =
    type === "mqb-export" || type === "mqb-config"
      ? asObject(obj.config)
      : asObject(obj);

  const mergedPublishers = mergeNamedEntries(
    currentPublishers as Array<Record<string, unknown>>,
    normalizeNamedArray<Record<string, unknown>>(incomingConfig.publishers) as Array<Record<string, unknown>>,
  );
  const mergedConsumers = mergeNamedEntries(
    currentConsumers as Array<Record<string, unknown>>,
    normalizeNamedArray<Record<string, unknown>>(incomingConfig.consumers) as Array<Record<string, unknown>>,
  );

  const nextConfig = {
    ...currentConfig,
    ...incomingConfig,
    publishers: mergedPublishers,
    consumers: mergedConsumers,
    presets: currentPresets,
    env_vars: currentEnvVars,
  };

  const importedPresets = {
    ...sanitizePresets(incomingConfig.presets),
  };
  for (const [publisherName, rows] of Object.entries(sanitizePresets(obj.presets))) {
    importedPresets[publisherName] = [
      ...(importedPresets[publisherName] || []),
      ...rows,
    ];
  }
  let mergedPresets = sanitizePresets(nextConfig.presets);
  for (const [publisherName, rows] of Object.entries(importedPresets)) {
    mergedPresets = mergePresets(mergedPresets, publisherName, rows);
  }
  nextConfig.presets = mergedPresets;
  nextConfig.env_vars = {
    ...sanitizeEnvVars(nextConfig.env_vars),
    ...sanitizeEnvVars(incomingConfig.env_vars),
    ...sanitizeEnvVars(obj.envVars),
  };

  await saveImportedConfig(nextConfig);
  return {
    importedPublishers: normalizeNamedArray<Record<string, unknown>>(incomingConfig.publishers).length,
    importedConsumers: normalizeNamedArray<Record<string, unknown>>(incomingConfig.consumers).length,
    importedRoutes: Object.keys(asObject(incomingConfig.routes)).length,
  };
}

export async function resetAppConfigToDefaults() {
  const currentConfig = asObject(structuredClone(mqbApp.config<Record<string, unknown>>()));
  const nextConfig = {
    ...currentConfig,
    consumers: [],
    publishers: [],
    default_tab: "publishers",
  };
  delete nextConfig.routes;
  await saveImportedConfig(nextConfig);
}

export function exportPresetsOnly() {
  const config = getWorkspaceConfig();
  const payload = {
    type: "mqb-presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: sanitizePresets(config.presets),
    envVars: sanitizeEnvVars(config.env_vars),
  };
  triggerJsonDownload(`mqb-presets-${isoDateCompact()}.json`, payload);
}

export function exportPresetsForPublisher(publisherName: string) {
  const config = getWorkspaceConfig();
  const allPresets = sanitizePresets(config.presets);
  const payload = {
    type: "mqb-presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: {
      [publisherName]: Array.isArray(allPresets[publisherName]) ? allPresets[publisherName] : [],
    },
    envVars: sanitizeEnvVars(config.env_vars),
  };
  triggerJsonDownload(`mqb-presets-${publisherName}-${isoDateCompact()}.json`, payload);
}

function flattenPostmanItems(
  items: unknown[],
  out: Array<Record<string, unknown>>,
  folderPath: string[] = [],
) {
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.request && typeof row.request === "object") {
      out.push({
        ...row,
        __folderPath: folderPath.slice(),
      });
    }
    if (Array.isArray(row.item)) {
      const nextPath = row.name ? [...folderPath, String(row.name)] : folderPath;
      flattenPostmanItems(row.item, out, nextPath);
    }
  }
}

function parsePostmanCollection(raw: unknown): PublisherPreset[] {
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  const info = obj.info as Record<string, unknown> | undefined;
  const schema = String(info?.schema ?? "");
  if (!schema.includes("postman.com")) return [];
  const list = Array.isArray(obj.item) ? obj.item : [];
  const entries: Array<Record<string, unknown>> = [];
  flattenPostmanItems(list, entries);
  return entries.map((entry, index) => {
    const request = (entry.request || {}) as Record<string, unknown>;
    const rawUrl = request.url;
    const method = String(request.method || "GET").toUpperCase();
    let url = "";
    if (typeof rawUrl === "string") {
      url = rawUrl;
    } else if (rawUrl && typeof rawUrl === "object") {
      const urlObj = rawUrl as Record<string, unknown>;
      url = String(urlObj.raw || "");
    }

    const headersValue = Array.isArray(request.header) ? request.header : [];
    const headers: HeaderRow[] = headersValue.map((headerRow) => {
      const header = headerRow && typeof headerRow === "object"
        ? (headerRow as Record<string, unknown>)
        : {};
      return {
        key: String(header.key || ""),
        value: String(header.value || ""),
        enabled: header.disabled !== true,
      };
    });

    const body = request.body && typeof request.body === "object"
      ? (request.body as Record<string, unknown>)
      : {};
    const payload = String(body.raw || "");

    const folderPath = Array.isArray(entry.__folderPath) ? entry.__folderPath : [];
    const group = folderPath.length > 0 ? folderPath.join(" / ") : "";

    return {
      name: String(entry.name || `Postman request ${index + 1}`),
      payload,
      headers,
      group,
      endpoint_type: "http",
      method,
      url,
      request_fields: { url },
    };
  });
}

function parseOpenApiDocument(raw: unknown): { presets: PublisherPreset[]; envVars: EnvVars } {
  if (!raw || typeof raw !== "object") return { presets: [], envVars: {} };
  const obj = raw as Record<string, unknown>;
  if (!obj.openapi) return { presets: [], envVars: {} };
  const paths = obj.paths && typeof obj.paths === "object" ? (obj.paths as Record<string, unknown>) : {};
  const methods = ["get", "post", "put", "delete", "patch", "head", "options"];
  const presets: PublisherPreset[] = [];

  for (const [path, operations] of Object.entries(paths)) {
    if (!operations || typeof operations !== "object") continue;
    const operationMap = operations as Record<string, unknown>;
    for (const method of methods) {
      const operation = operationMap[method];
      if (!operation || typeof operation !== "object") continue;
      const op = operation as Record<string, unknown>;
      const name = String(op.summary || op.operationId || `${method.toUpperCase()} ${path}`);
      let payload = "";
      const requestBody = op.requestBody && typeof op.requestBody === "object"
        ? (op.requestBody as Record<string, unknown>)
        : {};
      const content = requestBody.content && typeof requestBody.content === "object"
        ? (requestBody.content as Record<string, unknown>)
        : {};
      const jsonContent = content["application/json"];
      if (jsonContent && typeof jsonContent === "object") {
        const jc = jsonContent as Record<string, unknown>;
        if (jc.example !== undefined) {
          payload = JSON.stringify(jc.example, null, 2);
        }
      }
      presets.push({
        name,
        payload,
        headers: [],
        endpoint_type: "http",
        method: method.toUpperCase(),
        url: `\${baseUrl}${path}`,
        request_fields: { url: `\${baseUrl}${path}` },
      });
    }
  }

  const servers = Array.isArray(obj.servers) ? obj.servers : [];
  const firstServer = servers[0] && typeof servers[0] === "object"
    ? String((servers[0] as Record<string, unknown>).url || "")
    : "";
  const envVars: EnvVars = firstServer ? { baseUrl: firstServer } : {};
  return { presets, envVars };
}

function parseAsyncApiDocument(raw: unknown): { presets: PublisherPreset[]; envVars: EnvVars } {
  if (!raw || typeof raw !== "object") return { presets: [], envVars: {} };
  const obj = raw as Record<string, unknown>;
  if (!obj.asyncapi) return { presets: [], envVars: {} };
  const asyncApiVersion = String(obj.asyncapi);

  const resolveRef = (root: Record<string, unknown>, ref: unknown) => {
    const refValue = String(ref || "");
    if (!refValue.startsWith("#/")) return null;
    const parts = refValue.replace(/^#\//, "").split("/");
    let current: any = root;
    for (const part of parts) {
      if (!current || typeof current !== "object") return null;
      current = current[part];
    }
    return current ?? null;
  };

  const pickPayloadExample = (messageNodeRaw: unknown) => {
    const messageNode = messageNodeRaw && typeof messageNodeRaw === "object"
      ? (messageNodeRaw as Record<string, unknown>)
      : {};
    const messagePayload = messageNode.payload && typeof messageNode.payload === "object"
      ? (messageNode.payload as Record<string, unknown>)
      : {};
    if (messageNode.example !== undefined) {
      return JSON.stringify(messageNode.example, null, 2);
    }
    if (messagePayload.example !== undefined) {
      return JSON.stringify(messagePayload.example, null, 2);
    }
    if (Array.isArray(messagePayload.examples) && messagePayload.examples[0] !== undefined) {
      return JSON.stringify(messagePayload.examples[0], null, 2);
    }
    return "";
  };

  const channels = obj.channels && typeof obj.channels === "object"
    ? (obj.channels as Record<string, unknown>)
    : {};
  const presets: PublisherPreset[] = [];

  if (asyncApiVersion.startsWith("3")) {
    const operations = obj.operations && typeof obj.operations === "object"
      ? (obj.operations as Record<string, unknown>)
      : {};

    for (const [operationName, operationRaw] of Object.entries(operations)) {
      if (!operationRaw || typeof operationRaw !== "object") continue;
      const operation = operationRaw as Record<string, unknown>;
      const channelRef = operation.channel && typeof operation.channel === "object"
        ? String((operation.channel as Record<string, unknown>).$ref || "")
        : "";
      const channelNode = resolveRef(obj, channelRef);
      const channelAddress = channelNode && typeof channelNode === "object"
        ? String((channelNode as Record<string, unknown>).address || "")
        : "";

      const messagesRaw = Array.isArray(operation.messages) ? operation.messages : [];
      let payload = "";
      for (const messageRefRaw of messagesRaw) {
        const messageRef = messageRefRaw && typeof messageRefRaw === "object"
          ? String((messageRefRaw as Record<string, unknown>).$ref || "")
          : "";
        const messageNode = resolveRef(obj, messageRef);
        payload = pickPayloadExample(messageNode);
        if (payload) break;
      }

      const label = String(operation.summary || operation.title || operationName || channelAddress || "AsyncAPI operation");
      const normalizedAddress = channelAddress.replace(/^\/+/, "");
      if (!normalizedAddress) continue;
      presets.push({
        name: label,
        payload,
        headers: [],
        endpoint_type: "http",
        method: "POST",
        url: `\${baseUrl}/${normalizedAddress}`,
        request_fields: { url: `\${baseUrl}/${normalizedAddress}` },
      });
    }
  } else {
  for (const [channelName, channelDef] of Object.entries(channels)) {
    if (!channelDef || typeof channelDef !== "object") continue;
    const channel = channelDef as Record<string, unknown>;
    const opCandidates: Array<[string, Record<string, unknown>]> = [];
    if (channel.publish && typeof channel.publish === "object") {
      opCandidates.push(["PUBLISH", channel.publish as Record<string, unknown>]);
    }
    if (channel.subscribe && typeof channel.subscribe === "object") {
      opCandidates.push(["SUBSCRIBE", channel.subscribe as Record<string, unknown>]);
    }

    for (const [direction, operation] of opCandidates) {
      const payload = pickPayloadExample(operation.message);

      const summary = String(operation.summary || operation.operationId || `${direction} ${channelName}`);
      presets.push({
        name: summary,
        payload,
        headers: [],
        endpoint_type: "http",
        method: "POST",
        url: `\${baseUrl}/${channelName.replace(/^\/+/, "")}`,
        request_fields: { url: `\${baseUrl}/${channelName.replace(/^\/+/, "")}` },
      });
    }
  }
  }

  const servers = obj.servers && typeof obj.servers === "object"
    ? (obj.servers as Record<string, unknown>)
    : {};
  const firstServer = Object.values(servers)[0];
  const firstServerUrl = firstServer && typeof firstServer === "object"
    ? String((firstServer as Record<string, unknown>).url || "")
    : "";

  const envVars: EnvVars = firstServerUrl ? { baseUrl: firstServerUrl } : {};
  return { presets, envVars };
}

function mergePresets(
  existing: PresetsByPublisher,
  publisherName: string,
  incoming: PublisherPreset[],
): PresetsByPublisher {
  const next = { ...existing };
  const currentRows = Array.isArray(next[publisherName]) ? next[publisherName] : [];
  next[publisherName] = [...currentRows, ...incoming];
  return next;
}

type ParsedRequestImport =
  | { kind: "postman"; requests: ImportedRequest[]; envVars: EnvVars }
  | { kind: "openapi"; requests: ImportedRequest[]; envVars: EnvVars }
  | { kind: "asyncapi"; requests: ImportedRequest[]; envVars: EnvVars }
  | { kind: "unknown"; requests: ImportedRequest[]; envVars: EnvVars };

function parseRequestImport(raw: unknown): ParsedRequestImport {
  const postmanRequests = parsePostmanCollection(raw);
  if (postmanRequests.length > 0) {
    return { kind: "postman", requests: postmanRequests, envVars: {} };
  }

  const openApiImport = parseOpenApiDocument(raw);
  if (openApiImport.presets.length > 0) {
    return { kind: "openapi", requests: openApiImport.presets, envVars: openApiImport.envVars };
  }

  const asyncApiImport = parseAsyncApiDocument(raw);
  if (asyncApiImport.presets.length > 0) {
    return { kind: "asyncapi", requests: asyncApiImport.presets, envVars: asyncApiImport.envVars };
  }

  return { kind: "unknown", requests: [], envVars: {} };
}

export function extractImportedRequests(text: string): {
  kind: "postman" | "openapi" | "asyncapi";
  requests: ImportedRequest[];
  envVars: EnvVars;
} {
  const parsed = JSON.parse(text) as unknown;
  const result = parseRequestImport(parsed);
  if (result.kind === "unknown") {
    throw new Error("Unsupported file. Use Postman collection JSON, OpenAPI JSON, or AsyncAPI JSON.");
  }
  return result;
}

async function saveImportedConfig(config: Record<string, unknown>) {
  const refreshed = await saveWholeConfig(fetch, config);
  const nextConfig = { ...(refreshed as Record<string, unknown>) };
  delete nextConfig.routes;
  mqbApp.setConfig(nextConfig);
}

export async function importFromJsonText(
  text: string,
  options: {
    includeConfig: boolean;
    includePresets: boolean;
    targetPublisherName: string;
  },
) {
  const parsed = JSON.parse(text) as unknown;
  const currentConfig = structuredClone(getWorkspaceConfig());
  const nextConfig = ensureWorkspaceCollections(currentConfig);
  const mergedEnvVars = { ...sanitizeEnvVars(nextConfig.env_vars) };
  let mergedPresets = sanitizePresets(nextConfig.presets);
  let importedPresetCount = 0;
  let importedKind = "unknown";

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (obj.type === "mqb-export" || obj.type === "mqb-presets") {
      importedKind = String(obj.type);
      if (options.includeConfig && obj.config && typeof obj.config === "object") {
        const importedConfig = ensureWorkspaceCollections(structuredClone(obj.config as Record<string, unknown>));
        nextConfig.publishers = importedConfig.publishers;
        nextConfig.consumers = importedConfig.consumers;
        nextConfig.routes = importedConfig.routes;
        nextConfig.default_tab = importedConfig.default_tab;
        nextConfig.log_level = importedConfig.log_level;
        nextConfig.logger = importedConfig.logger;
        nextConfig.ui_addr = importedConfig.ui_addr;
        nextConfig.metrics_addr = importedConfig.metrics_addr;
        nextConfig.extract_secrets = importedConfig.extract_secrets;
        mergedPresets = sanitizePresets(importedConfig.presets);
        Object.assign(mergedEnvVars, sanitizeEnvVars(importedConfig.env_vars));
      }
      if (options.includePresets) {
        const importedPresets = sanitizePresets(obj.presets);
        for (const [publisherName, rows] of Object.entries(importedPresets)) {
          mergedPresets = mergePresets(mergedPresets, publisherName, rows);
          importedPresetCount += rows.length;
        }
        Object.assign(mergedEnvVars, sanitizeEnvVars(obj.envVars));
      }
    } else {
      const requestImport = parseRequestImport(obj);
      if (requestImport.kind === "unknown") {
        throw new Error(
          "Unsupported file. Use mqb export/presets JSON, Postman collection JSON, OpenAPI JSON, or AsyncAPI JSON.",
        );
      }
      importedKind = requestImport.kind;
      if (options.includePresets) {
        mergedPresets = mergePresets(mergedPresets, options.targetPublisherName, requestImport.requests);
        importedPresetCount += requestImport.requests.length;
        Object.assign(mergedEnvVars, requestImport.envVars);
      }
    }
  }

  if (options.includePresets) {
    nextConfig.presets = mergedPresets;
    nextConfig.env_vars = mergedEnvVars;
  }

  if (options.includeConfig || options.includePresets) {
    await saveImportedConfig(nextConfig);
  }

  return { importedPresetCount, importedKind, configName: currentConfig?.name };
}

export async function importPostmanFromJsonText(text: string, targetPublisherName: string) {
  const result = await importFromJsonText(text, {
    includeConfig: false,
    includePresets: true,
    targetPublisherName,
  });
  if (result.importedKind !== "postman") {
    throw new Error("Selected file is not a valid Postman collection JSON.");
  }
  return result;
}

export async function importOpenApiFromJsonText(text: string, targetPublisherName: string) {
  const result = await importFromJsonText(text, {
    includeConfig: false,
    includePresets: true,
    targetPublisherName,
  });
  if (result.importedKind !== "openapi") {
    throw new Error("Selected file is not a valid OpenAPI JSON document.");
  }
  return result;
}

export async function importAsyncApiFromJsonText(text: string, targetPublisherName: string) {
  const result = await importFromJsonText(text, {
    includeConfig: false,
    includePresets: true,
    targetPublisherName,
  });
  if (result.importedKind !== "asyncapi") {
    throw new Error("Selected file is not a valid AsyncAPI JSON document.");
  }
  return result;
}
