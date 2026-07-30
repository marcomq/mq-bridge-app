# Content-based routing (switch)

The [`switch`](../engine/reference.md#switch) structural endpoint picks a destination by the
value of a **metadata key**. Output only.

```yaml
output:
  switch:
    metadata_key: "country_code"
    cases:
      US: { kafka: { topic: "us_orders", url: "kafka-us:9092" } }
      EU: { nats:  { subject: "eu_orders", url: "nats-eu:4222" } }
    default: { file: { path: "/var/data/unroutable_orders.log" } }
```

A message whose key is missing or unmatched goes to `default`; **without a `default` it is
dropped.**

## Route on the payload, not just metadata

`switch` matches on **metadata**, not payload fields. To route on payload content, first promote
the value into metadata. Two common ways:

- An endpoint that already emits a status key — e.g. `http_status_code` from an HTTP
  [`request`](../engine/reference.md#request), or `mongodb.outcome` from a Mongo upsert (see
  [Upserts](upserts.md)).
- [`transform`](transform.md) with `on_error: pass_through`, which sets `mqb.transform_error` on
  failed records so you can shunt them aside:

```yaml
output:
  middlewares:
    - transform: { schema_file: "schemas/order.json", on_error: pass_through }
  switch:
    metadata_key: "mqb.transform_error"
    cases: {}                                  # (no exact-match cases)
    default: { kafka: { topic: "orders", url: "localhost:9092" } }
```

## Split HTTP responses by status

Pair `switch` with [`request`](../engine/reference.md#request), which forwards a response (or,
on error/timeout, the original message) tagged with a status key:

```yaml
output:
  request:
    to: { http: { url: "https://api.internal/score" } }
    forward_to:
      switch:
        metadata_key: "http_status_code"
        cases:
          "200": { nats: { subject: "ok", url: "nats://localhost:4222" } }
          "404": { file: { path: "not-found.jsonl" } }
        default: { file: { path: "other.jsonl" } }
```

See also [Fan-out](fanout.md) to send to *all* destinations instead of picking one.
