# --- Builder Stage ---
FROM --platform=$BUILDPLATFORM rust:1.92-bookworm AS builder
ARG TARGETARCH
ARG BUILDPLATFORM
# Bump DOCKER_CACHE_VERSION in release.yml to invalidate this cache
ARG CACHE_BUST=1

WORKDIR /usr/src/mq-bridge-app

RUN dpkg --add-architecture arm64 && \
    apt-get update && \
    apt-get install -y \
        pkg-config \
        curl \
        cmake \
        gcc-aarch64-linux-gnu \
        g++-aarch64-linux-gnu \
        gcc \
        libssl-dev:arm64 \
        zlib1g-dev:arm64 \
        libsasl2-dev:arm64 \
        libssl-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN rustup target add aarch64-unknown-linux-gnu

# Write the cmake toolchain file for aarch64 cross-compilation.
RUN cat > /aarch64-toolchain.cmake <<'EOF'
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_C_COMPILER   aarch64-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++)
set(CMAKE_AR           aarch64-linux-gnu-ar)
set(CMAKE_FIND_ROOT_PATH /usr/aarch64-linux-gnu)
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)
EOF

# Generate cargo config.toml conditionally per target platform.
#
# IMPORTANT: [target.X.env] is NOT valid cargo config syntax — cargo only
# supports [env] at the top level. So we write two different config files:
#
# arm64: includes TARGET_CMAKE_TOOLCHAIN_FILE (read by rdkafka-sys build.rs
#        to pass the cmake toolchain to librdkafka) plus ARM64 sysroot paths.
#
# amd64: minimal config, no sysroot overrides, native build works as-is.
#
# The cache mount targets /usr/local/cargo/registry, not /usr/local/cargo,
# so this file is never shadowed during the cargo build step.
#
# Heredocs cannot be used inside if/else in a RUN command — the EOF terminator
# ends the RUN instruction, making the Dockerfile parser see `else` as an
# unknown instruction. Instead we use printf to write both files, then select
# the right one with cp.
RUN mkdir -p /usr/local/cargo && \
    printf '[target.aarch64-unknown-linux-gnu]\nlinker = "aarch64-linux-gnu-gcc"\nar = "aarch64-linux-gnu-ar"\n\n[env]\nTARGET_CMAKE_TOOLCHAIN_FILE = "/aarch64-toolchain.cmake"\nPKG_CONFIG_SYSROOT_DIR = "/usr/aarch64-linux-gnu"\nPKG_CONFIG_PATH = "/usr/lib/aarch64-linux-gnu/pkgconfig"\nPKG_CONFIG_ALLOW_CROSS = "1"\nOPENSSL_INCLUDE_DIR = "/usr/include/aarch64-linux-gnu"\nOPENSSL_LIB_DIR = "/usr/lib/aarch64-linux-gnu"\n' > /cargo-config-arm64.toml && \
    printf '[target.x86_64-unknown-linux-gnu]\nlinker = "gcc"\n' > /cargo-config-amd64.toml && \
    if [ "$TARGETARCH" = "arm64" ]; then \
        cp /cargo-config-arm64.toml /usr/local/cargo/config.toml; \
    else \
        cp /cargo-config-amd64.toml /usr/local/cargo/config.toml; \
    fi

# CC_*/CXX_* are consumed by the `cc` crate, not cargo, so must be env vars
ENV CC_aarch64_unknown_linux_gnu=aarch64-linux-gnu-gcc \
    CXX_aarch64_unknown_linux_gnu=aarch64-linux-gnu-g++ \
    AR_aarch64_unknown_linux_gnu=aarch64-linux-gnu-ar \
    PKG_CONFIG_ALLOW_CROSS=1

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

ENV MQ_HOME="/opt/mqm"
ENV RUSTFLAGS="-L native=/opt/mqm/lib64"

# Copy project files
WORKDIR /usr/src/mq-bridge-app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY static ./static

# Build the application.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/src/mq-bridge-app/target,id=target-${TARGETARCH}-${CACHE_BUST},sharing=locked \
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