export type HeaderRow = { key: string; value: string; enabled: boolean };

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

export type WorkspaceConfig = Record<string, unknown> & {
  presets?: PresetsByPublisher;
  env_vars?: EnvVars;
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
} {
  config.presets = sanitizePresets(config.presets);
  config.env_vars = sanitizeEnvVars(config.env_vars);
  return config as T & { presets: PresetsByPublisher; env_vars: EnvVars };
}
