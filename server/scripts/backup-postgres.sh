#!/bin/bash
# PostgreSQL backup for the clube database.
#   daily  (default) — /opt/clube-geek-toys/backups/          retention 7 days
#   weekly           — /opt/clube-geek-toys/backups/weekly/   retention 12 weeks
# Usage: ./backup-postgres.sh [daily|weekly] [container] [db_user] [db_name]
#
# The dump is encrypted (AES-256, symmetric) before it touches the disk. It
# carries every member's CPF, address, e-mail and password hash, so a host
# compromise or a leaked disk snapshot would otherwise hand over the whole base.
# The passphrase lives in BACKUP_PASSPHRASE, in the VPS `.env` — which the
# deploy's rsync excludes, so it survives a deploy.
#
# Restoring needs that passphrase. Keep a copy somewhere that is NOT this
# server: without it these files are noise.

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

# Refuse rather than fall back to plaintext. A silent fallback is exactly how a
# backup nobody checked turns out to be readable by whoever took the disk. A
# failed run is visible in the log and yesterday's backups are still on disk.
if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "ERROR: BACKUP_PASSPHRASE not set — refusing to write an unencrypted dump." >&2
  echo "       Add it to /opt/clube-geek-toys/server/.env (kept out of the repo)." >&2
  exit 1
fi

if ! command -v gpg >/dev/null 2>&1; then
  echo "ERROR: gpg not installed — cannot encrypt the dump." >&2
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
  BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_weekly_${STAMP}.sql.gz.gpg"
else
  BACKUP_DIR="/opt/clube-geek-toys/backups"
  RETENTION_DAYS=7
  STAMP=$(date +%Y-%m-%d_%H%M)
  BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${STAMP}.sql.gz.gpg"
fi

umask 077
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "[$(date)] Starting ${KIND} backup of ${DB_NAME}..."

# `pipefail` is on, so a failing pg_dump or gpg fails the whole run instead of
# leaving a truncated file that looks fine.
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --clean --if-exists \
  | gzip -9 \
  | gpg --batch --quiet --yes --symmetric --cipher-algo AES256 \
        --passphrase-fd 3 --output "$BACKUP_FILE" 3<<<"$BACKUP_PASSPHRASE"
chmod 600 "$BACKUP_FILE"

if [[ ! -s "$BACKUP_FILE" ]]; then
  echo "[$(date)] ERROR: Backup file is empty!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Verify by reading it back the way a restore would. Checking the ciphertext
# alone would still pass on a backup nothing can open — the failure that only
# shows up on the day it is needed. This proves the passphrase now in `.env`
# decrypts this file and that what comes out is a whole gzip.
if ! gpg --batch --quiet --decrypt --passphrase-fd 3 "$BACKUP_FILE" 3<<<"$BACKUP_PASSPHRASE" 2>/dev/null | gzip -t; then
  echo "[$(date)] ERROR: Backup does not decrypt to a valid gzip!" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "[$(date)] Backup completed: ${BACKUP_FILE} (${SIZE})"

PATTERN="${DB_NAME}_*.sql.gz*"
if [[ "$KIND" == "weekly" ]]; then
  PATTERN="${DB_NAME}_weekly_*.sql.gz*"
fi

DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "$PATTERN" -mtime "+${RETENTION_DAYS}" -delete -print | wc -l)
if [[ "$DELETED" -gt 0 ]]; then
  echo "[$(date)] Cleaned up ${DELETED} old ${KIND} backup(s) (retention ${RETENTION_DAYS}d)"
fi

echo "[$(date)] Done. Current ${KIND} backups:"
ls -lh "$BACKUP_DIR"/$PATTERN 2>/dev/null | tail -8
