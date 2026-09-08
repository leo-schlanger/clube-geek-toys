#!/usr/bin/env bash
# Pushes the encrypted dumps to object storage, so a lost VPS is not a lost
# database.
#
# The dumps are already AES-256 before they leave the host, so the bucket never
# sees readable data and the storage provider is not part of the trust boundary.
#
# Configured through the VPS `.env` (which the deploy's rsync excludes):
#
#   BACKUP_OFFSITE_BUCKET      bucket name
#   BACKUP_OFFSITE_ENDPOINT    S3 endpoint (R2: https://<account>.r2.cloudflarestorage.com)
#   BACKUP_OFFSITE_ACCESS_KEY  access key id
#   BACKUP_OFFSITE_SECRET_KEY  secret access key
#   BACKUP_OFFSITE_PROVIDER    rclone S3 provider (default Cloudflare; use Other for B2)
#   BACKUP_OFFSITE_PREFIX      path inside the bucket (default clube-geek-toys)
#
# Unset means "not configured yet": it skips and says so, rather than failing.
# Refusing here would be the wrong trade — the local backup has already been
# written and verified, and killing the job over a missing bucket would throw
# away a good backup to protest a missing copy of it.
set -euo pipefail

BACKUP_DIR="${1:-/opt/clube-geek-toys/backups}"

if [[ -z "${BACKUP_OFFSITE_BUCKET:-}" ]]; then
  echo "[$(date)] offsite: not configured (BACKUP_OFFSITE_BUCKET unset) — skipping."
  exit 0
fi

for var in BACKUP_OFFSITE_ENDPOINT BACKUP_OFFSITE_ACCESS_KEY BACKUP_OFFSITE_SECRET_KEY; do
  if [[ -z "${!var:-}" ]]; then
    echo "[$(date)] offsite: ERROR — ${var} is missing while BACKUP_OFFSITE_BUCKET is set." >&2
    exit 1
  fi
done

if ! command -v rclone >/dev/null 2>&1; then
  echo "[$(date)] offsite: ERROR — rclone not installed (apt-get install -y rclone)." >&2
  exit 1
fi

PREFIX="${BACKUP_OFFSITE_PREFIX:-clube-geek-toys}"

# rclone takes its whole configuration from the environment, so nothing is
# written to disk and no credential lands in a config file.
export RCLONE_CONFIG_OFFSITE_TYPE=s3
export RCLONE_CONFIG_OFFSITE_PROVIDER="${BACKUP_OFFSITE_PROVIDER:-Cloudflare}"
export RCLONE_CONFIG_OFFSITE_ENDPOINT="$BACKUP_OFFSITE_ENDPOINT"
export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$BACKUP_OFFSITE_ACCESS_KEY"
export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$BACKUP_OFFSITE_SECRET_KEY"
export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true

REMOTE="offsite:${BACKUP_OFFSITE_BUCKET}/${PREFIX}"

echo "[$(date)] offsite: pushing ${BACKUP_DIR} → ${REMOTE}"
# Only the encrypted files, never a stray plaintext dump.
rclone copy "$BACKUP_DIR" "$REMOTE" \
  --include '*.sql.gz.gpg' \
  --transfers 4 \
  --retries 3 \
  --stats-one-line \
  --stats 0

# Read the newest one back out of the bucket and open it.
#
# `rclone copy` reporting success only says bytes were accepted. What has to be
# true is that the copy in the bucket still decrypts — that is the copy that
# gets used on the day the server is gone, and the only way to know is to fetch
# it and open it.
NEWEST=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.sql.gz.gpg' -printf '%T@ %f\n' \
  | sort -rn | head -1 | cut -d' ' -f2-)

if [[ -z "$NEWEST" ]]; then
  echo "[$(date)] offsite: nothing to verify (no encrypted backup found)." >&2
  exit 1
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "[$(date)] offsite: uploaded, but BACKUP_PASSPHRASE unset — could not verify readback." >&2
  exit 1
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

rclone copyto "${REMOTE}/${NEWEST}" "${TMP}/${NEWEST}" --retries 3
if gpg --batch --quiet --decrypt --passphrase-fd 3 "${TMP}/${NEWEST}" 3<<<"$BACKUP_PASSPHRASE" 2>/dev/null | gzip -t; then
  echo "[$(date)] offsite: OK — ${NEWEST} came back from the bucket and opens."
else
  echo "[$(date)] offsite: ERROR — ${NEWEST} in the bucket does NOT decrypt to a valid gzip!" >&2
  exit 1
fi

REMOTE_COUNT=$(rclone lsf "$REMOTE" --include '*.sql.gz.gpg' | wc -l)
echo "[$(date)] offsite: ${REMOTE_COUNT} encrypted backup(s) in the bucket."
