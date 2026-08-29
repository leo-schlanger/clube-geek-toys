#!/bin/bash
# PostgreSQL Restore Script
# Usage: ./restore-postgres.sh <backup_file.sql.gz> [container_name] [db_user] [db_name]

set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <backup_file.sql.gz> [container] [user] [db]}"
CONTAINER="${2:-clube-geek-postgres}"
DB_USER="${3:-$POSTGRES_USER}"
DB_NAME="${4:-$POSTGRES_DB}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: File not found: $BACKUP_FILE" >&2
  exit 1
fi

echo "WARNING: This will overwrite database '${DB_NAME}' in container '${CONTAINER}'."
echo "Backup file: ${BACKUP_FILE}"
read -p "Continue? (y/N) " -n 1 -r
echo

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

echo "[$(date)] Restoring ${BACKUP_FILE} to ${DB_NAME}..."

gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" --single-transaction

echo "[$(date)] Restore completed successfully."
