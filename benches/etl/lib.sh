#!/usr/bin/env bash
# Shared helpers for the ETL/CDC benchmark harness. Source this from the runners.
set -euo pipefail

# --- Fixed connection + workload parameters (match the compose + the brief) ---
export PGHOST="${PGHOST:-localhost}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-testuser}"
export PGPASSWORD="${PGPASSWORD:-testpass}"
export PGDATABASE="${PGDATABASE:-testdb}"
PG_URL="postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"
export PG_URL

# Workload knobs (overridable from the environment).
export MSG_COUNT="${MSG_COUNT:-100000}"     # rows per run
export WARMUP_COUNT="${WARMUP_COUNT:-5000}" # pre-roll rows, excluded from timing
export METRICS_ADDR="${METRICS_ADDR:-127.0.0.1:9090}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export HERE
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
export REPO_ROOT

# Path to the built lean benchmark binary (see README: cargo build --features bench).
export BIN="${BIN:-$REPO_ROOT/target/release/mq-bridge-app}"

# psql shorthand against the benchmark database. Uses a host `psql` if present,
# otherwise runs psql inside the compose container (so no host client is needed).
PG_CONTAINER="${PG_CONTAINER:-postgres-etl-bench-mq-bridge}"
psql_q() {
  if command -v psql >/dev/null 2>&1; then
    psql "$PG_URL" -v ON_ERROR_STOP=1 -qtA "$@"
  else
    docker exec -i "$PG_CONTAINER" psql -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -qtA "$@"
  fi
}

# Wait until Postgres answers.
wait_for_pg() {
  local tries=30
  until psql_q -c 'SELECT 1' >/dev/null 2>&1; do
    ((tries--)) || { echo "postgres never became ready" >&2; return 1; }
    sleep 1
  done
}

# Environment header — CPU model / cores / RAM / OS / mq-bridge(-app) version.
# Printed next to every results block so nothing is published without methodology.
print_env_header() {
  local cpu cores ram os appver enginever
  if [[ "$(uname)" == "Darwin" ]]; then
    cpu="$(sysctl -n machdep.cpu.brand_string 2>/dev/null || echo unknown)"
    cores="$(sysctl -n hw.ncpu 2>/dev/null || echo '?')"
    ram="$(( $(sysctl -n hw.memsize 2>/dev/null || echo 0) / 1024 / 1024 / 1024 )) GiB"
  else
    cpu="$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2 | xargs || echo unknown)"
    cores="$(nproc 2>/dev/null || echo '?')"
    ram="$(( $(grep -m1 MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}') / 1024 / 1024 )) GiB"
  fi
  os="$(uname -sr)"
  appver="$(cd "$REPO_ROOT" && grep -m1 '^version' Cargo.toml | cut -d'"' -f2)"
  # mq-bridge engine commit pinned in Cargo.lock.
  enginever="$(cd "$REPO_ROOT" && awk '/name = "mq-bridge"/{f=1} f&&/source =/{print $0; exit}' Cargo.lock | sed 's/.*#//; s/"//' || echo unknown)"
  cat <<EOF
**Environment:** ${cpu} · ${cores} cores · ${ram} · ${os} · mq-bridge-app ${appver} · engine ${enginever} · postgres:16-alpine (wal_level=logical)
EOF
}

# Scrape a Prometheus summary quantile for a metric from the running app's exporter.
# Usage: scrape_quantile <metric> <quantile> [label=value ...]
scrape_quantile() {
  local metric="$1"; local q="$2"; shift 2
  local url="http://${METRICS_ADDR}/metrics"
  curl -s "$url" | awk -v m="$metric" -v q="$q" '
    $0 ~ "^"m"{" && $0 ~ "quantile=\""q"\"" { print $NF; found=1 }
    END { if (!found) print "NaN" }'
}
