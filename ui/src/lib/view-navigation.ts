type ConsumerTab = "definition" | "response" | "messages";
type PublisherTab = "payload" | "headers" | "history" | "definition" | "presets";
import { getMqbState } from "./runtime-window";

function switchOrRun(mainTab: "routes" | "consumers" | "publishers", callback: () => void, fallback?: () => void) {
  if (window.switchMain) {
    window.switchMain(mainTab);
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
  (window as any)._mqb_pending_route_restore = state.pending_route_restore;
  window.history.replaceState(null, "", `#routes:${routeIdx}`);
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
  (window as any)._mqb_pending_consumer_restore = state.pending_consumer_restore;
  window.history.replaceState(null, "", `#consumers:${idx}`);
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
  (window as any)._mqb_pending_publisher_restore = state.pending_publisher_restore;
  window.history.replaceState(null, "", `#publishers:${idx}`);
  switchOrRun("publishers", () => restorePublisherState(idx, { tab }), fallback);
}
