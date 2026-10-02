#!/bin/bash
# Monthly restore drill. Same credentials source as the backup jobs.
set -euo pipefail

# shellcheck source=job-status.sh
source /opt/clube-geek-toys/server/scripts/job-status.sh

ENV_FILE="/opt/clube-geek-toys/server/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: missing $ENV_FILE" >&2
  exit 1
fi

export BACKUP_PASSPHRASE
BACKUP_PASSPHRASE=$(grep -E '^BACKUP_PASSPHRASE=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")

if /opt/clube-geek-toys/server/scripts/backup-restore-test.sh; then
  job_ok restore_drill
else
  job_fail restore_drill "O teste mensal de restauração FALHOU: o backup mais recente não restaurou ou veio sem dados. Os backups podem estar inúteis — confira /var/log/clube-restore-test.log."
  exit 1
fi
