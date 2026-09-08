#!/bin/bash
# Monthly restore drill. Same credentials source as the backup jobs.
set -euo pipefail

ENV_FILE="/opt/clube-geek-toys/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

export BACKUP_PASSPHRASE
BACKUP_PASSPHRASE=$(grep -E '^BACKUP_PASSPHRASE=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")

exec /opt/clube-geek-toys/server/scripts/backup-restore-test.sh
