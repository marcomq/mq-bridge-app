export type NamedEntity = {
  id?: string | null;
  name?: string | null;
};

export function getEntityStorageKey(entity: NamedEntity | null | undefined): string {
  const trimmedId = String(entity?.id || "").trim();
  const trimmedName = String(entity?.name || "").trim();
  return trimmedId !== "" ? trimmedId : trimmedName;
}
