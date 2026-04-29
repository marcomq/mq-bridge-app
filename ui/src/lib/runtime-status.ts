import type { RuntimeStatus } from "./types";

export const EMPTY_RUNTIME_STATUS: RuntimeStatus = {
  active_consumers: [],
  active_routes: [],
  route_throughput: {},
};

export function isRuntimeConnected(status: RuntimeStatus): boolean {
  return status.active_consumers.length > 0 || status.active_routes.length > 0;
}

export function runtimeStatusLabel(status: RuntimeStatus): string {
  if (!isRuntimeConnected(status)) {
    return "mq-bridge idle";
  }

  const parts: string[] = [];
  if (status.active_routes.length > 0) {
    parts.push(
      `${status.active_routes.length} active route${status.active_routes.length === 1 ? "" : "s"}`,
    );
  }
  if (status.active_consumers.length > 0) {
    parts.push(
      `${status.active_consumers.length} active consumer${status.active_consumers.length === 1 ? "" : "s"}`,
    );
  }
  return parts.join(" • ");
}

export interface RuntimeStatusPoller {
  poll: () => Promise<RuntimeStatus>;
  start: () => void;
  stop: () => void;
}

interface RuntimeStatusPollerOptions {
  fetchImpl?: typeof fetch;
  endpoint?: string;
  intervalMs?: number;
  onStatus?: (status: RuntimeStatus) => void;
}

export function createRuntimeStatusPoller({
  fetchImpl = fetch,
  endpoint = "/runtime-status",
  intervalMs = 2000,
  onStatus,
}: RuntimeStatusPollerOptions = {}): RuntimeStatusPoller {
  let timer: ReturnType<typeof setInterval> | null = null;

  const publish = (status: RuntimeStatus) => {
    onStatus?.(status);
    return status;
  };

  return {
    async poll() {
      try {
        const response = await fetchImpl(endpoint, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`runtime-status ${response.status}`);
        }

        const status = (await response.json()) as RuntimeStatus;
        return publish(status);
      } catch {
        return publish({ ...EMPTY_RUNTIME_STATUS });
      }
    },
    start() {
      if (timer !== null) return;

      timer = setInterval(() => {
        void this.poll();
      }, intervalMs);
    },
    stop() {
      if (timer === null) return;

      clearInterval(timer);
      timer = null;
    },
  };
}
