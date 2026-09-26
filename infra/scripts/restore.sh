#!/usr/bin/env bash
# Restores a backup made by backup.sh (run from the repository root). DESTRUCTIVE: it
# replaces the current database contents (and media, if given) with the backup.
#
#   infra/scripts/restore.sh --confirm-overwrite db-<time>.dump [media-<time>.tar.gz]
#
# The storefront and API are stopped during the restore and started again afterwards;
# the Redis cache is emptied so no page shows pre-restore data. Practise it on a staging
# server first (docs/DEPLOYMENT.md, "Restore drill").
set -euo pipefail

COMPOSE=${COMPOSE:-"docker compose -f infra/docker-compose.yml --env-file .env.production"}

if [ "${1:-}" != "--confirm-overwrite" ] || [ -z "${2:-}" ]; then
  echo "usage: $0 --confirm-overwrite <db-backup.dump> [<media-backup.tar.gz>]" >&2
  echo "This REPLACES the current database (and media) with the backup." >&2
  exit 2
fi
db=$2
media=${3:-}
[ -f "$db" ] || { echo "restore: $db not found" >&2; exit 2; }
[ -z "$media" ] || [ -f "$media" ] || { echo "restore: $media not found" >&2; exit 2; }

echo "restore: stopping the storefront and API"
$COMPOSE stop web api

echo "restore: database ← $db"
$COMPOSE exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' <"$db"

if [ -n "$media" ]; then
  echo "restore: media ← $media"
  $COMPOSE run --rm --no-deps -T --entrypoint sh api -c \
    'find /app/uploads -mindepth 1 -delete && tar -C /app/uploads -xzf -' <"$media"
fi

echo "restore: emptying the cache"
$COMPOSE exec -T redis redis-cli FLUSHDB >/dev/null

echo "restore: starting the API and storefront"
$COMPOSE up -d api web
echo "restore: done - run infra/scripts/smoke.sh against the site"
