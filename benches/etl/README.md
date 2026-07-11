# ETL / CDC benchmark harness (run through mq-bridge-app)

This harness produces **like-for-like ETL / data-movement numbers for the
mq-bridge engine, driven the way a real no-code user drives it** — through
`mq-bridge-app` configured by CLI/YAML, not a bespoke Rust harness. It mirrors
the scenarios and fixed parameters in the library's
[`benches/ETL_BENCHMARKS.md`](https://github.com/marcomq/mq-bridge/blob/dev/benches/ETL_BENCHMARKS.md),
so the output pastes straight into that document's **Results** section next to the
Debezium / OpenMessaging / Airbyte baselines.

## Why this path is credible

Competing ETL/CDC tools publish "config in → data moved out" numbers. So do we:
scenarios 1 & 3 run through the app's zero-code `copy` command (a Postgres table
→ Postgres table job); scenario 2 runs a `postgres_cdc → null` route from a YAML
config applied over the app's HTTP API — the same action as clicking *Save* in
the UI. No scenario uses a Criterion micro-harness or hand-written Rust.

## Fixed parameters (printed next to every number)

| Parameter     | Value                                             |
| ------------- | ------------------------------------------------- |
| Payload       | 256 B and 4 KiB JSON rows (both reported)         |
| Message count | 100 000 per run                                   |
| Batch sizes   | 1 (unbatched) and 128 (batched)                   |
| Concurrency   | 1 and 4 route workers                             |
| Postgres      | `postgres:16-alpine`, `wal_level=logical`         |
| Warm-up       | 5 000-message pre-roll, excluded from timing      |
| Environment   | CPU model, cores, RAM, mq-bridge(-app) version    |

Payload rows are `{"id":<n>,"pad":"xxx…"}` padded to exactly 256 / 4096 bytes.

## One-time setup

```bash
# 1. Lean release binary — just Postgres bulk-insert + CDC + metrics + TLS.
#    (Avoids the heavy `full` deps: rdkafka/librdkafka, grpc/protoc, ibm-mq.)
cargo build -p mq-bridge-app --no-default-features --features bench --release

# 2. Postgres 16 with logical replication (mirrors the library's CDC compose).
benches/etl/seed.sh up
```

Requires Docker, `curl`, and `python3` (sub-second timing) on PATH. A host `psql`
is used if present; otherwise the harness runs `psql` inside the compose container,
so no host Postgres client is needed.

## Scenarios & commands

### 1 & 3 — bulk-insert / batched-vs-unbatched throughput

`copy` reads a seeded 100 000-row Postgres table and inserts into a fresh table,
wall-clocked. `rows/sec = 100 000 / elapsed`. The runner sweeps the full
payload × batch × concurrency matrix and re-seeds before each timed run:

```bash
benches/etl/run_throughput.sh          # -> benches/etl/results/throughput.csv
```

The single underlying command (what a user would type) is:

```bash
mq-bridge-app copy \
  --from 'postgres://testuser:testpass@localhost:5432/testdb?table=src_256&cursor_column=id&sslmode=disable' \
  --to   'postgres://testuser:testpass@localhost:5432/testdb?table=dst_256&auto_create_table=true&sslmode=disable' \
  --drain --batch-size 128 --concurrency 4
```

`cursor_column=id` reads the source table non-destructively, paging on the
monotonic `id` column (the sqlx cursor reader — an incremental-sync read like
Airbyte's). Each moved record is the source row as JSON
(`{"id":N,"payload":"…"}`); the `payload` column is sized to exactly 256 B / 4 KiB.
Scenario 3 (the batching lever) is the `batch=1` vs `batch=128` rows of the same
matrix. The library's Criterion harness additionally covers the `memory` backend.

### 2 — CDC event-to-sink latency

A `postgres_cdc → null` route ([`cdc_latency.yaml`](cdc_latency.yaml)) with the
`metrics` middleware on the input endpoint. The runner boots the app with
`--config cdc_latency.yaml`, then **starts the route via `POST /consumer-start`**
— the zero-code equivalent of clicking *Start* in the UI. (Consumers do **not**
auto-start headless, and `POST /config` only validates+saves; it does not start
routes.) It then inserts rows into the captured table, waits for the processed
counter to settle, and reads the `queue_message_processing_duration_seconds`
summary quantiles:

```bash
benches/etl/run_cdc_latency.sh         # -> benches/etl/results/cdc_latency.csv
```

Two behaviours to know (validated in a smoke run):

- **Use a permanent replication slot** (`temporary_slot: false`, as in the YAML):
  a temporary slot is dropped when its creating connection closes and races the
  streaming connection (`replication slot "…" does not exist`). The runner drops
  the slot before each run for a clean start.
- **CDC delivers at ~transaction granularity:** one multi-row transaction arrives
  as a *single* processed message. So `queue_messages_processed_total` counts
  delivered messages, not rows, and to get N change events (each with its own
  latency sample) you insert **N single-row transactions**, not one bulk
  `generate_series`. The runner waits for the counter to *stop increasing* rather
  than reaching an exact row total.

**What this measures (be honest when publishing):** the metric is the engine's
**per-event in-engine processing time on the consumer side** (decode + hand-off),
exposed as Prometheus summary quantiles. It is *not* the full Postgres
commit → sink wall-clock that Debezium reports end-to-end; it excludes
replication-slot/WAL propagation delay. Report it as "mq-bridge CDC processing
latency (p50/p95/p99)" and note the difference rather than implying it is
identical to Debezium's end-to-end figure. New CDC endpoint schemes were also
added to `copy` (`postgres-cdc://… → null:`), which gives a wall-clock CDC
*throughput* cross-check if you want one.

## Reference baselines to line up against

- **Debezium** — Postgres CDC latency/throughput → scenario 2.
- **OpenMessaging Benchmark** — payload sizes + latency-percentile reporting → 1/3.
- **Airbyte** — records/sec for a full-table sync → scenario 1.

## Teardown

```bash
benches/etl/seed.sh down
```

## Results block to paste into the library's `ETL_BENCHMARKS.md`

Fill the cells from `results/throughput.csv` and `results/cdc_latency.csv`; the
environment line is printed by `benches/etl/lib.sh:print_env_header`.

```markdown
**Environment:** <CPU> · <N> cores · <RAM> · <OS> · mq-bridge-app <ver> · engine <commit> · postgres:16-alpine (wal_level=logical)

### Scenario 1 — bulk-insert throughput (copy, table→table, exact 100k rows)

| Payload | Batch | Concurrency | rows/sec | Baseline ref     |
| ------- | ----- | ----------- | -------- | ---------------- |
| 256 B   | 1     | 1           |          | Airbyte records/s |
| 256 B   | 128   | 1           |          | Airbyte records/s |
| 256 B   | 128   | 4           |          | Airbyte records/s |
| 4 KiB   | 1     | 1           |          | Airbyte records/s |
| 4 KiB   | 128   | 1           |          | Airbyte records/s |
| 4 KiB   | 128   | 4           |          | Airbyte records/s |

### Scenario 3 — batched vs unbatched (same route, batch 1 vs 128)

| Payload | Concurrency | batch=1 rows/s | batch=128 rows/s | speed-up |
| ------- | ----------- | -------------- | ---------------- | -------- |
| 256 B   | 1           |                |                  |          |
| 4 KiB   | 1           |                |                  |          |

### Scenario 2 — CDC processing latency (postgres_cdc → null, metrics proxy)

_In-engine per-event processing latency (consumer side), NOT Debezium-style
end-to-end commit→sink; excludes WAL/slot propagation._

| Payload | p50 | p95 | p99 | Baseline ref |
| ------- | --- | --- | --- | ------------ |
| 256 B   |     |     |     | Debezium     |
| 4 KiB   |     |     |     | Debezium     |
```
