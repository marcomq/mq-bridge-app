export type HeaderRow = { key: string; value: string; enabled: boolean };
export type HistoryMetadataRow = { k: string; v: string };

export type PublisherPreset = {
  name: string;
  payload: string;
  headers: HeaderRow[];
  group?: string;
  endpoint_type?: string;
  method?: string;
  url?: string;
  request_fields?: Record<string, string>;
};

export type PresetsByPublisher = Record<string, PublisherPreset[]>;
export type EnvVars = Record<string, string>;
export type PublisherHistoryEntry = {
  name: string;
  payload: string;
  headers: HeaderRow[];
  metadata: HistoryMetadataRow[];
  endpoint_type?: string;
  method?: string;
  url?: string;
  request_fields: Record<string, string>;
  requestMetadata: Record<string, string>;
  targetLabel?: string;
  responseData?: unknown;
  ok?: boolean;
  status: number;
  statusText?: string;
  displayStatus?: string;
  displayStatusText?: string;
  status_info?: Record<string, unknown>;
  duration: number;
  time: number;
  pinned?: boolean;
};
export type PublisherHistoryByPublisher = Record<string, PublisherHistoryEntry[]>;
export type PublisherHistoryStore = {
  version: number;
  updated_at: number;
  publishers: PublisherHistoryByPublisher;
};

export type WorkspaceConfig = Record<string, unknown> & {
  presets?: PresetsByPublisher;
  env_vars?: EnvVars;
  history?: PublisherHistoryStore;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sanitizePresets(value: unknown): PresetsByPublisher {
  const result: PresetsByPublisher = {};
  if (!isRecord(value)) return result;

  for (const [publisherName, rows] of Object.entries(value)) {
    if (!Array.isArray(rows)) continue;
    result[publisherName] = rows.map((row, index) => {
      const entry = isRecord(row) ? row : {};
      const headersValue = Array.isArray(entry.headers) ? entry.headers : [];
      const headers = headersValue.map((headerRow) => {
        const header = isRecord(headerRow) ? headerRow : {};
        return {
          key: String(header.key ?? ""),
          value: String(header.value ?? ""),
          enabled: header.enabled !== false,
        };
      });
      const requestFieldsValue = isRecord(entry.request_fields) ? entry.request_fields : {};
      const request_fields = Object.fromEntries(
        Object.entries(requestFieldsValue).map(([key, raw]) => [String(key), String(raw ?? "")]),
      );
      const endpoint_type = entry.endpoint_type ? String(entry.endpoint_type) : undefined;
      const method = entry.method ? String(entry.method).toUpperCase() : undefined;
      const url = entry.url ? String(entry.url) : undefined;
      if (url && !request_fields.url) {
        request_fields.url = url;
      }
      return {
        name: String(entry.name || `Imported preset ${index + 1}`),
        payload: String(entry.payload || ""),
        headers,
        group: entry.group ? String(entry.group) : undefined,
        endpoint_type,
        method,
        url,
        request_fields,
      };
    });
  }

  return result;
}

function sanitizeHeaderRows(value: unknown): HeaderRow[] {
  const headersValue = Array.isArray(value) ? value : [];
  return headersValue.map((headerRow) => {
    const header = isRecord(headerRow) ? headerRow : {};
    return {
      key: String(header.key ?? ""),
      value: String(header.value ?? ""),
      enabled: header.enabled !== false,
    };
  });
}

function sanitizeHistoryMetadataRows(value: unknown): HistoryMetadataRow[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.map((row) => {
    const entry = isRecord(row) ? row : {};
    return {
      k: String(entry.k ?? entry.key ?? ""),
      v: String(entry.v ?? entry.value ?? ""),
    };
  });
}

function sanitizeStringMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!isRecord(value)) return result;
  for (const [key, raw] of Object.entries(value)) {
    result[String(key)] = String(raw ?? "");
  }
  return result;
}

function sanitizeHistoryEntry(value: unknown, fallbackName = "", index = 0): PublisherHistoryEntry {
  const entry = isRecord(value) ? value : {};
  const headers = sanitizeHeaderRows(entry.headers);
  const metadata = sanitizeHistoryMetadataRows(entry.metadata);
  const mergedMetadata = metadata.length > 0
    ? metadata
    : headers.map((header) => ({ k: header.key, v: header.value }));
  const mergedHeaders = headers.length > 0
    ? headers
    : mergedMetadata.map((row) => ({ key: row.k, value: row.v, enabled: true }));
  const request_fields = sanitizeStringMap(entry.request_fields);
  const requestMetadata = sanitizeStringMap(entry.requestMetadata);
  const endpoint_type = entry.endpoint_type ? String(entry.endpoint_type) : undefined;
  const method = entry.method ? String(entry.method).toUpperCase() : undefined;
  const url = entry.url ? String(entry.url) : undefined;
  if (url && !request_fields.url) {
    request_fields.url = url;
  }
  const status = Number.isFinite(entry.status) ? Number(entry.status) : 0;
  const duration = Number.isFinite(entry.duration) ? Number(entry.duration) : 0;
  const time = Number.isFinite(entry.time) ? Number(entry.time) : index;
  const statusInfo = isRecord(entry.status_info)
    ? { ...entry.status_info }
    : {
      ok: entry.ok,
      code: status,
      label: entry.displayStatus || status,
      text: entry.displayStatusText || entry.statusText || "",
    };

  return {
    name: String(entry.name || fallbackName || `History entry ${index + 1}`),
    payload: String(entry.payload || ""),
    headers: mergedHeaders,
    metadata: mergedMetadata,
    endpoint_type,
    method,
    url,
    request_fields,
    requestMetadata,
    targetLabel: entry.targetLabel ? String(entry.targetLabel) : undefined,
    responseData: entry.responseData,
    ok: typeof entry.ok === "boolean" ? entry.ok : undefined,
    status,
    statusText: entry.statusText ? String(entry.statusText) : undefined,
    displayStatus: entry.displayStatus ? String(entry.displayStatus) : undefined,
    displayStatusText: entry.displayStatusText ? String(entry.displayStatusText) : undefined,
    status_info: statusInfo,
    duration,
    time,
    pinned: entry.pinned === true,
  };
}

function sanitizeHistoryPublishers(value: unknown): PublisherHistoryByPublisher {
  const result: PublisherHistoryByPublisher = {};
  if (!isRecord(value)) return result;

  for (const [publisherName, rows] of Object.entries(value)) {
    if (!Array.isArray(rows)) continue;
    result[publisherName] = rows.map((row, index) => sanitizeHistoryEntry(row, publisherName, index));
  }

  return result;
}

export function sanitizePublisherHistory(value: unknown): PublisherHistoryStore {
  if (Array.isArray(value)) {
    const publishers: PublisherHistoryByPublisher = {};
    value.forEach((row, index) => {
      const entry = sanitizeHistoryEntry(row, "", index);
      if (!publishers[entry.name]) {
        publishers[entry.name] = [];
      }
      publishers[entry.name].push(entry);
    });
    return {
      version: 1,
      updated_at: 0,
      publishers,
    };
  }

  const entry = isRecord(value) ? value : {};
  const publishers = entry.publishers
    ? sanitizeHistoryPublishers(entry.publishers)
    : sanitizeHistoryPublishers(entry);
  const version = Number.isFinite(entry.version) ? Number(entry.version) : 1;
  const updated_at = Number.isFinite(entry.updated_at) ? Number(entry.updated_at) : 0;

  return {
    version,
    updated_at,
    publishers,
  };
}

export function sanitizeEnvVars(value: unknown): EnvVars {
  const result: EnvVars = {};
  if (!isRecord(value)) return result;

  for (const [key, raw] of Object.entries(value)) {
    result[String(key)] = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
  }

  return result;
}

export function ensureWorkspaceCollections<T extends WorkspaceConfig>(config: T): T & {
  presets: PresetsByPublisher;
  env_vars: EnvVars;
  history: PublisherHistoryStore;
} {
  config.presets = sanitizePresets(config.presets);
  config.env_vars = sanitizeEnvVars(config.env_vars);
  config.history = sanitizePublisherHistory(config.history);
  return config as T & { presets: PresetsByPublisher; env_vars: EnvVars; history: PublisherHistoryStore };
}
