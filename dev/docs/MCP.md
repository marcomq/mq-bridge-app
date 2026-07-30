# MCP server

`mq-bridge-app mcp` runs the bridge as an [MCP](https://modelcontextprotocol.io)
server, so an LLM agent can move data between any two supported endpoints from
natural language. Nothing is preconfigured: `publish` and `start_route` take
their endpoint(s) inline as JSON keyed by connector type, so the model picks
both ends ad hoc. `list_routes`, `route_status`, and `stop_route` manage the
routes already started, by name.

No web UI is started in this mode.

```bash
# stdio — for local clients (Claude Code, Claude Desktop)
mq-bridge-app mcp

# streamable HTTP — for remote/shared clients
mq-bridge-app mcp --transport http --bind 127.0.0.1:9092
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--transport` | `stdio` | `stdio` for local clients, `http` for streamable HTTP (served over hyper) |
| `--bind` | `127.0.0.1:9092` | Listen address; `--transport http` only |

Logs go to **stderr**, because `stdio` transport owns stdout for the protocol
itself.

## Registering with a client

`mcp install` writes the client config for you, registering the **absolute path
of the binary you just ran** — so a `target/debug` build and an installed
release binary each register themselves correctly.

```bash
# every client detected on this machine
mq-bridge-app mcp install

# a single client, project-scoped rather than global
mq-bridge-app mcp install --client cursor --local

# bake --report-to-ui into the registered command
mq-bridge-app mcp install --report-to-ui
```

| Command | Purpose |
| --- | --- |
| `mcp install` | Register this binary. `--client`, `--local`, `--report-to-ui`, `--print-config`. |
| `mcp uninstall` | Remove the registration. `--client`, `--local`. |
| `mcp status` | Show where it is registered and whether the path is still current. |

| Client | Global config | Project config (`--local`) |
| --- | --- | --- |
| `claude` (Claude Code) | `claude mcp add --scope user`, else `~/.claude.json` | `--scope project`, else `./.mcp.json` |
| `claude-desktop` | `claude_desktop_config.json` | not supported |
| `cursor` | `~/.cursor/mcp.json` | `./.cursor/mcp.json` |

Where the client ships its own CLI (Claude Code) that CLI is driven, since it
stays correct across config-schema changes; otherwise the entry is merged into
the client's JSON, leaving every other registered server untouched. Installing
twice is a no-op.

With `--client` omitted, every client detected on the machine is configured.
For anything not listed above, `mcp install --print-config` prints the snippet:

```json
{
  "mcpServers": {
    "mq-bridge": {
      "command": "mq-bridge-app",
      "args": ["mcp", "--transport", "stdio"]
    }
  }
}
```

Use an absolute path to the binary if it is not on `PATH`. With
`--transport http`, point your client at `http://127.0.0.1:9092/` instead.

Restart the client fully after installing — reopening a tab is not enough.

Under `stdio` the client spawns the server process, so a rebuilt binary is only
picked up after the client restarts the server — an edit to `mcp.rs` alone will
not change the behaviour of an already-running session.

## Tools

| Tool | Purpose |
| --- | --- |
| `publish` | Send one message (`message`) or a batch (`messages`) to any endpoint. Independent of routes. |
| `start_route` | Run a route moving messages from `input` to `output`. Returns the route name. |
| `server_info` | Engine version, build profile and build time. Call it before relying on the throughput figures below (a debug build reports slower rates). |
| `list_routes` | List routes started by this server, with live connection health. |
| `route_status` | Health of one route (by `name`) or all of them. |
| `stop_route` | Stop a running route by `name`. |

### Endpoints

Every endpoint is a single-key JSON object naming the connector:

```json
{"kafka":   {"url": "localhost:9092", "topic": "orders"}}
{"nats":    {"url": "nats://localhost:4222", "stream": "ORDERS", "subject": "ORDERS.new"}}
{"sqlx":    {"url": "postgres://user:pass@localhost:5432/db", "table": "events"}}
{"file":    {"path": "/tmp/out.jsonl", "format": "json"}}
{"null":    null}
```

`{"null": null}` as an `output` discards messages — useful for draining a source.
The full option list per connector is in [reference/](./reference/).

### Messages

A message is a `payload` plus optional string `metadata` headers and an optional
`message_id` (a UUIDv7 is generated when omitted). A string payload is sent
verbatim; any other JSON value is serialized to JSON bytes.

```json
{
  "payload": {"id": 1, "sku": "A-100", "qty": 3},
  "metadata": {"kind": "order", "correlation_id": "abc-123"}
}
```

Conventional metadata keys: `kind` (message type, drives type-based routing),
`correlation_id` and `reply_to` (request/reply). Keys starting with `mqb.src.`
are reserved for provenance and are stripped on input.

### Route options

Alongside `input` and `output`, a route accepts the usual execution options —
`batch_size`, `concurrency`, and `exit_on_empty` (drain the source, then exit).
Without `exit_on_empty` a route polls indefinitely until `stop_route`.

### Route status

`route_status` (and `list_routes`) report two rates, and they answer different
questions:

| Field | Meaning |
| --- | --- |
| `messages` | Total messages the route has moved. |
| `messages_per_second` | **Instantaneous** rate, smoothed over ~0.5 s. Decays to ~0 within a second of a route going idle. |
| `elapsed_s` | The span over which those messages moved: route start → last message seen. Stops growing once the route goes idle. |
| `average_messages_per_second` | `messages / elapsed_s` — the rate the route **actually achieved**. |

For a route that is running now, read `messages_per_second`. For one that has
finished — anything started with `exit_on_empty` — read
`average_messages_per_second`: the instantaneous rate of a completed job is ~0 by
the time any status call observes it, which says nothing about how fast it was.
`stop_route` returns the same two fields as its parting summary.

`elapsed_s` and `average_messages_per_second` are `null` until the route has been
sampled at least once (the sampler runs every 200 ms), so a job that finishes
inside one tick reports no average.

## Examples

Publish a batch to NATS JetStream:

```json
{
  "publisher": {"nats": {"url": "nats://localhost:4222", "stream": "ORDERS", "subject": "ORDERS.new"}},
  "messages": [
    {"payload": {"id": 1, "sku": "A-100"}, "metadata": {"kind": "order"}},
    {"payload": {"id": 2, "sku": "B-200"}, "metadata": {"kind": "order"}}
  ]
}
```

Drain a Redis stream into Postgres, then exit:

```json
{
  "name": "redis-to-postgres",
  "route": {
    "input":  {"redis_streams": {"url": "redis://localhost:6379", "stream": "events",
                                 "group": "g1", "read_from_start": true}},
    "output": {"sqlx": {"url": "postgres://user:pass@localhost:5432/db",
                        "table": "events", "auto_create_table": true}},
    "batch_size": 10,
    "exit_on_empty": true
  }
}
```

## Errors

Invalid endpoints, duplicate route names, and unknown route names come back as
JSON-RPC `-32602` (invalid params); a connection failure at publish time reports
the underlying transport error:

```text
invalid publisher endpoint: IO error: Connection refused (os error 61)
```

A partially failed batch returns a result flagged `is_error` with a
`{"status": "Partial", "sent": N, "failed": M, "errors": [...]}` summary, so a
partial send is not mistaken for success.

## Known limitations

This originates in the upstream `mq-bridge` crate, not in the MCP layer.

- **Finished routes are not reaped.** A route started with `exit_on_empty` stays
  in `list_routes` after it has drained and exited; call `stop_route` to clear
  it. It is no longer indistinguishable from a running one, though: since
  mq-bridge 0.3.6 each entry carries `"finished"` plus an `"outcome"`. While the
  route runs these are `false` / `null`; once its task ends, `"finished": true`
  and `"outcome"` is `completed` (drained cleanly) or `failed` (permanent error
  — the cause is in `status.error`).

  `stop_route` removes the entry from `list_routes` as it stops the route, so
  the third outcome, `stopped`, is not observable through these tools.

## Testing against local brokers

The compose files in the `mq-bridge` repo bring up the brokers:

```bash
cd ../mq-bridge/tests/integration/docker-compose
docker compose -f nats.yml -f postgres.yml -f redis.yml up -d
```

Verified end-to-end against these: batch publish to file/NATS/Redis Streams,
`NATS → file` and `Redis Streams → Postgres` routes (including
`auto_create_table`), the full route lifecycle, and the error paths above.

## Performance

A tool call round-trips in ~0.065 ms (p50) over stdio, and a route started through
`start_route` moves data at the same rate the `copy` CLI does, within run-to-run
variance — the interface costs one round-trip, not a per-row tax. A 1,000,000-row
CSV → JSONL job runs at 735,330 rows/s and costs the agent three tool calls
(~370 tokens), because the rows never pass through the model's context.

Methodology and the client used to measure it (a real MCP client over stdio, not an
in-process harness) are in [`benches/etl/README.md`](../../benches/etl/README.md),
scenario 7. Call `server_info` before trusting any throughput number: it reports the
build `profile`, and a debug binary invalidates the measurement.
