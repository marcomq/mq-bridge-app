# --- Builder Stage ---
FROM rust:1.92-bookworm AS builder
ARG TARGETARCH

WORKDIR /usr/src/mq-bridge-app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config gcc libssl-dev zlib1g-dev zlib1g curl && rm -rf /var/lib/apt/lists/*

# Install IBM MQ Redistributable Client
WORKDIR /opt/mqm
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        curl -LO https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist/9.4.5.0-IBM-MQC-Redist-LinuxX64.tar.gz \
        && tar -xzf *.tar.gz \
        && rm *.tar.gz; \
    else \
        echo "Skipping IBM MQ installation for $TARGETARCH" \
        && mkdir -p /opt/mqm/lib64 /opt/mqm/licenses; \
    fi

# Set environment variables for the Rust crate to find the MQ libraries
ENV MQ_HOME="/opt/mqm"
ENV LIBRARY_PATH="/opt/mqm/lib64:$LIBRARY_PATH"
ENV LD_LIBRARY_PATH="/opt/mqm/lib64:$LD_LIBRARY_PATH"

# Copy only the necessary files to cache dependencies
WORKDIR /usr/src/mq-bridge-app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY static ./static

# Build the application in release mode
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        CARGO_PROFILE_RELEASE_WITH_LTO_LTO=thin cargo build --profile release-with-lto --features=ibm-mq --jobs 2; \
    else \
        CARGO_PROFILE_RELEASE_WITH_LTO_LTO=thin cargo build --profile release-with-lto --jobs 2; \
    fi
# Strip the binary to reduce its size
RUN strip /usr/src/mq-bridge-app/target/release-with-lto/mq-bridge-app

# --- Final Stage ---
FROM gcr.io/distroless/cc-debian12 AS final

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/mq-bridge-app/target/release-with-lto/mq-bridge-app /usr/local/bin/mq-bridge-app
# Copy the required shared library from the builder stage.
# The wildcard '*' handles different architecture paths (e.g., x86_64-linux-gnu, aarch64-linux-gnu).
COPY --from=builder /usr/lib/*-linux-gnu/libz.so.* /lib/

# Copy IBM MQ libraries and licenses
COPY --from=builder /opt/mqm/lib64 /opt/mqm/lib64
COPY --from=builder /opt/mqm/licenses /opt/mqm/licenses

# Configure runtime library path
ENV LD_LIBRARY_PATH="/opt/mqm/lib64"

CMD ["mq-bridge-app"]