import { nextUniqueName } from "./routes";

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function sanitizeConsumerName(name: string): string {
  const asciiName = String(name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const normalized = asciiName
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\-.]+|[_\-.]+$/g, "");
  return normalized || "consumer";
}

export function normalizeConsumerNames<T extends { name: string }>(consumers: T[], selectedIndex: number | null = null) {
  const usedNames = new Set<string>();
  let changed = false;

  for (const consumer of consumers) {
    const nextName = nextUniqueName(sanitizeConsumerName(consumer.name), usedNames);
    if (consumer.name !== nextName) {
      consumer.name = nextName;
      changed = true;
    }
    usedNames.add(nextName);
  }

  return {
    changed,
    selectedName: selectedIndex === null ? null : consumers[selectedIndex]?.name || null,
  };
}

export function normalizeConsumerResponse(response: unknown): { headers: Record<string, string>; payload: string } | null {
  if (!response || typeof response !== "object") return null;

  const headers = Object.fromEntries(
    Object.entries((response as { headers?: Record<string, unknown> }).headers || {})
      .map(([key, value]) => [String(key).trim(), String(value).trim()])
      .filter(([key, value]) => key && value),
  );
  const payload = typeof (response as { payload?: unknown }).payload === "string"
    ? (response as { payload: string }).payload
    : "";

  return Object.keys(headers).length > 0 || payload.trim() ? { headers, payload } : null;
}
