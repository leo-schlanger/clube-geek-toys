#!/usr/bin/env bash
# Pulls the encrypted Postgres backups off the VPS and verifies each one opens
# here, without the server.
#
# A copy that has never been read is not a backup — the day it is needed is a
# bad day to discover the passphrase does not match or a transfer truncated a
# file. So every file is decrypted and gzip-tested after the transfer.
#
# Usage: ./scripts/backup-pull.sh [destination]
set -euo pipefail

DEST="${1:-/mnt/c/Users/leosc/Desktop/geekpop-backups/postgres}"
REMOTE="${VPS_HOST:-geekpop-vps}"

mkdir -p "$DEST"
echo "[$(date)] Pulling from ${REMOTE}..."
rsync -az --info=stats1 -e ssh "${REMOTE}:/opt/clube-geek-toys/backups/" "$DEST/"

# The passphrase is read from the server so the everyday case needs no setup.
# Set BACKUP_PASSPHRASE yourself to verify a copy when the server is gone —
# which is the case this whole folder exists for.
PASS="${BACKUP_PASSPHRASE:-}"
if [[ -z "$PASS" ]]; then
  PASS=$(ssh "$REMOTE" 'grep -E "^BACKUP_PASSPHRASE=" /opt/clube-geek-toys/server/.env | cut -d= -f2-') || true
fi

if [[ -z "$PASS" ]]; then
  echo "WARNING: no passphrase — files copied but NOT verified." >&2
  exit 0
fi

ok=0
bad=0
while IFS= read -r f; do
  if gpg --batch --quiet --decrypt --passphrase-fd 3 "$f" 3<<<"$PASS" 2>/dev/null | gzip -t 2>/dev/null; then
    ok=$((ok + 1))
  else
    bad=$((bad + 1))
    echo "UNREADABLE: $f" >&2
  fi
done < <(find "$DEST" -name '*.sql.gz.gpg' -type f)

echo "[$(date)] ${ok} readable, ${bad} unreadable, in ${DEST}"
[[ "$bad" -eq 0 ]]
