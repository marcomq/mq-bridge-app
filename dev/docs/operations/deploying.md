# Deploying

The CLI / server form is what you deploy — a single headless binary that runs a long-lived
bridge in [config mode](../getting-started/run-forms.md#cli--server). This page covers running it
as a container and as a service, and the config/secrets patterns that suit each.

## Docker

The CLI is published as a multi-arch image (`amd64` + `arm64`):

```bash
docker run --rm --name mq-bridge -p 9091:9091 ghcr.io/marcomq/mq-bridge-app:latest
```

Mount a config directory and seed the config on first run:

```bash
touch input.log
docker run --rm --name mq-bridge -p 9091:9091 -v "$(pwd)":/app \
  ghcr.io/marcomq/mq-bridge-app:latest --init-config=/config/file-to-http.yml
```

- The default `latest` image is a plain multi-arch image for `amd64` and `arm64`.
- **IBM MQ** support is published separately as the `latest-ibm-mq` / `ibm-mq` tags, `amd64`
  only (no redistributable arm64 client yet). Start it with `--platform=linux/amd64`, or build
  yourself with `cargo build --release --features=ibm-mq`.

To build the image from source, see
[`BUILD.md`](https://github.com/marcomq/mq-bridge-app/blob/main/dev/docs/BUILD.md).

## Configuration in containers / Kubernetes

Configuration is **hierarchical** — files plus environment variables — which is exactly what
container and Kubernetes deployments want:

- Bake a base `config.yml` into the image or mount it as a ConfigMap.
- Override any field per environment with `MQB__{ROUTE}__{PATH}` env vars (double underscores
  between segments), e.g. `MQB__KAFKA_TO_NATS__INPUT__KAFKA__TOPIC=my-topic`.
- Reference secrets inline with `${ENV_VARIABLE_NAME:-default}`; a `.env` file in the working
  directory is auto-loaded for local development.

See [Configuration grammar](../engine/configuration.md) for the full env-var mapping and
[Secrets & interpolation](../cookbook/secrets.md) for keeping credentials out of committed
config.

## Choosing the run shape

| You want… | Run it as… |
|---|---|
| A one-shot batch move (finite source), exit 0 on success | `copy … --drain` (see [Quick start](../quick-start.md)) |
| A long-lived bridge with one or more routes | config mode: `mq-bridge-app --config config.yml` |
| The bridge driven by an LLM agent | [`mcp` mode](../MCP.md) |

In config mode the CLI also serves the browser UI on the configured port. If you don't want the
UI exposed in production, front it appropriately or run only the routes you need.

## Security checklist for production

- **TLS on every sensitive endpoint** (`tls.required: true` + `ca_file`, mTLS where supported).
  Never set `accept_invalid_certs: true`. Pick the crypto provider feature (`rustls-aws-lc` for
  FIPS-capable / post-quantum, or `rustls-ring`).
- **Keep payloads out of logs**: run above `trace` level (payloads log at `trace`).
- **Do not commit secrets**: source them from a secrets manager or env vars.
- Consider the config **security modes** (plain, extracted secrets, encrypted config, encrypted
  history) based on the runtime target and available key storage.

Full hardening notes (including the PCI-DSS-oriented checklist) are in the
[TLS & security hardening](../engine/configuration.md#tls--security-hardening) section.

## Observability

Wire up the [`metrics`](observability.md) middleware and scrape the Prometheus endpoint; ship
the JSON logs to your aggregator. See [Observability & metrics](observability.md).

## Continuous deployment of this book

Publishing the book itself (GitHub Pages) is a separate follow-up. Note that the book vendors
the engine's canonical docs at build time — a CI job must run `docs/sync-engine-docs.sh` (with
access to the `mq-bridge` repo, or `ENGINE_REPO` pointed at a checkout) **before** `mdbook build
docs`. See [the book's README](https://github.com/marcomq/mq-bridge-app/blob/main/docs/README.md).
