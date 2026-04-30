import { saveWholeConfig } from "./config-api";
import { mqbApp } from "./runtime-window";

const PRESETS_KEY = "mqb_publisher_presets";
const ENV_VARS_KEY = "mqb_env_vars";

type HeaderRow = { key: string; value: string; enabled: boolean };
type PublisherPreset = {
  name: string;
  method: string;
  url: string;
  payload: string;
  headers: HeaderRow[];
  group?: string;
};

type PresetsByPublisher = Record<string, PublisherPreset[]>;
type EnvVars = Record<string, string>;
export type ImportedRequest = PublisherPreset;

type ExportBundle = {
  type: "mqb-export";
  version: 1;
  exportedAt: string;
  config: Record<string, unknown>;
  presets: PresetsByPublisher;
  envVars: EnvVars;
};

function parseJsonSafe<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readPresetsFromStorage() {
  return parseJsonSafe<PresetsByPublisher>(localStorage.getItem(PRESETS_KEY), {});
}

function readEnvVarsFromStorage() {
  return parseJsonSafe<EnvVars>(localStorage.getItem(ENV_VARS_KEY), {});
}

function writePresetsToStorage(value: PresetsByPublisher) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(value));
}

function writeEnvVarsToStorage(value: EnvVars) {
  localStorage.setItem(ENV_VARS_KEY, JSON.stringify(value));
}

function sanitizePresets(value: unknown): PresetsByPublisher {
  const result: PresetsByPublisher = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [publisherName, rows] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(rows)) continue;
    result[publisherName] = rows.map((row, index) => {
      const entry = row && typeof row === "object" ? (row as Record<string, unknown>) : {};
      const headersValue = Array.isArray(entry.headers) ? entry.headers : [];
      const headers = headersValue.map((headerRow) => {
        const header = headerRow && typeof headerRow === "object"
          ? (headerRow as Record<string, unknown>)
          : {};
        return {
          key: String(header.key ?? ""),
          value: String(header.value ?? ""),
          enabled: header.enabled !== false,
        };
      });
      return {
        name: String(entry.name || `Imported preset ${index + 1}`),
        method: String(entry.method || "GET").toUpperCase(),
        url: String(entry.url || ""),
        payload: String(entry.payload || ""),
        headers,
      };
    });
  }
  return result;
}

function sanitizeEnvVars(value: unknown): EnvVars {
  const result: EnvVars = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    result[key] = String(raw ?? "");
  }
  return result;
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
  const bundle: ExportBundle = {
    type: "mqb-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    config: structuredClone(mqbApp.config()),
    presets: readPresetsFromStorage(),
    envVars: readEnvVarsFromStorage(),
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

export function exportPresetsOnly() {
  const payload = {
    type: "mqb-presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: readPresetsFromStorage(),
    envVars: readEnvVarsFromStorage(),
  };
  triggerJsonDownload(`mqb-presets-${isoDateCompact()}.json`, payload);
}

export function exportPresetsForPublisher(publisherName: string) {
  const allPresets = readPresetsFromStorage();
  const payload = {
    type: "mqb-presets",
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: {
      [publisherName]: Array.isArray(allPresets[publisherName]) ? allPresets[publisherName] : [],
    },
    envVars: readEnvVarsFromStorage(),
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
      method,
      url,
      payload,
      headers,
      group,
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
        method: method.toUpperCase(),
        url: `\${baseUrl}${path}`,
        payload,
        headers: [],
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
        method: "POST",
        url: `\${baseUrl}/${normalizedAddress}`,
        payload,
        headers: [],
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
        method: "POST",
        url: `\${baseUrl}/${channelName.replace(/^\/+/, "")}`,
        payload,
        headers: [],
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
  mqbApp.setConfig(refreshed as Record<string, unknown>);
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
  const currentConfig = mqbApp.config<Record<string, unknown>>();
  const mergedEnvVars = { ...readEnvVarsFromStorage() };
  let mergedPresets = readPresetsFromStorage();
  let importedPresetCount = 0;
  let importedKind = "unknown";

  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (obj.type === "mqb-export" || obj.type === "mqb-presets") {
      importedKind = String(obj.type);
      if (options.includeConfig && obj.config && typeof obj.config === "object") {
        await saveImportedConfig(obj.config as Record<string, unknown>);
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
    writePresetsToStorage(mergedPresets);
    writeEnvVarsToStorage(mergedEnvVars);
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
