#!/bin/bash
# PostgreSQL backup for the clube database.
#   daily  (default) — /opt/clube-geek-toys/backups/          retention 7 days
#   weekly           — /opt/clube-geek-toys/backups/weekly/   retention 12 weeks
# Usage: ./backup-postgres.sh [daily|weekly] [container] [db_user] [db_name]

set -euo pipefail

KIND="${1:-daily}"
CONTAINER="${2:-clube-geek-postgres}"
DB_USER="${3:-${POSTGRES_USER:-}}"
DB_NAME="${4:-${POSTGRES_DB:-}}"

if [[ "$KIND" != "daily" && "$KIND" != "weekly" ]]; then
  echo "Usage: $0 [daily|weekly] [container] [db_user] [db_name]" >&2
  exit 2
fi

if [[ -z "$DB_USER" || -z "$DB_NAME" ]]; then
  echo "ERROR: POSTGRES_USER / POSTGRES_DB not set. Use cron-backup.sh or export them." >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container '$CONTAINER' not found." >&2
  exit 1
fi

if [[ "$KIND" == "weekly" ]]; then
  BACKUP_DIR="/opt/clube-geek-toys/backups/weekly"
  RETENTION_DAYS=84
  STAMP=$(date +%Y-%m-%d)
  BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_weekly_${STAMP}.sql.gz"
else
  BACKUP_DIR="/opt/clube-geek-toys/backups"
  RETENTION_DAYS=7
  STAMP=$(date +%Y-%m-%d_%H%M)
  BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz"
fi

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date)] Starting ${KIND} backup of ${DB_NAME}..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip -9 > "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "[$(date)] ERROR: Backup file is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

if ! gzip -t "$BACKUP_FILE"; then
  echo "[$(date)] ERROR: Backup is not a valid gzip!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup completed: ${BACKUP_FILE} (${SIZE})"

PATTERN="${DB_NAME}_*.sql.gz"
if [[ "$KIND" == "weekly" ]]; then
  PATTERN="${DB_NAME}_weekly_*.sql.gz"
fi

DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "$PATTERN" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
if [[ "$DELETED" -gt 0 ]]; then
  echo "[$(date)] Cleaned up ${DELETED} old ${KIND} backup(s) (retention ${RETENTION_DAYS}d)"
fi

echo "[$(date)] Done. Current ${KIND} backups:"
ls -lh "$BACKUP_DIR"/$PATTERN 2>/dev/null | tail -8
