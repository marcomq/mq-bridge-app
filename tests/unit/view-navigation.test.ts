// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { openConsumerByIndex, openPublisherByIndex, openRouteByName } from "../../ui/src/lib/view-navigation";

describe("view-navigation", () => {
  it("opens route by name and schedules restore via switchMain", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const restoreRouteState = vi.fn();
    const switchMain = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 1 as any;
    });

    window.switchMain = switchMain;
    const didOpen = openRouteByName({ alpha: {}, beta: {} }, "beta", restoreRouteState);

    expect(didOpen).toBe(true);
    expect(window._mqb_pending_route_restore).toEqual({ idx: 1 });
    expect(replaceState).toHaveBeenCalledWith(null, "", "#routes:1");
    expect(switchMain).toHaveBeenCalledWith("routes");
    expect(restoreRouteState).toHaveBeenCalledWith(1);

    setTimeoutSpy.mockRestore();
    replaceState.mockRestore();
  });

  it("runs fallback when switchMain is unavailable", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const restorePublisherState = vi.fn();
    const fallback = vi.fn();

    window.switchMain = undefined as any;
    openPublisherByIndex(2, "definition", restorePublisherState, fallback);

    expect(window._mqb_pending_publisher_restore).toEqual({ idx: 2, tab: "definition" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "#publishers:2");
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(restorePublisherState).toHaveBeenCalledWith(2, { tab: "definition" });

    replaceState.mockRestore();
  });

  it("returns false when route does not exist", () => {
    const restoreRouteState = vi.fn();
    const didOpen = openRouteByName({ alpha: {} }, "missing", restoreRouteState);
    expect(didOpen).toBe(false);
    expect(restoreRouteState).not.toHaveBeenCalled();
  });

  it("opens consumer and writes pending state", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const restoreConsumerState = vi.fn();
    const switchMain = vi.fn();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation((fn: any) => {
      fn();
      return 1 as any;
    });

    window.switchMain = switchMain;
    openConsumerByIndex(4, "messages", restoreConsumerState);

    expect(window._mqb_pending_consumer_restore).toEqual({ idx: 4, tab: "messages" });
    expect(replaceState).toHaveBeenCalledWith(null, "", "#consumers:4");
    expect(switchMain).toHaveBeenCalledWith("consumers");
    expect(restoreConsumerState).toHaveBeenCalledWith(4, { tab: "messages" });

    setTimeoutSpy.mockRestore();
    replaceState.mockRestore();
  });
});
