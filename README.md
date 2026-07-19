# mq-bridge-app

![Linux](https://img.shields.io/badge/Linux-supported-green?logo=linux)
![Windows](https://img.shields.io/badge/Windows-supported-green?logo=windows)
![macOS](https://img.shields.io/badge/macOS-supported-green?logo=apple)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

<p align="center">
  <img src="crates/desktop/icons/icon.png" alt="mq-bridge-app" width="128" height="128">
</p>
<p style="margin-top:-30px" align="center"><em>crossing streams</em></p>

`mq-bridge-app` is a **fast, single-command ETL and data-movement tool** built in Rust — and, on top of the same engine, a multi-protocol bridge and traffic workbench for messaging.

It ships in **three forms that share one engine and one config format**: a **desktop app** (visual workbench), a **CLI / server** (headless bridge and one-line `copy`), and a **library** (embed the engine in Rust, Python, or Node.js). Design a route once, run it anywhere — no rewrite in between.

Supported integration types include **Kafka**, **RabbitMQ (AMQP)**, **NATS**, **AWS SQS**, **MQTT**, **IBM MQ** (optional), **HTTP**, **gRPC**, **ZeroMQ**, **MongoDB**, **sqlx (MySQL, MariaDB, PostgreSQL)**, and filesystem endpoints.

## A quick taste

At its core is a zero-config `copy` command that moves data between databases, queues, and files in a single line of bash — no YAML, no pipeline definition, no code:

```bash
mq-bridge-app copy \
  --from 'postgres://user:pass@localhost/db?table=src&sslmode=disable' \
  --to   'file://out.jsonl?format=raw' \
  --drain
```

The **scheme selects the endpoint** and **query parameters configure it**, so any source→sink pair (Postgres, MySQL, MariaDB, SQLite, NATS, Redis, MongoDB, files, …) is just one URL each. And it's quick: in our benchmarks a 1,000,000-row Postgres → JSONL job sustained **266,951 rows/s** at **~20 MiB peak RSS** — about **17x faster** and ~30x leaner than Meltano on the same machine (see [Performance](#performance)).

## The three ways to run it

Test connections and dial in a route in the Postman-inspired UI, export the JSON/YAML, then run that exact config — unchanged — however you deploy.

| Form | What it is | How to install |
| --- | --- | --- |
| [**Desktop app (UI)**](#desktop-app-ui) | The visual workbench — build/test routes, run request/response traffic, inspect message history | Download the bundle from [Releases](https://github.com/marcomq/mq-bridge-app/releases) |
| [**CLI / server**](#cli--server) | Headless binary: a one-line `copy`, a drain-then-exit batch job, or a long-lived bridge (also serves the same UI in a browser) | `cargo binstall mq-bridge-app` |
| [**Library**](#library) | The engine embedded in your own code — native **Rust**, **Python**, or **Node.js** bindings | `cargo add` / `pip` / `npm` |

---

## Desktop app (UI)

The desktop app is a Tauri bundle of the full messaging workbench: manage publishers/consumers/routes, run request/response traffic (like Postman for REST), inspect message history, and import Postman/OpenAPI/AsyncAPI definitions. It is the **same UI** the CLI serves in a browser — only the packaging differs.

![mq-bridge UI - publishers](dev/images/Screen1.jpg)

Prebuilt desktop bundles for macOS, Windows, and Linux are attached to every release on the [GitHub Releases page](https://github.com/marcomq/mq-bridge-app/releases).

### macOS

Download the `.dmg` / `.app` bundle. Because the desktop binaries are currently not notarized, macOS may report the application as "damaged" on first launch. Remove the quarantine attribute to fix it.

If the app is in your `/Applications` folder:
```bash
sudo xattr -rd com.apple.quarantine /Applications/mq-bridge.app
```
If the app is in a user-owned directory (e.g. `~/Downloads`), `sudo` is not required:
```bash
xattr -rd com.apple.quarantine ~/Downloads/mq-bridge.app
```

### Windows

Download the Windows installer or standalone executable from the [Releases page](https://github.com/marcomq/mq-bridge-app/releases).

### Linux

Download the Linux bundle that suits your distribution — AppImage, `.deb`, `.rpm`, or the unpacked archive.

---

## CLI / server

The CLI (`mq-bridge-app`) is a headless binary. It runs in **three modes**:

- **[Config mode](#config-mode)** — load a YAML/JSON/TOML config and run a long-lived bridge; optionally serve the browser UI.
- **[`copy` mode](#copy-mode)** — an ad-hoc one-route job from two endpoint URIs, no config file and no UI.
- **[`mcp` mode](#mcp-server)** — expose the bridge as MCP tools so an LLM agent can publish and route from natural language.

### Install

**Recommended — prebuilt binary via `cargo binstall`.** Downloads the prebuilt CLI from [Releases](https://github.com/marcomq/mq-bridge-app/releases) instead of compiling from source, so it installs in seconds:

```bash
cargo binstall mq-bridge-app
```

Prebuilt binaries are available for `x86_64` Linux, Apple Silicon macOS, and `x86_64` Windows. ([`cargo-binstall`](https://github.com/cargo-bins/cargo-binstall) is a drop-in `cargo install` replacement.)

**From source via `cargo install`.** Requires a Rust toolchain and compiles all supported endpoint client libraries (except IBM MQ), so it may take a while:

```bash
cargo install mq-bridge-app
```

For IBM MQ, install the client library first and build with `--features=ibm-mq`.

**Docker.** The CLI is published as a multi-arch image (`amd64` + `arm64`):

```bash
docker run --rm --name mq-bridge -p 9091:9091 ghcr.io/marcomq/mq-bridge-app:latest
```

To read+tail from `input.log` and forward its content, mount a config and pass `--init-config`:

```bash
touch input.log
docker run --rm --name mq-bridge -p 9091:9091 -v "$(pwd)":/app \
  ghcr.io/marcomq/mq-bridge-app:latest --init-config=/config/file-to-http.yml
```

> [!NOTE]
> The default `latest` image is a plain multi-arch image for `amd64` and `arm64`. IBM MQ support is published separately as the `latest-ibm-mq` and `ibm-mq` tags on `amd64` only, since there is no redistributable IBM MQ client library for arm64 yet. Start that image in emulation mode with `--platform=linux/amd64`, or build `mq-bridge-app` yourself with `cargo build --release --features=ibm-mq`.

**Build from source.** See [Build from source](#build-from-source).

### Config mode

Point the CLI at a config file to run a long-lived bridge. Configuration is hierarchical: files (**YAML**, **JSON**, or **TOML**) plus environment variables, which suits Container/Kubernetes deployments.

```bash
# Run with an existing config
mq-bridge-app --config config.yml

# Seed config.yml from a template on first run only (if it doesn't exist yet)
mq-bridge-app --config config.yml --init-config dev/config/file-to-http.yml
```

- `--config <path>` — config file to load **and** save (the UI writes back here).
- `--init-config <path>` / `--init-config-str <str>` — initialize from a template / inline string only if the main config doesn't exist yet.
- `--config-str <str>` — inline config that overrides the config file.
- `--schema <path>` — write the JSON Schema for `AppConfig` (use `-` for stdout).

In config mode the CLI also **serves the browser UI** (the same UI as the desktop app) on the configured port, so you can start with no config at all and define `config.yml` interactively:

```bash
mq-bridge-app          # start empty, then open the UI to build your config
```

**Environment variables.** Reference env vars anywhere in JSON/YAML/UI values with `${ENV_VARIABLE_NAME:-default_if_not_found}`. For local development, drop a `.env` file in the working directory and it is loaded automatically.

> **Note:** IBM MQ support is an optional build feature. See the [IBM MQ Setup Guide](dev/docs/IBM_MQ_SETUP.md) for build instructions.

### `copy` mode

For ad-hoc data moves (queue→DB, DB→DB, DB→file) you don't need a config file. The `copy` subcommand builds a single route from two endpoint URIs and runs it headlessly (no web UI):

```bash
# DB → DB, drain the source table then exit (exit code 0 on success)
mq-bridge-app copy \
  --from 'postgres://user:pass@localhost/db?table=src' \
  --to   'postgres://user:pass@localhost/db?table=dst' \
  --drain

# Queue → DB as a continuous bridge (runs until Ctrl-C; omit --drain)
mq-bridge-app copy \
  --from 'nats://localhost:4222?subject=orders' \
  --to   'postgres://user:pass@localhost/db?table=orders'
```

The URLs use a generic `scheme://…?param=a&next=b` convention: the **scheme selects the endpoint** and **query parameters set its config**. Any query key that matches a field of that endpoint's config becomes endpoint config; every other query param stays on the connection URL, so driver params pass through unchanged (e.g. `postgres://…/db?table=src&sslmode=disable`). No per-field flags.

- **Schemes**: `postgres` / `postgresql` / `mysql` / `mariadb` / `sqlite` → sqlx, `nats` → NATS, `mongodb` → MongoDB, `redis` → Redis streams, `file` → file.
- **Common config params**: `table`, `insert_query` (URL-encoded; supports the `${metadata:<key>}` / `${payload:<field>}` token mapping), `delete_after_read`, `subject`, `stream`, `collection`, `database`, `format`, … — anything on the endpoint's config struct.
- For `nats`, the dominant target field can also be given as the URL path instead of a query param — `nats://localhost:4222/orders` is equivalent to `nats://localhost:4222?subject=orders` (matching the UI's short-display convention); the query form wins if both are given. (A `redis` path is the connection's database number and stays on the URL, so a redis stream target must be set with `?stream=…`.)
- MongoDB sources are **non-destructive by default**: `copy` (and the UI) default `consume` to `capture_all` (read existing documents, then watch for changes) so pointing at an existing collection never claims or deletes its documents. Pass `?consume=consumer` to opt into the destructive queue-drain mode. (Note: `capture_all` / `capture_new` use change streams, which require a replica set.)

**Middlewares.** Append `|`-separated middlewares to either URI to wrap that endpoint. They apply in the order written, and each takes its own config struct's fields as query params:

```bash
# Retry the source, meter the sink, and batch its sends
mq-bridge-app copy \
  --from 'postgres://user:pass@localhost/db?table=src|retry?max_attempts=5&initial_interval_ms=200' \
  --to   'kafka://broker:9092?topic=orders|buffer?max_messages=500&max_delay_ms=50|metrics' \
  --drain
```

- **Names**: `retry`, `metrics`, `dlq`, `deduplication`, `delay`, `limiter`, `buffer`, `weak_join`, `cookie_jar`, `random_panic`, `custom`. A `-` is accepted for `_` (`weak-join` == `weak_join`).
- A middleware with no params needs no `?` at all — `|metrics`.
- `dlq`'s `endpoint` is itself a URL-encoded endpoint URI, so failed messages can land anywhere: `|dlq?endpoint=file%3A%2F%2F%2Ftmp%2Ffailed.jsonl`.
- Object/array fields take a JSON literal, e.g. `|weak-join?group_by=cid&expected_count=2&timeout_ms=1000&required=["a","b"]`.
- A literal `|` inside the URI itself (e.g. in a password) must be written percent-encoded as `%7C`.

**Flags**

- `--from <uri>` / `--to <uri>` — source and destination endpoints, each optionally followed by `|`-separated middlewares.
- `--drain` — exit gracefully once the source is empty (drain-then-exit). Without it, `copy` runs as a continuous bridge until Ctrl-C.
- `--concurrency <N>` / `--batch-size <N>` — route tuning passthrough.

**Full `copy` documentation** lives in [`dev/docs/`](dev/docs/):

- [Quick Start](dev/docs/quick-start.md) — complete, working `copy` commands (Postgres → ClickHouse, Postgres CDC → Postgres, MQTT → Kafka, RabbitMQ → HTTP, File → MongoDB).
- [Connectors](dev/docs/connectors/) — per-connector pages: purpose, URL format, and practical examples.
- [URL Parameter Reference](dev/docs/reference/) — every connector's recognised query parameters (name, type, default, required), generated from the JSON Schemas `copy` uses to parse `--from`/`--to`.

### MCP server

`mq-bridge-app mcp` exposes the bridge as [MCP](https://modelcontextprotocol.io) tools, so an LLM agent can move data between any two supported endpoints from natural language. Nothing is preconfigured — `publish` and `start_route` take their endpoint(s) inline as JSON keyed by connector type, so the model picks both ends ad hoc; `list_routes`, `route_status`, and `stop_route` manage the routes already started, by name. No web UI is started.

```bash
# stdio — for local clients (Claude Code, Claude Desktop)
mq-bridge-app mcp

# streamable HTTP — for remote/shared clients
mq-bridge-app mcp --transport http --bind 127.0.0.1:9092
```

Five tools: `publish` (one message or a batch to any endpoint), `start_route` (move messages from an `input` to an `output`, with `batch_size` / `concurrency` / `exit_on_empty`), and `list_routes` / `route_status` / `stop_route` to manage what is running.

`mcp install` registers the running binary with your MCP clients, so you don't have to write the config by hand:

```bash
# every client detected on this machine (Claude Code, Claude Desktop, Cursor)
mq-bridge-app mcp install

# one client, project-scoped instead of global
mq-bridge-app mcp install --client cursor --local

mq-bridge-app mcp status      # where it is registered, and whether it still points here
mq-bridge-app mcp uninstall   # remove it again
```

For any client not written directly, `mcp install --print-config` prints the snippet to paste:

```json
{
  "mcpServers": {
    "mq-bridge": { "command": "mq-bridge-app", "args": ["mcp", "--transport", "stdio"] }
  }
}
```

**Full MCP documentation** — tools, endpoint and message shapes, examples, error handling, and known limitations — is in [dev/docs/MCP.md](dev/docs/MCP.md).

---

## Library

Beyond running as a standalone application, the core engine is available as a library so you can produce or consume messages with a unified API — no broker-specific SDK, one config format across all three bindings:

- **Rust** — [`mq-bridge`](https://github.com/marcomq/mq-bridge) (`cargo add mq-bridge`)
- **Python** — [`pip install mq-bridge-py`](https://pypi.org/project/mq-bridge-py/)
- **Node.js** — [`npm install mq-bridge`](https://www.npmjs.com/package/mq-bridge)

The core of the library are the `MessageConsumer` and `MessagePublisher` traits, found in `mq_bridge::traits`.

---

## How the UI differs

`mq-bridge-app`'s UI overlaps with API clients and collection tools like Postman, Bruno, ApiArc, and similar apps, but its center of gravity is different: it is designed around message bridging, runtime operation, and long-lived route management rather than just request composition.

The table below is intentionally broad. Exact feature sets vary by product and edition, but it captures the main difference in emphasis.

| Capability | mq-bridge | Postman | Bruno | Insomnia | Hoppscotch |
| --- | --- | --- | --- | --- | --- |
| Basic HTTP/API requests | ✓ | ✓ | ✓ | ✓ | ✓ |
| Scripting | — | ✓ | ✓ | ✓ | ✓ |
| Cookie jar | Not yet | ✓ | ✓ | ✓ | ~ |
| Multipart forms | — | ✓ | ✓ | ✓ | ✓ |
| Hex-level payload debugging | ✓ | — | — | — | — |
| Broker pub/sub workflow | ✓ | MQTT | — | — | MQTT |
| Long-lived consumers/routes | ✓ | — | — | — | — |
| Bridge traffic between protocols | ✓ | — | — | — | — |
| Replay messages | ✓ |  ~ | — | — | ~ |
| Local-first workspace | ✓ | ~ | ✓ | ✓ | ~ |
| Git-friendly config | ✓ | ~ | ✓ | ✓ | ~ |
| Cloud sync by default | — | ✓ | — | Optional | Optional |
| AI / agent features | — | ✓ | — | ~ | ~ |
| Encrypted config | ✓ | ~ | ~ | ~ | ~ |

In short:

- use Postman, Bruno, or ApiArc when your main job is crafting and sharing API requests, or if you have complex authentications or request workflows;
- use `mq-bridge-app` when you need to connect systems, move messages between protocols, inspect live traffic, and manage bridge-style runtime configuration.

## Features

### Connectivity
- **Multi-Protocol Support**: Bridge messages between **Kafka**, **IBM MQ**, **NATS**, **AMQP** (RabbitMQ), **MQTT**, **AWS SQS**, **gRPC**, **ZeroMQ**, **MongoDB**, **sqlx (MySQL, MariaDB, PostgreSQL)** and **HTTP**.
- **File System Integration**: Stream data from files (tail/read) or write messages to disk (append).
- **HTTP Webhooks**: Act as both an HTTP server (receiving webhooks) and client (calling external APIs), with full support for Request-Response patterns.

### Core Processing
- **Middleware Chains**: Define processing pipelines for routes, including **Dead Letter Queues (DLQ)** for robust error handling.
- **Deduplication**: Optional, persistent message deduplication to prevent processing redundant data.
- **High Performance**: Written in **Rust** using **Tokio**, ensuring low latency, high concurrency, and a small memory footprint.

### Operations & Management
- **Built-in Web UI**: Svelte-based management UI for publishers, consumers, routes, runtime status, presets, and imports.
- **Observability**: Production-ready with structured **JSON logging** and a **Prometheus** metrics endpoint.
- **Flexible Configuration**: Hierarchical configuration via files (YAML, JSON, TOML) and environment variables, perfect for Container/Kubernetes environments.

### Security & Storage
- **Config Security Modes**: Choose between plain config, extracted secrets, encrypted config, and persistent encrypted history depending on runtime target and available key storage.
- **Encrypted Message History**: Cached broker payloads and captured message history can be encrypted at rest to avoid leaving readable data behind after shutdown.
- **Local-First Operation**: Config files stay under your control instead of being tied to a mandatory cloud workspace.

## Performance

In our own benchmarks, forwarding messages over a local Unix-domain-socket IPC
transport (`static` source → `memory` publisher, batch_size 1024, concurrency 1)
sustained **1,202,926 rows/s** on commodity hardware.

For a CSV → JSONL file conversion (1,000,000 mixed-type rows, ~116 MiB, `copy
--batch-size 1024 --concurrency 1`), mq-bridge-app sustained **833,333 rows/s**
at **~20 MiB peak RSS**, about **43x faster** and ~22x leaner than Meltano
(`tap-csv` → `target-jsonl`, same file, same machine) at **~19,500 rows/s** /
444 MiB.

For a Postgres → JSONL file ETL job (1,000,000 rows, 7 mixed-type columns, `copy
--batch-size 1024 --concurrency 1`), mq-bridge-app sustained **266,951 rows/s**
at **~20 MiB peak RSS**, about **17.4x faster** and ~30x leaner than Meltano
(`tap-postgres` → `target-jsonl`, same table, same machine) at **15,356 rows/s** /
600 MiB.

Full setup and methodology for these scenarios (CSV→JSONL and Postgres→JSONL, 1M
rows, throughput + peak RSS) are in [`benches/etl/README.md`](benches/etl/README.md).

## Build from source

Building the CLI/server, the desktop (Tauri) app, or the Docker image from source
is covered in [`dev/docs/BUILD.md`](dev/docs/BUILD.md).

## Architecture & Web UI

This application demonstrates a unique usage of the `mq-bridge` library itself to serve its own management UI.

### Backend: `mq-bridge` as a web server

Instead of using a traditional web framework like Actix or Axum directly for the management API, the application uses [mq-bridge](https://github.com/marcomq/mq-bridge/)'s internal routing mechanism:

1.  **HTTP Input**: An `http` input endpoint listens on the configured UI port. It converts incoming HTTP requests into `CanonicalMessage`s.
2.  **WebUiHandler**: A custom `Handler` processes these messages. It acts as a router, serving static files (HTML, JS) or handling API requests (e.g. `/config`, `/schema.json`).
3.  **Response Output**: The handler returns a response message, which is sent to a `response` output endpoint, completing the HTTP request-response cycle.

This approach showcases the library's ability to handle request-reply patterns and serve as a lightweight web server.

### Frontend: `vanilla-schema-forms`

The Web UI is dynamically generated from the Rust configuration structures:

1.  **Schema Generation**: The backend uses `schemars` to generate a JSON Schema for the `AppConfig` struct at runtime. This is exposed via `/schema.json`. It is also available via CLI: `mq-bridge-app --schema dev/config/schema.json`
2.  **Dynamic Form**: The frontend uses [vanilla-schema-forms](https://github.com/marcomq/vanilla-schema-forms) to render a complete configuration form based solely on this schema.
3.  **No UI Code Changes**: When new features or configuration options are added to the Rust code (e.g. a new middleware), the schema updates automatically and the UI reflects these changes without requiring any frontend code modifications.

## Status

> **Note**: This project is currently in **Active Development**.

It originally served as the primary reference implementation and testbed for the [mq-bridge](https://github.com/marcomq/mq-bridge) library.

The UI was unfortunately mostly vibe coded. It doesn't mirror the general mq-bridge or mq-bridge-app core/cli standards. Don't use the current UI / Tauri code as a reference implementation — I wouldn't recommend using it in production yet without testing.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
