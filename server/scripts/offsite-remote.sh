#!/usr/bin/env bash
# Resolves where the off-site copies go, shared by backup-offsite.sh and
# uploads-offsite.sh so both agree on the configuration and the failure modes.
#
# Sourced, not executed.

# Sets OFFSITE_DEST to the base destination for rclone and exports rclone's
# configuration into the *current* shell.
#
# Deliberately not a function that prints the destination: `DEST=$(...)` runs it
# in a subshell, and every `export` here would die with that subshell — the
# credentials would silently never reach rclone. That is exactly how this broke
# the first time it ran against a real bucket, and the local stand-in
# destination could not catch it, because a plain path needs no credentials.
#
# Returns 0 configured, 1 half-configured (a mistake worth stopping for),
# 2 not configured at all (not a mistake).
offsite_setup() {
  # cron runs with PATH=/usr/bin:/bin, which finds the distribution's rclone.
  # Ubuntu ships v1.60 (2022), and against R2 that build fails every upload
  # once: R2 returns a version id on PUT, rclone re-reads the object with
  # `?versionId=`, and R2 answers 501 because it does not implement addressing
  # by version. The retry then succeeds, so it looks like noise while actually
  # doubling the work and skipping the deletion pass. Current rclone knows not
  # to do that, so prefer the one in /usr/local/bin.
  export PATH=/usr/local/bin:$PATH

  # Everything is configured through the environment; pointing rclone at an
  # empty config keeps it from warning about the file it will never use.
  export RCLONE_CONFIG=/dev/null

  # A plain path stands in for the bucket. It is how the whole pipeline gets
  # exercised before a bucket exists, and it is also the way to keep a second
  # copy on a mounted disk.
  if [[ -n "${BACKUP_OFFSITE_LOCAL_DIR:-}" ]]; then
    mkdir -p "$BACKUP_OFFSITE_LOCAL_DIR"
    OFFSITE_DEST="$BACKUP_OFFSITE_LOCAL_DIR"
    return 0
  fi

  if [[ -z "${BACKUP_OFFSITE_BUCKET:-}" ]]; then
    OFFSITE_DEST=""
    return 2
  fi

  local var
  for var in BACKUP_OFFSITE_ENDPOINT BACKUP_OFFSITE_ACCESS_KEY BACKUP_OFFSITE_SECRET_KEY; do
    if [[ -z "${!var:-}" ]]; then
      echo "offsite: ERROR — ${var} is missing while BACKUP_OFFSITE_BUCKET is set." >&2
      return 1
    fi
  done

  if ! command -v rclone >/dev/null 2>&1; then
    echo "offsite: ERROR — rclone not installed. See DEPLOY.md §10 for the" >&2
    echo "        signature-verified install; the distro package is too old for R2." >&2
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

  OFFSITE_DEST="offsite:${BACKUP_OFFSITE_BUCKET}/${BACKUP_OFFSITE_PREFIX:-clube-geek-toys}"
}

# Standard preamble for a caller: resolves the destination or leaves the script.
# `$1` is what to say when off-site simply is not set up yet.
offsite_require() {
  OFFSITE_DEST=""
  local rc=0
  offsite_setup || rc=$?
  case "$rc" in
    0) return 0 ;;
    2) echo "[$(date)] ${1:-offsite: not configured} — skipping."; exit 0 ;;
    *) exit 1 ;;
  esac
}
