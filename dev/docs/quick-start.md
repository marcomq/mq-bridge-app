# Quick Start

`mq-bridge-app copy` moves data between two endpoints described as URIs. The scheme
picks the connector; `?query=params` configure it.

```bash
mq-bridge-app copy \
  --from postgres://localhost/app?table=users \
  --to 'clickhouse://localhost:8123?table=users&database=analytics'
```

This copies every row currently in `app.users` (PostgreSQL) into
`analytics.users` (ClickHouse). No config file, no UI — just a source and a
destination. Add `--drain` to exit once the source is empty instead of
running as a continuous bridge (see
[Continuous vs. one-shot](#continuous-vs-one-shot) below).

The five sections below are complete, working commands. Each links to the
full [connector page](./connectors/) for that endpoint, which lists every
available option; the [generated URL reference](./reference/) is the
authoritative source for every parameter's type, default, and description.

## PostgreSQL → ClickHouse

```bash
mq-bridge-app copy --drain \
  --from postgres://user:pass@localhost/app?table=orders \
  --to 'clickhouse://localhost:8123?table=orders&database=analytics'
```

Reads all rows from the `orders` table and bulk-inserts them into ClickHouse's
HTTP interface. Add `&cursor_column=id&cursor_id=orders_sync` on `--from` to
make this resumable instead of a one-shot batch. See
[PostgreSQL](./connectors/postgres.md) and [ClickHouse](./connectors/clickhouse.md).

## PostgreSQL CDC → PostgreSQL

```bash
mq-bridge-app copy \
  --from 'postgres-cdc://user:pass@localhost/app?publication=mqb_pub&slot_name=mqb_slot' \
  --to 'postgres://user:pass@otherhost/replica?table=orders&auto_create_table=true'
```

Streams inserts/updates/deletes from a PostgreSQL logical-replication
publication into another PostgreSQL table, continuously (CDC is a change
stream, so this command doesn't drain — run it as a long-lived process). See
[PostgreSQL CDC](./connectors/postgres.md#postgresql-cdc).

## MQTT → Kafka

```bash
mq-bridge-app copy \
  --from mqtt://broker.local:1883?topic=sensors/+/temperature \
  --to kafka://kafka.local:9092?topic=sensor-readings
```

Subscribes to an MQTT topic (wildcards supported) and republishes every
message to a Kafka topic, continuously. See [MQTT](./connectors/mqtt.md) and
[Kafka](./connectors/kafka.md).

## RabbitMQ → HTTP

```bash
mq-bridge-app copy \
  --from rabbitmq://guest:guest@localhost:5672/%2f?queue=orders \
  --to http://internal-api.local/ingest?method=POST
```

Consumes messages from a RabbitMQ queue and POSTs each one to an HTTP
endpoint, continuously. See [RabbitMQ](./connectors/rabbitmq.md) and
[HTTP](./connectors/http.md).

## File (CSV) → MongoDB

```bash
mq-bridge-app copy --drain \
  --from file:///data/customers.csv?format=csv \
  --to 'mongodb://localhost?database=app&collection=customers'
```

Reads a CSV file (first row = header) and inserts one document per row into
a MongoDB collection, then exits since the source is a finite file. See
[File](./connectors/file.md) and [MongoDB](./connectors/mongodb.md).

## Continuous vs. one-shot

Without `--drain`, `copy` runs as a continuous bridge until Ctrl-C — the
right mode for message brokers (MQTT, Kafka, RabbitMQ) and CDC sources, which
never "end". With `--drain`, `copy` exits once the source yields an empty
batch — the right mode for finite sources (a file, or a full-table read from
a database). `--concurrency` and `--batch_size` tune throughput on both
modes.

## Escape hatch: driver options and full connection strings

Any query parameter that isn't a recognised config field (e.g. `sslmode`,
`replicaSet`) is left on the connection URL untouched, so driver-specific
options just work — including object-typed fields like `tls`, which can
never be set from a single scalar query param and so always stays on the URL
(e.g. `mongodb://host/?tls=true&database=appdb` passes `tls=true` straight
through to the MongoDB driver). If you already have a complete connection
string (copied from elsewhere, or one whose own options would otherwise be
mis-parsed as config), skip decomposition entirely and pass it verbatim with
`?url=<url-encoded string>`:

```bash
mq-bridge-app copy \
  --from 'mongodb://_/?url=mongodb%3A%2F%2Fuser%3Apass%40host%2Fdb%3Ftls%3Dtrue&collection=orders' \
  --to null:
```

See the [generated reference](./reference/) for each connector's recognised
field names.
