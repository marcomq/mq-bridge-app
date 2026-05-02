// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";

const runtimeStatusStoreSet = vi.fn();
const activeMainTabSet = vi.fn();

let capturedOnStatus: ((status: any) => void) | null = null;

const runtimeState = {
  runtime_status: {
    active_consumers: [],
    active_routes: [],
    route_throughput: {},
    consumers: {},
  },
  dirty_sections: {},
  saved_sections: {},
};

vi.mock("../../ui/src/lib/stores", () => ({
  activeMainTab: { set: activeMainTabSet },
  runtimeStatusStore: { set: runtimeStatusStoreSet },
}));

vi.mock("../../ui/src/lib/runtime-status", () => ({
  EMPTY_RUNTIME_STATUS: {
    active_consumers: [],
    active_routes: [],
    route_throughput: {},
    consumers: {},
  },
  createRuntimeStatusPoller: (options: { onStatus?: (status: any) => void }) => {
    capturedOnStatus = options.onStatus || null;
    return {
      poll: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  },
}));

vi.mock("../../ui/src/lib/runtime-window", () => ({
  appWindow: () => window as any,
  clearLegacyPendingRestoreGlobals: vi.fn(),
  currentHash: () => "#publishers",
  getMqbState: () => {
    const w = window as any;
    if (w._mqb_runtime_status !== undefined) {
      runtimeState.runtime_status = w._mqb_runtime_status;
    }
    w._mqb_runtime_status = runtimeState.runtime_status;
    return runtimeState;
  },
  mqbApp: {
    config: vi.fn(() => ({})),
    schema: vi.fn(() => ({})),
    setConfig: vi.fn(),
    setSchema: vi.fn(),
    isDesktop: vi.fn(() => false),
    init: {
      routes: vi.fn(),
      consumers: vi.fn(),
      publishers: vi.fn(),
    },
  },
  mqbDialogs: {
    alert: vi.fn(),
    confirm: vi.fn(),
    prompt: vi.fn(),
    choose: vi.fn(),
  },
  onHashChange: vi.fn(),
  replaceHash: vi.fn(),
}));

vi.mock("../../ui/src/lib/dirty-state", () => ({
  createDirtyTracker: vi.fn(() => ["publishers", { buttonId: "pub-save", getValue: () => ({}), baseline: "{}" }]),
  cloneSectionState: vi.fn((v) => v),
  isDirty: vi.fn(() => false),
}));
vi.mock("../../ui/src/lib/config-api", () => ({
  saveWholeConfig: vi.fn(),
  saveConfigSection: vi.fn(),
  fetchConfigFromServer: vi.fn(),
}));
vi.mock("../../ui/src/lib/consumers-view", () => ({ initConsumers: vi.fn(), restoreConsumerStateFromView: vi.fn() }));
vi.mock("../../ui/src/lib/publishers-view", () => ({ initPublishers: vi.fn(), restorePublisherStateFromView: vi.fn() }));
vi.mock("../../ui/src/lib/routes-view", () => ({ initRoutes: vi.fn(), restoreRouteStateFromView: vi.fn() }));
vi.mock("../../ui/src/lib/settings", () => ({ initSettings: vi.fn() }));
vi.mock("../../ui/src/lib/dialogs", () => ({ installDialogs: vi.fn() }));
vi.mock("../../ui/src/lib/routing", () => ({
  nextHashForTab: vi.fn(() => "#publishers"),
  pickDefaultTab: vi.fn(() => "publishers"),
  resolveTabFromHash: vi.fn(() => "publishers"),
}));

describe("bootstrap runtime status sync", () => {
  beforeEach(async () => {
    vi.resetModules();
    runtimeStatusStoreSet.mockReset();
    activeMainTabSet.mockReset();
    capturedOnStatus = null;
    runtimeState.runtime_status = {
      active_consumers: [],
      active_routes: [],
      route_throughput: {},
      consumers: {},
    };
    (window as any)._mqb_runtime_status = {
      active_consumers: [],
      active_routes: [],
      route_throughput: {},
      consumers: {},
    };

    await import("../../ui/src/bootstrap");
  });

  test("publishes the fresh polled status even when legacy global is stale", () => {
    const nextStatus = {
      active_consumers: ["memory_consumer", "http222"],
      active_routes: [],
      route_throughput: {},
      consumers: {},
    };
    expect(capturedOnStatus).toBeTypeOf("function");

    capturedOnStatus?.(nextStatus);

    expect((window as any)._mqb_runtime_status).toEqual(nextStatus);
    expect(runtimeStatusStoreSet).toHaveBeenLastCalledWith(nextStatus);
  });
});
