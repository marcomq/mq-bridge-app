// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  localStorageBackend,
  readJson,
  removeKey,
  setStorageBackend,
  writeJson,
  type StorageBackend,
} from "../../ui/src/lib/storage";

describe("storage helpers", () => {
  afterEach(() => {
    setStorageBackend(localStorageBackend);
  });

  test("reads writes and removes json through the active backend", () => {
    const data = new Map<string, string>();
    const backend: StorageBackend = {
      getItem: vi.fn((key: string) => data.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        data.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        data.delete(key);
      }),
    };

    setStorageBackend(backend);
    writeJson("alpha", { ok: true, count: 2 });
    expect(readJson("alpha", null)).toEqual({ ok: true, count: 2 });

    removeKey("alpha");
    expect(readJson("alpha", { fallback: true })).toEqual({ fallback: true });
    expect(backend.setItem).toHaveBeenCalledOnce();
    expect(backend.removeItem).toHaveBeenCalledWith("alpha");
  });

  test("falls back on invalid json", () => {
    const backend: StorageBackend = {
      getItem: vi.fn(() => "{not-json"),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };

    setStorageBackend(backend);
    expect(readJson("broken", { safe: true })).toEqual({ safe: true });
  });
});
