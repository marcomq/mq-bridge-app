export type MainTab = "publishers" | "consumers" | "routes" | "config";

export interface RuntimeStatus {
  active_consumers: string[];
  active_routes: string[];
  route_throughput: Record<string, number>;
}

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
    };
  };

  const detectRunningConsumers = async (): Promise<string[]> => {
    try {
      let consumers: Array<{ name?: string }> = [];

      const configResponse = await fetchImpl("/config", { cache: "no-store" });
      if (configResponse.ok) {
        const config = (await configResponse.json()) as { consumers?: Array<{ name?: string }> };
        consumers = Array.isArray(config?.consumers) ? config.consumers : [];
      }

      if (consumers.length === 0) {
        const runtimeConfig = (window as unknown as { appConfig?: { consumers?: Array<{ name?: string }> } }).appConfig;
        consumers = Array.isArray(runtimeConfig?.consumers) ? runtimeConfig.consumers : [];
      }
      if (consumers.length === 0) return [];

      const checks = await Promise.all(
        consumers
          .map((consumer) => String(consumer?.name || "").trim())
          .filter((name) => name.length > 0)
          .map(async (name) => {
            try {
              const response = await fetchImpl(`/consumer-status?consumer=${encodeURIComponent(name)}`, {
                cache: "no-store",
              });
              if (!response.ok) return null;
              const payload = (await response.json()) as { running?: boolean };
              return payload?.running ? name : null;
            } catch {
              return null;
            }
          }),
      );

      return checks.filter((name): name is string => Boolean(name));
    } catch {
      return [];
    }
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

        const status = normalizeStatus(await response.json());
        if (status.active_consumers.length === 0 && status.active_routes.length === 0) {
          const fallbackConsumers = await detectRunningConsumers();
          if (fallbackConsumers.length > 0) {
            status.active_consumers = fallbackConsumers;
          }
        }
        return publish(status);
      } catch {
        const fallbackConsumers = await detectRunningConsumers();
        if (fallbackConsumers.length > 0) {
          return publish({
            active_consumers: fallbackConsumers,
            active_routes: [],
            route_throughput: {},
          });
        }
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
