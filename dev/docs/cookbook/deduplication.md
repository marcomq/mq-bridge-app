# Deduplication

Two complementary ways to keep replayed or retried records from creating duplicates: the
[`deduplication`](../engine/reference.md#deduplication) middleware (filters *before* the sink),
and the sink's own unique constraint (the robust choice for multi-writer ETL, covered in
[Upserts & insert-if-absent](upserts.md)).

## The `deduplication` middleware

Drops messages whose ID was already seen within a TTL. **Input only.** Requires the `dedup`
feature (pulls `sled`):

```yaml
input:
  middlewares:
    - deduplication: { sled_path: "/var/lib/mq-bridge/dedup", ttl_seconds: 3600 }
  kafka: { topic: "orders", url: "localhost:9092" }
```

State is a local sled database, so deduplication is **per-process, not cluster-wide**. For
multi-writer pipelines prefer the sink constraint (below); use the middleware as a complement,
not a replacement.

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
