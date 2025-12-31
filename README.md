# MQ Multi Bridge

A message queue bridge application written in Rust, designed to connect different messaging systems like RabbitMQ, Kafka, and NATS.

# Status
This project is under active development. While many features are functional, APIs may change. Use with caution in production environments. It is used as example and intended to test the bridge library https://github.com/marcomq/mq-bridge

## Features

- **Multiple Broker Support**: Connect Kafka, NATS, AMQP (e.g., RabbitMQ), MQTT, and HTTP in any direction.
- **HTTP Integration**: Expose HTTP endpoints as message sources (e.g., for webhooks) or sinks (to call external APIs), with support for request-response patterns.
- **File I/O**: Use local files as a source (reading line-by-line) or a sink (appending messages).
- **Performant**: Built with [Tokio](https://tokio.rs/) for asynchronous, non-blocking I/O.
- **Deduplication**: Optional message deduplication to prevent processing duplicates (requires a persistent on-disk database).
- **Observable**: Structured (JSON) logging and Prometheus metrics for observability.
- **Configurable**: Easily configured via a file or environment variables.

## Getting Started

### Prerequisites

- Rust toolchain (latest stable version recommended)
- Access to the message brokers you want to connect (e.g., Kafka, NATS, RabbitMQ)


## Build

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/marcomq/mq-bridge-app
    cd mq-bridge-app
    ```

2.  **Configure the application:**
    Create a `config.yaml` file in the project root or set environment variables. See the Configuration section for details.
    
### Build Docker Image (doesn't require local Rust)

1.  **Prerequisites**: Docker and Docker Compose must be installed.

2.  **Start Services**:

    ```bash
    docker-compose up --build
    ```
    

    This will start Kafka, NATS, and the bridge application.

### Building and Running Locally


**Build and run the application:**
    ```bash
    cargo run --release
    ```

## Configuration

The application can be configured in three ways, with the following order of precedence (lower numbers are overridden by higher numbers):

1.  **Default Values**: The application has built-in default values for most settings.
2.  **Configuration File**: A file named `config.[yaml|json|toml]` can be placed in the application's working directory.
3.  **Environment Variables**: Any setting can be overridden using environment variables.

### Configuration File

You can create a configuration file (e.g., `config.yaml`) to specify your settings. This is the recommended approach for managing complex route configurations.

**Example `config.yaml`:**

```yaml
# General settings
log_level: "info"

# Define bridge routes from a source to a sink
routes:
  my_kafka_to_nats:
    input:
      kafka:
        brokers: "kafka-us.example.com:9092"
        group_id: "bridge-group-us" # topic is optional, defaults to route name
    output:
      nats:
        url: "nats://nats.example.com:4222"
        stream: "events" # subject is optional, defaults to route name

  amqp_to_kafka_orders:
    input:
      amqp:
        url: "amqp://user:pass@rabbitmq.example.com:5672"
        # queue is optional, defaults to route name
    output:
      kafka:
        brokers: "kafka-eu.example.com:9092"
        group_id: "bridge-group-eu"
        # topic is optional, defaults to route name

  webhook_to_kafka:
    input:
      http:
        url: "0.0.0.0:8080"
    output:
      kafka:
        brokers: "kafka-eu.example.com:9092"
        group_id: "bridge-group-eu"
        # topic defaults to "webhook_to_kafka"

  kafka_to_url:
    input:
      kafka:
        brokers: "kafka-eu.example.com:9092"
        group_id: "bridge-group-eu"
        topic: "outgoing.events"
    output:
      http:
        url: "https://api.example.com/ingest" # Override default URL

  file_to_kafka:
    input:
      file:
        path: "/var/data/input.log"
    output:
      kafka:
        brokers: "kafka-eu.example.com:9092"
        group_id: "bridge-group-eu"
        topic: "from_file"
```

### Environment Variables

All configuration parameters can be set via environment variables. This is particularly useful for containerized deployments (e.g., Docker, Kubernetes). The variables must be prefixed with `MQB_`, and nested keys are separated by a double underscore `__`. For map-like structures such as `routes`, the key becomes part of the variable name.

**Example using environment variables:**

```bash
# General settings
export MQB__LOG_LEVEL="info"
export MQB__LOGGER="json"

# Metrics
export MQB__METRICS_ADDR="0.0.0.0:9090"

# Route 'kafka_us_to_nats_events': kafka -> nats
export MQB__ROUTES__MY_KAFKA_TO_NATS__INPUT__KAFKA__BROKERS="kafka-us.example.com:9092"
export MQB__ROUTES__MY_KAFKA_TO_NATS__INPUT__KAFKA__GROUP_ID="bridge-group-us"
export MQB__ROUTES__MY_KAFKA_TO_NATS__INPUT__KAFKA__TOPIC="raw_events" # topic is optional

export MQB__ROUTES__MY_KAFKA_TO_NATS__OUTPUT__NATS__SUBJECT="processed.events"
export MQB__ROUTES__MY_KAFKA_TO_NATS__OUTPUT__NATS__URL="nats://nats.example.com:4222"
export MQB__ROUTES__MY_KAFKA_TO_NATS__OUTPUT__NATS__STREAM="events"

# DLQ for Route 'kafka_us_to_nats_events'
export MQB__ROUTES__MY_KAFKA_TO_NATS__INPUT__MIDDLEWARES__0__DLQ__KAFKA__BROKERS="kafka-dlq.example.com:9092"
export MQB__ROUTES__MY_KAFKA_TO_NATS__INPUT__MIDDLEWARES__0__DLQ__KAFKA__GROUP_ID="bridge-dlq-group"
export MQB__ROUTES__MY_KAFKA_TO_NATS__INPUT__MIDDLEWARES__0__DLQ__KAFKA__TOPIC="dlq-kafka-us-to-nats"
```

### Using a `.env` file

For local development, you can place a `.env` file in the root of the project. The application will automatically load the variables from this file.

## Using as a Library

Beyond running as a standalone application, the core logic is available as a library crate (`mq_bridge`) to interact with various message brokers using a unified API. This is useful for building custom applications that need to produce or consume messages without being tied to a specific broker's SDK.

The core of the library are the `MessageConsumer` and `MessagePublisher` traits, found in `mq_bridge::traits`.


## License

This project is licensed under the MIT License - see the LICENSE file for details.
