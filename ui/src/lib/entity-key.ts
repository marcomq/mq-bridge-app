export type NamedEntity = {
  id?: string | null;
  name?: string | null;
};

export function getEntityStorageKey(entity: NamedEntity | null | undefined): string {
  return String(entity?.id || entity?.name || "").trim();
}
