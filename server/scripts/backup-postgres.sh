#!/bin/bash
# PostgreSQL Backup Script
# Runs daily via cron. Retains last 7 days of backups.
# Usage: ./backup-postgres.sh [container_name] [db_user] [db_name]

set -euo pipefail

CONTAINER="${1:-clube-geek-postgres}"
DB_USER="${2:-$POSTGRES_USER}"
DB_NAME="${3:-$POSTGRES_DB}"
BACKUP_DIR="/opt/clube-geek-toys/backups"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting backup of ${DB_NAME}..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists | gzip > "$BACKUP_FILE"

if [ -s "$BACKUP_FILE" ]; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[$(date)] Backup completed: ${BACKUP_FILE} (${SIZE})"
else
  echo "[$(date)] ERROR: Backup file is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Remove backups older than retention period
DELETED=$(find "$BACKUP_DIR" -name "${DB_NAME}_*.sql.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[$(date)] Cleaned up ${DELETED} old backup(s)"
fi

echo "[$(date)] Done. Current backups:"
ls -lh "$BACKUP_DIR"/${DB_NAME}_*.sql.gz 2>/dev/null | tail -7
