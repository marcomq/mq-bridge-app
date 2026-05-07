import type { WorkspaceConfig } from "./workspace-config";

export type StorageSecurityInfo = {
  encrypted: boolean;
  persistent: boolean;
  keySource: "none" | "os-key-store" | "ephemeral-process" | "env";
  configEncrypted: boolean;
  messagesEncrypted: boolean;
  messagesPersistent: boolean;
  reason?: "key-store-unavailable" | "key-store-write-failed" | "cli-mode";
  messageKeyHex?: string;
  kid?: string;
};

export const EMPTY_STORAGE_SECURITY: StorageSecurityInfo = {
  encrypted: false,
  persistent: true,
  keySource: "none",
  configEncrypted: false,
  messagesEncrypted: false,
  messagesPersistent: true,
};

export function normalizeStorageSecurityInfo(raw: unknown): StorageSecurityInfo {
  if (!raw || typeof raw !== "object") {
    return { ...EMPTY_STORAGE_SECURITY };
  }

  const value = raw as Record<string, unknown>;
  const keySource = value.keySource ?? value.key_source;
  const reason = value.reason;

  return {
    encrypted: value.encrypted === true,
    persistent: value.persistent !== false,
    keySource:
      keySource === "os-key-store" || keySource === "ephemeral-process" || keySource === "env"
        ? keySource
        : "none",
    configEncrypted: value.configEncrypted === true || value.config_encrypted === true,
    messagesEncrypted: value.messagesEncrypted === true || value.messages_encrypted === true,
    messagesPersistent: value.messagesPersistent === true || value.messages_persistent === true,
    ...(reason === "key-store-unavailable" || reason === "key-store-write-failed" || reason === "cli-mode"
      ? { reason }
      : {}),
    ...(typeof value.messageKeyHex === "string"
      ? { messageKeyHex: value.messageKeyHex }
      : typeof value.message_key_hex === "string"
        ? { messageKeyHex: value.message_key_hex }
        : {}),
    ...(typeof value.kid === "string" ? { kid: value.kid } : {}),
  };
}

export function fallbackStorageSecurity(config: Pick<WorkspaceConfig, "config_security"> | Record<string, unknown>) {
  const mode = String((config as WorkspaceConfig).config_security?.mode || "balanced");
  if (mode === "durable") {
    return {
      ...EMPTY_STORAGE_SECURITY,
      encrypted: true,
      persistent: true,
      keySource: "os-key-store" as const,
      configEncrypted: true,
      messagesEncrypted: true,
      messagesPersistent: true,
    };
  }
  if (mode === "sensitive") {
    return {
      ...EMPTY_STORAGE_SECURITY,
      encrypted: true,
      persistent: false,
      keySource: "ephemeral-process" as const,
      configEncrypted: true,
      messagesEncrypted: true,
      messagesPersistent: false,
    };
  }
  return { ...EMPTY_STORAGE_SECURITY };
}

export function resolveStorageSecurity(
  runtimeInfo: StorageSecurityInfo | null | undefined,
  config: Pick<WorkspaceConfig, "config_security"> | Record<string, unknown>,
) {
  return runtimeInfo ? normalizeStorageSecurityInfo(runtimeInfo) : fallbackStorageSecurity(config);
}

export function hasTemporaryEncryptedMessages(info: StorageSecurityInfo) {
  return info.messagesEncrypted && !info.messagesPersistent && info.keySource === "ephemeral-process";
}

export function hasEncryptedMessages(info: StorageSecurityInfo) {
  return info.messagesEncrypted && typeof info.messageKeyHex === "string" && info.messageKeyHex.length > 0;
}

export function storageSecuritySummary(info: StorageSecurityInfo): string {
  if (info.messagesEncrypted && info.messagesPersistent) {
    return "Messages are encrypted and can be restored after restart using a key stored in the OS key store.";
  }
  if (hasTemporaryEncryptedMessages(info)) {
    return "Messages are encrypted during the current session and cleared after restart.";
  }
  if (info.reason === "key-store-unavailable") {
    return "No OS key store is available. Message history can only be stored temporarily and will be cleared after restart.";
  }
  return "Message history is stored without encryption at rest.";
}

export function storageSecurityDetail(info: StorageSecurityInfo): string {
  if (info.messagesEncrypted) {
    return "Message history is encrypted at rest to avoid leaving readable broker payloads in local browser storage after shutdown. This does not protect against code running inside the app.";
  }
  return "Stored message history and cached payloads remain readable on disk after shutdown in this mode.";
}
