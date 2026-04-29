type ConsumerTab = "definition" | "response" | "messages";
type PublisherTab = "payload" | "headers" | "history" | "definition";

function switchOrRun(mainTab: "routes" | "consumers" | "publishers", callback: () => void, fallback?: () => void) {
  if (window.switchMain) {
    window.switchMain(mainTab);
    window.setTimeout(callback, 0);
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

  window._mqb_pending_route_restore = { idx: routeIdx };
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
  window._mqb_pending_consumer_restore = { idx, tab };
  window.history.replaceState(null, "", `#consumers:${idx}`);
  switchOrRun("consumers", () => restoreConsumerState(idx, { tab }), fallback);
}

export function openPublisherByIndex(
  idx: number,
  tab: PublisherTab,
  restorePublisherState: (idx: number, options?: { tab?: PublisherTab }) => void,
  fallback?: () => void,
) {
  window._mqb_pending_publisher_restore = { idx, tab };
  window.history.replaceState(null, "", `#publishers:${idx}`);
  switchOrRun("publishers", () => restorePublisherState(idx, { tab }), fallback);
}
