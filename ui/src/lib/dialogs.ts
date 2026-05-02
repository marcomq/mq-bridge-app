import { mount, unmount } from "svelte";
import DialogComponent from "../components/Dialog.svelte";

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

function openDialog(options: OpenDialogOptions): Promise<DialogResult> {
  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const component = mount(DialogComponent, {
      target: container,
      props: {
        ...options,
        onResolve: (result: DialogResult) => {
          unmount(component);
          container.remove();
          resolve(result);
        },
      },
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
