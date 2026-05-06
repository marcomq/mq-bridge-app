import type { MainTab } from "./lib/runtime-status";
import type { MqbState } from "./lib/runtime-window";

type DialogChoice = { value: string; label: string; description?: string };

declare global {
  interface Window {
    __MQB_DESKTOP__?: boolean;
    __mqb_state?: MqbState;

    appConfig: Record<string, any>;
    appSchema: Record<string, any>;

    // Dialog bridge API
    mqbAlert: (message: string, title?: string) => Promise<void>;
    mqbConfirm: (message: string, title?: string) => Promise<boolean>;
    mqbPrompt: (
      message: string,
      title?: string,
      options?: {
        confirmLabel?: string;
        cancelLabel?: string;
        value?: string;
        placeholder?: string;
      },
    ) => Promise<string | null>;
    mqbChoose: (
      message: string,
      title?: string,
      options?: {
        confirmLabel?: string;
        cancelLabel?: string;
        choices?: DialogChoice[];
      },
    ) => Promise<string | null>;

    // Runtime helpers bridged from bootstrap
    switchMain: (name: MainTab) => void | Promise<void>;
    showJsonModal: () => void;
    syncSaveButtonLabel: (button: HTMLElement | null) => void;
    registerDirtySection: (
      sectionName: string,
      options: { buttonId: string; getValue: () => unknown },
    ) => void;
    refreshDirtySection: (sectionName: string) => boolean;
    markSectionSaved: (sectionName: string, savedValue?: unknown) => void;
    pollRuntimeStatus: () => Promise<unknown>;
    fetchConfigFromServer: <T>() => Promise<T>;
    saveConfig: (silent?: boolean, button?: (HTMLElement & { loading?: boolean }) | null) => Promise<boolean>;
    saveConfigSection: (
      sectionName: string,
      sectionValue: unknown,
      silent?: boolean,
      button?: (HTMLElement & { loading?: boolean }) | null,
    ) => Promise<any>;

    // Legacy libs and migration compatibility
    Split?: (...args: any[]) => unknown;
    VanillaSchemaForms: {
      h: (tag: string, props?: Record<string, unknown>, ...children: unknown[]) => HTMLElement;
      init: (
        container: HTMLElement,
        schema: Record<string, unknown>,
        value: unknown,
        onChange?: (updated: Record<string, unknown>) => void,
      ) => Promise<unknown>;
    };
    renderRoutesRuntimeMetrics?: () => void;
    renderConsumersRuntimeStatus?: () => void;
    initConsumers?: (config: Record<string, any>, schema: Record<string, any>) => void;
    initPublishers?: (config: Record<string, any>, schema: Record<string, any>) => void;
    restoreConsumerState?: (idx: number, options?: { tab?: string }) => void;
    restorePublisherState?: (idx: number, options?: { tab?: string }) => void;

    // Transitional compatibility while migration removes remaining legacy test/setup assignments.
    [key: `_mqb_${string}`]: any;
    [key: `init${string}`]: any;
    [key: `restore${string}`]: any;
    [key: string]: any;
  }
}

export {};
