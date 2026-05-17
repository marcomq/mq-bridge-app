import type {
  ConsumerStatusSnapshot,
  RuntimeStatusResponse,
} from "./generated/ui-types";

export type MainTab = "publishers" | "consumers" | "config";

export type RuntimeConsumerState = ConsumerStatusSnapshot;
export type RuntimeStatus = RuntimeStatusResponse;

export const EMPTY_RUNTIME_STATUS: RuntimeStatus = {
  active_consumers: [],
  active_routes: [],
  route_throughput: {},
  consumers: {},
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
  intervalMs = 1000,
  onStatus,
}: RuntimeStatusPollerOptions = {}): RuntimeStatusPoller {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  const normalizeStatus = (rawStatus: unknown): RuntimeStatus => {
    const status = rawStatus && typeof rawStatus === "object"
      ? rawStatus as Record<string, unknown>
      : {};
    const activeConsumersRaw = status.active_consumers;
    const activeRoutesRaw = status.active_routes;
    const throughputRaw = status.route_throughput;
    const consumersRaw = status.consumers;

    const consumers = consumersRaw && typeof consumersRaw === "object"
      ? Object.fromEntries(
          Object.entries(consumersRaw as Record<string, unknown>).map(([name, value]) => {
            const rawConsumer = value && typeof value === "object"
              ? (value as Record<string, unknown>)
              : {};
            const rawStatus = rawConsumer.status && typeof rawConsumer.status === "object"
              ? (rawConsumer.status as Record<string, unknown>)
              : {};

            return [
              String(name),
              {
                running: Boolean(rawConsumer.running),
                status: {
                  healthy: Boolean(rawStatus.healthy),
                  target: typeof rawStatus.target === "string" ? rawStatus.target : String(name),
                  pending: typeof rawStatus.pending === "number" ? rawStatus.pending : null,
                  capacity: typeof rawStatus.capacity === "number" ? rawStatus.capacity : null,
                  ...(typeof rawStatus.error === "string" && rawStatus.error ? { error: rawStatus.error } : {}),
                  details: rawStatus.details ?? null,
                },
                throughput: typeof rawConsumer.throughput === "number" ? rawConsumer.throughput : 0,
                message_sequence:
                  typeof rawConsumer.message_sequence === "number"
                    ? rawConsumer.message_sequence
                    : 0,
                capture_enabled:
                  typeof rawConsumer.capture_enabled === "boolean"
                    ? rawConsumer.capture_enabled
                    : true,
                capture_keep_last:
                  typeof rawConsumer.capture_keep_last === "number"
                    ? rawConsumer.capture_keep_last
                    : 100,
              } satisfies RuntimeConsumerState,
            ];
          }),
        )
      : {};

    return {
      active_consumers: Array.isArray(activeConsumersRaw)
        ? activeConsumersRaw.map((value) => String(value))
        : [],
      active_routes: Array.isArray(activeRoutesRaw)
        ? activeRoutesRaw.map((value) => String(value))
        : [],
      route_throughput:
        throughputRaw && typeof throughputRaw === "object"
          ? (throughputRaw as Record<string, number>)
          : {},
      consumers,
    };
  };

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

        return publish(normalizeStatus(await response.json()));
      } catch {
        return publish({ ...EMPTY_RUNTIME_STATUS });
      }
    },
    start() {
      if (timer !== null) return;

      timer = setInterval(() => {
        if (inFlight) return;
        inFlight = true;
        void this.poll().finally(() => {
          inFlight = false;
        });
      }, intervalMs);
    },
    stop() {
      if (timer === null) return;

      clearInterval(timer);
      timer = null;
    },
  };
}
