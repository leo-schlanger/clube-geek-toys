#!/usr/bin/env bash
# Resolves where the off-site copies go, shared by backup-offsite.sh and
# uploads-offsite.sh so both agree on the configuration and the failure modes.
#
# Sourced, not executed.

# Prints the base destination for rclone, or nothing when off-site is not
# configured. Exits non-zero only when the configuration is half-filled — that
# is a mistake worth stopping for, while "not set up yet" is not.
offsite_base_dest() {
  # Everything is configured through the environment; pointing rclone at an
  # empty config keeps it from warning about the file it will never use.
  export RCLONE_CONFIG=""

  # A plain path stands in for the bucket. It is how the whole pipeline gets
  # exercised before a bucket exists, and it is also the way to keep a second
  # copy on a mounted disk.
  if [[ -n "${BACKUP_OFFSITE_LOCAL_DIR:-}" ]]; then
    mkdir -p "$BACKUP_OFFSITE_LOCAL_DIR"
    printf '%s' "$BACKUP_OFFSITE_LOCAL_DIR"
    return 0
  fi

  if [[ -z "${BACKUP_OFFSITE_BUCKET:-}" ]]; then
    printf ''
    return 0
  fi

  local var
  for var in BACKUP_OFFSITE_ENDPOINT BACKUP_OFFSITE_ACCESS_KEY BACKUP_OFFSITE_SECRET_KEY; do
    if [[ -z "${!var:-}" ]]; then
      echo "offsite: ERROR — ${var} is missing while BACKUP_OFFSITE_BUCKET is set." >&2
      return 1
    fi
  done

  if ! command -v rclone >/dev/null 2>&1; then
    echo "offsite: ERROR — rclone not installed (apt-get install -y rclone)." >&2
    return 1
  fi

  # rclone reads its whole configuration from the environment, so no credential
  # is ever written to a config file on disk.
  export RCLONE_CONFIG_OFFSITE_TYPE=s3
  export RCLONE_CONFIG_OFFSITE_PROVIDER="${BACKUP_OFFSITE_PROVIDER:-Cloudflare}"
  export RCLONE_CONFIG_OFFSITE_ENDPOINT="$BACKUP_OFFSITE_ENDPOINT"
  export RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID="$BACKUP_OFFSITE_ACCESS_KEY"
  export RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY="$BACKUP_OFFSITE_SECRET_KEY"
  export RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET=true

  printf 'offsite:%s/%s' "$BACKUP_OFFSITE_BUCKET" "${BACKUP_OFFSITE_PREFIX:-clube-geek-toys}"
}
