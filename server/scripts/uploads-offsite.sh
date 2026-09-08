#!/usr/bin/env bash
# Off-site copy of the uploads volume: product photos, gallery, event banners,
# profile pictures and member contracts.
#
# The database dump only stores the *path* of these files. Restoring Postgres
# without them gives back a catalogue where every product has a broken image —
# and unlike the dump, none of this regenerates: the photos were taken one by
# one, and the contracts are signed documents.
#
# Two things it does differently from the database copy:
#
#   - **rclone crypt, not gpg.** Filenames are encrypted too (a contract named
#     after a member id would leak on its own), and only changed files move —
#     re-uploading the whole volume nightly would not scale as the catalogue
#     grows. Same passphrase as the dumps.
#   - **Deletions are kept.** `--backup-dir` parks anything overwritten or
#     removed under `deleted/<date>/`, so deleting a photo by accident in the
#     admin panel is recoverable for a while, not immediately final.
#
# Configuration: the same BACKUP_OFFSITE_* and BACKUP_PASSPHRASE as
# `backup-offsite.sh`. See DEPLOY.md §10.
set -euo pipefail

VOLUME="${UPLOADS_VOLUME:-server_uploads}"
# How long a deleted or replaced file stays recoverable.
DELETED_RETENTION_DAYS="${UPLOADS_DELETED_RETENTION_DAYS:-30}"

# shellcheck source=/dev/null
. "$(dirname "$0")/offsite-remote.sh"

DEST=$(offsite_base_dest) || exit $?
if [[ -z "$DEST" ]]; then
  echo "[$(date)] uploads: off-site not configured — skipping."
  exit 0
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "[$(date)] uploads: ERROR — BACKUP_PASSPHRASE unset, refusing to send files in the clear." >&2
  exit 1
fi

SRC=$(docker volume inspect "$VOLUME" --format '{{.Mountpoint}}' 2>/dev/null || true)
if [[ -z "$SRC" || ! -d "$SRC" ]]; then
  echo "[$(date)] uploads: ERROR — cannot resolve docker volume '${VOLUME}'." >&2
  exit 1
fi

# One crypt layer over the whole destination, with the live copy and the
# recoverable deletions as paths inside it. They have to share a remote:
# `--backup-dir` refuses to point at a different one. Rooting the crypt above
# both also means even the directory names are encrypted.
export RCLONE_CONFIG_UPCRYPT_TYPE=crypt
export RCLONE_CONFIG_UPCRYPT_REMOTE="$DEST"
RCLONE_CONFIG_UPCRYPT_PASSWORD=$(rclone obscure "$BACKUP_PASSPHRASE")
export RCLONE_CONFIG_UPCRYPT_PASSWORD

LIVE="upcrypt:uploads"
DELETED="upcrypt:uploads-deleted"

SIZE=$(du -sh "$SRC" | cut -f1)
COUNT=$(find "$SRC" -type f | wc -l)
echo "[$(date)] uploads: syncing ${COUNT} file(s), ${SIZE}, from ${VOLUME}"

rclone sync "$SRC" "$LIVE" \
  --backup-dir "${DELETED}/$(date +%Y-%m-%d)" \
  --transfers 8 \
  --retries 3 \
  --stats-one-line \
  --stats 0

# `rclone sync` reporting success says the transfers were accepted. What has to
# be true is that what landed there decrypts back to the bytes we have here —
# `cryptcheck` is the only check that reads through the crypt layer and compares
# against the plaintext source.
echo "[$(date)] uploads: verifying through the crypt layer..."
if rclone cryptcheck "$SRC" "$LIVE" --one-way; then
  echo "[$(date)] uploads: OK — ${COUNT} file(s) verified against the copy."
else
  echo "[$(date)] uploads: ERROR — the off-site copy does not match the source!" >&2
  exit 1
fi

# Prune the recoverable-deletions area so it cannot grow without bound.
rclone delete "$DELETED" --min-age "${DELETED_RETENTION_DAYS}d" --rmdirs 2>/dev/null || true
