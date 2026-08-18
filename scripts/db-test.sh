#!/usr/bin/env bash
# =====================================================================
# Rejoue tout le schéma sur une base Postgres neuve, puis lance les tests
# SQL (calcul + RLS). Aucun Docker requis.
#
#   PGHOST / PGPORT / PGUSER  pointent par défaut sur un cluster local.
#   Usage : ./scripts/db-test.sh
# =====================================================================
set -euo pipefail

PGHOST="${PGHOST:-/var/run/postgresql}"
PGPORT="${PGPORT:-55432}"
PGUSER="${PGUSER:-postgres}"
DB="${MEP_TEST_DB:-mep_test}"
export PGHOST PGPORT PGUSER

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run() { psql -d "$1" -v ON_ERROR_STOP=1 -q -f "$2"; }

echo "→ Recréation de la base $DB"
psql -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"

echo "→ Shim Supabase (auth.uid, rôles)"
run "$DB" "$ROOT/supabase/tests/00_supabase_shim.sql"

echo "→ Migrations"
for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "   $(basename "$migration")"
  run "$DB" "$migration"
done

echo "→ Seed"
run "$DB" "$ROOT/supabase/seed.sql"

echo "→ Tests"
status=0
for test_file in "$ROOT"/supabase/tests/*.test.sql; do
  echo ""
  echo "   ── $(basename "$test_file")"
  if ! psql -d "$DB" -v ON_ERROR_STOP=1 -f "$test_file" 2>&1 \
      | grep -E '^(NOTICE|psql|ERROR|=====)' \
      | sed -e 's/^NOTICE:  /     /' -e 's/^/  /'; then
    status=1
  fi
  # Le code de sortie de psql est masqué par le pipe : on le récupère ici.
  if [ "${PIPESTATUS[0]:-0}" -ne 0 ]; then status=1; fi
done

echo ""
if [ "$status" -eq 0 ]; then
  echo "✅ Tous les tests SQL sont passés."
else
  echo "❌ Au moins un test SQL a échoué."
fi
exit "$status"
