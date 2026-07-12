# ClickHouse

Reads from or bulk-inserts into a ClickHouse table over ClickHouse's HTTP
interface (port 8123 by default; 8443 for HTTPS).

## URL format

```
clickhouse://host[:port]?table=<name>[&database=<name>]
```

`clickhouse://` is rewritten to `http://` (and `clickhouses://` to
`https://`) before being handed to the ClickHouse client — the scheme only
selects the endpoint kind on the CLI.

## Examples

**Bulk insert from a full-table Postgres read, one-shot:**

```bash
mq-bridge copy --drain \
  --from postgres://user:pass@localhost/app?table=orders \
  --to clickhouse://localhost:8123?table=orders&database=analytics
```

**Async insert for high-throughput streaming writes, continuous:**

```bash
mq-bridge copy \
  --from kafka://kafka.local:9092?topic=events \
  --to 'clickhouse://user:pass@ch.local:8123?table=events&database=analytics&async_insert=true'
```

**Resumable, non-destructive read of an existing table into Kafka:**

```bash
mq-bridge copy \
  --from clickhouse://localhost:8123?table=events&database=analytics&cursor_column=id&cursor_id=events_export \
  --to kafka://kafka.local:9092?topic=events
```

Each restart resumes from the last `id` seen instead of re-reading from the
start. (Per-column mapping via `columns` is a map field, so it can't be set
from a query param — use a YAML route config for that.)

## Key options

| Option | Purpose |
|---|---|
| `table` | **Required.** May be schema-qualified (`db.table`). |
| `database` | Defaults to `default`. |
| `columns` | Map target columns to `${payload:field}` / `${metadata:key}` tokens instead of inserting the whole JSON payload as one row. |
| `async_insert` | Server-side buffered inserts for higher publisher throughput. |
| `cursor_column` + `cursor_id` | Non-destructive, resumable reads of an existing table. |

Full field list: [reference/clickhouse.md](../reference/clickhouse.md).
