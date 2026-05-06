// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vitest";
import { formatDesktopSecretsSummary, initSettings } from "../../ui/src/lib/settings";

describe("settings", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="form-actions" style="display:none;">
        <button id="js-submit" type="button">Save</button>
      </div>
      <div id="form-container"></div>
    `;

    window.appConfig = { consumers: [], publishers: [], default_tab: "publishers" };
    window.registerDirtySection = vi.fn();
    window.refreshDirtySection = vi.fn();
    window.saveConfig = vi.fn().mockResolvedValue(true);
    window.mqbAlert = vi.fn().mockResolvedValue(undefined);
    window.mqbConfirm = vi.fn().mockResolvedValue(true);
    window.__MQB_DESKTOP__ = false;
    window.VanillaSchemaForms = {
      h: (tagName: string, attrs: Record<string, string>, label: string) => {
        const element = document.createElement(tagName);
        Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
        element.textContent = label;
        return element;
      },
      init: vi.fn().mockResolvedValue({}),
    } as any;
  });

  test("formats desktop secret summary by section and name", () => {
    expect(
      formatDesktopSecretsSummary({
        routes: {
          route_b: [
            { key: "token", extracted: true, stored: true },
          ],
          route_a: [
            { key: "user", extracted: true, stored: false, error: "missing in keyring" },
            { key: "pass", extracted: false, stored: false },
          ],
        },
        consumers: {
          consumer_a: [{ key: "auth", extracted: true, stored: true }],
        },
      }),
    ).toBe(
      [
        "Routes:",
        "- route_a: 1/2 extracted, 0/2 stored",
        "  user: missing in keyring",
        "- route_b: 1/1 extracted, 1/1 stored",
        "Consumers:",
        "- consumer_a: 1/1 extracted, 1/1 stored",
      ].join("\n"),
    );
  });

  test("returns empty-summary message when nothing is configured", () => {
    expect(formatDesktopSecretsSummary({})).toBe(
      "The current desktop config does not reference any extracted secrets.",
    );
  });

  test("initializes the settings form and wires save handling", async () => {
    await initSettings(
      window.appConfig as Record<string, unknown>,
      { properties: { default_tab: { type: "string" } } } as Record<string, unknown>,
    );

    expect(window.registerDirtySection).toHaveBeenCalledWith("config", {
      buttonId: "js-submit",
      getValue: expect.any(Function),
    });
    expect(window.VanillaSchemaForms.init).toHaveBeenCalledWith(
      document.getElementById("form-container"),
      { properties: { default_tab: { type: "string" } } },
      window.appConfig,
    );
    expect(document.getElementById("form-actions")?.style.display).toBe("flex");

    const submitButton = document.getElementById("js-submit") as HTMLButtonElement;
    await submitButton.onclick?.({ currentTarget: submitButton } as unknown as MouseEvent);
    expect(window.saveConfig).toHaveBeenCalledWith(false, submitButton);

    const formContainer = document.getElementById("form-container") as HTMLDivElement;
    formContainer.oninput?.(new Event("input"));
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(window.refreshDirtySection).toHaveBeenCalledWith("config");
  });

  test("adds desktop secret actions and reports stored secret summary", async () => {
    window.__MQB_DESKTOP__ = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          routes: {
            route_a: [{ key: "token", extracted: true, stored: true }],
          },
        }),
      }),
    );

    await initSettings(window.appConfig as Record<string, unknown>, {});

    const checkButton = document.getElementById("js-check-desktop-secrets") as HTMLButtonElement;
    expect(checkButton).not.toBeNull();
    await checkButton.onclick?.(new Event("click"));

    expect(fetch).toHaveBeenCalledWith("/desktop-secrets", { cache: "no-store" });
    expect(window.mqbAlert).toHaveBeenCalledWith(
      "Routes:\n- route_a: 1/1 extracted, 1/1 stored",
      "Stored Secrets",
    );
    vi.unstubAllGlobals();
  });
});
