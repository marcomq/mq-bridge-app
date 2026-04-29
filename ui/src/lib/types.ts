export type MainTab = "publishers" | "consumers" | "routes" | "config";

export interface RuntimeStatus {
  active_consumers: string[];
  active_routes: string[];
  route_throughput: Record<string, number>;
}
