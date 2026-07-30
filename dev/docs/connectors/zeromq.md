# ZeroMQ

Sends or receives messages over ZeroMQ sockets (PUSH/PULL, PUB/SUB, REQ/REP).
The `socket_type` selects the pattern and `bind` decides whether the endpoint
binds or connects.

## URL format

```
zeromq://<transport>?socket_type=<type>[&bind=true]
```

`zeromq://` and `zmq://` are both accepted. The URL is a ZeroMQ transport
address such as `tcp://127.0.0.1:5555`. Choose `bind=true` on exactly one side
of a socket pair; the other connects.

## Examples

**Pull from a PUSH producer and write to a file, continuous:**

```bash
mq-bridge-app copy \
  --from 'zeromq://tcp://127.0.0.1:5555?socket_type=pull&bind=true' \
  --to file:///data/events.jsonl?format=json
```

**Publish a Kafka topic to a PUB socket, continuous:**

```bash
mq-bridge-app copy \
  --from kafka://kafka.local:9092?topic=events \
  --to 'zeromq://tcp://0.0.0.0:5556?socket_type=pub&bind=true'
```

**Subscribe to a topic on a remote PUB socket, continuous:**

```bash
mq-bridge-app copy \
  --from 'zeromq://tcp://feed.local:5556?socket_type=sub&topic=orders' \
  --to postgres://user:pass@localhost/app?table=orders&auto_create_table=true
```

## Key options

| Option | Purpose |
|---|---|
| `socket_type` | `push`, `pull`, `pub`, `sub`, `req`, or `rep`. |
| `bind` | Bind to the address instead of connecting (default `false`). |
| `topic` | Consumer-only: topic filter for `sub` sockets. |
| `format` | Wire format: `json` (default, wraps the message), `raw` (payload bytes), `raw_framed` (raw + JSON metadata frame). |
| `backend` | `zmq` (default) or `omq` (PoC, PUSH/PULL + PUB/SUB only; needs the `zeromq-omq` feature). |

Full field list: [reference/zeromq.md](../reference/zeromq.md).
