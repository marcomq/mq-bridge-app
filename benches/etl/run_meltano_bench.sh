#!/usr/bin/env bash
# Postgres -> JSONL comparison against Meltano (tap-postgres -> target-jsonl):
# `bench` table/schema/dataset (id, first_name, country, amount, created_at,
# active, attributes; 1,000,000 rows, seed 42, see gen_bench_data.py), 1 warmup
# run discarded + 5 timed runs, median/stddev, row-count parity check.
#
# Prereqs:  ./seed.sh up && ./seed.sh bench   and a lean build:
#           cargo build -p mq-bridge-app --no-default-features --features bench --release
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/seed.sh"   # also sources lib.sh

ROWS="${ROWS:-1000000}"
REPEATS="${REPEATS:-5}"
MELTANO_PROJECT="$HERE/meltano_project/bench"
MELTANO_BIN="$HERE/meltano_project/.venv/bin/meltano"

RESULTS_DIR="${RESULTS_DIR:-$HERE/results}"
mkdir -p "$RESULTS_DIR"
CSV="$RESULTS_DIR/meltano_pg_to_jsonl.csv"
echo "tool,rows,repeats,median_elapsed_s,stddev_elapsed_s,median_rows_per_s" > "$CSV"

now() { python3 -c 'import time; print(time.time())'; }
COPY_TIMEOUT="${COPY_TIMEOUT:-900}"
OUT_FILE="${OUT_FILE:-/tmp/mqb_bench_out.jsonl}"

median_stddev() {
  python3 -c "
import statistics as s
xs=[${1}]
print(f'{s.median(xs):.3f} {s.pstdev(xs):.3f}' if len(xs) > 1 else f'{xs[0]:.3f} 0.000')
"
}

[[ -x "$BIN" ]] || { echo "binary not found at $BIN — build with --features bench --release" >&2; exit 1; }
[[ -x "$MELTANO_BIN" ]] || { echo "meltano venv not found at $MELTANO_BIN" >&2; exit 1; }
wait_for_pg

n_bench="$(psql_q -c "SELECT count(*) FROM bench;" 2>/dev/null || echo 0)"
if [[ "$n_bench" != "$ROWS" ]]; then
  echo "bench table has ${n_bench} rows, expected ${ROWS} — reseeding"
  seed_bench "$ROWS" 42
fi

# --- mq-bridge-app copy ---
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

from="${PG_URL}?table=bench&cursor_column=id&sslmode=disable"
to="file://${OUT_FILE}?format=raw"

echo "-- mq-bridge-app copy: warmup"
rm -f "$OUT_FILE"
copy_guarded --from "$from" --to "$to" --drain --batch-size 1024 --concurrency 1 || true

mqb_samples=()
for ((i = 1; i <= REPEATS; i++)); do
  rm -f "$OUT_FILE"
  t0="$(now)"
  copy_guarded --from "$from" --to "$to" --drain --batch-size 1024 --concurrency 1 || true
  t1="$(now)"
  landed="$(wc -l < "$OUT_FILE" | tr -d ' ')"
  [[ "$landed" == "$ROWS" ]] || echo "  WARNING: mq-bridge-app run $i landed ${landed} != expected ${ROWS}" >&2
  elapsed="$(python3 -c "print(f'{$t1-$t0:.6f}')")"
  echo "  mq-bridge-app run $i: ${elapsed}s"
  mqb_samples+=("$elapsed")
done
read -r mqb_median mqb_stddev <<<"$(median_stddev "${mqb_samples[*]/%/,}")"
mqb_rate="$(python3 -c "print(int($ROWS/$mqb_median))")"
printf 'mq-bridge-app,%s,%s,%s,%s,%s\n' "$ROWS" "$REPEATS" "$mqb_median" "$mqb_stddev" "$mqb_rate" | tee -a "$CSV"
rm -f "$OUT_FILE"

# --- Meltano (tap-postgres -> target-jsonl) ---
run_meltano_once() {
  rm -rf "$MELTANO_PROJECT/output"
  (cd "$MELTANO_PROJECT" && "$MELTANO_BIN" run tap-postgres target-jsonl) >/dev/null 2>&1
}

echo "-- meltano: warmup"
run_meltano_once || true

meltano_samples=()
for ((i = 1; i <= REPEATS; i++)); do
  t0="$(now)"
  run_meltano_once
  t1="$(now)"
  landed="$(wc -l < "$MELTANO_PROJECT/output/public-bench.jsonl" | tr -d ' ')"
  [[ "$landed" == "$ROWS" ]] || echo "  WARNING: meltano run $i landed ${landed} != expected ${ROWS}" >&2
  elapsed="$(python3 -c "print(f'{$t1-$t0:.6f}')")"
  echo "  meltano run $i: ${elapsed}s"
  meltano_samples+=("$elapsed")
done
read -r meltano_median meltano_stddev <<<"$(median_stddev "${meltano_samples[*]/%/,}")"
meltano_rate="$(python3 -c "print(int($ROWS/$meltano_median))")"
printf 'meltano,%s,%s,%s,%s,%s\n' "$ROWS" "$REPEATS" "$meltano_median" "$meltano_stddev" "$meltano_rate" | tee -a "$CSV"

echo "done -> $CSV"
