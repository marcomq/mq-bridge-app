# mq-bridge CLI Docs

Docs for `mq-bridge copy --from <uri> --to <uri>`, the headless one-shot/
continuous copy command.

- **[Quick Start](./quick-start.md)** — five working `copy` commands
  (Postgres → ClickHouse, Postgres CDC → Postgres, MQTT → Kafka, RabbitMQ →
  HTTP, File → MongoDB). Start here.
- **[Connectors](./connectors/)** — per-connector pages: purpose, URL format,
  practical examples, and a link to the full option list.
- **[URL Parameter Reference](./reference/)** — every connector's recognised
  query parameters (name, type, default, required, description),
  auto-generated from the JSON Schemas `mq-bridge copy` uses to parse
  `--from`/`--to`. Regenerate with:

  ```bash
  cargo run -p mq-bridge-app --example gen_url_docs
  ```

## Folder structure

```
dev/docs/
├── README.md              this file
├── quick-start.md          workflow-first examples
├── connectors/              hand-written, one page per connector
│   ├── README.md
│   ├── postgres.md
│   ├── clickhouse.md
│   ├── mqtt.md
│   ├── kafka.md
│   ├── rabbitmq.md
│   ├── http.md
│   ├── mongodb.md
│   └── file.md
└── reference/                generated, one page per connector — do not edit by hand
    ├── README.md
    ├── postgres.md
    ├── clickhouse.md
    └── ...
```

Connector pages are hand-written and stay that way: purpose, URL format, and
examples need human judgment. The reference pages are generated from the
JSON Schemas so parameter docs never drift from the actual config structs —
see `crates/cli/examples/gen_url_docs.rs`.
