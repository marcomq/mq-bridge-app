interface DesktopSecretEntry {
  key?: string;
  extracted?: boolean;
  stored?: boolean;
  error?: string;
}
import { cloneSectionState } from "./dirty-state";
import { appWindow, getMqbState, mqbApp, mqbDialogs, mqbRuntime } from "./runtime-window";
import { storageSecurityDetail, storageSecuritySummary } from "./storage-security";

interface DesktopSecretSummary {
  routes?: Record<string, DesktopSecretEntry[]>;
  consumers?: Record<string, DesktopSecretEntry[]>;
  publishers?: Record<string, DesktopSecretEntry[]>;
}

const SETTINGS_KEYS = [
  "default_tab",
  "log_level",
  "logger",
  "ui_addr",
  "metrics_addr",
  "config_security",
  "env_vars",
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];

function cloneSchema<T>(schema: T): T {
  return JSON.parse(JSON.stringify(schema)) as T;
}

function filterObjectKeys<T extends Record<string, unknown>>(value: T, keys: readonly SettingsKey[]) {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = value[key];
    }
  }
  return result;
}

export function buildSettingsSchema(schema: Record<string, unknown>) {
  const cloned = cloneSchema(schema);
  const properties = filterObjectKeys(
    ((cloned?.properties as Record<string, unknown> | undefined) || {}) as Record<string, unknown>,
    SETTINGS_KEYS,
  );
  return {
    ...cloned,
    properties,
    required: Array.isArray(cloned?.required)
      ? cloned.required.filter((key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(properties, key))
      : [],
  };
}

export function extractSettingsConfig(config: Record<string, unknown>) {
  return filterObjectKeys(config, SETTINGS_KEYS);
}

function mergeSettingsConfig(target: Record<string, unknown>, settingsConfig: Record<string, unknown>) {
  for (const key of SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(settingsConfig, key)) {
      target[key] = settingsConfig[key];
    }
  }
}

function createActionButton(
  label: string,
  id: string,
  variant: "neutral" | "danger",
) {
  const button = mqbApp.forms().h("wa-button", { id }, label) as HTMLElement & {
    setAttribute: (name: string, value: string) => void;
    onclick?: (event: Event) => void | Promise<void>;
  };
  button.setAttribute("variant", variant);
  button.setAttribute("appearance", "outlined");
  button.setAttribute("size", "small");
  return button;
}

function renderStorageSecurityNotice() {
  const formActions = document.getElementById("form-actions");
  const state = getMqbState();
  const info = state.storage_security;
  if (!formActions || !info) return;

  let notice = document.getElementById("js-storage-security-note");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "js-storage-security-note";
    notice.className = "storage-security-note";
    formActions.parentElement?.insertBefore(notice, formActions);
  }

  notice.textContent = `${storageSecuritySummary(info)} ${storageSecurityDetail(info)}`;
}

export function formatDesktopSecretsSummary(summary: DesktopSecretSummary): string {
  const groups: Array<[string, Record<string, DesktopSecretEntry[]>]> = [
    ["Routes", summary.routes || {}],
    ["Consumers", summary.consumers || {}],
    ["Publishers", summary.publishers || {}],
  ];

  const lines: string[] = [];
  for (const [label, entries] of groups) {
    const names = Object.keys(entries).sort();
    if (names.length === 0) {
      continue;
    }

    lines.push(`${label}:`);
    for (const name of names) {
      const items = entries[name] || [];
      const extracted = items.filter((item) => item.extracted).length;
      const stored = items.filter((item) => item.stored).length;
      const total = items.length;

      lines.push(`- ${name}: ${extracted}/${total} extracted, ${stored}/${total} stored`);

      const errors = items
        .filter((item) => item.error)
        .map((item) => `${item.key}: ${item.error}`);
      errors.forEach((message) => lines.push(`  ${message}`));
    }
  }

  return lines.length > 0
    ? lines.join("\n")
    : "The current desktop config does not reference any extracted secrets.";
}

export async function initSettings(config: Record<string, unknown>, schema: Record<string, unknown>) {
  const lib = mqbApp.forms();
  const container = document.getElementById("form-container");
  if (!container) {
    return;
  }

  const settingsSchema = buildSettingsSchema(schema);
  let settingsConfig = extractSettingsConfig(config);
  const state = getMqbState();
  state.saved_sections.config = cloneSectionState(settingsConfig);

  mqbRuntime.registerDirtySection("config", {
    buttonId: "js-submit",
    getValue: () => settingsConfig,
  });

  state.form_mode = "settings";
  (window as any)._mqb_form_mode = "settings";
  await lib.init(container, settingsSchema, settingsConfig);
  renderStorageSecurityNotice();

  const formActions = document.getElementById("form-actions");
  if (formActions) {
    formActions.style.display = "flex";
  }

  const submitButton = document.getElementById("js-submit") as (HTMLElement & {
    onclick?: (event: Event) => void | Promise<void>;
  }) | null;
  if (submitButton) {
    submitButton.onclick = async (event) => {
      const currentTarget = event.currentTarget as HTMLElement | null;
      const appConfig = mqbApp.config<Record<string, unknown>>();
      mergeSettingsConfig(appConfig, settingsConfig);
      const saved = await appWindow().saveConfig(false, currentTarget);
      if (saved) {
        settingsConfig = extractSettingsConfig(appConfig);
        appWindow().markSectionSaved("config", settingsConfig);
      }
    };
  }

  const scheduleDirtyRefresh = () => appWindow().setTimeout(() => mqbRuntime.refreshDirtySection("config"), 0);
  container.oninput = scheduleDirtyRefresh;
  container.onchange = scheduleDirtyRefresh;

  let desktopSecretsDeleteButton = document.getElementById("js-delete-desktop-secrets") as (HTMLElement & {
    onclick?: (event: Event) => void | Promise<void>;
  }) | null;
  let desktopSecretsCheckButton = document.getElementById("js-check-desktop-secrets") as (HTMLElement & {
    onclick?: (event: Event) => void | Promise<void>;
  }) | null;

  if (mqbApp.isDesktop() && formActions && !desktopSecretsDeleteButton) {
    desktopSecretsCheckButton = createActionButton(
      "Check Stored Secrets",
      "js-check-desktop-secrets",
      "neutral",
    );
    formActions.appendChild(desktopSecretsCheckButton);

    desktopSecretsDeleteButton = createActionButton(
      "Delete Stored Secrets",
      "js-delete-desktop-secrets",
      "danger",
    );
    formActions.appendChild(desktopSecretsDeleteButton);
  }

  if (desktopSecretsDeleteButton) {
    desktopSecretsDeleteButton.onclick = async () => {
      try {
        const confirmed = await mqbDialogs.confirm(
          "Delete all securely stored secrets referenced by the current desktop config?",
          "Delete Stored Secrets",
        );
        if (!confirmed) {
          return;
        }

        const response = await fetch("/desktop-secrets", { method: "DELETE" });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to delete stored secrets");
        }

        const result = await response.json().catch(() => ({ deleted: 0 }));
        const deleted = Number(result?.deleted || 0);
        await mqbDialogs.alert(
          deleted > 0
            ? `Deleted ${deleted} stored secret${deleted === 1 ? "" : "s"}.`
            : "No stored secrets were found for the current desktop config.",
          "Stored Secrets",
        );
      } catch (error) {
        await mqbDialogs.alert(`Failed to delete stored secrets: ${(error as Error).message}`, "Stored Secrets");
      }
    };
  }

  if (desktopSecretsCheckButton) {
    desktopSecretsCheckButton.onclick = async () => {
      try {
        const response = await fetch("/desktop-secrets", { cache: "no-store" });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to inspect stored secrets");
        }

        const summary = (await response.json()) as DesktopSecretSummary;
        await mqbDialogs.alert(formatDesktopSecretsSummary(summary), "Stored Secrets");
      } catch (error) {
        await mqbDialogs.alert(`Failed to inspect stored secrets: ${(error as Error).message}`, "Stored Secrets");
      }
    };
  }
}
