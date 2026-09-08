#!/usr/bin/env bash
# Restores the newest backup into a throwaway Postgres and checks what came out.
#
# A backup nobody has restored is faith, not a guarantee. `gzip -t` says the
# bytes survived; it says nothing about whether the dump still loads into the
# Postgres version we actually run, or whether it carries the tables and the
# rows the shop needs. This finds that out on a quiet Tuesday instead of on the
# day the database is gone.
#
# It never touches production: it starts its own container, on its own storage,
# and the only thing it reads from the live system is the backup file.
#
# Usage: ./backup-restore-test.sh [backup_file]   (default: the newest one)
set -euo pipefail

BACKUP_DIR="/opt/clube-geek-toys/backups"
PG_IMAGE="postgres:16-alpine"

# Deliberately not the production name, and unique per run, so this can never
# resolve to the live container even if something goes wrong.
TEST_CONTAINER="clube-restore-drill-$$-$(date +%s)"
TEST_USER="drill"
TEST_DB="drill"

# Tables whose absence would make a restore worthless. Losing any of these means
# the backup is not a backup of this shop.
REQUIRED_TABLES=(users members orders products payments subscriptions)

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name '*.sql.gz.gpg' -printf '%T@ %p\n' \
    | sort -rn | head -1 | cut -d' ' -f2-)
fi

if [[ -n "${1:-}" && ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: ${BACKUP_FILE}: no such file." >&2
  exit 1
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "ERROR: no backup found to test (looked in ${BACKUP_DIR})." >&2
  exit 1
fi

if [[ -z "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "ERROR: BACKUP_PASSPHRASE not set — cannot open ${BACKUP_FILE}." >&2
  exit 1
fi

cleanup() {
  docker rm -f "$TEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[$(date)] Restore drill on: ${BACKUP_FILE}"
echo "[$(date)] Starting throwaway ${PG_IMAGE} as ${TEST_CONTAINER}..."

# tmpfs for the data directory: nothing from this drill reaches the disk, and
# the container cannot outlive the run.
docker run -d --rm \
  --name "$TEST_CONTAINER" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_USER="$TEST_USER" \
  -e POSTGRES_PASSWORD="drill-$(head -c 16 /dev/urandom | base64 | tr -d '\n/+=')" \
  -e POSTGRES_DB="$TEST_DB" \
  "$PG_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$TEST_CONTAINER" pg_isready -U "$TEST_USER" -d "$TEST_DB" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$TEST_CONTAINER" pg_isready -U "$TEST_USER" -d "$TEST_DB" >/dev/null 2>&1; then
  echo "[$(date)] FAILED: throwaway Postgres never became ready." >&2
  exit 1
fi

echo "[$(date)] Restoring..."
# The dump is `--clean --if-exists` against an empty database, so DROPs for
# objects that do not exist are expected noise, not failure. What must not
# happen is the restore aborting: `--single-transaction` with ON_ERROR_STOP
# makes it all-or-nothing.
if ! gpg --batch --quiet --decrypt --passphrase-fd 3 "$BACKUP_FILE" 3<<<"$BACKUP_PASSPHRASE" 2>/dev/null \
  | gunzip -c \
  | docker exec -i "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" \
      --single-transaction --set ON_ERROR_STOP=on -q >/dev/null; then
  echo "[$(date)] FAILED: the dump did not restore cleanly into ${PG_IMAGE}." >&2
  exit 1
fi

q() { docker exec "$TEST_CONTAINER" psql -U "$TEST_USER" -d "$TEST_DB" -tAc "$1"; }

TABLES=$(q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
echo "[$(date)] Restored ${TABLES} table(s)."

FAILED=0
for t in "${REQUIRED_TABLES[@]}"; do
  if [[ "$(q "SELECT to_regclass('public.${t}') IS NOT NULL")" != "t" ]]; then
    echo "[$(date)] FAILED: table '${t}' is missing from the restore." >&2
    FAILED=1
    continue
  fi
  echo "    ${t}: $(q "SELECT count(*) FROM ${t}") row(s)"
done

# An empty shop restores "successfully" and is still a disaster, so the drill
# insists the data came back too, not just the schema.
for t in users products; do
  if [[ "$(q "SELECT count(*) FROM ${t}")" -eq 0 ]]; then
    echo "[$(date)] FAILED: '${t}' restored with zero rows." >&2
    FAILED=1
  fi
done

if [[ "$FAILED" -ne 0 ]]; then
  echo "[$(date)] RESTORE DRILL FAILED — the backups are not usable as they stand." >&2
  exit 1
fi

echo "[$(date)] RESTORE DRILL PASSED — ${BACKUP_FILE} restores into ${PG_IMAGE} with its data."
