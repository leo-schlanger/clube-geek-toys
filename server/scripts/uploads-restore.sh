#!/usr/bin/env bash
# Brings the uploads back from the off-site copy.
#
# The counterpart to `uploads-offsite.sh`, and the reason it exists: on a new
# VPS, restoring Postgres gives back a catalogue whose every image URL points at
# a file that is not there. This puts the files back.
#
# Usage:
#   ./uploads-restore.sh                      restore everything into the volume
#   ./uploads-restore.sh /tmp/somewhere       restore into a directory instead
#   ./uploads-restore.sh --deleted 2026-09-08 /tmp/out
#                                             recover what was deleted that day
#
# Needs BACKUP_PASSPHRASE and the same BACKUP_OFFSITE_* settings.
set -euo pipefail

VOLUME="${UPLOADS_VOLUME:-server_uploads}"

FROM_DELETED=""
if [[ "${1:-}" == "--deleted" ]]; then
  FROM_DELETED="${2:?Usage: $0 --deleted <YYYY-MM-DD> [target]}"
  shift 2
fi

# shellcheck source=/dev/null
. "$(dirname "$0")/offsite-remote.sh"

OFFSITE_DEST=""
if ! offsite_setup; then
  echo "ERROR: off-site is not configured — nothing to restore from." >&2
  exit 1
fi
DEST="$OFFSITE_DEST"

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "ERROR: BACKUP_PASSPHRASE not set — the copy is encrypted." >&2
  exit 1
fi

export RCLONE_CONFIG_UPCRYPT_TYPE=crypt
export RCLONE_CONFIG_UPCRYPT_REMOTE="$DEST"
RCLONE_CONFIG_UPCRYPT_PASSWORD=$(rclone obscure "$BACKUP_PASSPHRASE")
export RCLONE_CONFIG_UPCRYPT_PASSWORD

SOURCE="upcrypt:uploads"
[[ -n "$FROM_DELETED" ]] && SOURCE="upcrypt:uploads-deleted/${FROM_DELETED}"

TARGET="${1:-}"
if [[ -z "$TARGET" ]]; then
  TARGET=$(docker volume inspect "$VOLUME" --format '{{.Mountpoint}}' 2>/dev/null || true)
  if [[ -z "$TARGET" ]]; then
    echo "ERROR: cannot resolve docker volume '${VOLUME}'. Pass a target directory." >&2
    exit 1
  fi
fi

echo "[$(date)] Restoring ${SOURCE} → ${TARGET}"
mkdir -p "$TARGET"

# `copy`, never `sync`: sync would delete anything already in the target that is
# not in the copy. Restoring is not the moment to remove files.
rclone copy "$SOURCE" "$TARGET" --transfers 8 --retries 3 --stats-one-line --stats 0

echo "[$(date)] Restored $(find "$TARGET" -type f | wc -l) file(s), $(du -sh "$TARGET" | cut -f1)."
echo "[$(date)] Check ownership if the API cannot read them: chown -R the volume as needed."
