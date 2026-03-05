# --- Builder Stage ---
FROM --platform=$BUILDPLATFORM rust:1.92-bookworm AS builder
ARG TARGETARCH
ARG BUILDARCH

WORKDIR /usr/src/mq-bridge-app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config curl && \
    if [ "$TARGETARCH" = "arm64" ] && [ "$BUILDARCH" != "arm64" ]; then \
        dpkg --add-architecture arm64 && \
        apt-get update && \
        apt-get install -y gcc-aarch64-linux-gnu libssl-dev:arm64 zlib1g-dev:arm64 && \
        rustup target add aarch64-unknown-linux-gnu; \
    else \
        apt-get install -y gcc libssl-dev zlib1g-dev; \
    fi && \
    rm -rf /var/lib/apt/lists/*
    
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
# Cross-compilation environment variables
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
    CC_aarch64-unknown-linux-gnu=aarch64-linux-gnu-gcc \
    CXX_aarch64-unknown-linux-gnu=aarch64-linux-gnu-g++ \
    AR_aarch64-unknown-linux-gnu=aarch64-linux-gnu-ar \
    PKG_CONFIG_PATH_aarch64-unknown-linux-gnu=/usr/lib/aarch64-linux-gnu/pkgconfig


# Copy project files
WORKDIR /usr/src/mq-bridge-app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY static ./static

# Build the application in release mode
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/src/mq-bridge-app/target,id=target-${TARGETARCH},sharing=locked \
    if [ "$TARGETARCH" = "amd64" ]; then \
        RUST_TARGET="x86_64-unknown-linux-gnu"; \
    else \
        RUST_TARGET="aarch64-unknown-linux-gnu"; \
        # Force the cross-compiler for C dependencies with non-standard build scripts (like rdkafka-sys).
        # This ensures that even if a build script ignores Cargo's environment, it still picks up the correct compiler.
        export CC=aarch64-linux-gnu-gcc; \
        export CXX=aarch64-linux-gnu-g++; \
        export AR=aarch64-linux-gnu-ar; \
    fi && \
    CARGO_FEATURES=$(if [ "$TARGETARCH" = "amd64" ]; then echo "--features=ibm-mq"; fi) && \
    CARGO_PROFILE_RELEASE_WITH_LTO_LTO=thin cargo build --target "$RUST_TARGET" --profile release-with-lto $CARGO_FEATURES --jobs 2 && \
    cp target/$RUST_TARGET/release-with-lto/mq-bridge-app mq-bridge-app

# Identify and copy only the necessary MQ libraries for the final stage
RUN mkdir /mq-libs && \
    if [ "$TARGETARCH" = "amd64" ]; then \
        ldd mq-bridge-app | grep '/opt/mqm/lib64/' | awk '{print $3}' | xargs -I {} cp -L {} /mq-libs/; \
    fi

RUN touch input.log error.log && mkdir /app_placeholder && \
    # Staging libs for the final image. This is safer than using a wildcard
    # in the final stage's COPY command, which can be ambiguous when
    # cross-compiling and multiple architectures' libraries are present.
    mkdir /dist_libs && \
    if [ "$TARGETARCH" = "amd64" ]; then \
        cp /usr/lib/x86_64-linux-gnu/libz.so.* /dist_libs/; \
    else \
        cp /usr/lib/aarch64-linux-gnu/libz.so.* /dist_libs/; \
    fi

# --- Final Stage ---
FROM gcr.io/distroless/cc-debian12:nonroot AS final

# Copy the built binary from the builder stage
COPY --from=builder /usr/src/mq-bridge-app/mq-bridge-app /usr/local/bin/mq-bridge-app
# Create a writable /app directory for the nonroot user before copying files into it.
COPY --from=builder --chown=nonroot:nonroot /app_placeholder /app
COPY --from=builder --chown=nonroot:nonroot /usr/src/mq-bridge-app/input.log /app/input.log
COPY --from=builder --chown=nonroot:nonroot /usr/src/mq-bridge-app/error.log /app/error.log
# Copy the required shared library from the builder stage.
# The wildcard '*' handles different architecture paths (e.g., x86_64-linux-gnu, aarch64-linux-gnu).
COPY --from=builder /dist_libs/libz.so.* /lib/

# Copy only the required IBM MQ libraries and all licenses
COPY --from=builder /mq-libs /opt/mqm/lib64
COPY --from=builder /opt/mqm/licenses /opt/mqm/licenses

# Configure runtime library path
ENV LD_LIBRARY_PATH="/opt/mqm/lib64"

# Copy example configurations
COPY config /config

WORKDIR /app

EXPOSE 9090
EXPOSE 9091

ENTRYPOINT ["/usr/local/bin/mq-bridge-app"]