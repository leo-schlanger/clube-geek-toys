#!/bin/bash
# PostgreSQL Restore Script
# Usage: ./restore-postgres.sh <backup_file.sql.gz[.gpg]> [container_name] [db_user] [db_name]
#
# Backups are encrypted since 08/09/2026. A `.gpg` file needs BACKUP_PASSPHRASE
# — the same one in the VPS `.env`, and the reason a copy of it has to live
# somewhere other than this server. Plain `.sql.gz` from before that date still
# restores, so an old backup is not stranded.

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

if [[ "$BACKUP_FILE" == *.gpg ]]; then
  if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
    echo "ERROR: ${BACKUP_FILE} is encrypted and BACKUP_PASSPHRASE is not set." >&2
    echo "       export BACKUP_PASSPHRASE=... (see the VPS .env, or your off-site copy)" >&2
    exit 1
  fi
  gpg --batch --quiet --decrypt --passphrase-fd 3 "$BACKUP_FILE" 3<<<"$BACKUP_PASSPHRASE" \
    | gunzip -c \
    | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" --single-transaction
else
  gunzip -c "$BACKUP_FILE" | docker exec -i "$CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" --single-transaction
fi

echo "[$(date)] Restore completed successfully."
