# --- Builder Stage ---
FROM rust:1.92-bookworm AS builder
ARG TARGETARCH

WORKDIR /usr/src/mq-bridge-app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config gcc libssl-dev zlib1g-dev zlib1g curl && rm -rf /var/lib/apt/lists/*

# Install IBM MQ Redistributable Client which is only available for AMD64
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
ENV LIBRARY_PATH="/opt/mqm/lib64:\${LIBRARY_PATH:-}"
ENV LD_LIBRARY_PATH="/opt/mqm/lib64:\${LD_LIBRARY_PATH:-}"
ENV RUSTFLAGS="-L native=/opt/mqm/lib64"

# Copy only the necessary files to cache dependencies
WORKDIR /usr/src/mq-bridge-app
COPY Cargo.toml Cargo.lock ./

# Create a dummy main.rs to build dependencies
RUN mkdir src && echo "fn main() {}" > src/main.rs

# Build dependencies (this layer will be cached if Cargo.toml/lock don't change)
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=target,sharing=locked \
    CARGO_FEATURES=$(if [ "$TARGETARCH" = "amd64" ]; then echo "--features=ibm-mq"; fi) && \
    CARGO_PROFILE_RELEASE_WITH_LTO_LTO=thin cargo build --profile release-with-lto $CARGO_FEATURES --jobs 2

# Copy the actual source code
COPY src ./src
COPY static ./static

# Build the application in release mode
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=target,sharing=locked \
    touch src/main.rs && \
    CARGO_FEATURES=$(if [ "$TARGETARCH" = "amd64" ]; then echo "--features=ibm-mq"; fi) && \
    CARGO_PROFILE_RELEASE_WITH_LTO_LTO=thin cargo build --profile release-with-lto $CARGO_FEATURES --jobs 2 && \
    cp target/release-with-lto/mq-bridge-app mq-bridge-app
# Strip the binary to reduce its size
RUN strip mq-bridge-app
# Create an empty log file for file input examples
RUN touch input.log
RUN touch error.log

# --- Final Stage ---
FROM gcr.io/distroless/cc-debian12 AS final

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/mq-bridge-app/mq-bridge-app /usr/local/bin/mq-bridge-app
COPY --from=builder /usr/src/mq-bridge-app/input.log /app/input.log
COPY --from=builder /usr/src/mq-bridge-app/error.log /app/error.log
# Copy the required shared library from the builder stage.
# The wildcard '*' handles different architecture paths (e.g., x86_64-linux-gnu, aarch64-linux-gnu).
COPY --from=builder /usr/lib/*-linux-gnu/libz.so.* /lib/

# Copy IBM MQ libraries and licenses
COPY --from=builder /opt/mqm/lib64 /opt/mqm/lib64
COPY --from=builder /opt/mqm/licenses /opt/mqm/licenses

# Configure runtime library path
ENV LD_LIBRARY_PATH="/opt/mqm/lib64"

# Copy example configurations
COPY config /app/config

WORKDIR /app

EXPOSE 9090
EXPOSE 9091

ENTRYPOINT ["/usr/local/bin/mq-bridge-app"]