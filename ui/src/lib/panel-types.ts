import type { ConfigSecurity, EnvVars, PresetsByPublisher, PublisherHistoryEntry, PublisherHistoryStore, PublisherPreset } from "./workspace-config";

export type ConsumerMessage = {
  id?: string;
  payload: unknown;
  metadata?: Record<string, string>;
  time?: string;
  response?: unknown;
  response_metadata?: Record<string, string>;
};

export type ConsumerStatus = {
  running: boolean;
  unsaved?: boolean;
  status: {
    healthy: boolean;
    error?: string;
  };
};

export type ConsumerMessageCaptureConfig = {
  enabled: boolean;
  keep_last: number;
};

export type ConsumerResponseConfig = {
  headers: Record<string, string>;
  payload: string;
};

export type ConsumerOutputConfig =
  | { mode: "none" }
  | { mode: "publisher"; publisher: string; publisher_id?: string | null }
  | { mode: "response"; response: ConsumerResponseConfig | null };

export type ConsumerConfig = {
  id?: string;
  name: string;
  endpoint: Record<string, unknown>;
  comment?: string;
  response?: unknown;
  output?: ConsumerOutputConfig | null;
  message_capture?: ConsumerMessageCaptureConfig;
  batch_size?: number;
};

export type PublisherConfig = {
  id?: string;
  name: string;
  endpoint: Record<string, unknown>;
  comment?: string;
};

export type ConsumerResponseHeaderRow = {
  id: number;
  key: string;
  value: string;
  enabled: boolean;
};

export type PublisherState = {
  payload: string;
  headers?: Array<{
    id: number;
    key: string;
    value: string;
    enabled: boolean;
  }>;
};

export type PublisherResponseState = {
  responseVisible?: boolean;
  responseTabLabel?: string;
  responseStatusLabel?: string;
  responseStatusText?: string;
  responseStatusColor?: string;
  responseDurationLabel?: string;
  responseSizeLabel?: string;
  requestRows?: Array<[string, string]>;
  requestHeaders?: Array<[string, string]>;
  responseHeaders?: Array<[string, string]>;
  responsePayload?: string;
};

export type PublisherHistoryItem = PublisherHistoryEntry;

export type ConsumersAppConfig = {
  consumers: ConsumerConfig[];
  publishers?: PublisherConfig[];
  routes?: Record<string, unknown>;
  config_security?: ConfigSecurity;
};

export type PublishersAppConfig = {
  publishers: PublisherConfig[];
  consumers?: ConsumerConfig[];
  routes?: Record<string, unknown>;
  presets?: PresetsByPublisher;
  env_vars?: EnvVars;
  history?: PublisherHistoryStore;
  config_security?: ConfigSecurity;
};

export type ConsumersSchemaRoot = {
  properties?: {
    consumers?: {
      items?: Record<string, any>;
    };
  };
  $defs?: Record<string, any>;
};

export type PublishersSchemaRoot = {
  properties?: {
    publishers?: {
      items?: Record<string, any>;
    };
  };
  $defs?: Record<string, any>;
};

export type PublisherPresetLike = PublisherPreset;
