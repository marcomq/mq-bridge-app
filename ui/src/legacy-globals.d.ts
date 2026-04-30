import type { MainTab, RuntimeStatus } from "./lib/runtime-status";

type AppConfigShape = any;
type AppSchemaShape = any;
type DirtySectionTracker = {
  buttonId: string;
  getValue: () => unknown;
  baseline: string;
};
type ChooseOption = { value: string; label: string; description?: string };
type SaveButtonLike = HTMLElement & { loading?: boolean; dataset: DOMStringMap };

declare global {
  interface Window {
    __MQB_DESKTOP__?: boolean;
    applyColorScheme?: (event?: MediaQueryList | MediaQueryListEvent) => void;
    appConfig: AppConfigShape;
    appSchema: AppSchemaShape;
    initRoutes?: (config: AppConfigShape, schema: AppSchemaShape) => void;
    initConsumers?: (config: AppConfigShape, schema: AppSchemaShape) => void;
    initPublishers?: (config: AppConfigShape, schema: AppSchemaShape) => void;
    restoreRouteState?: (idx: number) => void;
    restoreConsumerState?: (idx: number, options?: { tab?: string }) => void;
    restorePublisherState?: (idx: number, options?: { tab?: string }) => void;
    renderRoutesRuntimeMetrics?: () => void;
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
        choices?: ChooseOption[];
      },
    ) => Promise<string | null>;
    _mqb_active_tab?: MainTab;
    _mqb_routes_initialized?: boolean;
    _mqb_consumers_initialized?: boolean;
    _mqb_publishers_initialized?: boolean;
    _mqb_config_initialized?: boolean;
    _mqb_pending_route_restore?: { idx: number } | null;
    _mqb_pending_consumer_restore?: { idx: number; tab?: string } | null;
    _mqb_pending_publisher_restore?: { idx: number; tab?: string } | null;
    _mqb_runtime_status: RuntimeStatus;
    _mqb_dirty_sections: Record<string, DirtySectionTracker>;
    _mqb_saved_sections: Record<string, unknown>;
    _mqb_runtime_poll_timer?: number;
    _mqb_consumer_poll_timer?: number | null;
    _mqb_consumer_poll_nonce?: number;
    _mqb_form_mode?: string | null;
    _consSplit?: unknown;
    _pubSplit?: unknown;
    Split?: (
      selectors: string[],
      options: {
        direction: string;
        sizes: number[];
        minSize: number;
        gutterSize: number;
        elementStyle: (dimension: string, size: number, gutterSize: number) => Record<string, string>;
        gutterStyle: (dimension: string, gutterSize: number) => Record<string, string>;
      },
    ) => unknown;
    VanillaSchemaForms: {
      h: (tag: string, props?: Record<string, unknown>, ...children: unknown[]) => HTMLElement;
      init: (
        container: HTMLElement,
        schema: Record<string, unknown>,
        value: unknown,
        onChange?: (updated: Record<string, unknown>) => void,
      ) => Promise<unknown>;
    };
    syncSaveButtonLabel: (button: HTMLElement | null) => void;
    registerDirtySection: (
      sectionName: string,
      options: { buttonId: string; getValue: () => unknown },
    ) => void;
    refreshDirtySection: (sectionName: string) => boolean;
    markSectionSaved: (sectionName: string, savedValue?: unknown) => void;
    renderRuntimeStatus: () => void;
    pollRuntimeStatus: () => Promise<unknown>;
    runSaveButtonAction: <T>(button: SaveButtonLike | null, action: () => Promise<T>) => Promise<T | null>;
    fetchConfigFromServer: <T>() => Promise<T>;
    saveConfig: (silent?: boolean, button?: SaveButtonLike | null) => Promise<boolean>;
    saveConfigSection: (
      sectionName: string,
      sectionValue: unknown,
      silent?: boolean,
      button?: SaveButtonLike | null,
    ) => Promise<any>;
    switchMain: (name: MainTab) => void;
    showJsonModal: () => void;
  }
}

export {};
