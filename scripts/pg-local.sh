#!/usr/bin/env bash
# =====================================================================
# Démarre un Postgres local jetable pour `pnpm db:test`.
#
# Utile en environnement de développement sans Docker (Claude Code sur le
# web, machine de CI minimale). Ne sert JAMAIS en production.
#
#   ./scripts/pg-local.sh start | stop | status
# =====================================================================
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PGDATA="${PGDATA:-/var/lib/postgresql/mep-test}"
PGPORT="${PGPORT:-55432}"
SOCKET_DIR="${SOCKET_DIR:-/var/run/postgresql}"
LOG="${PG_LOG:-/var/lib/postgresql/pg.log}"

as_postgres() { su postgres -c "$1"; }

case "${1:-start}" in
  start)
    mkdir -p "$SOCKET_DIR"; chown postgres "$SOCKET_DIR"
    if [ ! -s "$PGDATA/PG_VERSION" ]; then
      echo "→ Initialisation du cluster dans $PGDATA"
      rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown postgres "$PGDATA"; chmod 700 "$PGDATA"
      as_postgres "$PGBIN/initdb -D $PGDATA -A trust -U postgres --locale=C --encoding=UTF8" >/dev/null
    fi

    if as_postgres "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
      echo "✓ Postgres tourne déjà sur le port $PGPORT"
      exit 0
    fi

    as_postgres "$PGBIN/pg_ctl -D $PGDATA -o '-k $SOCKET_DIR -p $PGPORT -c listen_addresses=' -l $LOG start"
    echo "✓ Postgres démarré sur $SOCKET_DIR:$PGPORT"
    ;;

  stop)
    as_postgres "$PGBIN/pg_ctl -D $PGDATA -m fast stop" || true
    ;;

  status)
    as_postgres "$PGBIN/pg_ctl -D $PGDATA status" || true
    ;;

  *)
    echo "Usage: $0 [start|stop|status]" >&2
    exit 1
    ;;
esac
