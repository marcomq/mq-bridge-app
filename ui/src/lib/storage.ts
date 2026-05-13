export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getBrowserStorage(): Storage | null {
  try {
    return typeof globalThis !== "undefined" && "localStorage" in globalThis
      ? globalThis.localStorage
      : null;
  } catch {
    return null;
  }
}

export const localStorageBackend: StorageBackend = {
  getItem: (key) => getBrowserStorage()?.getItem(key) ?? null,
  setItem: (key, value) => {
    getBrowserStorage()?.setItem(key, value);
  },
  removeItem: (key) => {
    getBrowserStorage()?.removeItem(key);
  },
};

let activeBackend: StorageBackend = localStorageBackend;

export function setStorageBackend(backend: StorageBackend): void {
  activeBackend = backend;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = activeBackend.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function writeJson<T>(key: string, value: T): void {
  activeBackend.setItem(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  activeBackend.removeItem(key);
}
