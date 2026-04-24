# mq-bridge-app

![Linux](https://img.shields.io/badge/Linux-supported-green?logo=linux)
![Windows](https://img.shields.io/badge/Windows-supported-green?logo=windows)
![macOS](https://img.shields.io/badge/macOS-supported-green?logo=apple)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

```text
      ┌────── mq-bridge-app ──────┐
──────┴───────────────────────────┴──────
            crossing streams
```

`mq-bridge-app` is a flexible message routing application written in Rust, designed to connect different messaging systems and data sources. It acts as a universal translator for your data streams, seamlessly bridging technologies like **Kafka**, **RabbitMQ (AMQP)**, **NATS**, **AWS SQS** ,**MQTT**, and **IBM MQ**. The application also integrates with modern web protocols like **HTTP** and **gRPC**, and can interact with **ZeroMQ**, **MongoDB**, and the local **filesystem**.

Built for performance and ease of use, it's a powerful tool for building integration workflows, creating data pipelines, or simply getting information from point A to point B, no matter the protocol.

# Status

> **Note**: This project is currently in **Active Development**.

It serves as the primary reference implementation and testbed for the [mq-bridge](https://github.com/marcomq/mq-bridge) library. It may already work perfect and reliable for some use cases. But some disconnect patterns and some subscriber endpoints haven't been tested yet. Always test by yourself before production usage.

## Features

### Connectivity
- **Multi-Protocol Support**: Bridge messages between **Kafka**, **IBM MQ**, **NATS**, **AMQP** (RabbitMQ), **MQTT**, **AWS SQS**, **gRPC**, **ZeroMQ**, and **HTTP**.
- **File System Integration**: Stream data from files (tail/read) or write messages to disk (append).
- **HTTP Webhooks**: Act as both an HTTP server (receiving webhooks) and client (calling external APIs), with full support for Request-Response patterns.

### Core Processing
- **Middleware Chains**: Define processing pipelines for routes, including **Dead Letter Queues (DLQ)** for robust error handling.
- **Deduplication**: Optional, persistent message deduplication to prevent processing redundant data.
- **High Performance**: Written in **Rust** using **Tokio**, ensuring low latency, high concurrency, and a small memory footprint.

### Operations & Management
- **Built-in Web UI**: A dynamic management interface served directly by the application to view configurations and schemas.
- **Observability**: Production-ready with structured **JSON logging** and a **Prometheus** metrics endpoint.
- **Flexible Configuration**: Hierarchical configuration via files (YAML, JSON, TOML) and Environment Variables, perfect for Container/Kubernetes environments.

## Installation

### Docker (Recommended)

The easiest way to run the application is using the pre-built Docker image, which includes all necessary dependencies (like the IBM MQ client).

```bash
docker run --rm --name mq-bridge -p 9091:9091 ghcr.io/marcomq/mq-bridge-app:latest
```

Or if you want to already read+tail from input.log and send the content to http://localhost:3000/

```bash
touch input.log
docker run --rm --name mq-bridge -p 9091:9091 -v "$(pwd)":/app ghcr.io/marcomq/mq-bridge-app:latest --init-config=/config/file-to-http.yml
```

> [!NOTE]
> The default `latest` image is a plain multi-arch image for `amd64` and `arm64`. IBM MQ support is published separately as the `latest-ibm-mq` and `ibm-mq` tags on `amd64`, since there is no redistributable IBM MQ client library for arm64 yet. You may still start that image in emulation mode with `--platform=linux/amd64` or build `mq-bridge-app` yourself with `cargo build --release --features=ibm-mq`.

### Cargo

If you have Rust installed, you can install the application directly from source. This may take a some time, as it will compile all supported endpoint client libraries, except ibm-mq. For IBM MQ, you would need to install the client library first and install it with `--features=ibm-mq`.

```bash
cargo install mq-bridge-app
./mq-bridge-app
```

## Build from Source

### Prerequisites

- Rust toolchain (latest stable version recommended)
- Access to the message brokers you want to connect (e.g., Kafka, NATS, RabbitMQ)

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/marcomq/mq-bridge-app
    cd mq-bridge-app
    ```

2.  **Build and run empty:**
    ```bash
    cargo run --release 
    ```
2.  **Build and run with configuration:**
    ```bash
    cargo run --release -- --config config/file-to-http.yml
    ```
3.  **Configure the application:**
    Create a `config.yml` file in the project root or set environment variables. See the Configuration section for details. Or you start right away without and use the UI to define the `config.yml`
    
### Build Docker Image (doesn't require local Rust)

1.  **Prerequisites**: Docker and Docker Compose must be installed.

2.  **Start Services**:

    ```bash
    docker-compose up --build
    ```
    

    This will start the bridge application.

## Configuration

The application can be configured in three ways, with the following order of precedence (lower numbers are overridden by higher numbers):

1.  **Default Values**: The application has built-in default values for most settings.
2.  **Configuration File**: A file named `config.[yml|json]` can be placed in the application's working directory.
3.  **Environment Variables**: Any setting can be overridden using environment variables.

### Configuration File

You can create a configuration file (e.g., `config.yml`) to specify your settings. This is the recommended approach for managing complex route configurations.

**Example `config.yml`:**

```yaml
# General settings
log_level: "info"

# Define bridge routes from a source to a sink
routes:
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
        url: "0.0.0.0:9090"
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

  # Example with Metrics, Retry and Dead Letter Queue
  orders_with_reliability:
    input:
      kafka:
        brokers: "kafka.example.com:9092"
        group_id: "orders-group"
        topic: "orders"
    output:
      http:
        url: "https://api.example.com/orders"
      middlewares:
        - metrics: {}
        - retry:
            max_attempts: 3
            delay_ms: 1000
        - dlq:
            file:
              path: "error.log"
```

### Environment Variables

All configuration parameters can be set via environment variables. This is particularly useful for containerized deployments (e.g., Docker, Kubernetes). The variables must be prefixed with `MQB_`, and nested keys are separated by a double underscore `__`. For map-like structures such as `routes`, the key becomes part of the variable name. You can alternatively use environment variables directly in json/yaml by using `${ENV_VARIABLE_NAME:-default_if_not_found}`.

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

### Example Configurations 

This repository includes a set of example configurations in the config directory to help you get started quickly. These examples are also included in the Docker image under /config. 

You can use them with Docker by mounting them from your host or by referencing them from within the image using the --config flag: 

```bash 
# Using an example from the host 
docker run -p 9090:9090 -v $(pwd)/config/kafka-to-nats.yml:/app/config.yml ghcr.io/marcomq/mq-bridge-app:latest 
# Using an example from within the image 
docker run -p 9090:9090 ghcr.io/marcomq/mq-bridge-app:latest --config /config/kafka-to-nats.yml
```
Available Examples: 
* http-to-kafka.yml: Exposes an HTTP endpoint and forwards incoming requests to a Kafka topic. 
* kafka-to-nats.yml: A simple route from a Kafka topic to a NATS subject. 
* rabbitmq-to-file.yml: Reads messages from a RabbitMQ queue and appends them to a log file (requires mounting a volume for /data).

### Using a `.env` file

For local development, you can place a `.env` file in the root of the project. The application will automatically load the variables from this file.

## Model Context Protocol (MCP)

The project includes a separate binary, [mq-bridge-mcp](MCP.md), which acts as an MCP server. It exposes your configured publishers and consumers as Tools and Resources to AI assistants. This allows LLMs to directly interact with your message brokers.

## Architecture & Web UI

This application demonstrates a unique usage of the `mq-bridge` library itself to serve its own management UI.

### Backend: `mq-bridge` as a Web Server

Instead of using a traditional web framework like Actix or Axum directly for the management API, the application uses [mq-bridge](https://github.com/marcomq/mq-bridge/)'s internal routing mechanism:

1.  **HTTP Input**: An `http` input endpoint listens on the configured UI port. It converts incoming HTTP requests into `CanonicalMessage`s.
2.  **WebUiHandler**: A custom `Handler` processes these messages. It acts as a router, serving static files (HTML, JS) or handling API requests (e.g., `/config`, `/schema.json`).
3.  **Response Output**: The handler returns a response message, which is sent to a `response` output endpoint, completing the HTTP request-response cycle.

This approach showcases the library's ability to handle request-reply patterns and serve as a lightweight web server.

### Frontend: `vanilla-schema-forms`

The Web UI is dynamically generated from the Rust configuration structures:

1.  **Schema Generation**: The backend uses `schemars` to generate a JSON Schema for the `AppConfig` struct at runtime. This is exposed via `/schema.json`. It is also available via CLI: `mq-bridge-app --schema config/schema.json`
2.  **Dynamic Form**: The frontend uses [vanilla-schema-forms](https://github.com/marcomq/vanilla-schema-forms) to render a complete configuration form based solely on this schema.
3.  **No UI Code Changes**: When new features or configuration options are added to the Rust code (e.g., a new middleware), the schema updates automatically, and the UI reflects these changes without requiring any frontend code modifications.

## Using as a Library

Beyond running as a standalone application, the core logic is available as a library crate [mq-bridge](https://github.com/marcomq/_bridge) to interact with various message brokers using a unified API. This is useful for building custom applications that need to produce or consume messages without being tied to a specific broker's SDK.

The core of the library are the `MessageConsumer` and `MessagePublisher` traits, found in `mq_bridge::traits`.


## License

This project is licensed under the MIT License - see the LICENSE file for details.
