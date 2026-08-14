# CLI commands

`mq-bridge-app` is a single headless binary with three modes: **config mode** (the default —
run a long-lived bridge, optionally serving the browser UI), the **`copy`** subcommand (an
ad-hoc one-route job), and the **`mcp`** subcommand (expose the bridge as MCP tools).

```text
mq-bridge-app [OPTIONS]            # config mode
mq-bridge-app copy [COPY OPTIONS]  # one-route ad-hoc job
mq-bridge-app mcp  [MCP OPTIONS]   # MCP server
```

## Config mode (default)

Run with no subcommand to load a config and run a bridge; with no config at all it starts
empty and serves the UI so you can build one interactively.

```bash
mq-bridge-app --config config.yml
mq-bridge-app --config config.yml --init-config dev/config/file-to-http.yml
mq-bridge-app                      # start empty, define config.yml in the UI
```

| Option | Meaning |
|---|---|
| `-c, --config <path>` | Config file to load **and** save (the UI writes back here). |
| `-i, --init-config <path>` | Initialize from a template file only if the main config doesn't exist yet. |
| `--init-config-str <str>` | Initialize from an inline config string if the main config doesn't exist yet. |
| `--config-str <str>` | Inline config that overrides the config file. |
| `--schema <path>` | Write the JSON Schema for `AppConfig` (use `-` for stdout) and exit. |
| `--plugin <path>` | Load a native endpoint/middleware library before starting. Repeatable, valid on every subcommand, and combines with `plugins:` in the config — see [Native plugins](../extending/plugins.md). |

Config is hierarchical (files + environment variables) — see
[Configuration grammar](../engine/configuration.md). In config mode the CLI also serves the browser UI
(the same UI as the desktop app) on the configured port.

## `copy` — ad-hoc one-route job

Builds a single route from two endpoint URIs and runs it headlessly (no web UI). The scheme
selects the endpoint and query parameters set its config.

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

| Flag | Default | Meaning |
|---|---|---|
| `--from <uri>` | required | Source endpoint URI, optionally followed by `\|`-separated middlewares. |
| `--to <uri>` | required | Destination endpoint URI (same forms as `--from`). |
| `--drain` | off | Exit once the source yields an empty batch. Without it, `copy` runs as a continuous bridge until Ctrl-C. |
| `--concurrency <N>` | `4` | Route concurrency. |
| `--batch-size <N>` | `1024` | Batch size. |

> Note: `copy`'s defaults (`--concurrency 4`, `--batch-size 1024`) are higher than the
> library's route defaults (`concurrency: 1`, `batch_size: 1`), because `copy` is built for
> bulk throughput. See [Performance tuning](../operations/tuning.md).

### Resumable copies

By default a `copy` re-reads the whole source every run. Add `cursor_column` (SQL) or
`consume=capture_all` (MongoDB) plus a `cursor_id` on `--from` and the position is persisted, so
each run copies only what is new — a `copy … --drain` on a timer becomes an incremental sync:

```bash
mq-bridge-app copy \
  --from 'postgres://user:pass@localhost/app?table=orders&cursor_column=id&cursor_id=orders_sync' \
  --to   'file:///data/orders.jsonl' \
  --drain
```

Without `cursor_id` nothing is persisted. `checkpoint_store` chooses where the position lives
(source DB by default; `file://`, `postgres://`, `mongodb://`, `s3://` otherwise) and must be
percent-encoded inside the URI. Full details, guarantees and gotchas:
[Checkpoints & resumable copies](../cookbook/checkpoints.md).

### URI grammar

`scheme://…?param=a&next=b`: the **scheme selects the endpoint** and **query parameters set
its config**. Any query key that matches a field of that endpoint's config becomes endpoint
config; every other query param stays on the connection URL, so driver params pass through
unchanged (e.g. `postgres://…/db?table=src&sslmode=disable`).

- **Schemes**: `postgres` / `postgresql` / `mysql` / `mariadb` / `sqlite` → sqlx, `nats` →
  NATS, `mongodb` → MongoDB, `redis` → Redis streams, `file` → file,
  `s3` / `gs` / `az` / `abfs` → cloud object storage (credentials from the environment), and
  the rest by name.
- **Common config params**: `table`, `insert_query` (URL-encoded; supports
  `${metadata:<key>}` / `${payload:<field>}` token mapping), `delete_after_read`, `subject`,
  `stream`, `collection`, `database`, `format`, … — anything on the endpoint's config struct.
- For `nats`, the dominant target field can be given as the URL path
  (`nats://localhost:4222/orders` ≡ `?subject=orders`); the query form wins if both are given.
  A `redis` path is the connection's database number, so a redis stream target must use
  `?stream=…`.
- MongoDB sources are **non-destructive by default**: `copy` defaults `consume` to
  `capture_all`. Pass `?consume=consumer` to opt into the destructive queue-drain mode
  (`capture_*` use change streams, which require a replica set).

### Middlewares in the URI

Append `|`-separated middlewares to either URI to wrap that endpoint. They apply in the order
written, and each takes its own config struct's fields as query params:

```bash
mq-bridge-app copy \
  --from 'postgres://user:pass@localhost/db?table=src|retry?max_attempts=5&initial_interval_ms=200' \
  --to   'kafka://broker:9092?topic=orders|buffer?max_messages=500&max_delay_ms=50|metrics' \
  --drain
```

- Names: `retry`, `metrics`, `dlq`, `deduplication`, `transform`, `delay`, `limiter`,
  `buffer`, `weak_join`, `cookie_jar`, `random_panic`, `compression`, `encryption`, `custom`
  (`-` is accepted for `_`).
- `encryption`'s `key` is a shell-visible argument; prefer `${env:VAR}` to keep it out of the
  process list and shell history: `|encryption?key=$%7Benv:MQB_KEY%7D`.
- `compression` and `encryption` produce **binary** payloads, so a `file` sink holding them must
  use `format=normal`. `format=json`/`text` render the payload as a JSON value and it does not
  survive the round trip (it comes back as a JSON array, and the reader reports a bogus
  "unsupported encryption envelope version 91").
- Middlewares apply in list order on **both** ends, so a route that reads back what another wrote
  must list them in the **reverse** order. Writing with `|compression?algorithm=zstd|encryption?key=…`
  reads back with `|encryption?key=…|compression?algorithm=zstd`.
- A middleware with no params needs no `?` — `|metrics`.
- `dlq`'s `endpoint` is itself a URL-encoded endpoint URI:
  `|dlq?endpoint=file%3A%2F%2F%2Ftmp%2Ffailed.jsonl`.
- Object/array fields take a JSON literal:
  `|weak-join?group_by=cid&expected_count=2&timeout_ms=1000&required=["a","b"]`.
- A literal `|` inside the URI (e.g. in a password) must be written percent-encoded as `%7C`.

### Escape hatch: full connection strings

Any query parameter that isn't a recognised config field (e.g. `sslmode`, `replicaSet`) stays
on the connection URL, so driver options just work — including object-typed fields like `tls`.
If you already have a complete connection string, pass it verbatim with `?url=<url-encoded>`:

```bash
mq-bridge-app copy \
  --from 'mongodb://_/?url=mongodb%3A%2F%2Fuser%3Apass%40host%2Fdb%3Ftls%3Dtrue&collection=orders' \
  --to null:
```

See the [Quick start](../quick-start.md) for complete, working `copy`
commands.

## `mcp` — MCP server

```bash
mq-bridge-app mcp                                    # stdio (local clients)
mq-bridge-app mcp --transport http --bind 127.0.0.1:9092   # streamable HTTP
```

| Flag | Default | Meaning |
|---|---|---|
| `--transport <stdio\|http>` | `stdio` | Transport. `stdio` for local clients (Claude Desktop/Code), `http` for streamable HTTP over hyper. |
| `--bind <addr>` | `127.0.0.1:9092` | Bind address; `--transport http` only. |
| `--report-to-ui` | off | Report running routes / publish targets to a local mq-bridge-app UI over a local IPC socket. Only names, connector types, health and counts are sent — never URLs or credentials. |

### `mcp install` / `uninstall` / `status`

Register the running binary with local MCP clients so you don't write the config by hand:

```bash
mq-bridge-app mcp install                         # every detected client
mq-bridge-app mcp install --client cursor --local  # one client, project-scoped
mq-bridge-app mcp install --report-to-ui           # bake --report-to-ui into the entry
mq-bridge-app mcp status
mq-bridge-app mcp uninstall
```

| Subcommand | Flags | Purpose |
|---|---|---|
| `install` | `--client`, `--local`, `--report-to-ui`, `--print-config` | Register this binary (its absolute path). |
| `uninstall` | `--client`, `--local` | Remove the registration. |
| `status` | `--local` | Show where it is registered and whether the path is still current. |

`--print-config` prints the JSON snippet for a client not written directly. Full tool and
message reference is in [MCP server](../MCP.md).
