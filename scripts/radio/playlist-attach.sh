#!/usr/bin/env bash
# Associa TODOS os media files de uma subpasta a uma playlist.
#
# Uso:
#   ./playlist-attach.sh <subpasta> <playlist_id>
#
# Exemplo:
#   ./playlist-attach.sh kpop 2
#
# Se o playlist_id não for passado, lista as playlists existentes e sai.
set -euo pipefail

VPS="${VPS_HOST:?Defina VPS_HOST=user@host antes de rodar}"
STATION_ID=1
STATION_SHORT="geek_e_toys"

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <subpasta> [playlist_id]" >&2
  echo "Sem playlist_id → lista playlists disponíveis." >&2
  exit 1
fi

SUB="$1"
PLAYLIST_ID="${2:-}"

if [[ -z "$PLAYLIST_ID" ]]; then
  echo "Playlists da estação $STATION_ID:"
  ssh "$VPS" "docker exec azuracast azuracast_cli dbal:run-sql \"SELECT id, name, type FROM station_playlists WHERE station_id = $STATION_ID ORDER BY id\""
  exit 0
fi

echo "==> Associando todos os media de '$SUB' à playlist $PLAYLIST_ID..."

ssh "$VPS" bash -s -- "$STATION_ID" "$STATION_SHORT" "$SUB" "$PLAYLIST_ID" <<'EOF'
set -euo pipefail
STATION_ID="$1"; SHORT="$2"; SUB="$3"; PID="$4"

# Descobrir storage_location_id dessa estação (station_media liga por storage_location_id, não station_id)
SL_ID=$(docker exec azuracast azuracast_cli dbal:run-sql \
  "SELECT media_storage_location_id FROM station WHERE id = $STATION_ID" \
  | awk '/^[[:space:]]*[0-9]+[[:space:]]*$/ {print $1; exit}')

# Query: insere media_id→playlist_id evitando duplicatas via NOT EXISTS
SQL="INSERT INTO station_playlist_media (playlist_id, media_id, weight, last_played, is_queued)
     SELECT $PID, sm.id, 0, 0, 0
     FROM station_media sm
     WHERE sm.storage_location_id = $SL_ID
       AND sm.path LIKE '$SUB/%'
       AND NOT EXISTS (
         SELECT 1 FROM station_playlist_media spm
         WHERE spm.playlist_id = $PID AND spm.media_id = sm.id
       );"

docker exec azuracast azuracast_cli dbal:run-sql "$SQL"

# Limpar queue para mudanças entrarem em efeito
docker exec azuracast azuracast_cli dbal:run-sql \
  "DELETE FROM station_queue WHERE station_id = $STATION_ID"
docker exec azuracast azuracast_cli dbal:run-sql \
  "UPDATE station_playlist_media SET is_queued = 0 WHERE playlist_id = $PID"

# Contar
COUNT=$(docker exec azuracast azuracast_cli dbal:run-sql \
  "SELECT COUNT(*) AS n FROM station_playlist_media WHERE playlist_id = $PID" \
  | awk '/^[[:space:]]*[0-9]+/ {print $2; exit}')
echo "Total de músicas na playlist $PID: $COUNT"
EOF

echo "==> Feito. Se a rádio já estava tocando, considere reiniciar:"
echo "    ssh $VPS 'docker exec azuracast azuracast_cli azuracast:radio:restart $STATION_ID'"
