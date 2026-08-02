# Deduplication

Two complementary ways to keep replayed or retried records from creating duplicates: the
[`deduplication`](../engine/reference.md#deduplication) middleware (filters *before* the sink),
and the sink's own unique constraint (the robust choice for multi-writer ETL, covered in
[Upserts & insert-if-absent](upserts.md)).

## The `deduplication` middleware

Drops messages whose ID was already seen within a TTL. **Input only.** Requires the `dedup`
feature:

```yaml
input:
  middlewares:
    - deduplication: { store: "sled:///var/lib/mq-bridge/dedup", ttl_seconds: 3600 }
  kafka: { topic: "orders", url: "localhost:9092" }
```

### Picking a store

`store` selects the backend by URL scheme, and the scheme decides whether deduplication is
process-local or **shared across every instance of the route**:

| `store` | Scope | Extra feature |
|---|---|---|
| `sled:///path` (or a bare path) | per-process only | — |
| `mongodb://host/db[/collection]` | shared between instances | `mongodb` |
| `postgres` / `mysql` / `mariadb` / `sqlite` `://…[/table]` | shared between instances | `sqlx` |

The collection/table defaults to `mqb_dedup_<route>`. Point a shared store at the deployment
your sink already uses rather than standing up extra infrastructure. `sled_path` is the legacy
spelling of a local sled store, equivalent to `store: "sled://<path>"`.

```yaml
# Shared across every instance of this route.
- deduplication: { store: "mongodb://localhost:27017/etl", ttl_seconds: 3600 }
```

A `sled` store is **per-process, not cluster-wide**, so for multi-writer pipelines use either a
shared store above or the sink constraint (below). Even with a shared store, the sink's own
unique constraint remains the more robust choice when the sink has one — it is already the
authority, with no second write.

## Sink-side dedup (the robust path)

The most robust place to dedup is the sink's own unique constraint — it's already shared across
every writer:

- **MongoDB** — `id_field` maps a business key to the unique `_id`; a duplicate is an idempotent
  skip.
- **SQL** — `ON CONFLICT (key) DO NOTHING` / `ON DUPLICATE KEY UPDATE`.
- **ClickHouse** — `ReplacingMergeTree(version)` collapses duplicates by sort key at merge time.

Full examples in [Upserts & insert-if-absent](upserts.md).

## Deduplicating CDC replays

A `postgres_cdc` change event's `message_id` is a **stable hash** of `schema.table + key + lsn`,
so a replayed change deduplicates through the `deduplication` middleware, and the sink's own
constraint (`id_field` / `ON CONFLICT`) makes the write idempotent. Use `postgres.lsn` as the
version to drop stale replays:

```sql
INSERT INTO orders (id, body, lsn) VALUES (${payload:id}, ${payload:body}, ${metadata:postgres.lsn})
  ON CONFLICT (id) DO UPDATE SET body = EXCLUDED.body, lsn = EXCLUDED.lsn
  WHERE EXCLUDED.lsn > orders.lsn
```

> **Known edge:** if the same primary key changes twice *within one transaction*, both events
> share that transaction's commit LSN and therefore the same `message_id` — the middleware treats
> the second as a duplicate and drops it. The sink still converges to the final row, but the
> intermediate revision is not delivered. If you need every intra-txn revision, don't rely on the
> `message_id`/middleware path for those rows.

See the [Postgres CDC → JSONL](../tutorials/postgres-cdc.md) tutorial for the full CDC idempotency
picture.
