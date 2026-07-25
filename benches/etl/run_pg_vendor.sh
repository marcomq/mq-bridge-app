#!/usr/bin/env bash
# Postgres -> file, against the tools that ship *with Postgres*.
#
#   ./seed.sh up && ./seed.sh bench 1000000   # prereq: the 1M-row `bench` table
#   ./run_pg_vendor.sh                        # -> results/pg_vendor.csv
#
# Why these tools, and which comparison is fair:
#
#   psql \copy TO CSV  — LIKE-FOR-LIKE. Both sides read the same table and write
#                        the same CSV bytes (the runner diffs them). This is the
#                        honest "how do you compare to what I already run?" number.
#   pg_dump            — REFERENCE FLOOR, NOT a head-to-head. It writes a *restore
#                        format* (a COPY-block SQL script), not interchange data,
#                        and it never decodes a row: the server streams COPY text
#                        and pg_dump forwards it. It is the cost of getting bytes
#                        out of Postgres at all, so it belongs in the table as the
#                        lower bound on any extraction — not as a competitor that
#                        was beaten or lost to.
#
# Deliberately NOT compared: pg_dump's custom/directory formats (compressed,
# parallel, restore-only) and `--data-only` row counts. Publishing a ratio against
# a dump format would be comparing different work and inviting the obvious
# objection.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/lib.sh"

ROWS="${ROWS:-1000000}"
REPEATS="${REPEATS:-2}"
RESULTS_DIR="${RESULTS_DIR:-$HERE/results}"
RESULTS_CSV="${RESULTS_CSV:-$RESULTS_DIR/pg_vendor.csv}"

OUT_MQB="${OUT_MQB:-/tmp/mqb_pg_vendor.csv}"
OUT_PSQL="${OUT_PSQL:-/tmp/psql_pg_vendor.csv}"
OUT_DUMP="${OUT_DUMP:-/tmp/pg_dump_vendor.sql}"

PG_TIMEOUT="${PG_TIMEOUT:-$(guard_budget 0.0004 60)}"   # ~400s at 1M rows

require_bin

# A HOST psql/pg_dump is mandatory here, unlike everywhere else in the harness.
# lib.sh's psql_q falls back to running psql *inside* the compose container, which
# would silently invalidate this scenario in two ways at once: `\copy` writes
# client-side, so the CSV would land on container disk (overlayfs) instead of the
# host's, and the client would reach the server over a container-local socket
# rather than the TCP connection mq-bridge-app uses. That is a different disk and a
# different network path — a faster number, and not a comparison.
#
# On macOS: brew install libpq (keg-only, no server, no service) and put
# $(brew --prefix libpq)/bin on PATH.
for tool in psql pg_dump; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "no host ${tool} on PATH — this scenario cannot use the container client:" >&2
    echo "  \\copy would write to container disk over a container-local socket," >&2
    echo "  while mq-bridge-app writes host disk over TCP. Not comparable." >&2
    echo "  macOS: brew install libpq && export PATH=\"\$(brew --prefix libpq)/bin:\$PATH\"" >&2
    exit 1
  }
done

wait_for_pg

have="$(psql_q -c 'SELECT count(*) FROM bench;' 2>/dev/null || echo 0)"
[[ "$have" == "$ROWS" ]] || {
  echo "the \`bench\` table has ${have} rows, expected ${ROWS} — run: ./seed.sh bench ${ROWS}" >&2
  exit 1
}

print_env_header
echo

# --- mq-bridge-app: table -> CSV file -----------------------------------------
mqb_once() {
  rm -f "$OUT_MQB"
  "$BIN" copy \
    --from "${PG_URL}?table=bench&cursor_column=id&sslmode=disable" \
    --to "file://${OUT_MQB}?format=csv" \
    --drain --batch-size 1024 --concurrency 1
}

# --- psql \copy: the same table, the same CSV ---------------------------------
# The projection looks fussy, and each part of it is load-bearing for the parity
# check. mq-bridge-app's CSV sink serializes each row from a JSON object, so it
# emits columns in **alphabetical** order and renders booleans as `true`/`false`;
# Postgres emits declared column order and `t`/`f`. So the columns are listed
# alphabetically and `active` is cast to text, which makes the two outputs
# byte-identical without changing the work either side does — only how the
# baseline presents it. `ORDER BY id` gives both a deterministic row order
# (mq-bridge-app reads via `cursor_column=id`), and HEADER matches its header line.
psql_once() {
  rm -f "$OUT_PSQL"
  psql_q -c "\\copy (SELECT active::text AS active, amount, attributes, country, created_at, first_name, id FROM bench ORDER BY id) TO '${OUT_PSQL}' WITH (FORMAT csv, HEADER true)"
}

# --- pg_dump: reference floor -------------------------------------------------
# Data only, one table, plain format — the leanest thing pg_dump can be asked to
# do, so the floor is not inflated by schema/index work.
dump_once() {
  rm -f "$OUT_DUMP"
  if command -v pg_dump >/dev/null 2>&1; then
    pg_dump "$PG_URL" --data-only --table=bench --format=plain --file="$OUT_DUMP"
  else
    docker exec -i "$PG_CONTAINER" pg_dump -U "$PGUSER" -d "$PGDATABASE" \
      --data-only --table=bench --format=plain > "$OUT_DUMP"
  fi
}

# Both CSV writers emit a header line on top of the data rows.
EXPECT_LINES=$((ROWS + 1))
bench_tool "mq-bridge-app" "$OUT_MQB" "$PG_TIMEOUT" mqb_once || exit 1
bench_tool "psql-copy" "$OUT_PSQL" "$PG_TIMEOUT" psql_once || exit 1

# A rate is only worth publishing if the two outputs are the same bytes. Without
# this the CSV comparison would be as arguable as the dump one.
echo "-- parity: mq-bridge-app CSV vs psql \\copy CSV"
if cmp -s "$OUT_MQB" "$OUT_PSQL"; then
  echo "   identical ($(wc -c < "$OUT_MQB" | tr -d ' ') bytes)"
else
  echo "   DIFFER — the CSV comparison is not like-for-like as configured:" >&2
  # `|| true` because a diff that finds differences exits 1, and under `set -o
  # pipefail` that aborted the whole script here — which is why pg_dump silently
  # never ran the first time. This is diagnostic output, not a measurement, so
  # suppressing its status is safe (contrast guarded_sample, where `|| true` would
  # hide a timeout and publish it as a result).
  diff <(head -3 "$OUT_MQB") <(head -3 "$OUT_PSQL") | head -20 >&2 || true
  echo "   (fix the sink config before publishing the ratio)" >&2
fi

# The dump writes a SQL script, so its line count is not a row count; count the
# COPY-block data lines instead (every one starts with the integer id column).
EXPECT_LINES=""
echo "-- pg_dump (reference floor, restore format — not a head-to-head)"
dump_rows_ok() {
  local n
  n="$(grep -cE '^[0-9]+\t' "$OUT_DUMP" || true)"
  [[ "$n" == "$ROWS" ]] || { echo "   dump held ${n} data rows, expected ${ROWS}" >&2; return 1; }
  echo "   dump holds ${n} data rows ($(wc -c < "$OUT_DUMP" | tr -d ' ') bytes)"
}
dump_samples=()
guarded_sample "$PG_TIMEOUT" "pg_dump warmup" dump_once || exit 1
for ((i = 1; i <= REPEATS; i++)); do
  t0="$(now)"
  guarded_sample "$PG_TIMEOUT" "pg_dump run $i" dump_once || exit 1
  t1="$(now)"
  dump_rows_ok || exit 1
  dump_samples+=("$(python3 -c "print(f'{$t1-$t0:.6f}')")")
done
read -r dump_median dump_stddev <<<"$(median_stddev "${dump_samples[*]/%/,}")"
results_drop_tool "$RESULTS_CSV" "pg_dump"
printf '%s,%s,%s,%s,%s,%s\n' "pg_dump" "$ROWS" "$REPEATS" "$dump_median" "$dump_stddev" \
  "$(python3 -c "print(int($ROWS/$dump_median))")" | tee -a "$RESULTS_CSV"

rm -f "$OUT_MQB" "$OUT_PSQL" "$OUT_DUMP"
echo "done -> $RESULTS_CSV"
