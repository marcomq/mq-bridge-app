type ConsumerTab = "definition" | "response" | "messages";
type PublisherTab = "payload" | "headers" | "history" | "definition" | "presets";
import { appWindow, getMqbState, replaceHash } from "./runtime-window";

function switchOrRun(mainTab: "consumers" | "publishers", callback: () => void, fallback?: () => void) {
  if (appWindow().switchMain) {
    fallback?.(); // Refresh view state before switching tabs
    appWindow().switchMain(mainTab);
    return;
  }

  fallback?.();
  callback();
}

export function openConsumerByIndex(
  idx: number,
  tab: ConsumerTab,
  restoreConsumerState: (idx: number, options?: { tab?: ConsumerTab }) => void,
  fallback?: () => void,
) {
  const state = getMqbState();
  state.last_consumer_idx = idx;
  state.last_consumer_tab = tab;
  (appWindow() as any)._mqb_last_consumer_idx = idx;
  (appWindow() as any)._mqb_last_consumer_tab = tab;
  state.pending_consumer_restore = { idx, tab };
  (appWindow() as any)._mqb_pending_consumer_restore = state.pending_consumer_restore;
  replaceHash(`#consumers:${idx}`);
  switchOrRun("consumers", () => restoreConsumerState(idx, { tab }), fallback);
}

export function openPublisherByIndex(
  idx: number,
  tab: PublisherTab,
  restorePublisherState: (idx: number, options?: { tab?: PublisherTab }) => void,
  fallback?: () => void,
) {
  const state = getMqbState();
  state.last_publisher_idx = idx;
  state.last_publisher_tab = tab;
  (appWindow() as any)._mqb_last_publisher_idx = idx;
  (appWindow() as any)._mqb_last_publisher_tab = tab;
  state.pending_publisher_restore = { idx, tab };
  (appWindow() as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
  replaceHash(`#publishers:${idx}`);
  switchOrRun("publishers", () => restorePublisherState(idx, { tab }), fallback);
}
