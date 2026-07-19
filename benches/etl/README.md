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
**and** peak RSS against a Sling and a Meltano (`tap-*` → `target-jsonl`) baseline (see
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
the same seeded (seed 42) 7-column mixed-type dataset of 1,000,000 rows, against two
baselines — Sling (a compiled Go EL tool) and Meltano (`tap-*` → `target-jsonl`) —
reporting throughput **and** peak RSS (detailed writeups in §5 and §6 below). All
columns are measured on the same machine (this repo's Apple M1 host, on battery).

### A — CSV → JSONL (1,000,000 rows, ~116 MiB)

mq-bridge-app is measured **twice**, because the two configurations do different
work and each has a baseline it legitimately belongs against:

| Metric            | mq-bridge-app (typed) | mq-bridge-app (untyped) | Sling           | Meltano        |
| ----------------- | --------------------- | ----------------------- | --------------- | -------------- |
| Throughput        | **540,248 rows/s**    | **784,313 rows/s**      | 127,959 rows/s  | ~19,500 rows/s |
| Median wall-clock | 1.85 s                | 1.28 s                  | 7.82 s          | ~51 s          |
| Peak RSS          | 69.7 MiB              | 18.9 MiB                | 111.2 MiB       | 443.8 MiB      |
| Rows out          | 1,000,000             | 1,000,000               | 1,000,000       | 1,000,000      |

- **typed** runs a `transform` middleware that reproduces Sling's typing exactly,
  and the harness fails the run unless all 1,000,000 output records match. **This
  is the column to read against Sling** (~4.2x), and the only one that is
  like-for-like.
- **untyped** runs no middleware: every field stays the string the CSV reader
  produced. This is the column to read against **Meltano** (~40x), whose `tap-csv`
  likewise emits every field as a string — and it is the floor the transform's cost
  is measured against.

Quoting the untyped figure against Sling would overstate the margin (it would read
~6.1x); quoting the typed figure against Meltano understates it. See
[A note on the Sling comparison](#a-note-on-the-sling-comparison). Peak RSS
(measured with `/usr/bin/time -l`): untyped **18.9 MiB**, typed **69.7 MiB** — the
transform's per-row JSON decode/buffer adds ~51 MiB, still well under Sling's
111.2 MiB and Meltano's 443.8 MiB.

### B — Postgres → JSONL (1,000,000 rows, 7-col)

| Metric            | mq-bridge-app       | Sling           | Meltano        |
| ----------------- | ------------------- | --------------- | -------------- |
| Throughput        | **266,951 rows/s**  | 122,774 rows/s  | 15,356 rows/s  |
| Median wall-clock | 3.75 s              | 8.15 s          | 65.1 s         |
| Peak RSS          | 19.9 MiB            | not yet measured| 599.7 MiB      |
| Rows out          | 1,000,000           | 1,000,000       | 1,000,000      |

`mq-bridge-app` moves the same 1M rows at **~20 MiB peak RSS** — an order of
magnitude leaner than Meltano's Python pipeline (444–600 MiB). Throughput and RSS
are single-machine, single-process batch numbers.

> **The two Sling columns are not on equal footing — check which one you're
> reading.** In **A (CSV)** the *typed* mq-bridge-app column does the same per-row
> work as Sling: it runs a `transform` middleware reproducing Sling's typing, and
> the outputs are asserted identical row-for-row, so that ratio is like-for-like.
> (A's *untyped* column is not — it belongs against Meltano.) In **B (Postgres)**
> the comparison is not equalised at all: there mq-bridge-app passes values through
> untyped while Sling does schema inference and type conversion, which is real work
> it does and mq-bridge-app doesn't. B has no typed column yet.
> See [A note on the Sling comparison](#a-note-on-the-sling-comparison).

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

# 3. Optional — the Sling CLI baseline for §5/§6 (compiled Go EL tool).
#    Kept repo-local so a run never depends on what's on PATH; both runners
#    skip the Sling block if it's absent.
mkdir -p benches/etl/bin && curl -sL \
  "https://github.com/slingdata-io/sling-cli/releases/latest/download/sling_darwin_arm64.tar.gz" \
  | tar -xz -C benches/etl/bin sling
```

Requires Docker, `curl`, `python3` (sub-second timing), and `uv` (used by
`seed.sh` to run `gen_bench_data.py` for the §5/§6 dataset) on PATH. A host `psql`
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

Sling side: `sling run --src-conn … --src-stream public.bench --tgt-object file://…`
with `{"format":"jsonlines","file_max_rows":0}`, defaults otherwise.

| Tool | Config | rows/s | peak RSS |
| --- | --- | --- | --- |
| mq-bridge-app `copy` | batch_size 1024, concurrency 1 | **266,951** | 19.9 MiB |
| Sling | defaults | 122,774 | not yet measured |
| Meltano (`tap-postgres` → `target-jsonl`) | default Singer config | 15,356 | 599.7 MiB |

**mq-bridge-app is ~2.0x faster than Sling and ~17.4x faster than Meltano** (and ~30x
leaner than Meltano in peak memory) in this scenario — but see
[the note on Sling below](#a-note-on-the-sling-comparison), because that ratio is
not comparing equal work. No `metrics` middleware
involved here either — the `copy` CLI command never attaches a handler (see
scenario 4's CommandPublisher bug/fix note), so there's no metrics path to
accidentally measure in the first place.

The mq-bridge-app and Sling figures above come from the same back-to-back session
(2 timed runs each: 3.994s ±0.025 and 8.145s ±0.155). The Meltano figure is from
an earlier session on the same machine and dataset, not the same run.

### 6 — CSV → JSONL vs. Meltano

A common ETL benchmark is a CSV → JSONL conversion. Same seeded dataset (`data/bench.csv`: 1,000,000
mixed-type rows — `id, first_name, country, amount, created_at, active,
attributes` — seed 42, ~116 MiB, generated by [`gen_bench_data.py`](gen_bench_data.py)),
same machine, both one-shot full-file CSV → local JSONL, one JSON object per
input row (string-valued fields — the shape both mq-bridge's CSV reader and
tap-csv emit):

```bash
benches/etl/run_csv_to_jsonl.sh   # all tools -> benches/etl/results/csv_to_jsonl.csv
```

Each tool is also a standalone script, so a single number can be re-measured
without re-running the matrix. They append to the same results CSV, each replacing
only its own row:

```bash
benches/etl/run_csv_mqb.sh              # mq-bridge-app, typed (transform)
benches/etl/run_csv_mqb.sh --untyped    # mq-bridge-app, untyped (no middleware)
benches/etl/run_csv_sling.sh
benches/etl/run_csv_meltano.sh
benches/etl/run_csv_parity.sh           # asserts typed output == Sling's
```

The two mq-bridge-app configurations differ only in the middleware suffix on the
output endpoint:

```bash
# untyped — every field stays the string the CSV reader produced
mq-bridge-app copy \
  --from 'file:///…/benches/etl/data/bench.csv?format=csv' \
  --to   'file:///tmp/mqb_csv_out.jsonl?format=raw' \
  --drain --batch-size 1024 --concurrency 1

# typed — reproduces Sling's typing, and is what §5's Sling ratio compares
mq-bridge-app copy \
  --from 'file:///…/benches/etl/data/bench.csv?format=csv' \
  --to   'file:///tmp/mqb_csv_out.jsonl?format=raw|transform?schema_file=…/schemas/bench.json' \
  --drain --batch-size 1024 --concurrency 1
```

Meltano side: same `meltano_project/bench` project with a `tap-csv` extractor
(pinned to `tap-csv 1.3.2`) → `target-jsonl 0.1.4`, run via
`meltano run tap-csv target-jsonl`. Install the plugin once with
`(cd meltano_project/bench && ../.venv/bin/meltano install extractor tap-csv)`.

Sling side: `sling run --src-stream file://…bench.csv --tgt-object file://…` with
`{"format":"jsonlines","file_max_rows":0}`, defaults otherwise.

| Tool | Config | rows/s | peak RSS |
| --- | --- | --- | --- |
| mq-bridge-app `copy` (typed) | batch_size 1024, concurrency 1, `transform` (schemas/bench.json) | **540,248** (2-run median 1.851s, ±0.015) | 69.7 MiB |
| mq-bridge-app `copy` (untyped) | batch_size 1024, concurrency 1, no middleware | **784,313** (2-run median 1.275s, ±0.012) | 18.9 MiB |
| Sling | defaults | 127,959 (2-run median 7.815s, ±0.077) | 111.2 MiB |
| Meltano (`tap-csv` → `target-jsonl`) | default Singer config | ~19,500 (clean runs 49.7s / 53.1s; fuller median pending) | 443.8 MiB |

**Typed vs Sling: ~4.2x** — equal work, asserted identical outputs. **Untyped vs
Meltano: ~40x** — both emit strings. Those are the two defensible ratios; see
[the note below](#a-note-on-the-sling-comparison) for why they are not
interchangeable.

The typed cost is explicit here rather than hidden in a single number: the
transform adds **0.58 s per 1,000,000 rows (~0.58 µs/row, ~31% of the typed
wall-clock)**. An earlier revision of the transform cost 2.10 s per 1M rows (2.1
µs/row, 64%), which is why the previously published typed figure was 303,214.

The mq-bridge-app and Sling figures above come from the same back-to-back session
(2026-07-19, 2 repeats each after a discarded warmup, on battery). The untyped
figure was measured three separate times in that session — 788,022 / 784,313 /
768,639 rows/s — and the table reports the median; the ~2.5% spread is the honest
run-to-run variance on this host. The Meltano figure is from an earlier session on
the same machine and dataset.

### A note on the Sling comparison

Sling does schema inference and type conversion: given a CSV row it emits typed
values and re-parses nested JSON into real objects. mq-bridge-app's readers do not
infer types — they pass values through as strings. Comparing those two directly
would time a string passthrough against a tool that parses and re-types every row,
which is not a benchmark, so the two scenarios handle it differently.

**§5 (CSV → JSONL) — equal work, ratio is like-for-like.** The mq-bridge-app run
carries a `transform` middleware ([`schemas/bench.json`](schemas/bench.json)) that
reproduces Sling's output exactly: `coerce` widens the `id` string to an integer,
and `contentMediaType: application/json` decodes the embedded `attributes` document
into a nested object. Both tools then emit the same records:

```jsonc
// sling (defaults) and mq-bridge-app (+ transform) — identical records
{"id":1,"amount":"6767.32","attributes":{"score":2.501,"tier":"free"}}
```

This is asserted, not assumed: [`compare_jsonl.py`](compare_jsonl.py) diffs the two
outputs record-by-record and **fails the run** on any mismatch, so the numbers in §5
cannot be published unless all 1,000,000 rows match. Records are compared as parsed
JSON — mq-bridge-app preserves the source column order inside `attributes` while
Sling alphabetizes it, which is a serialization difference, not a data one.

Making the work equal is not free, and the harness measures the cost directly by
running mq-bridge-app both ways in the same session: **784,313 untyped → 540,248
typed**, i.e. the transform costs ~0.58 µs/row (~31% of wall-clock). The margin
against Sling is therefore ~4.2x, not the ~6.1x the untyped run would suggest.

Both configurations stay published on purpose. The untyped number is not a
discarded draft — it is the correct comparison against any tool that also does no
transformation (Meltano's `tap-csv` emits every field as a string), and it is what
makes the transform's cost auditable instead of baked invisibly into one figure.
What it must *not* be used for is a comparison against a type-inferring tool.

Historical note: this scenario previously published 303,214 rows/s typed, against
an untyped 834,724 — a ~2.7x cost for the same schema. A later optimization of the
transform middleware cut that to ~1.45x. Sling is a useful control across all of
it, measuring 119,217 → 128,766 → 127,959 rows/s in three separate sessions on this
machine, so the movement in the typed number is real engine work rather than a
drifting baseline.

**§6 (Postgres → JSONL) — not yet equalised.** That scenario still runs
mq-bridge-app untyped against a type-inferring Sling, so part of its ~2.0x gap is
mq-bridge-app doing less. Read it with that attached. Applying the same treatment
there needs a Postgres-shaped schema (the driver already returns typed values for
some columns, so it is not a copy of `bench.json`) and a re-run.

**A note on this benchmark:**

- **The CSV number does not scale with batch size or concurrency.** A `file://`
  source is a single sequential reader, so extra route workers can't parallelize
  the read; the bottleneck is per-row CSV→JSON conversion on the one reader, not
  I/O or batching. After the CSV-path optimization this untyped baseline sits at
  ~784k, close to the raw byte-passthrough `file→file` reference (~880k, no CSV
  decode), so the remaining CSV-decode overhead is now small.

## Reference baselines to line up against

- **Debezium** — Postgres CDC latency/throughput → scenario 2.
- **OpenMessaging Benchmark** — payload sizes + latency-percentile reporting → 1/3.
- **Airbyte** — records/sec for a full-table sync → scenario 1.

## Teardown

```bash
benches/etl/seed.sh down
```
