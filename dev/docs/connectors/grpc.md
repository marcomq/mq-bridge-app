# gRPC

Sends or receives messages over gRPC. As a **client** (default) it connects to
a remote server and issues `Publish` / `PublishBatch` RPCs; as a **server**
(`server_mode=true`) it starts an embedded tonic server that accepts those RPCs.

## URL format

```
grpc://host[:port]?topic=<topic>
```

`grpc://` (plain) and `grpcs://` (TLS) are both accepted. In client mode the URL
is the remote server (e.g. `grpc://localhost:50051`); in server mode it is the
bind address (e.g. `grpc://0.0.0.0:50051`).

## Examples

**Forward a Kafka topic to a remote gRPC service, continuous:**

```bash
mq-bridge-app copy \
  --from kafka://kafka.local:9092?topic=orders \
  --to grpc://orders-svc.local:50051?topic=orders
```

**Run an embedded gRPC server that ingests into Postgres, continuous:**

```bash
mq-bridge-app copy \
  --from grpc://0.0.0.0:50051?server_mode=true&topic=orders \
  --to postgres://user:pass@localhost/app?table=orders&auto_create_table=true
```

## Key options

| Option | Purpose |
|---|---|
| `server_mode` | Start an embedded gRPC server (receive) instead of connecting as a client. |
| `topic` | Topic / subject used for both subscribe and publish paths. |
| `timeout_ms` | Client: connection timeout and per-request deadline. Server: per-request deadline. |
| `max_decoding_message_size` | Server-only: max decoded incoming message size (default 4 MiB). |
| `http2_keepalive_interval_ms` / `http2_keepalive_timeout_ms` | Server-only: HTTP/2 keepalive tuning. |
| `tls` | TLS configuration (object; set with a JSON literal `?tls={...}`). |

Full field list: [reference/grpc.md](../reference/grpc.md).
