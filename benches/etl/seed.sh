#!/usr/bin/env bash
# Seed / teardown for the ETL benchmark Postgres. Sourced by the runners and also
# usable directly:  ./seed.sh up | down | source <tbl> <bytes> <count> | dst <tbl> | cdc
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

COMPOSE="$HERE/docker-compose.postgres.yml"

pg_up() {
  docker compose -f "$COMPOSE" up -d --wait
  wait_for_pg
  echo "postgres ready at $PG_URL"
}

pg_down() { docker compose -f "$COMPOSE" down -v; }

# Populate a source table with `count` rows whose JSON payload is exactly `bytes`
# long: {"id":<n>,"pad":"xxx…"} rpad-ded to the target byte length.
seed_source() {
  local tbl="$1" bytes="$2" count="$3"
  psql_q <<SQL
CREATE TABLE IF NOT EXISTS ${tbl} (id bigserial PRIMARY KEY, payload text);
TRUNCATE ${tbl} RESTART IDENTITY;
INSERT INTO ${tbl} (payload)
SELECT rpad(format('{"id":%s,"pad":"', g), ${bytes} - 2, 'x') || '"}'
FROM generate_series(1, ${count}) AS g;
SQL
  local n len
  n="$(psql_q -c "SELECT count(*) FROM ${tbl};")"
  len="$(psql_q -c "SELECT length(payload) FROM ${tbl} LIMIT 1;")"
  echo "seeded ${tbl}: ${n} rows, payload length ${len} bytes"
}

# Fresh empty destination table for the sqlx sink.
reset_dst() {
  local tbl="$1"
  psql_q <<SQL
CREATE TABLE IF NOT EXISTS ${tbl} (id bigserial PRIMARY KEY, payload text);
TRUNCATE ${tbl} RESTART IDENTITY;
SQL
  echo "reset ${tbl} (empty)"
}

# CDC captured table + publication. Drops any leftover replication slot first so
# a permanent slot from a previous run can't shadow this one (a lingering/again-
# dropped slot makes streaming fail with "slot does not exist"). The endpoint then
# recreates the slot on startup (create_slot: true).
seed_cdc() {
  local tbl="${1:-cdc_src}" pub="${2:-mqb_pub}" slot="${3:-mqb_slot}"
  psql_q <<SQL
SELECT pg_drop_replication_slot(slot_name) FROM pg_replication_slots WHERE slot_name = '${slot}';
DROP PUBLICATION IF EXISTS ${pub};
DROP TABLE IF EXISTS ${tbl};
CREATE TABLE ${tbl} (id bigserial PRIMARY KEY, payload text, ins_ts double precision);
ALTER TABLE ${tbl} REPLICA IDENTITY FULL;
CREATE PUBLICATION ${pub} FOR TABLE ${tbl};
SQL
  echo "cdc ready: table ${tbl}, publication ${pub}"
}

case "${1:-}" in
  up)     pg_up ;;
  down)   pg_down ;;
  source) seed_source "$2" "$3" "$4" ;;
  dst)    reset_dst "$2" ;;
  cdc)    seed_cdc "${2:-cdc_src}" "${3:-mqb_pub}" "${4:-mqb_slot}" ;;
  "")     : ;;  # sourced, not invoked
  *)      echo "usage: $0 up|down|source <tbl> <bytes> <count>|dst <tbl>|cdc [tbl] [pub] [slot]" >&2; exit 2 ;;
esac
