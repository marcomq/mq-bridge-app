export type NamedEntity = {
  id?: string | null;
  name?: string | null;
};

export function getEntityStorageKey(entity: NamedEntity | null | undefined): string {
  const trimmedId = String(entity?.id || "").trim();
  const trimmedName = String(entity?.name || "").trim();
  return trimmedId !== "" ? trimmedId : trimmedName;
}

export function createLocalEntityId(prefix = "ui"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
