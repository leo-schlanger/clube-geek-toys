#!/bin/bash
# Sunday dump with 12-week retention. Same credentials source as the daily job.
set -euo pipefail

ENV_FILE="/opt/clube-geek-toys/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

export POSTGRES_USER
export POSTGRES_DB
POSTGRES_USER=$(grep -E '^POSTGRES_USER=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
POSTGRES_DB=$(grep -E '^POSTGRES_DB=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")

exec /opt/clube-geek-toys/server/scripts/backup-postgres.sh weekly
