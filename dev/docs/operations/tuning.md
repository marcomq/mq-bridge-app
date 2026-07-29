# Performance tuning

`mq-bridge` is fast by default and stays out of your way until you need more. This page is the
map of the knobs that trade throughput against latency, memory, and ordering — what each one
does, when raising it helps, and when it hurts.

## Philosophy: fast by default, safe knobs

The engine is optimized around **batch-shaped APIs** on every endpoint, even when the backend
only has a single-message primitive. The headless surfaces ship tuned for throughput; the
low-level engine primitive stays conservative so embedded routes are predictable and easy to
reason about. Tuning is opt-in: you raise a knob deliberately for a specific workload.

Two different starting points are worth knowing:

- **Library / config-mode routes** default to `batch_size: 1`, `concurrency: 1` — the engine
  primitive default, so an embedded route does nothing surprising until you opt in.
- **The `copy` CLI and the MCP server** default to `batch_size: 1024`, `concurrency: 4`
  (`--batch-size` / `--concurrency` on `copy`), because they exist for bulk moves. The
  benchmark numbers below use `copy`.

When throughput matters, **`batch_size` is almost always the first knob to try.**

## `batch_size` — the single most important knob

`batch_size` is the maximum number of messages a route gathers per iteration before handing the
batch to the sink. Larger batches amortize per-call overhead (network round-trips, SQL
statement prep, file syscalls) across many rows.

| Field | Default (library) | Default (`copy`) |
|---|---|---|
| `batch_size` | `1` | `1024` |

**When bigger helps:** row-oriented and high-latency sinks — SQL `INSERT`, HTTP POST, object
storage, ClickHouse. These pay a fixed cost per call, so moving from 1 to 128–1024 rows per
call is often a 10–100x throughput change. Databases especially: one multi-row insert beats a
thousand single-row inserts.

**When bigger hurts:**

- **Latency.** A larger batch means the first message waits longer before the batch flushes and
  ships. For a low-latency bridge, keep it small — or use a [`buffer`](#compression--encryption-cost)
  middleware with a `max_delay_ms` bound so a partial batch still flushes on a timer.
- **Memory.** The whole batch is held in memory (and, over IPC, written as one frame — frames
  over 100 MB are rejected). Very large batches of large payloads raise peak RSS.
- **Redelivery granularity.** A nack redelivers at batch granularity on some transports, so a
  big batch means more replayed work after a failure.

### Choosing `batch_size`

| Workload | Recommended `batch_size` |
|---|---|
| Bulk DB → file / file → DB ETL | `512`–`1024` |
| Broker → DB sink (row inserts) | `128`–`512` |
| Low-latency request/response or event bridge | `1`–`16` |
| Large payloads (MB-scale) | keep small; watch peak RSS and the 100 MB IPC frame cap |

## `concurrency` — sequential vs. worker pool

`concurrency` is the number of route worker tasks that process batches in parallel.

| Field | Default (library) | Default (`copy`) |
|---|---|---|
| `concurrency` | `1` | `4` |

**When it helps:** high-latency **handlers** or **sinks** where a worker spends most of its time
awaiting I/O — HTTP calls, remote databases. More workers keep the pipeline full while others
wait.

**Ordering implications.** With `concurrency > 1`, batches are processed in parallel, so
**strict per-key ordering across the route is not guaranteed.** Commits are still sequenced for
cumulative-ack brokers (a later batch cannot ack over an earlier unresolved one), but the *order
of side effects* at the sink can interleave. If you need ordering, keep `concurrency: 1` or
partition upstream so each key lands on one route.

**When it does *not* help.** Concurrency does not speed up sources that fetch serially. A
**MongoDB source** fetches batches serially — `concurrency` only widens the downstream side, not
the read. A single-connection cursor read is likewise source-bound. Raising `concurrency`
against a serial source just adds idle workers.

### Choosing `concurrency`

| Workload | Recommended `concurrency` |
|---|---|
| CPU-light copy, fast local sink | `1`–`4` |
| Per-message HTTP call / remote sink (I/O-bound) | `4`–`16` |
| Order-sensitive stream | `1` |
| MongoDB / serial-read source | `1` (widen downstream instead) |

`commit_concurrency_limit` (default `4096`) caps in-flight commit operations, whether queued
through ordered sequencing or run concurrently for independent-ack transports. Rarely needs
changing.

## Connection pooling / reuse

Publishers targeting the same server **share one underlying transport client by default** —
consolidating TCP connections, background threads, and batching, following each driver's own
guidance (one shared producer / client / pool per application). Sharing applies to **Kafka,
NATS, MongoDB, SQLx, HTTP, and gRPC**, keyed by connection-level settings (URL, auth, TLS),
never by topic/subject/collection.

Set `shared: false` on a publisher for a dedicated connection when sharing works against you:

- **Kafka** — isolate a latency-sensitive topic from a high-throughput one so they don't share
  one internal send queue (head-of-line blocking).
- **SQLx** — a shared pool's `max_connections` is a budget spread across every route on that
  database; give a hot route its own pool.
- **gRPC** — a shared channel multiplexes over one HTTP/2 connection; at very high concurrency
  its max-concurrent-streams cap can bottleneck.

See [Connection sharing](../engine/configuration.md#connection-sharing).

## Retry & backoff

The [`retry`](../engine/reference.md#retry) middleware retries only `Retryable` and
connection errors, with exponential backoff (`initial_interval_ms`, `multiplier`,
`max_interval_ms`). Tuning notes:

- Backoff caps at `max_interval_ms`, so retries don't stall a route indefinitely; pick a cap
  that matches your latency budget.
- Retry interacts with [`dlq`](../engine/reference.md#dlq): once attempts are exhausted the
  error is marked permanent so a following `dlq` captures it. **Put `dlq` after `retry`** on the
  output (last = outermost). Without a `dlq`, an exhausted message is dropped.
- Several endpoints already retry connection/timeout errors internally, so `retry` adds backoff
  *on top* — you don't need huge `max_attempts`.

## Compression & encryption cost

- **Compression** (`file` / `object_store` `compression: none|gzip|lz4|zstd`) trades CPU for
  smaller output. `lz4` is cheapest; `zstd` compresses best; `gzip` is roughly 33% slower than
  zstd at similar ratios in practice. See the [Compression](../cookbook/compression.md) recipe.
- **Encryption** costs an AEAD seal/open per batch. Do **not** stack the
  [`encryption`](../engine/reference.md#encryption) middleware on top of a sink's batch
  `compression` — ciphertext does not compress; use the file endpoints' own compress-then-encrypt
  fields instead. See [Encryption at rest](../cookbook/encryption.md).
- A `buffer` middleware in front of a compressing sink increases batch size, which improves
  compression ratio and amortizes the codec cost.

## Measuring

Never trust a single number without its methodology. Measure with a **release build** (a debug
build reports dramatically slower rates — if you're driving the [MCP server](../MCP.md),
call `server_info` first to confirm the build profile), record CPU/cores/RAM, and report the
exact `batch_size` / `concurrency` next to every figure.

- Attach the [`metrics`](../engine/reference.md#metrics) middleware and scrape the
  [Prometheus endpoint](observability.md) for live throughput/latency/error rates.
- For the MCP server, read `average_messages_per_second` for a **finished** job and
  `messages_per_second` for a **running** one (see [MCP route status](../MCP.md#route-status)).
- The like-for-like ETL/CDC methodology and fixed parameters are in
  [`benches/etl/README.md`](https://github.com/marcomq/mq-bridge-app/blob/main/benches/etl/README.md).

### Reference numbers

Measured through `mq-bridge-app`'s `copy` CLI (the zero-code path) on an Apple M1, 8 cores,
8 GB RAM. **Numbers are hardware-dependent — treat them as shape, not guarantees.**

| Scenario | Batch | Conc. | Throughput | Peak RSS |
|---|---|---|---|---|
| IPC forward (`static` → `memory`) | 1024 | 1 | **1,202,926 rows/s** | — |
| CSV → JSONL (strings passthrough, 1M rows ~116 MiB) | 1024 | 1 | **784,313 rows/s** | ~20 MiB |
| CSV → JSONL with typing `transform` (id→int, embedded JSON) | 1024 | 1 | **540,248 rows/s** | ~20 MiB |
| Postgres → JSONL (1M rows, 7 mixed-type cols) | 1024 | 1 | **266,951 rows/s** | ~20 MiB |
| Postgres → JSONL (same) | 1024 | 4 | **303,398 rows/s** | — |

Two things the table shows:

- **Typing has a real but modest cost.** Adding a `transform` that coerces `id` to an integer
  and decodes an embedded JSON document costs ~0.58 µs/row — CSV→JSONL drops from 784k to 540k
  rows/s but every output record is fully typed.
- **Peak RSS stays flat (~20 MiB) regardless of dataset size**, because rows stream in batches
  rather than being buffered whole — the reason mq-bridge is ~30x leaner than tools that
  materialize the dataset.

> **Keyset cursor needs an index.** The Postgres bulk-copy reader uses keyset pagination
> (`WHERE id > $cursor ORDER BY id LIMIT batch`). Without an index on the cursor column it does
> a full scan per batch (near-quadratic). `CREATE INDEX ON <table>(id)` first.

## A tuning checklist

1. Start from the defaults. Confirm correctness before tuning.
2. Raise `batch_size` (128 → 512 → 1024) and re-measure. This is usually the biggest win.
3. If the sink or handler is I/O-bound and order doesn't matter, raise `concurrency`.
4. Add `buffer` if the source emits singles but the sink prefers batches.
5. For hot Kafka/SQLx/gRPC publishers colliding with others, set `shared: false`.
6. Add `retry` + `dlq` for resilience; keep `max_attempts` modest.
7. Measure on a release build, with metrics, and record the parameters.
