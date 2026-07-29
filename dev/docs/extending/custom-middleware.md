# Custom middleware

Middleware wraps the message flow between an input and an output — retries, dedup,
transforms, and so on. When the built-in set doesn't cover your need, register your own
and select it from config by name.

## Config

```yaml
middlewares:
  - custom:
      name: "my_enricher"
      config: { lookup_url: "http://enrich.internal" }
```

| Field | Type | Required |
|---|---|---|
| `name` | string | yes — matches the registered factory |
| `config` | any JSON | yes — passed through to your factory |

## Implementing it

Implement the `CustomMiddlewareFactory` trait and register it before starting routes.
It exposes `apply_consumer` and/or `apply_publisher` — each defaults to pass-through, so
you only implement the side you need. The consumer and publisher sides are separate
because middleware wraps a `MessageConsumer` on the way in and a `MessagePublisher` on
the way out; wrap order matters (see the architecture doc).

## See also

- [`custom` (middleware) reference](../engine/reference.md#custom-middleware) — the authoritative field list.
- [Learn the architecture → Extending mq-bridge](../engine/architecture.md#extending-mq-bridge) — traits, registration, and wrap order.
- [Custom endpoints](custom-endpoints.md) — the endpoint equivalent.
