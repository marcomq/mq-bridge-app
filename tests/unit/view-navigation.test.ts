// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { openConsumerByIndex, openPublisherByIndex } from "../../ui/src/lib/view-navigation";

describe("view-navigation", () => {
  it("runs fallback when switchMain is unavailable", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const restorePublisherState = vi.fn();
    const fallback = vi.fn();

    window.switchMain = undefined as any;
    openPublisherByIndex(2, "definition", restorePublisherState, fallback);

    expect(window._mqb_pending_publisher_restore).toEqual({ idx: 2, tab: "definition" });
    expect(window._mqb_last_publisher_idx).toBe(2);
    expect(window._mqb_last_publisher_tab).toBe("definition");
    expect(replaceState).toHaveBeenCalledWith(null, "", "#publishers:2");
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(restorePublisherState).toHaveBeenCalledWith(2, { tab: "definition" });

    replaceState.mockRestore();
  });
  it("opens consumer and writes pending state", () => {
    const replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    const restoreConsumerState = vi.fn();
    const switchMain = vi.fn();

    window.switchMain = switchMain;
    openConsumerByIndex(4, "messages", restoreConsumerState);

    expect(window._mqb_pending_consumer_restore).toEqual({ idx: 4, tab: "messages" });
    expect(window._mqb_last_consumer_idx).toBe(4);
    expect(window._mqb_last_consumer_tab).toBe("messages");
    expect(replaceState).toHaveBeenCalledWith(null, "", "#consumers:4");
    expect(switchMain).toHaveBeenCalledWith("consumers");
    expect(restoreConsumerState).not.toHaveBeenCalled();

    replaceState.mockRestore();
  });
});
