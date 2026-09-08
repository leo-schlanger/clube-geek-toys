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
# Off-site copy. Unset simply skips — see backup-offsite.sh.
for v in BACKUP_OFFSITE_BUCKET BACKUP_OFFSITE_ENDPOINT BACKUP_OFFSITE_ACCESS_KEY \
         BACKUP_OFFSITE_SECRET_KEY BACKUP_OFFSITE_PROVIDER BACKUP_OFFSITE_PREFIX; do
  export "$v"
  printf -v "$v" '%s' "$(grep -E "^${v}=" "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")"
done

/opt/clube-geek-toys/server/scripts/backup-postgres.sh daily

# The dump is already written and verified at this point. A failing off-site
# push is loud but does not fail the job: throwing away a good backup because
# its copy did not leave the host would be the wrong trade.
if ! /opt/clube-geek-toys/server/scripts/backup-offsite.sh; then
  echo "[$(date)] WARNING: off-site copy failed — the backup is on this host only." >&2
fi
