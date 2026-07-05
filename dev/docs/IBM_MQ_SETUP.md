# IBM MQ Setup

How to build and install `mq-bridge-app` (CLI/server **and** the Tauri desktop app)
with IBM MQ support.

IBM MQ is an **optional, opt-in feature** (`--features ibm-mq`). It is not part of
the default `full` feature set because it links against IBM's native MQ client
library, which is not redistributable on crates.io and has no arm64 build. The UI
auto-detects whether the running backend was built with IBM MQ and shows/hides the
IBM MQ endpoint type accordingly (via the `/features` endpoint).

## 1. Install the IBM MQ client library

You need IBM's native MQ C client before building.

1. Download the **IBM MQ redistributable C client** for your platform from the
   [IBM MQ downloads page](https://www.ibm.com/support/pages/downloading-ibm-mq-94):
   - Linux: `IBM-MQC-Redist-LinuxX64.tar.gz`
   - macOS: `IBM-MQC-Redist-MacX64.tar.gz`
   - Windows: `IBM-MQC-Redist-Win64.zip`

2. Extract it and point `MQ_INSTALLATION_PATH` at it (skip the env var if you use
   the default `/opt/mqm`):

   **Linux / macOS**
   ```bash
   mkdir -p ~/ibm-mq && tar -xzf IBM-MQC-Redist-*.tar.gz -C ~/ibm-mq
   export MQ_INSTALLATION_PATH=~/ibm-mq
   ```

   **Windows (PowerShell)** — extract the zip, then:
   ```powershell
   $env:MQ_INSTALLATION_PATH = "C:\IBM\MQ"
   ```

> IBM MQ client libraries are **x86_64 only**. There is no arm64 redistributable
> client, so arm64 builds cannot include IBM MQ (even on Apple Silicon — build the
> x86_64 binary instead).

## 2. Install mq-bridge-app with IBM MQ

The build reads `MQ_INSTALLATION_PATH` (or `MQ_HOME`, default `/opt/mqm`) to locate
the client library, so make sure it is exported in the shell you run `cargo` from.

### CLI / server (web UI)

```bash
export MQ_INSTALLATION_PATH=~/ibm-mq          # where you extracted the client
cargo install mq-bridge-app --features ibm-mq
mq-bridge-app                                  # then open http://localhost:9091
```

The web UI is embedded directly in the binary, so a plain `cargo install` serves
the full UI — no `static/` folder or extra files to ship. (`--features ibm-mq` keeps
the default `full` feature set on and adds IBM MQ; you don't need `--features
ibm-mq,full`.)

### Desktop app (Tauri)

The desktop crate is not published to crates.io, so install it straight from git.
The committed UI bundle is reused, so no `npm` build is required:

```bash
export MQ_INSTALLATION_PATH=~/ibm-mq
cargo install --git https://github.com/marcomq/mq-bridge-app \
  mq-bridge-app-desktop --features ibm-mq
mq-bridge-app-desktop
```

The desktop build also needs the usual [Tauri prerequisites](https://tauri.app/start/prerequisites/)
(WebKitGTK + build tools on Linux; Xcode command-line tools on macOS; WebView2 on
Windows).

### From a local checkout

```bash
git clone https://github.com/marcomq/mq-bridge-app
cd mq-bridge-app
export MQ_INSTALLATION_PATH=~/ibm-mq

# CLI / server
cargo install --path crates/cli --features ibm-mq
# or desktop
cargo install --path crates/desktop --features ibm-mq
```

### Docker (CLI / server, amd64 only)

A prebuilt IBM MQ image is published as the `ibm-mq` / `latest-ibm-mq` tags:

```bash
docker run --rm -p 9091:9091 ghcr.io/marcomq/mq-bridge-app:latest-ibm-mq
```

Or build it yourself (the Dockerfile downloads the MQ client automatically):

```bash
docker build --build-arg ENABLE_IBM_MQ=true -t mq-bridge-app:ibm-mq .
```

## 3. Verify IBM MQ is enabled

```bash
curl http://localhost:9091/features
# => {"ibm_mq":true, "kafka":true, ...}
```

When `ibm_mq` is `true`, the IBM MQ endpoint type appears in the publisher and
consumer dropdowns in the UI.

## 4. Configure an IBM MQ endpoint

```yaml
publishers:
  - name: "IBM MQ Publisher"
    endpoint:
      ibmmq:
        connection_manager: "QM1"
        queue: "DEV.QUEUE.1"
        # ...or a topic instead of a queue:
        # topic: "topic://events"
        url: "mq-host(1414)"
        channel: "DEV.APP.SVRCONN"
        username: "app"
        password: "${MQ_PASSWORD}"

consumers:
  - name: "IBM MQ Consumer"
    endpoint:
      ibmmq:
        connection_manager: "QM1"
        queue: "DEV.QUEUE.1"
        url: "mq-host(1414)"
        channel: "DEV.APP.SVRCONN"
        username: "app"
        password: "${MQ_PASSWORD}"
```

## Troubleshooting

**Build can't find the client library** — confirm `MQ_INSTALLATION_PATH` (or
`MQ_HOME`) points at the directory that contains `lib64/` (64-bit). The build script
links against `$MQ_INSTALLATION_PATH/lib64`. Make sure you installed the C client,
not the Java client, and that it matches your architecture (x86_64).

**Runtime: `cannot open shared object file: libmqic_r.so` (Linux) /
`libmqic_r.dylib` (macOS)** — the loader needs the library at runtime:

```bash
# Linux
export LD_LIBRARY_PATH=$MQ_INSTALLATION_PATH/lib64:$LD_LIBRARY_PATH
# macOS
export DYLD_LIBRARY_PATH=$MQ_INSTALLATION_PATH/lib64:$DYLD_LIBRARY_PATH
```

On Linux you can make it permanent:
```bash
echo "$MQ_INSTALLATION_PATH/lib64" | sudo tee /etc/ld.so.conf.d/ibm-mq.conf
sudo ldconfig
```
(The CLI build adds an rpath automatically for GNU/Linux targets, so this is usually
only needed for the desktop app or non-default install paths.)

**Connection errors** — verify the queue manager is running, the `channel`/`queue`
exist, the port (default 1414) is reachable, and credentials are correct. Check the
MQ error logs for detail.

## Platform notes

| Platform | Default path | Library dir | Native library |
|----------|--------------|-------------|----------------|
| Linux    | `/opt/mqm`   | `lib64`     | `libmqic_r.so` |
| macOS    | `/opt/mqm`   | `lib64`     | `libmqic_r.dylib` (may need a security exception for the unsigned lib) |
| Windows  | `C:\Program Files\IBM\MQ` | `bin64` | `mqic.dll` |

## License

The IBM MQ client library is redistributable under IBM's own license terms. If you
distribute binaries built with IBM MQ support, include IBM's license files (from
`$MQ_INSTALLATION_PATH/licenses`) and comply with IBM's redistribution terms.

## Further reading

- [IBM MQ documentation](https://www.ibm.com/docs/en/ibm-mq)
- [IBM MQ client downloads](https://www.ibm.com/support/pages/downloading-ibm-mq-94)
