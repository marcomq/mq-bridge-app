type ConsumerTab = "definition" | "response" | "messages";
type PublisherTab = "payload" | "headers" | "history" | "definition" | "presets";
import { appWindow, getMqbState, replaceHash } from "./runtime-window";

function switchOrRun(mainTab: "routes" | "consumers" | "publishers", callback: () => void, fallback?: () => void) {
  if (appWindow().switchMain) {
    fallback?.(); // Refresh view state before switching tabs
    appWindow().switchMain(mainTab);
    return;
  }

  fallback?.();
  callback();
}

export function openRouteByName(
  routes: Record<string, unknown> | undefined,
  routeName: string,
  restoreRouteState: (idx: number) => void,
  fallback?: () => void,
): boolean {
  const routeIdx = Object.keys(routes || {}).indexOf(routeName);
  if (routeIdx === -1) return false;

  const state = getMqbState();
  state.pending_route_restore = { idx: routeIdx };
  (appWindow() as any)._mqb_pending_route_restore = state.pending_route_restore;
  replaceHash(`#routes:${routeIdx}`);
  switchOrRun("routes", () => restoreRouteState(routeIdx), fallback);
  return true;
}

export function openConsumerByIndex(
  idx: number,
  tab: ConsumerTab,
  restoreConsumerState: (idx: number, options?: { tab?: ConsumerTab }) => void,
  fallback?: () => void,
) {
  const state = getMqbState();
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
  state.pending_publisher_restore = { idx, tab };
  (appWindow() as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
  replaceHash(`#publishers:${idx}`);
  switchOrRun("publishers", () => restorePublisherState(idx, { tab }), fallback);
}
