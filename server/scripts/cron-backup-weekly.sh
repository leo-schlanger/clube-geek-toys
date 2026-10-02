#!/bin/bash
# Sunday dump with 12-week retention. Same credentials source as the daily job.
set -euo pipefail

# shellcheck source=job-status.sh
source /opt/clube-geek-toys/server/scripts/job-status.sh
trap 'job_fail backup_weekly "O backup semanal parou com erro (linha $LINENO). O dump desta rodada pode não existir — confira /var/log/clube-backup*.log."' ERR

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
BACKUP_PASSPHRASE=$(grep -E '^BACKUP_PASSPHRASE=' "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")
# Off-site copy. Unset simply skips — see backup-offsite.sh.
for v in BACKUP_OFFSITE_BUCKET BACKUP_OFFSITE_ENDPOINT BACKUP_OFFSITE_ACCESS_KEY \
         BACKUP_OFFSITE_SECRET_KEY BACKUP_OFFSITE_PROVIDER BACKUP_OFFSITE_PREFIX \
         BACKUP_OFFSITE_LOCAL_DIR; do
  export "$v"
  printf -v "$v" '%s' "$(grep -E "^${v}=" "$ENV_FILE" | cut -d= -f2- | tr -d "\"'")"
done

/opt/clube-geek-toys/server/scripts/backup-postgres.sh weekly
job_ok backup_weekly

# The dump is already written and verified at this point. A failing off-site
# push is loud but does not fail the job: throwing away a good backup because
# its copy did not leave the host would be the wrong trade.
if ! /opt/clube-geek-toys/server/scripts/backup-offsite.sh; then
  echo "[$(date)] WARNING: off-site copy of the dump failed — it is on this host only." >&2
  job_fail offsite_dump "A cópia externa (R2) do backup do banco falhou. O dump existe só nesta VPS."
else
  job_ok offsite_dump
fi

# The photos never regenerate: the dump only stores their paths. Same rule as
# above — loud, but it does not fail the job.
if ! /opt/clube-geek-toys/server/scripts/uploads-offsite.sh; then
  echo "[$(date)] WARNING: off-site copy of the uploads failed — photos are on this host only." >&2
  job_fail offsite_uploads "A cópia externa (R2) das fotos falhou. As fotos novas existem só nesta VPS."
else
  job_ok offsite_uploads
fi
