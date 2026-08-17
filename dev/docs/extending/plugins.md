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

Plugins are loaded only from trusted startup configuration. The UI and `POST /config` may
reorder or repeat the same canonical paths, but cannot add, remove, or retarget a plugin.
Edit the startup config and restart the process for every plugin change. Loaded native
libraries remain mapped and registered for the process lifetime; they are never unloaded.

Every build can load plugins; there is no cargo feature to enable.

## From the CLI

`--plugin <path>` loads a library without touching the config, repeatable, and valid on
every subcommand:

```bash
mqb --plugin ./libmq_bridge_pulsar.so --config config.yml
```

It combines with `plugins:` rather than replacing it. Listing the same library both ways
is harmless — a library already loaded is not loaded twice. The `copy` subcommand accepts
only its built-in URI schemes; use config mode, as above, for plugin-backed endpoints.

## Failure modes

Loading is strict, because the alternative is a confusing "unknown endpoint" much later,
once a route asks for something nobody registered:

| Condition | Result |
|---|---|
| File missing or unreadable | startup fails naming the path |
| Built against an incompatible ABI major version | rejected |
| Declares neither an endpoint nor a middleware | rejected |
| Name already taken by a different factory | rejected — traffic would silently reroute |

At startup a bad path aborts the process. A runtime config whose canonical plugin set differs
from the startup set is rejected before route validation, storage changes, or saving.

## Security

A plugin is native code loaded into this process, with the same privileges — it is not
sandboxed. Treat the startup configuration and CLI flags as trusted inputs, and treat the
libraries they name exactly like any other native dependency. Runtime config updates cannot
load a new library.

Writing one is covered in [Writing a plugin](../engine/plugins.md).
