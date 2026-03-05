# --- Builder Stage ---
FROM --platform=$BUILDPLATFORM rust:1.92-bookworm AS builder
ARG TARGETARCH
ARG BUILDPLATFORM

WORKDIR /usr/src/mq-bridge-app

# Install build dependencies.
# For ARM64 cross-compilation, we need:
#   1. The aarch64 GCC toolchain (compiler + linker)
#   2. ARM64 sysroot libraries (:arm64 packages) for rdkafka's C deps
#   3. cmake, which rdkafka-sys uses to build librdkafka from source
#   4. A cmake toolchain file so cmake targets aarch64, not the host
RUN dpkg --add-architecture arm64 && \
    apt-get update && \
    apt-get install -y \
        pkg-config \
        curl \
        cmake \
        # ARM64 cross-compiler toolchain (used even on amd64 builds
        # for the cross-compile path, harmless to install always)
        gcc-aarch64-linux-gnu \
        g++-aarch64-linux-gnu \
        # Native (host) build tools for amd64 path
        gcc \
        # ARM64 sysroot libraries — rdkafka's cmake build links these
        libssl-dev:arm64 \
        zlib1g-dev:arm64 \
        libsasl2-dev:arm64 \
        # Native equivalents for amd64 path
        libssl-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# Add ARM64 Rust target
RUN rustup target add aarch64-unknown-linux-gnu

# Write a cmake toolchain file for aarch64.
# rdkafka-sys passes CMAKE_TOOLCHAIN_FILE to cmake when building librdkafka,
# so cmake will use the cross-compiler instead of the host gcc.
RUN cat > /aarch64-toolchain.cmake <<'EOF'
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)

set(CMAKE_C_COMPILER   aarch64-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++)
set(CMAKE_AR           aarch64-linux-gnu-ar)

# Tell cmake to look for libraries/headers in the ARM64 sysroot
set(CMAKE_FIND_ROOT_PATH /usr/aarch64-linux-gnu)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
EOF

# --- Cross-compilation environment variables ---
# Cargo linker for the aarch64 target
ENV CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc \
    CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc \
    CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++ \
    AR_aarch64_unknown_linux_gnu=aarch64-linux-gnu-ar \
    # Tell pkg-config it's allowed to cross-compile
    PKG_CONFIG_ALLOW_CROSS=1 \
    # Point pkg-config to the ARM64 sysroot packages
    PKG_CONFIG_PATH_aarch64_unknown_linux_gnu=/usr/lib/aarch64-linux-gnu/pkgconfig \
    PKG_CONFIG_SYSROOT_DIR=/usr/aarch64-linux-gnu \
    # Pass the cmake toolchain file to rdkafka-sys's build script.
    # This is the key fix: without this, cmake builds librdkafka for x86_64.
    CMAKE_TOOLCHAIN_FILE=/aarch64-toolchain.cmake \
    # Also set OPENSSL vars explicitly so rdkafka-sys and openssl-sys
    # find the ARM64 headers/libs rather than the host ones.
    OPENSSL_INCLUDE_DIR=/usr/include/aarch64-linux-gnu \
    OPENSSL_LIB_DIR=/usr/lib/aarch64-linux-gnu \
    OPENSSL_DIR=/usr/aarch64-linux-gnu

# IBM MQ — only available for AMD64
WORKDIR /opt/mqm
RUN if [ "$TARGETARCH" = "amd64" ]; then \
        curl -LO https://public.dhe.ibm.com/ibmdl/export/pub/software/websphere/messaging/mqdev/redist/9.4.5.0-IBM-MQC-Redist-LinuxX64.tar.gz \
        && tar -xzf *.tar.gz \
        && rm *.tar.gz; \
    else \
        echo "Skipping IBM MQ installation for $TARGETARCH" \
        && mkdir -p /opt/mqm/lib64 /opt/mqm/licenses; \
    fi

# Set MQ env vars (lib64 will be empty on arm64, which is fine)
ENV MQ_HOME="/opt/mqm"
ENV LIBRARY_PATH="/opt/mqm/lib64:${LIBRARY_PATH:-}"
ENV LD_LIBRARY_PATH="/opt/mqm/lib64:${LD_LIBRARY_PATH:-}"
ENV RUSTFLAGS="-L native=/opt/mqm/lib64"

# Copy project files
WORKDIR /usr/src/mq-bridge-app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY static ./static

# Build the application
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/src/mq-bridge-app/target,id=target-${TARGETARCH},sharing=locked \
    if [ "$TARGETARCH" = "amd64" ]; then \
        RUST_TARGET="x86_64-unknown-linux-gnu"; \
        CARGO_FEATURES="--features=ibm-mq"; \
    else \
        RUST_TARGET="aarch64-unknown-linux-gnu"; \
        CARGO_FEATURES=""; \
    fi && \
    CARGO_PROFILE_RELEASE_WITH_LTO_LTO=thin \
    cargo build --target "$RUST_TARGET" --profile release-with-lto $CARGO_FEATURES --jobs 2 && \
    cp target/$RUST_TARGET/release-with-lto/mq-bridge-app mq-bridge-app

# Identify and copy only the necessary MQ libraries for the final stage
RUN mkdir /mq-libs && \
    if [ "$TARGETARCH" = "amd64" ]; then \
        ldd mq-bridge-app | grep '/opt/mqm/lib64/' | awk '{print $3}' | xargs -I {} cp -L {} /mq-libs/; \
    fi

# Stage the correct libz for the final image based on target arch
RUN touch input.log error.log && mkdir /app_placeholder && \
    mkdir /dist_libs && \
    if [ "$TARGETARCH" = "amd64" ]; then \
        cp /usr/lib/x86_64-linux-gnu/libz.so.* /dist_libs/; \
    else \
        cp /usr/lib/aarch64-linux-gnu/libz.so.* /dist_libs/; \
    fi

# --- Final Stage ---
FROM gcr.io/distroless/cc-debian12:nonroot AS final

COPY --from=builder /usr/src/mq-bridge-app/mq-bridge-app /usr/local/bin/mq-bridge-app
COPY --from=builder --chown=nonroot:nonroot /app_placeholder /app
COPY --from=builder --chown=nonroot:nonroot /usr/src/mq-bridge-app/input.log /app/input.log
COPY --from=builder --chown=nonroot:nonroot /usr/src/mq-bridge-app/error.log /app/error.log
COPY --from=builder /dist_libs/libz.so.* /lib/

COPY --from=builder /mq-libs /opt/mqm/lib64
COPY --from=builder /opt/mqm/licenses /opt/mqm/licenses

ENV LD_LIBRARY_PATH="/opt/mqm/lib64"

COPY config /config

WORKDIR /app

EXPOSE 9090
EXPOSE 9091

ENTRYPOINT ["/usr/local/bin/mq-bridge-app"]