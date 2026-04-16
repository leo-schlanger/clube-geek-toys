#!/usr/bin/env bash
# Envia uma pasta local de .mp3 para a pasta de mídia do AzuraCast na VPS.
#
# Uso:
#   ./upload-to-vps.sh <pasta-local> <subpasta-remota>
#
# Exemplo:
#   ./upload-to-vps.sh downloads/kpop kpop
#
# O script:
#   1. scp todos os .mp3 para /tmp/radio-upload/ na VPS
#   2. docker cp pra /var/azuracast/stations/geek_e_toys/media/<subpasta>/
#   3. chown azuracast:azuracast
#   4. supervisorctl restart php-worker (força detecção)
#   5. limpa /tmp
set -euo pipefail

VPS="${VPS_HOST:?Defina VPS_HOST=user@host antes de rodar}"
STATION_SHORT="geek_e_toys"

if [[ $# -ne 2 ]]; then
  echo "Uso: $0 <pasta-local> <subpasta-remota>" >&2
  exit 1
fi

LOCAL_DIR="$1"
REMOTE_SUB="$2"
REMOTE_MEDIA="/var/azuracast/stations/${STATION_SHORT}/media/${REMOTE_SUB}"
TMP_REMOTE="/tmp/radio-upload-$$"

if [[ ! -d "$LOCAL_DIR" ]]; then
  echo "Pasta local não existe: $LOCAL_DIR" >&2
  exit 1
fi

MP3S=("$LOCAL_DIR"/*.mp3)
if [[ ${#MP3S[@]} -eq 0 || ! -f "${MP3S[0]}" ]]; then
  echo "Nenhum .mp3 em $LOCAL_DIR" >&2
  exit 1
fi

echo "==> ${#MP3S[@]} arquivos em $LOCAL_DIR → $REMOTE_MEDIA"

# 1. preparar /tmp na VPS + criar pasta destino
ssh "$VPS" "mkdir -p $TMP_REMOTE && docker exec azuracast mkdir -p $REMOTE_MEDIA"

# 2. scp em batch (um só handshake)
echo "==> scp..."
scp -q "${MP3S[@]}" "$VPS:$TMP_REMOTE/"

# 3. mover pra container + chown
echo "==> docker cp + chown..."
ssh "$VPS" bash -s -- "$TMP_REMOTE" "$REMOTE_MEDIA" <<'EOF'
set -euo pipefail
TMP="$1"; DEST="$2"
cd "$TMP"
for f in *.mp3; do
  docker cp "$f" "azuracast:$DEST/$f"
done
docker exec azuracast chown -R azuracast:azuracast "$DEST"
rm -rf "$TMP"
EOF

# 4. forçar detecção
echo "==> restart php-worker (detecção)..."
ssh "$VPS" "docker exec azuracast supervisorctl restart php-worker" >/dev/null

echo "==> OK. Aguarde ~90s e depois rode playlist-attach.sh."
