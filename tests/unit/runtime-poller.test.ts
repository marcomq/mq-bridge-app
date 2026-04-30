import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createRuntimeStatusPoller, EMPTY_RUNTIME_STATUS } from "../../ui/src/lib/runtime-status";

describe("runtime-poller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("publishes fetched status", async () => {
    const onStatus = vi.fn();
    const poller = createRuntimeStatusPoller({
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          active_consumers: ["consumer-a"],
          active_routes: ["route-a"],
          route_throughput: { "route-a": 5 },
        }),
      }) as unknown as typeof fetch,
      onStatus,
    });

    await expect(poller.poll()).resolves.toEqual({
      active_consumers: ["consumer-a"],
      active_routes: ["route-a"],
      route_throughput: { "route-a": 5 },
    });
    expect(onStatus).toHaveBeenCalledWith({
      active_consumers: ["consumer-a"],
      active_routes: ["route-a"],
      route_throughput: { "route-a": 5 },
    });
  });

  test("falls back to empty status when request fails", async () => {
    const onStatus = vi.fn();
    const poller = createRuntimeStatusPoller({
      fetchImpl: vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch,
      onStatus,
    });

    await expect(poller.poll()).resolves.toEqual(EMPTY_RUNTIME_STATUS);
    expect(onStatus).toHaveBeenCalledWith(EMPTY_RUNTIME_STATUS);
  });

  test("starts one interval and stops it cleanly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        active_consumers: [],
        active_routes: ["route-a"],
        route_throughput: {},
      }),
    });
    const poller = createRuntimeStatusPoller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      intervalMs: 2000,
    });

    poller.start();
    poller.start();

    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
    await vi.advanceTimersByTimeAsync(4000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test("detects running consumers when runtime-status is empty", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async (url: string) => {
        if (url === "/runtime-status") {
          return { ok: true, json: async () => EMPTY_RUNTIME_STATUS };
        }
        if (url === "/config") {
          return { ok: true, json: async () => ({ consumers: [{ name: "c1" }, { name: "c2" }] }) };
        }
        if (url.startsWith("/consumer-status?consumer=c1")) {
          return { ok: true, json: async () => ({ running: true }) };
        }
        if (url.startsWith("/consumer-status?consumer=c2")) {
          return { ok: true, json: async () => ({ running: false }) };
        }
        return { ok: false, json: async () => ({}) };
      });

    const onStatus = vi.fn();
    const poller = createRuntimeStatusPoller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      onStatus,
    });

    const status = await poller.poll();
    expect(status.active_consumers).toEqual(["c1"]);
    expect(onStatus).toHaveBeenCalledWith({
      active_consumers: ["c1"],
      active_routes: [],
      route_throughput: {},
    });
  });

  test("handles wrapped runtime status payload shape", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        RuntimeStatus: {
          active_consumers: ["c1", "c2"],
          active_routes: [],
          route_throughput: {},
        },
      }),
    });

    const poller = createRuntimeStatusPoller({
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const status = await poller.poll();
    expect(status).toEqual({
      active_consumers: ["c1", "c2"],
      active_routes: [],
      route_throughput: {},
    });
  });
});
