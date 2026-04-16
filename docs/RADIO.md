# Rádio Geek E Toys (AzuraCast)

Guia operacional da rádio online que roda em `radio.geeketoys.com.br`.

Operação enxuta: uma playlist por gênero em modo shuffle, sem blocos horários, sem whitelist de frontend.

> **Configuração local**: antes de usar os comandos abaixo, exporte `VPS_HOST=user@ip-ou-hostname` na sua shell (ou em um `.envrc`). Os scripts e exemplos usam essa variável pra não expor o host no repo público.

## Servidor

| O que              | Valor                                                              |
| ------------------ | ------------------------------------------------------------------ |
| SSH                | `$VPS_HOST`                                                        |
| Painel admin       | https://radio.geeketoys.com.br                                     |
| Stream principal   | https://radio.geeketoys.com.br/listen/geek_e_toys/radio.mp3        |
| Página pública     | https://radio.geeketoys.com.br/public/geek_e_toys                  |
| Station short_name | `geek_e_toys`                                                      |
| Station ID         | `1`                                                                |
| Compose            | `/opt/azuracast/docker-compose.yml` (fora do repo do clube)        |
| Pasta de mídia     | `/var/azuracast/stations/geek_e_toys/media/` (dentro do container) |
| SFTP (uploads)     | `radio.geeketoys.com.br:2022`                                      |

## Comandos úteis

```bash
# Executar comando dentro do container
ssh $VPS_HOST "docker exec azuracast <comando>"

# SQL direto (CLI do AzuraCast)
ssh $VPS_HOST "docker exec azuracast azuracast_cli dbal:run-sql \"SELECT ... \""

# Status do supervisor (serviços internos: nginx, php-fpm, liquidsoap, mariadb, redis)
ssh $VPS_HOST "docker exec azuracast supervisorctl status"

# Reiniciar a rádio (reload playlists, limpa queue)
ssh $VPS_HOST "docker exec azuracast azuracast_cli azuracast:radio:restart 1"

# Detectar arquivos novos sem esperar o scan periódico
ssh $VPS_HOST "docker exec azuracast supervisorctl restart php-worker"

# Verificar stream ao vivo
ssh $VPS_HOST "docker exec azuracast curl -s http://localhost:8000/status-json.xsl"
```

## Estrutura de pastas

```
/var/azuracast/stations/geek_e_toys/media/
├── kpop/         ← começamos aqui
├── pop/          (criar quando adicionar pop internacional)
├── rock/
├── ...
```

Uma pasta por gênero. Dentro, os arquivos `.mp3` em snake_case.

## Padrões de arquivo

### Nome do arquivo (obrigatório)

- **snake_case** com underscores, SEM espaços
- Padrão: `Artista_-_Titulo.mp3` (observe os dois underscores cercando o hífen)
- Title_Case: primeira letra de cada palavra maiúscula
- Sem emojis, sem `< > : " / \ | ? *`

✅ `NewJeans_-_Super_Shy.mp3`
❌ `newjeans - super shy.mp3` (espaços e minúsculas)

### Metadados ID3 (obrigatório)

| Tag    | Valor                          |
| ------ | ------------------------------ |
| Title  | Título limpo (sem underscores) |
| Artist | Nome do artista                |
| Album  | Álbum ou single (opcional)     |
| Genre  | `K-Pop`, `Pop`, `Rock`, etc.   |

### Capa do álbum (obrigatório)

Toda música precisa ter capa embebida. `yt-dlp --embed-thumbnail` resolve no download. Verificar com:

```bash
ffprobe -v quiet -show_streams arquivo.mp3 | grep codec_type=video  # se sair, tem capa
```

## Fluxo de adicionar música (8 passos)

### 1. Checar duplicata

```bash
ssh $VPS_HOST "docker exec azuracast azuracast_cli dbal:run-sql \"SELECT id, title, artist FROM station_media WHERE artist LIKE '%ARTISTA%' AND title LIKE '%TITULO%'\""
```

### 2. Baixar via yt-dlp

```bash
yt-dlp -x --audio-format mp3 --audio-quality 0 \
  --embed-thumbnail --add-metadata \
  -o "Artista_-_Titulo.%(ext)s" \
  "ytsearch1:Artista Titulo"
```

### 3. Verificar integridade e metadata

```bash
ffmpeg -v error -i "Artista_-_Titulo.mp3" -f null -  # sem erro = ok
ffprobe -v quiet -print_format json -show_format "Artista_-_Titulo.mp3"
```

### 4. Corrigir metadata (se necessário)

```bash
ffmpeg -i "input.mp3" -c copy \
  -metadata title="Titulo Correto" \
  -metadata artist="Artista Correto" \
  -metadata genre="K-Pop" \
  "output.mp3"
```

### 5. Enviar para a VPS

```bash
scp "Artista_-_Titulo.mp3" $VPS_HOST:/tmp/
ssh $VPS_HOST "docker cp /tmp/Artista_-_Titulo.mp3 azuracast:/var/azuracast/stations/geek_e_toys/media/kpop/"
ssh $VPS_HOST "docker exec azuracast chown azuracast:azuracast /var/azuracast/stations/geek_e_toys/media/kpop/Artista_-_Titulo.mp3"
ssh $VPS_HOST "rm /tmp/Artista_-_Titulo.mp3"
```

### 6. Forçar detecção

```bash
ssh $VPS_HOST "docker exec azuracast supervisorctl restart php-worker"
# aguardar 60-90s
```

### 7. Confirmar detecção (pegar media_id)

```bash
ssh $VPS_HOST "docker exec azuracast azuracast_cli dbal:run-sql \"SELECT id, title, artist FROM station_media WHERE path LIKE '%Artista_-_Titulo%'\""
```

Sem resultado → aguardar mais. **Nunca pular este passo.**

### 8. Associar à playlist

```bash
# id da playlist (ver `SELECT id, name FROM station_playlists WHERE station_id = 1`)
ssh $VPS_HOST "docker exec azuracast azuracast_cli dbal:run-sql \"INSERT INTO station_playlist_media (playlist_id, media_id, weight) VALUES (<PLAYLIST_ID>, <MEDIA_ID>, 0)\""
```

Após alterações em playlist, limpar queue:

```bash
ssh $VPS_HOST "docker exec azuracast azuracast_cli dbal:run-sql \"DELETE FROM station_queue WHERE station_id = 1\""
ssh $VPS_HOST "docker exec azuracast azuracast_cli dbal:run-sql \"UPDATE station_playlist_media SET is_queued = 0 WHERE playlist_id = <PLAYLIST_ID>\""
ssh $VPS_HOST "docker exec azuracast azuracast_cli azuracast:radio:restart 1"
```

## Scripts

Em `scripts/radio/`:

- `download-batch.py` — baixa uma lista `Artista — Título` (um por linha) em paralelo, com retry e validação
- `upload-to-vps.sh` — envia uma pasta local pra pasta remota, ajusta permissões, força detecção
- `playlist-attach.sh` — associa todos os media_ids de uma pasta a uma playlist
- `kpop-top100.txt` — lista curada dos 100 K-pop para alimentar o `download-batch.py`

Fluxo completo:

```bash
cd scripts/radio

# 1. Baixar (escreve em scripts/radio/downloads/kpop/)
python download-batch.py kpop-top100.txt kpop

# 2. Enviar
./upload-to-vps.sh downloads/kpop kpop

# 3. Criar playlist (via painel AzuraCast ou SQL) e pegar o ID
# 4. Associar
./playlist-attach.sh kpop <PLAYLIST_ID>
```

## Troubleshooting

| Problema                     | Solução                                                          |
| ---------------------------- | ---------------------------------------------------------------- |
| Música não aparece no painel | `supervisorctl restart php-worker`, aguardar 90s, ver logs       |
| `chown` falhou               | container parado — `docker compose up -d` em `/opt/azuracast`    |
| Stream não responde          | `azuracast_cli azuracast:radio:restart 1`                        |
| Sem espaço em disco          | `docker system prune`, `df -h` no host                           |
| yt-dlp falha no download     | Atualizar: `pip install -U yt-dlp` (YouTube muda com frequência) |
