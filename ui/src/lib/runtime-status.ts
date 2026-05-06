export type MainTab = "publishers" | "consumers" | "config";

export interface RuntimeConsumerState {
  running: boolean;
  status: {
    healthy: boolean;
    error?: string;
  };
  message_sequence: number;
  capture_enabled: boolean;
  capture_keep_last: number;
}

export interface RuntimeStatus {
  active_consumers: string[];
  active_routes: string[];
  route_throughput: Record<string, number>;
  consumers: Record<string, RuntimeConsumerState>;
}

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

  const pickRuntimeStatusShape = (raw: unknown): Record<string, unknown> => {
    if (!raw || typeof raw !== "object") return {};
    const obj = raw as Record<string, unknown>;

    // direct payload
    if (Array.isArray(obj.active_consumers) || Array.isArray(obj.active_routes)) return obj;
    if (Array.isArray(obj.activeConsumers) || Array.isArray(obj.activeRoutes)) return obj;

    // enum/wrapper payload variants seen in different UI transport layers
    const wrapped =
      obj.RuntimeStatus ||
      obj.runtime_status ||
      obj.payload ||
      obj.status ||
      null;
    if (wrapped && typeof wrapped === "object") {
      return wrapped as Record<string, unknown>;
    }

    return obj;
  };

  const normalizeStatus = (rawStatus: unknown): RuntimeStatus => {
    const status = pickRuntimeStatusShape(rawStatus);
    const activeConsumersRaw = status.active_consumers ?? status.activeConsumers;
    const activeRoutesRaw = status.active_routes ?? status.activeRoutes;
    const throughputRaw = status.route_throughput ?? status.routeThroughput;
    const consumersRaw = status.consumers ?? status.consumer_statuses ?? status.consumerStatuses;

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
                  ...(typeof rawStatus.error === "string" && rawStatus.error ? { error: rawStatus.error } : {}),
                },
                message_sequence:
                  typeof rawConsumer.message_sequence === "number"
                    ? rawConsumer.message_sequence
                    : typeof rawConsumer.messageSequence === "number"
                      ? rawConsumer.messageSequence
                      : 0,
                capture_enabled:
                  typeof rawConsumer.capture_enabled === "boolean"
                    ? rawConsumer.capture_enabled
                    : typeof rawConsumer.captureEnabled === "boolean"
                      ? rawConsumer.captureEnabled
                      : true,
                capture_keep_last:
                  typeof rawConsumer.capture_keep_last === "number"
                    ? rawConsumer.capture_keep_last
                    : typeof rawConsumer.captureKeepLast === "number"
                      ? rawConsumer.captureKeepLast
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
