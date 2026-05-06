// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from "vitest";
import { flushSync, mount, unmount } from "../../node_modules/svelte/src/index-client.js";
import CollapsibleFields from "../../ui/src/lib/forms/CollapsibleFields.svelte";
import OptionalSectionField from "../../ui/src/lib/forms/OptionalSectionField.svelte";
import HeadersEditor from "../../ui/src/lib/forms/HeadersEditor.svelte";

function mountComponent<Props extends Record<string, unknown>>(component: any, props: Props) {
  const target = document.createElement("div");
  document.body.appendChild(target);
  const instance = mount(component, { target, props });
  flushSync();
  return { target, instance };
}

function createTextNode(text: string, className = "") {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("svelte form components", () => {
  test("CollapsibleFields toggles advanced content without losing visible content", async () => {
    const visible = createTextNode("Visible Fields", "visible-fields");
    const hidden = createTextNode("Advanced Fields", "advanced-fields");
    const { target, instance } = mountComponent(CollapsibleFields, {
      description: "Primary publisher settings",
      visibleContent: visible,
      hiddenContent: hidden,
      toggleLabel: "Show advanced",
    });

    expect(target.querySelector(".mqb-form-description-block")?.textContent).toContain("Primary publisher settings");
    expect(target.querySelector(".visible-fields")?.textContent).toBe("Visible Fields");
    expect(target.querySelector(".advanced-fields")).toBeNull();

    const toggle = target.querySelector(".mqb-form-toggle") as HTMLButtonElement | null;
    expect(toggle?.textContent).toContain("Show advanced");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");

    toggle?.click();
    flushSync();

    expect(target.querySelector(".advanced-fields")?.textContent).toBe("Advanced Fields");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle?.textContent).toContain("Hide advanced");

    toggle?.click();
    flushSync();

    expect(target.querySelector(".advanced-fields")).toBeNull();
    expect(target.querySelector(".visible-fields")?.textContent).toBe("Visible Fields");
    unmount(instance);
  });

  test("OptionalSectionField reflects initial checked state and calls onToggle", async () => {
    const nested = createTextNode("TLS Settings", "tls-settings");
    const onToggle = vi.fn();
    const { target, instance } = mountComponent(OptionalSectionField, {
      label: "TLS",
      description: "Enable secure transport.",
      checked: true,
      inputId: "tls-required",
      onToggle,
      content: nested,
    });

    const checkbox = target.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(checkbox?.checked).toBe(true);
    expect(target.querySelector(".tls-settings")?.textContent).toBe("TLS Settings");

    checkbox!.checked = false;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(onToggle).toHaveBeenCalledWith(false);
    expect(target.querySelector(".tls-settings")).toBeNull();

    checkbox!.checked = true;
    checkbox!.dispatchEvent(new Event("change", { bubbles: true }));
    flushSync();

    expect(onToggle).toHaveBeenCalledWith(true);
    expect(target.querySelector(".tls-settings")?.textContent).toBe("TLS Settings");
    unmount(instance);
  });

  test("HeadersEditor adds, updates, filters, and removes rows", async () => {
    const onChange = vi.fn();
    const { target, instance } = mountComponent(HeadersEditor, {
      title: "Custom Headers",
      description: "Manage request headers.",
      rows: [],
      onChange,
    });

    expect(target.querySelector(".mqb-empty-inline-note")?.textContent).toContain("No headers defined.");

    const addButton = Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Add Header")) as HTMLButtonElement | undefined;
    addButton?.click();
    flushSync();

    expect(onChange).toHaveBeenLastCalledWith([]);
    const inputs = target.querySelectorAll("input");
    expect(inputs).toHaveLength(2);

    const keyInput = inputs[0] as HTMLInputElement;
    const valueInput = inputs[1] as HTMLInputElement;
    keyInput.value = "x-request-id";
    keyInput.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(onChange).toHaveBeenLastCalledWith([{ key: "x-request-id", value: "" }]);

    valueInput.value = "42";
    valueInput.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();

    expect(onChange).toHaveBeenLastCalledWith([{ key: "x-request-id", value: "42" }]);

    const deleteButton = Array.from(target.querySelectorAll("button"))
      .find((button) => button.textContent?.includes("Delete")) as HTMLButtonElement | undefined;
    deleteButton?.click();
    flushSync();

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(target.querySelector(".mqb-empty-inline-note")?.textContent).toContain("No headers defined.");
    unmount(instance);
  });
});
