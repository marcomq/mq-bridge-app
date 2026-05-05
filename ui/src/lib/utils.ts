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

  const rawHeaders = (response as { headers?: unknown }).headers;
  const isPlainHeadersObject =
    rawHeaders !== null && typeof rawHeaders === "object" && !Array.isArray(rawHeaders);
  const headers = Object.fromEntries(
    Object.entries(isPlainHeadersObject ? (rawHeaders as Record<string, unknown>) : {})
      .map(([key, value]) => [String(key).trim(), String(value).trim()])
      .filter(([key, value]) => key && value),
  );
  const payload = typeof (response as { payload?: unknown }).payload === "string"
    ? (response as { payload: string }).payload
    : "";

  return Object.keys(headers).length > 0 || payload.trim() ? { headers, payload } : null;
}

export function handleActionKey(event: KeyboardEvent, action: () => void | Promise<void>) {
  // This utility function handles keyboard activation for interactive elements.
  // It prevents the default browser action for 'Enter' or 'Space' keys and then executes the provided action.
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void action(); // Use void to explicitly ignore the Promise return value if the action is async
  }
}
/**
 * Checks if a string contains only printable ASCII characters (32-126).
 * This is a heuristic to guess if a string might represent binary data.
 * @param str The string to check.
 * @returns True if the string contains only printable ASCII characters, false otherwise.
 */
export function isPrintableAscii(str: string): boolean {
  for (let i = 0; i < str.length; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode < 32 || charCode > 126) {
      return false;
    }
  }
  return true;
}

export function toHexString(byteArray: Uint8Array): string {
  return Array.from(byteArray, (byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join(' ');
}

export function fromHexString(hexString: string): Uint8Array {
  const cleanedHexString = hexString.replace(/\s/g, ''); // Remove spaces for parsing
  const bytes = new Uint8Array(cleanedHexString.length / 2);
  for (let i = 0; i < cleanedHexString.length; i += 2) {
    bytes[i / 2] = parseInt(cleanedHexString.substring(i, i + 2), 16);
  }
  return bytes;
}

export function uint8ArrayToString(arr: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(arr);
  } catch (e) {
    // Not valid UTF-8, return empty string or handle as needed
    return "[BINARY DATA]"; // Indicate it's binary data
  }
}

export function stringToUint8ArrayLatin1(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xFF; // Take the lower 8 bits
  }
  return bytes;
}
