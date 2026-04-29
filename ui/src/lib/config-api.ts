export async function fetchConfigFromServer<T>(fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl("/config", { cache: "no-store" });
  return response.json() as Promise<T>;
}

export async function postConfig(fetchImpl: typeof fetch, config: unknown): Promise<void> {
  const response = await fetchImpl("/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

export async function saveWholeConfig<T extends object>(
  fetchImpl: typeof fetch,
  currentConfig: T,
): Promise<T> {
  await postConfig(fetchImpl, currentConfig);
  return fetchConfigFromServer<T>(fetchImpl);
}

export async function saveConfigSection<T extends object, K extends keyof T>(
  fetchImpl: typeof fetch,
  sectionName: K,
  sectionValue: T[K],
): Promise<T> {
  const serverConfig = await fetchConfigFromServer<T>(fetchImpl);
  const nextConfig = { ...serverConfig, [sectionName]: sectionValue };
  await postConfig(fetchImpl, nextConfig);
  return fetchConfigFromServer<T>(fetchImpl);
}
