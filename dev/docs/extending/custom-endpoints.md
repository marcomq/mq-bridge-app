# Custom endpoints

When a protocol isn't built in, you can plug your own endpoint into the engine. A
custom endpoint is selected from config by name and delegates to a factory you register
programmatically before starting routes.

## Config

```yaml
output:
  custom:
    name: "my_sink"
    config: { target: "internal://thing" }
```

| Field | Type | Required |
|---|---|---|
| `name` | string | yes — matches the registered factory |
| `config` | any JSON | yes — passed through to your factory |

The `custom` endpoint works as a route `input` or `output`.

## Implementing it

Implement the `CustomEndpointFactory` trait and register your type before starting
routes. The factory receives the `config` JSON and builds an endpoint that speaks the
engine's `MessageConsumer` / `MessagePublisher` traits (in `mq_bridge::traits`), so
your endpoint participates in batching, middleware, and ack/nack exactly like a
built-in one.

## See also

- [`custom` (endpoint) reference](../engine/reference.md#custom-endpoint) — the authoritative field list.
- [Learn the architecture → Extending mq-bridge](../engine/architecture.md#extending-mq-bridge) — the trait and registration mechanics.
- [Custom middleware](custom-middleware.md) — the middleware equivalent.
