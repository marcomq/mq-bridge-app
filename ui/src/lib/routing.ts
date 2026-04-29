import type { MainTab } from "./types";

export function resolveTabFromHash(hash: string): MainTab | null {
  if (!hash) return null;
  if (hash === "#publishers" || hash.startsWith("#publishers:")) return "publishers";
  if (hash === "#consumers" || hash.startsWith("#consumers:")) return "consumers";
  if (hash === "#routes" || hash.startsWith("#routes:")) return "routes";
  if (hash === "#config") return "config";
  return null;
}

export function nextHashForTab(currentHash: string, tab: MainTab): string {
  return currentHash === `#${tab}` || currentHash.startsWith(`#${tab}:`)
    ? currentHash
    : `#${tab}`;
}

export function pickDefaultTab(
  hash: string,
  activeRoutes: string[],
  configuredDefault: unknown,
): MainTab {
  const hashTab = resolveTabFromHash(hash);
  if (hashTab) return hashTab;
  if (activeRoutes.length > 0) return "routes";
  if (
    configuredDefault === "publishers" ||
    configuredDefault === "consumers" ||
    configuredDefault === "routes" ||
    configuredDefault === "config"
  ) {
    return configuredDefault;
  }
  return "publishers";
}
