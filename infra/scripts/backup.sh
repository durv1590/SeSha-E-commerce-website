#!/usr/bin/env bash
# Backs up the production database and uploaded media (run from the repository root).
#
#   infra/scripts/backup.sh [backup-dir]         default: /var/backups/seshakart
#
# Writes db-<UTC time>.dump (pg_dump custom format: compressed, restorable table by table)
# and media-<UTC time>.tar.gz, checks the dump can be read back, and deletes this script's
# own backups older than KEEP_DAYS (default 14). Copy the folder off the server too: set
# BACKUP_UPLOAD_CMD, e.g. 'rclone copy "$BACKUP_DIR" remote:seshakart-backups'.
# Schedule it (cron, as the deploy user):  15 2 * * * cd /srv/seshakart && infra/scripts/backup.sh
set -euo pipefail

COMPOSE=${COMPOSE:-"docker compose -f infra/docker-compose.yml --env-file .env.production"}
BACKUP_DIR=${1:-${BACKUP_DIR:-/var/backups/seshakart}}
KEEP_DAYS=${KEEP_DAYS:-14}
stamp=$(date -u +%Y%m%dT%H%M%SZ)
export BACKUP_DIR

umask 077 # backups contain personal data: readable by the owner only
mkdir -p "$BACKUP_DIR"

db="$BACKUP_DIR/db-$stamp.dump"
media="$BACKUP_DIR/media-$stamp.tar.gz"

echo "backup: database → $db"
$COMPOSE exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' >"$db.partial"
mv "$db.partial" "$db"

echo "backup: checking the dump can be read"
tables=$($COMPOSE exec -T postgres pg_restore --list <"$db" | grep -c ' TABLE DATA ' || true)
if [ "$tables" -lt 10 ]; then
  echo "backup: FAILED - the dump lists only $tables tables" >&2
  exit 1
fi
echo "backup: dump OK ($tables tables)"

echo "backup: media → $media"
$COMPOSE exec -T api tar -C /app/uploads -czf - . >"$media.partial"
mv "$media.partial" "$media"

find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) \
  -mtime +"$KEEP_DAYS" -print -delete

if [ -n "${BACKUP_UPLOAD_CMD:-}" ]; then
  echo "backup: copying off the server"
  sh -c "$BACKUP_UPLOAD_CMD"
else
  echo "backup: WARNING - BACKUP_UPLOAD_CMD is not set; backups exist only on this server" >&2
fi
echo "backup: done"
