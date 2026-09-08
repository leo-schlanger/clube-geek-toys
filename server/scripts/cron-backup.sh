#!/bin/bash
# Load DB name/user from the VPS .env (never commit that file) and run a daily dump.
set -euo pipefail

ENV_FILE="/opt/clube-geek-toys/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

export POSTGRES_USER
export POSTGRES_DB
export BACKUP_PASSPHRASE
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
# Encrypts the dump. Missing means the backup refuses to run rather than
# writing every member's data in the clear.
BACKUP_PASSPHRASE=$(grep -E '^BACKUP_PASSPHRASE=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")

exec /opt/clube-geek-toys/server/scripts/backup-postgres.sh daily
