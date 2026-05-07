import { describe, expect, test } from "vitest";
import {
  fallbackStorageSecurity,
  normalizeStorageSecurityInfo,
  storageModeOptions,
  storageModeOptionsSummary,
} from "../../ui/src/lib/storage-security";

describe("storage-security", () => {
  test("shows only cli-relevant storage modes", () => {
    const options = storageModeOptions(
      normalizeStorageSecurityInfo({
        target: "cli",
        key_source: "env",
        encrypted: false,
        persistent: true,
        config_encrypted: false,
        messages_encrypted: false,
        messages_persistent: true,
      }),
    );

    expect(options.map((option) => option.value)).toEqual([
      "unencrypted",
      "balanced",
      "env_temporary_messages",
    ]);
  });

  test("shows desktop fallback modes when no key store is available", () => {
    const info = normalizeStorageSecurityInfo({
      target: "desktop",
      key_source: "ephemeral-process",
      key_store_available: false,
      encrypted_config_available: false,
      persistent_messages_available: false,
      encrypted: true,
      persistent: false,
      config_encrypted: false,
      messages_encrypted: true,
      messages_persistent: false,
      reason: "key-store-unavailable",
    });

    expect(storageModeOptions(info).map((option) => option.value)).toEqual([
      "unencrypted",
      "temporary_messages",
    ]);
    expect(storageModeOptionsSummary(info)).toContain(
      "Persistent encrypted config and persistent encrypted history are unavailable because no OS key store is available.",
    );
  });

  test("marks durable mode unavailable when desktop persistent history is not available", () => {
    const options = storageModeOptions(
      normalizeStorageSecurityInfo({
        target: "desktop",
        key_source: "os-key-store",
        key_store_available: true,
        encrypted_config_available: true,
        persistent_messages_available: false,
        encrypted: false,
        persistent: true,
        config_encrypted: false,
        messages_encrypted: false,
        messages_persistent: true,
      }),
    );

    expect(options.find((option) => option.value === "durable")).toEqual(
      expect.objectContaining({
        available: false,
      }),
    );
  });

  test("falls back to temporary encrypted message handling for temporary modes", () => {
    expect(
      fallbackStorageSecurity({
        config_security: { mode: "env_temporary_messages" },
      }),
    ).toEqual(
      expect.objectContaining({
        encrypted: true,
        persistent: false,
        configEncrypted: false,
        messagesEncrypted: true,
        messagesPersistent: false,
        keySource: "ephemeral-process",
      }),
    );

    expect(
      fallbackStorageSecurity({
        config_security: { mode: "temporary_messages" },
      }),
    ).toEqual(
      expect.objectContaining({
        encrypted: true,
        persistent: false,
        configEncrypted: false,
        messagesEncrypted: true,
        messagesPersistent: false,
        keySource: "ephemeral-process",
      }),
    );
  });
});
