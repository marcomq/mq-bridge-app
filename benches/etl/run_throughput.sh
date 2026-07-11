#!/usr/bin/env bash
# Scenarios 1 & 3 — bulk-insert throughput and batched-vs-unbatched, run through
# the app's zero-code `copy` ETL command (postgres table -> postgres table),
# wall-clocked over an exact MSG_COUNT rows. rows/sec = MSG_COUNT / elapsed.
#
# Prereqs:  ./seed.sh up   (Docker Postgres)   and a lean build:
#           cargo build -p mq-bridge-app --no-default-features --features bench --release
#
# Matrix (override via env): PAYLOADS, BATCHES, CONCURRENCIES.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/seed.sh"   # also sources lib.sh

PAYLOADS="${PAYLOADS:-256 4096}"        # bytes per JSON row
BATCHES="${BATCHES:-1 128}"
CONCURRENCIES="${CONCURRENCIES:-1 4}"

RESULTS_DIR="${RESULTS_DIR:-$HERE/results}"
mkdir -p "$RESULTS_DIR"
CSV="$RESULTS_DIR/throughput.csv"
echo "payload_bytes,batch,concurrency,rows,elapsed_s,rows_per_s" > "$CSV"

now() { python3 -c 'import time; print(time.time())'; }
COPY_TIMEOUT="${COPY_TIMEOUT:-900}"   # hard cap per copy run (s), guards a stuck route

# Run `copy` with a watchdog kill so a misconfigured/stuck route can't hang the
# matrix. Returns non-zero if it had to be killed.
copy_guarded() {
  "$BIN" copy "$@" >/dev/null 2>&1 &
  local pid=$!
  { sleep "$COPY_TIMEOUT"; kill "$pid" 2>/dev/null; } 2>/dev/null &
  local killer=$!
  disown "$killer" 2>/dev/null || true
  local rc=0; wait "$pid" 2>/dev/null || rc=$?
  kill "$killer" 2>/dev/null || true
  return "$rc"
}

[[ -x "$BIN" ]] || { echo "binary not found at $BIN — build with --features bench --release" >&2; exit 1; }
wait_for_pg

run_one() {
  local bytes="$1" batch="$2" conc="$3"
  local src="src_${bytes}" dst="dst_${bytes}"
  # Non-destructive incremental read paging on the monotonic `id` column (the
  # sqlx cursor reader) — the ETL "read a source table" path, akin to an Airbyte
  # incremental sync. (`delete_after_read` instead expects a queue-shaped table.)
  local from="${PG_URL}?table=${src}&cursor_column=id&sslmode=disable"
  local to="${PG_URL}?table=${dst}&auto_create_table=true&sslmode=disable"

  # Warmup pre-roll (excluded from timing): primes the connection pool + caches.
  reset_dst "$dst" >/dev/null
  seed_source "$src" "$bytes" "$WARMUP_COUNT" >/dev/null
  copy_guarded --from "$from" --to "$to" --drain --batch-size "$batch" --concurrency "$conc" || true

  # Measured run.
  reset_dst "$dst" >/dev/null
  seed_source "$src" "$bytes" "$MSG_COUNT" >/dev/null
  local t0 t1 elapsed rate landed
  t0="$(now)"
  copy_guarded --from "$from" --to "$to" --drain --batch-size "$batch" --concurrency "$conc" || true
  t1="$(now)"
  landed="$(psql_q -c "SELECT count(*) FROM ${dst};")"
  elapsed="$(python3 -c "print(f'{$t1-$t0:.3f}')")"
  rate="$(python3 -c "print(int($MSG_COUNT/($t1-$t0)))")"
  printf '%s,%s,%s,%s,%s,%s\n' "$bytes" "$batch" "$conc" "$landed" "$elapsed" "$rate" | tee -a "$CSV"
  if [[ "$landed" != "$MSG_COUNT" ]]; then
    echo "  WARNING: landed ${landed} != expected ${MSG_COUNT}" >&2
  fi
}

echo "# throughput matrix: payloads=[$PAYLOADS] batches=[$BATCHES] concurrency=[$CONCURRENCIES] rows=$MSG_COUNT"
for bytes in $PAYLOADS; do
  for batch in $BATCHES; do
    for conc in $CONCURRENCIES; do
      echo "-- ${bytes}B batch=${batch} conc=${conc}"
      run_one "$bytes" "$batch" "$conc"
    done
  done
done
echo "done -> $CSV"
