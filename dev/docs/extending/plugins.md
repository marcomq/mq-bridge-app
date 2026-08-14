# Native plugins

A plugin is a shared library holding an endpoint — and optionally a middleware — that
this binary never compiled: Pulsar, a proprietary broker, an in-house transport. Loading
one registers it under its own name, after which routes address it like any built-in
connector.

This is the runtime counterpart to [custom endpoints](custom-endpoints.md): a custom
endpoint is registered programmatically by code you compile in, a plugin is loaded from
a file named in the config.

## Loading

List the libraries under `plugins:`. Paths go through the usual placeholder expansion,
so `${VAR}` works:

```yaml
plugins:
  - "${MQB_PLUGIN_DIR}/libmq_bridge_pulsar.so"

routes:
  orders:
    input:
      custom:
        name: pulsar
        config: { url: "pulsar://localhost:6650" }
    output:
      file:
        path: "orders.jsonl"
```

The `name` is the one the plugin exports, not the file name. A plugin providing a
middleware registers that under the same name, usable in any `middlewares:` chain.

Adding an entry and saving takes effect immediately — the UI applies the config without
restarting the process, and the library loads before the new routes are validated.
Removing an entry does **not** unload it: a loaded library stays registered for the life
of the process, so dropping a plugin takes a restart.

Every build can load plugins; there is no cargo feature to enable.

## From the CLI

`--plugin <path>` loads a library without touching the config, repeatable, and valid on
every subcommand:

```bash
mq-bridge-app --plugin ./libmq_bridge_pulsar.so --config config.yml
mq-bridge-app copy --plugin ./libmq_bridge_pulsar.so --from 'custom://pulsar?...' --to out.jsonl
```

It combines with `plugins:` rather than replacing it. Listing the same library both ways
is harmless — a library already loaded is not loaded twice.

## Failure modes

Loading is strict, because the alternative is a confusing "unknown endpoint" much later,
once a route asks for something nobody registered:

| Condition | Result |
|---|---|
| File missing or unreadable | startup fails naming the path |
| Built against an incompatible ABI major version | rejected |
| Declares neither an endpoint nor a middleware | rejected |
| Name already taken by a different factory | rejected — traffic would silently reroute |

At startup a bad path aborts the process. When the config is applied at runtime, it is
reported as a validation error and the previous config keeps running.

## Security

A plugin is native code loaded into this process, with the same privileges — it is not
sandboxed. Treat the libraries you list exactly like any other native dependency, and
note that anyone who can edit the config or reach the UI can name a library to load.

Writing one is covered in
[mq-bridge's PLUGINS.md](https://github.com/marcomq/mq-bridge/blob/main/docs/PLUGINS.md).
