# MongoDB

Reads from or writes to a MongoDB collection. `database` and `collection`
are separate query params — MongoDB URIs don't encode the database in the
path the way this connector reads them (unlike PostgreSQL).

## URL format

```text
mongodb://[user:pass@]host[:port]?database=<db>&collection=<name>
```

## Examples

**Load a CSV file into a collection, one-shot:**

```bash
mq-bridge-app copy --drain \
  --from file:///data/customers.csv?format=csv \
  --to 'mongodb://localhost?database=app&collection=customers'
```

**Non-destructive read of an existing collection (default source behavior):**

```bash
mq-bridge-app copy --drain \
  --from 'mongodb://localhost?database=app&collection=customers' \
  --to 'postgres://user:pass@localhost/app?table=customers&auto_create_table=true'
```

By default (no `consume` given), a MongoDB *source* reads existing documents
then watches for changes (`capture_all`) — pointing at a collection never
claims/deletes its documents, unlike the library's own `consumer` default.

**Watch for new documents only (change stream), continuous:**

```bash
mq-bridge-app copy \
  --from 'mongodb://localhost?database=app&collection=orders&consume=capture_new' \
  --to kafka://kafka.local:9092?topic=orders
```

## Key options

| Option | Purpose |
|---|---|
| `database` | **Required.** |
| `collection` | Collection name. |
| `consume` | `capture_all` (default via the CLI), `capture_new` (changes only), `consumer` (durable queue, destructive), or `subscriber` (ephemeral). |
| `checkpoint_store` | Where to persist the resume cursor for `capture_new`/`capture_all`. |
| `username` / `password` | Take precedence over credentials embedded in `url`. |

Full field list: [reference/mongodb.md](../reference/mongodb.md).
