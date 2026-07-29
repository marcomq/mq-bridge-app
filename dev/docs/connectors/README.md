# Connectors

Hand-written per-connector docs: purpose, URL format, and practical
examples. For the full, auto-generated list of every recognised query
parameter (type, default, required, description), see the matching page
under [`../reference/`](../reference/).

- [PostgreSQL / MySQL / MariaDB / SQLite](./postgres.md) (including [PostgreSQL CDC](./postgres.md#postgresql-cdc))
- [ClickHouse](./clickhouse.md)
- [MQTT](./mqtt.md)
- [Kafka](./kafka.md)
- [RabbitMQ (AMQP)](./rabbitmq.md)
- [HTTP](./http.md)
- [MongoDB](./mongodb.md)
- [File (CSV / JSON / JSONL)](./file.md)

Other connectors supported by `mq-bridge-app copy` (NATS, Redis Streams,
WebSocket, gRPC, AWS SQS/SNS, ZeroMQ, IBM MQ) don't yet have a hand-written
page — see their [generated reference](../reference/) for the recognised
scheme(s) and parameters.
