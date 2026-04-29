type DialogMode = "message" | "confirm" | "prompt" | "choose";

interface DialogChoice {
  value: string;
  label: string;
  description?: string;
}

interface OpenDialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  value?: string;
  placeholder?: string;
  mode?: DialogMode;
  choices?: DialogChoice[];
}

interface PromptOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  value?: string;
  placeholder?: string;
}

interface ChooseOptions {
  cancelLabel?: string;
  choices?: DialogChoice[];
}

type DialogResult = boolean | string | null;

function h(tagName: string, attrs: Record<string, unknown> = {}, ...children: unknown[]) {
  // Dialog UI should stay independent from schema-form rendering behavior.
  const element = document.createElement(tagName);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === "className") {
      element.className = String(value);
      return;
    }
    if (key === "style" && typeof value === "object" && value) {
      Object.assign(element.style, value);
      return;
    }
    element.setAttribute(key, String(value));
  });

  children.flat().forEach((child) => {
    if (child === null || child === undefined || child === false || child === "") return;
    if (child instanceof Node) {
      element.appendChild(child);
    } else {
      element.appendChild(document.createTextNode(String(child)));
    }
  });

  return element;
}

function ensureStyles() {
  if (document.getElementById("mqb-dialog-styles")) return;

  const style = document.createElement("style");
  style.id = "mqb-dialog-styles";
  style.textContent = `
    wa-dialog.mqb-dialog::part(panel) {
      min-width: min(520px, calc(100vw - 32px));
    }
    .mqb-dialog-body {
      display: grid;
      gap: 14px;
      color: var(--text-muted);
      line-height: 1.5;
    }
    .mqb-dialog-input {
      width: 100%;
      box-sizing: border-box;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-input);
      color: var(--text-primary);
      font: inherit;
    }
    .mqb-choice-list {
      display: grid;
      gap: 10px;
      margin-top: 4px;
      justify-items: start;
    }
    .mqb-choice-link {
      display: grid;
      gap: 4px;
      width: auto;
      max-width: 100%;
      background: color-mix(in srgb, var(--bg-input) 78%, transparent);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 14px;
      text-align: left;
      cursor: pointer;
      color: var(--text-primary);
      font: inherit;
      line-height: 1.35;
      transition: border-color 120ms ease, background-color 120ms ease;
    }
    .mqb-choice-link:hover {
      border-color: color-mix(in srgb, var(--accent-blue) 45%, var(--border));
      background: color-mix(in srgb, var(--accent-blue) 8%, var(--bg-input));
    }
    .mqb-choice-link:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--accent-blue) 75%, white);
      outline-offset: 1px;
    }
    .mqb-choice-link__title {
      display: block;
      font-weight: 600;
      color: var(--accent-blue);
    }
    .mqb-choice-link__description {
      display: block;
      font-size: 12px;
      color: var(--text-dim);
    }
  `;
  document.head.appendChild(style);
}

function openDialog({
  title,
  message,
  confirmLabel = "OK",
  cancelLabel = "",
  value = "",
  placeholder = "",
  mode = "message",
  choices = [],
}: OpenDialogOptions): Promise<DialogResult> {
  return new Promise((resolve) => {
    ensureStyles();

    const dialog = document.createElement("wa-dialog") as HTMLElement & {
      open?: boolean;
      lightDismiss?: boolean;
    };
    dialog.className = "mqb-dialog";
    dialog.setAttribute("label", title);
    dialog.lightDismiss = true;

    const body = h("div", { className: "mqb-dialog-body" }, h("div", {}, message));
    let input: HTMLInputElement | null = null;
    let resolved = false;
    let result: DialogResult = mode === "confirm" ? false : null;

    if (mode === "prompt") {
      input = h("input", { className: "mqb-dialog-input", type: "text" }) as HTMLInputElement;
      input.value = value;
      input.placeholder = placeholder;
      body.appendChild(input);
    }

    if (mode === "choose") {
      const choiceList = h("div", { className: "mqb-choice-list" });
      choices.forEach((choice) => {
        const button = h(
          "button",
          { className: "mqb-choice-link", type: "button" },
          h("span", { className: "mqb-choice-link__title" }, String(choice.label)),
          choice.description
            ? h("span", { className: "mqb-choice-link__description" }, String(choice.description))
            : "",
        ) as HTMLButtonElement;
        button.onclick = () => {
          result = choice.value;
          dialog.open = false;
        };
        choiceList.appendChild(button);
      });
      body.appendChild(choiceList);
    }

    dialog.appendChild(body);

    if (mode !== "choose") {
      if (cancelLabel) {
        const cancelButton = document.createElement("wa-button") as HTMLElement & {
          slot?: string;
          variant?: string;
          appearance?: string;
          size?: string;
          onclick?: () => void;
        };
        cancelButton.slot = "footer";
        cancelButton.variant = "neutral";
        cancelButton.appearance = "outlined";
        cancelButton.size = "small";
        cancelButton.textContent = cancelLabel;
        cancelButton.onclick = () => {
          result = mode === "confirm" ? false : null;
          dialog.open = false;
        };
        dialog.appendChild(cancelButton);
      }

      const confirmButton = document.createElement("wa-button") as HTMLElement & {
        slot?: string;
        variant?: string;
        size?: string;
        onclick?: () => void;
      };
      confirmButton.slot = "footer";
      confirmButton.variant = "brand";
      confirmButton.size = "small";
      confirmButton.textContent = confirmLabel;
      confirmButton.onclick = () => {
        if (mode === "prompt") {
          result = input?.value.trim() || "";
        } else {
          result = true;
        }
        dialog.open = false;
      };
      dialog.appendChild(confirmButton);
    } else if (cancelLabel) {
      const cancelButton = document.createElement("wa-button") as HTMLElement & {
        slot?: string;
        variant?: string;
        appearance?: string;
        size?: string;
        onclick?: () => void;
      };
      cancelButton.slot = "footer";
      cancelButton.variant = "neutral";
      cancelButton.appearance = "outlined";
      cancelButton.size = "small";
      cancelButton.textContent = cancelLabel;
      cancelButton.onclick = () => {
        result = null;
        dialog.open = false;
      };
      dialog.appendChild(cancelButton);
    }

    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      dialog.remove();
      resolve(result);
    };

    dialog.addEventListener("wa-after-hide", cleanup, { once: true });
    document.body.appendChild(dialog);
    requestAnimationFrame(() => {
      dialog.open = true;
      if (input) {
        input.focus();
        input.select();
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            result = input?.value.trim() || "";
            dialog.open = false;
          }
        });
      }
    });
  });
}

export function installDialogs() {
  window.mqbAlert = async (message: string, title = "Notice") => {
    await openDialog({
      title,
      message,
      confirmLabel: "OK",
      mode: "message",
    });
  };

  window.mqbConfirm = async (message: string, title = "Confirm") =>
    openDialog({
      title,
      message,
      confirmLabel: "Continue",
      cancelLabel: "Cancel",
      mode: "confirm",
    }) as Promise<boolean>;

  window.mqbPrompt = async (message: string, title = "Enter Name", options: PromptOptions = {}) =>
    openDialog({
      title,
      message,
      confirmLabel: options.confirmLabel || "Create",
      cancelLabel: options.cancelLabel || "Cancel",
      value: options.value || "",
      placeholder: options.placeholder || "",
      mode: "prompt",
    }) as Promise<string | null>;

  window.mqbChoose = async (message: string, title = "Choose", options: ChooseOptions = {}) =>
    openDialog({
      title,
      message,
      cancelLabel: options.cancelLabel || "Cancel",
      mode: "choose",
      choices: options.choices || [],
    }) as Promise<string | null>;
}
