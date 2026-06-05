# IBM MQ Integration Setup

This guide explains how to build and use `mq-bridge-app` with IBM MQ support.

## Overview

IBM MQ support is available as an optional feature that must be explicitly enabled during compilation. The UI will automatically detect whether IBM MQ support is available in the running backend and show/hide the IBM MQ endpoint options accordingly.

## Prerequisites

### IBM MQ Client Library

To build with IBM MQ support, you need the IBM MQ client library installed on your system:

1. **Download the IBM MQ Client**
   - Visit the [IBM MQ Downloads page](https://www.ibm.com/support/pages/downloading-ibm-mq-94)
   - Download the "IBM MQ C client" redistributable package for your platform
   - For Linux: `IBM-MQC-Redist-LinuxX64.tar.gz`
   - For macOS: `IBM-MQC-Redist-MacX64.tar.gz`
   - For Windows: `IBM-MQC-Redist-Win64.zip`

2. **Install the Client Library**

   **Linux/macOS:**
   ```bash
   # Extract to /opt/mqm (default location)
   sudo mkdir -p /opt/mqm
   sudo tar -xzf IBM-MQC-Redist-*.tar.gz -C /opt/mqm
   
   # Or extract to a custom location and set MQ_INSTALLATION_PATH
   tar -xzf IBM-MQC-Redist-*.tar.gz -C ~/ibm-mq
   export MQ_INSTALLATION_PATH=~/ibm-mq
   ```

   **Windows:**
   ```powershell
   # Extract to C:\IBM\MQ (or your preferred location)
   # Set environment variable
   $env:MQ_INSTALLATION_PATH = "C:\IBM\MQ"
   ```

## Building with IBM MQ Support

### Using Cargo

```bash
# Set the MQ installation path if not using /opt/mqm
export MQ_INSTALLATION_PATH=/path/to/mqm

# Build with IBM MQ feature
cargo build --release --features=ibm-mq

# Or install directly
cargo install --path crates/cli --features=ibm-mq
```

### Using Docker

The project includes Docker build support for IBM MQ. The Dockerfile automatically downloads and includes the IBM MQ client library for AMD64 builds:

```bash
# Build with IBM MQ support (AMD64 only)
docker build --build-arg ENABLE_IBM_MQ=true -t mq-bridge-app:ibm-mq .

# Run the container
docker run --rm -p 9091:9091 mq-bridge-app:ibm-mq
```

**Note:** IBM MQ client libraries are only available for AMD64 architecture. ARM64 builds will not include IBM MQ support even if `ENABLE_IBM_MQ=true` is set.

### Pre-built Binaries

Pre-built binaries with IBM MQ support are not included in the standard releases to keep download sizes manageable. You can:

1. Build from source using the instructions above
2. Use the Docker image with IBM MQ support
3. Request IBM MQ-enabled binaries for your platform

## Configuration

Once built with IBM MQ support, you can configure IBM MQ endpoints in your configuration:

```yaml
publishers:
  - name: "IBM MQ Publisher"
    endpoint:
      ibmmq:
        connection_manager: "QM1"
        queue: "DEV.QUEUE.1"
        # Or use topic instead of queue
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

## UI Feature Detection

The UI automatically detects whether IBM MQ support is available:

- **With IBM MQ:** The IBM MQ endpoint type appears in publisher and consumer dropdowns
- **Without IBM MQ:** The IBM MQ endpoint type is hidden from the UI

This detection happens automatically when the app starts by querying the `/features` endpoint.

## Verifying IBM MQ Support

You can verify whether your build includes IBM MQ support:

### Via API

```bash
curl http://localhost:9091/features
```

Response:
```json
{
  "ibm_mq": true,
  "kafka": true,
  "nats": true,
  ...
}
```

### Via CLI

```bash
# Check if the binary was built with IBM MQ
mq-bridge-app --version
# Look for "ibm-mq" in the features list (if implemented)
```

## Troubleshooting

### Library Not Found Errors

If you see errors like `cannot open shared object file: libmqic_r.so`:

1. Ensure the IBM MQ client is installed
2. Set `LD_LIBRARY_PATH` (Linux) or `DYLD_LIBRARY_PATH` (macOS):
   ```bash
   export LD_LIBRARY_PATH=/opt/mqm/lib64:$LD_LIBRARY_PATH
   ```
3. On Linux, you can also add the library path to `/etc/ld.so.conf.d/`:
   ```bash
   echo "/opt/mqm/lib64" | sudo tee /etc/ld.so.conf.d/ibm-mq.conf
   sudo ldconfig
   ```

### Build Errors

If compilation fails:

1. Verify `MQ_INSTALLATION_PATH` or `MQ_HOME` is set correctly
2. Ensure the client library matches your system architecture (64-bit vs 32-bit)
3. Check that you have the C client library, not just the Java client

### Connection Errors

If you can't connect to IBM MQ:

1. Verify the queue manager is running
2. Check firewall rules allow connections on the MQ port (default 1414)
3. Ensure the channel and queue exist
4. Verify credentials are correct
5. Check MQ error logs for detailed error messages

## Platform-Specific Notes

### Linux

- Default installation path: `/opt/mqm`
- Library path: `/opt/mqm/lib64` (64-bit) or `/opt/mqm/lib` (32-bit)
- Requires `libmqic_r.so` and dependencies

### macOS

- Default installation path: `/opt/mqm`
- Library path: `/opt/mqm/lib64`
- May require security exceptions for unsigned libraries

### Windows

- Default installation path: `C:\Program Files\IBM\MQ`
- Library path: `C:\Program Files\IBM\MQ\bin64`
- Requires `mqic.dll` and dependencies

## License Considerations

The IBM MQ client library is redistributable under IBM's license terms. When distributing binaries with IBM MQ support:

1. Include the IBM MQ license files from `/opt/mqm/licenses`
2. Comply with IBM's redistribution terms
3. Consider providing IBM MQ-enabled builds separately from standard builds

## Further Reading

- [IBM MQ Documentation](https://www.ibm.com/docs/en/ibm-mq)
- [IBM MQ Client Downloads](https://www.ibm.com/support/pages/downloading-ibm-mq-94)
- [mq-bridge IBM MQ Support](https://github.com/marcomq/mq-bridge#ibm-mq)