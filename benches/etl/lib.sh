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
export MSG_COUNT="${MSG_COUNT:-1000000}"    # rows per run
export WARMUP_COUNT="${WARMUP_COUNT:-5000}" # pre-roll rows, excluded from timing
export METRICS_ADDR="${METRICS_ADDR:-127.0.0.1:9090}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export HERE
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
export REPO_ROOT

# Path to the built lean benchmark binary (see README: cargo build --features bench).
export BIN="${BIN:-$REPO_ROOT/target/release/mq-bridge-app}"

# Path to the Sling CLI — a compiled (Go) EL baseline alongside Meltano. Kept
# repo-local so a run never depends on what's on $PATH. Install with:
#   mkdir -p benches/etl/bin && curl -sL \
#     "https://github.com/slingdata-io/sling-cli/releases/latest/download/sling_darwin_arm64.tar.gz" \
#     | tar -xz -C benches/etl/bin sling
export SLING_BIN="${SLING_BIN:-$HERE/bin/sling}"

# Count JSONL rows at a path that may be a single file or a directory of parts
# (Sling splits its output into part files unless file_max_rows is 0).
landed_rows() {
  local p="$1"
  if [[ -d "$p" ]]; then
    find "$p" -type f -exec cat {} + 2>/dev/null | wc -l | tr -d ' '
  elif [[ -f "$p" ]]; then
    wc -l < "$p" | tr -d ' '
  else
    echo 0
  fi
}

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

# --- Shared app-process helpers (used by the run_*.sh scenario scripts) ---

# Bail with a clear message if the lean bench binary hasn't been built.
require_bin() {
  [[ -x "$BIN" ]] || { echo "binary not found at $BIN — build with --features bench --release" >&2; exit 1; }
}

# Start the app in the background against a --config file; prints its PID.
# Usage: pid="$(start_app config.yaml app.log)"
start_app() {
  local config="$1" log="$2"
  "$BIN" --config "$config" >"$log" 2>&1 &
  echo $!
}

# Poll a UI's /health endpoint until it answers, or fail after ~30s.
wait_health() {
  local addr="$1" log="${2:-}" tries=30
  until curl -fs "http://${addr}/health" >/dev/null 2>&1; do
    ((tries--)) || { echo "UI at ${addr} never came up${log:+ (see $log)}" >&2; return 1; }
    sleep 1
  done
}

# --config loads a route but does NOT start it — this is the zero-code
# "Start" action (POST /consumer-start), the same thing clicking Start in
# the UI does. (POST /config only validates+saves; it never starts routes.)
start_consumer() {
  local addr="$1" id="$2"
  curl -fs -X POST "http://${addr}/consumer-start?consumer_id=${id}" >/dev/null \
    || { echo "POST /consumer-start failed for ${id} on ${addr}" >&2; return 1; }
}

# Best-effort kill of one or more PIDs; ignores already-exited processes.
# Usage: trap 'kill_pids "$PID1" "$PID2"' EXIT
kill_pids() {
  for pid in "$@"; do [[ -n "$pid" ]] && kill "$pid" 2>/dev/null; done
  true
}

# Run a command with a watchdog timeout so a stuck/misconfigured route can't
# hang a benchmark matrix. Returns non-zero if it had to be killed.
# Usage: run_guarded 900 "$BIN" copy --from ... --to ...
run_guarded() {
  local timeout="$1"; shift
  "$@" >/dev/null 2>&1 &
  local pid=$!
  { sleep "$timeout"; kill "$pid" 2>/dev/null; } 2>/dev/null &
  local killer=$!
  disown "$killer" 2>/dev/null || true
  local rc=0; wait "$pid" 2>/dev/null || rc=$?
  kill "$killer" 2>/dev/null || true
  return "$rc"
}
