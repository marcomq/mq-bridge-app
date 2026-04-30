interface DesktopSecretEntry {
  key?: string;
  extracted?: boolean;
  stored?: boolean;
  error?: string;
}
import { getMqbState } from "./runtime-window";

interface DesktopSecretSummary {
  routes?: Record<string, DesktopSecretEntry[]>;
  consumers?: Record<string, DesktopSecretEntry[]>;
  publishers?: Record<string, DesktopSecretEntry[]>;
}

function cloneSchema<T>(schema: T): T {
  return JSON.parse(JSON.stringify(schema)) as T;
}

function createActionButton(
  label: string,
  id: string,
  variant: "neutral" | "danger",
) {
  const button = window.VanillaSchemaForms.h("wa-button", { id }, label) as HTMLElement & {
    setAttribute: (name: string, value: string) => void;
    onclick?: (event: Event) => void | Promise<void>;
  };
  button.setAttribute("variant", variant);
  button.setAttribute("appearance", "outlined");
  button.setAttribute("size", "small");
  return button;
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
  const lib = window.VanillaSchemaForms;
  const container = document.getElementById("form-container");
  if (!container) {
    return;
  }

  window.registerDirtySection("config", {
    buttonId: "js-submit",
    getValue: () => window.appConfig,
  });

  getMqbState().form_mode = "settings";
  await lib.init(container, cloneSchema(schema), config);
  getMqbState().form_mode = null;

  const formActions = document.getElementById("form-actions");
  if (formActions) {
    formActions.style.display = "flex";
  }

  const submitButton = document.getElementById("js-submit") as (HTMLElement & {
    onclick?: (event: Event) => void | Promise<void>;
  }) | null;
  if (submitButton) {
    submitButton.onclick = async (event) => {
      await window.saveConfig(false, event.currentTarget as HTMLElement | null);
    };
  }

  const scheduleDirtyRefresh = () => window.setTimeout(() => window.refreshDirtySection("config"), 0);
  container.oninput = scheduleDirtyRefresh;
  container.onchange = scheduleDirtyRefresh;

  let desktopSecretsDeleteButton = document.getElementById("js-delete-desktop-secrets") as (HTMLElement & {
    onclick?: (event: Event) => void | Promise<void>;
  }) | null;
  let desktopSecretsCheckButton = document.getElementById("js-check-desktop-secrets") as (HTMLElement & {
    onclick?: (event: Event) => void | Promise<void>;
  }) | null;

  if (window.__MQB_DESKTOP__ && formActions && !desktopSecretsDeleteButton) {
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
        const confirmed = await window.mqbConfirm(
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
        await window.mqbAlert(
          deleted > 0
            ? `Deleted ${deleted} stored secret${deleted === 1 ? "" : "s"}.`
            : "No stored secrets were found for the current desktop config.",
          "Stored Secrets",
        );
      } catch (error) {
        await window.mqbAlert(`Failed to delete stored secrets: ${(error as Error).message}`, "Stored Secrets");
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
        await window.mqbAlert(formatDesktopSecretsSummary(summary), "Stored Secrets");
      } catch (error) {
        await window.mqbAlert(`Failed to inspect stored secrets: ${(error as Error).message}`, "Stored Secrets");
      }
    };
  }
}
