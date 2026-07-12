# ETL / CDC benchmark harness (run through mq-bridge-app)

This harness produces **like-for-like ETL / data-movement numbers for the
mq-bridge engine, driven the way a real no-code user drives it** — through
`mq-bridge-app` configured by CLI/YAML, not a bespoke Rust harness. It mirrors
the scenarios and fixed parameters in the library's
[`benches/ETL_BENCHMARKS.md`](https://github.com/marcomq/mq-bridge/blob/dev/benches/ETL_BENCHMARKS.md),
so the output pastes straight into that document's **Results** section next to the
Debezium / OpenMessaging / Airbyte baselines.

**The two headline scenarios (§5 Postgres → JSONL and §6 CSV → JSONL)** are
full-dataset ETL jobs on a 1,000,000-row seed-42 dataset, reporting throughput
**and** peak RSS against a Meltano (`tap-*` → `target-jsonl`) baseline (see
[Results](#results--the-two-headline-etl-scenarios-1m-rows)). The remaining
scenarios (1 & 3 table→table copy, 2 CDC latency, 4 local IPC) are additional
coverage.

## Why this path is credible

Competing ETL/CDC tools publish "config in → data moved out" numbers. So do we:
scenarios 1 & 3 run through the app's zero-code `copy` command (a Postgres table
→ Postgres table job); scenario 2 runs a `postgres_cdc → null` route from a YAML
config applied over the app's HTTP API — the same action as clicking *Save* in
the UI. No scenario uses a Criterion micro-harness or hand-written Rust.

## Results — the two headline ETL scenarios (1M rows)

The two most common ETL jobs — **CSV → JSONL** and **Postgres → JSONL** — run on
the same seeded (seed 42) 7-column mixed-type dataset of 1,000,000 rows, against a
Meltano (`tap-*` → `target-jsonl`) baseline, reporting throughput **and** peak RSS
(detailed writeups in §5 and §6 below). Both columns are measured on the same
machine (this repo's Apple M1 host, on battery).

### A — CSV → JSONL (1,000,000 rows, ~116 MiB)

| Metric            | mq-bridge-app       | Meltano        |
| ----------------- | ------------------- | -------------- |
| Throughput        | **833,333 rows/s**  | ~19,500 rows/s |
| Median wall-clock | 1.20 s              | ~51 s          |
| Peak RSS          | 20.0 MiB            | 443.8 MiB      |
| Rows out          | 1,000,000           | 1,000,000      |

### B — Postgres → JSONL (1,000,000 rows, 7-col)

| Metric            | mq-bridge-app       | Meltano        |
| ----------------- | ------------------- | -------------- |
| Throughput        | **266,951 rows/s**  | 15,356 rows/s  |
| Median wall-clock | 3.75 s              | 65.1 s         |
| Peak RSS          | 19.9 MiB            | 599.7 MiB      |
| Rows out          | 1,000,000           | 1,000,000      |

`mq-bridge-app` moves the same 1M rows at **~20 MiB peak RSS** — an order of
magnitude leaner than Meltano's Python pipeline (444–600 MiB). Throughput and RSS
are single-machine, single-process batch numbers.

## Fixed parameters (printed next to every number)

| Parameter     | Value                                             |
| ------------- | ------------------------------------------------- |
| Payload       | 256 B and 4 KiB JSON rows (both reported)         |
| Message count | 1 000 000 per run                                 |
| Batch sizes   | 1 / 128 (table→table §1 & §3); 1024 (§5 & §6)     |
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

`copy` reads a seeded 1 000 000-row Postgres table and inserts into a fresh table,
wall-clocked. `rows/sec = 1 000 000 / elapsed`. The runner sweeps the full
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

### 4 — Local IPC throughput (Unix domain socket, no metrics middleware)

A `static` load generator (process A) forwards messages to a receiver (process B)
over a real Unix domain socket — a `memory:` endpoint with a `unix://` topic, so
this is genuine cross-process IPC, not just an in-process channel
([`ipc_sender.yaml`](ipc_sender.yaml) / [`ipc_receiver.yaml`](ipc_receiver.yaml)).
Both sides run with `batch_size: 1024, concurrency: 1`. After starting both routes
via `POST /consumer-start` (same zero-code "Start" action as scenario 2) and a
2-second settle window, `rows/sec` is the delta of the receiver's own per-batch
transport log (`count=`/`bytes=` from `ipc_unix.rs`, no metrics crate involved)
over a 15-second sampling window:

```bash
benches/etl/run_ipc_throughput.sh      # -> benches/etl/results/ipc_throughput.csv
```

**Latest result: 1,202,926 rows/s** at `concurrency: 1`. (`concurrency: 4` gave a
very slightly *lower* 1,167,428 rows/s — expected, since both sides talk over a
single Unix socket connection either way, serialized through one mutex-guarded
stream; extra worker concurrency here only adds channel-handoff overhead with no
real parallelism to gain.)

### 5 — Postgres → JSONL vs. Meltano (`tap-postgres` → `target-jsonl`)

Same source table (`bench`: 1,000,000 rows, 7 mixed-type columns — `id,
first_name, country, amount, created_at, active, attributes` — seed 42, the same
dataset scenario 6 reads as CSV), same Postgres instance, same machine, both
one-shot full-table syncs to a local JSONL file. Both sides run through
[`run_meltano_bench.sh`](run_meltano_bench.sh) (1 warm-up + timed runs each,
median/stddev, output row count verified against the 1,000,000-row source):

```bash
benches/etl/run_meltano_bench.sh   # both sides -> results/meltano_pg_to_jsonl.csv
```

```bash
mq-bridge-app copy \
  --from 'postgres://testuser:testpass@localhost:5432/testdb?table=bench&cursor_column=id&sslmode=disable' \
  --to   'file:///tmp/mqb_bench_out.jsonl?format=raw' \
  --drain --batch-size 1024 --concurrency 1
```

Meltano side: `benches/etl/meltano_project/bench` (`meltano.yml` configures
`tap-postgres` selecting only `public-bench.*`, and `target-jsonl`), run via
`meltano run tap-postgres target-jsonl`, wall-clocked the same way.

| Tool | Config | rows/s | peak RSS |
| --- | --- | --- | --- |
| mq-bridge-app `copy` | batch_size 1024, concurrency 1 | **266,951** | 19.9 MiB |
| Meltano (`tap-postgres` → `target-jsonl`) | default Singer config | 15,356 | 599.7 MiB |

**mq-bridge-app is ~17.4x faster** (and ~30x leaner in peak memory) in this scenario. No `metrics` middleware
involved here either — the `copy` CLI command never attaches a handler (see
scenario 4's CommandPublisher bug/fix note), so there's no metrics path to
accidentally measure in the first place.

### 6 — CSV → JSONL vs. Meltano

A common ETL benchmark is a CSV → JSONL conversion. Same seeded dataset (`data/bench.csv`: 1,000,000
mixed-type rows — `id, first_name, country, amount, created_at, active,
attributes` — seed 42, ~116 MiB, generated by [`gen_bench_data.py`](gen_bench_data.py)),
same machine, both one-shot full-file CSV → local JSONL, one JSON object per
input row (string-valued fields — the shape both mq-bridge's CSV reader and
tap-csv emit):

```bash
benches/etl/run_csv_to_jsonl.sh   # -> benches/etl/results/csv_to_jsonl.csv
```

```bash
mq-bridge-app copy \
  --from 'file:///…/benches/etl/data/bench.csv?format=csv' \
  --to   'file:///tmp/mqb_csv_out.jsonl?format=raw' \
  --drain --batch-size 1024 --concurrency 1
```

Meltano side: same `meltano_project/bench` project with a `tap-csv` extractor
(pinned to `tap-csv 1.3.2`) → `target-jsonl 0.1.4`, run via
`meltano run tap-csv target-jsonl`. Install the plugin once with
`(cd meltano_project/bench && ../.venv/bin/meltano install extractor tap-csv)`.

| Tool | Config | rows/s | peak RSS |
| --- | --- | --- | --- |
| mq-bridge-app `copy` | batch_size 1024, concurrency 1 | **833,333** (median of 2 clean runs: 1.210s / 1.190s) | 20.0 MiB |
| Meltano (`tap-csv` → `target-jsonl`) | default Singer config | ~19,500 (clean runs 49.7s / 53.1s; fuller 5-run median pending) | 443.8 MiB |

**mq-bridge-app is ~43x faster** (and ~22x leaner in peak memory) in this scenario.

**A note on this benchmark:**

- **The CSV number does not scale with batch size or concurrency.** A `file://`
  source is a single sequential reader, so extra route workers can't parallelize
  the read; the bottleneck is per-row CSV→JSON conversion on the one reader, not
  I/O or batching. After the CSV-path optimization this baseline sits at ~833k,
  close to the raw byte-passthrough `file→file` reference (~880k, no CSV decode),
  so the remaining CSV-decode overhead is now small.

## Reference baselines to line up against

- **Debezium** — Postgres CDC latency/throughput → scenario 2.
- **OpenMessaging Benchmark** — payload sizes + latency-percentile reporting → 1/3.
- **Airbyte** — records/sec for a full-table sync → scenario 1.

## Teardown

```bash
benches/etl/seed.sh down
```
