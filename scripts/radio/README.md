# scripts/radio

Ferramentas pra gerenciar biblioteca da rádio `radio.geeketoys.com.br` (AzuraCast).

Ver documentação completa em [`docs/RADIO.md`](../../docs/RADIO.md).

## Arquivos

| Arquivo              | Finalidade                                                  |
| -------------------- | ----------------------------------------------------------- |
| `download-batch.py`  | Baixa lista `Artista — Título` (uma por linha) via yt-dlp   |
| `upload-to-vps.sh`   | `scp` + `docker cp` + `chown` + força detecção              |
| `playlist-attach.sh` | Associa todos os .mp3 de uma subpasta a uma playlist        |
| `kpop-top100.txt`    | Lista curada dos 100 K-pop (fonte para `download-batch.py`) |
| `downloads/`         | (gerado) saída dos downloads, organizada por subpasta       |

## Requisitos locais

- `yt-dlp` (`pip install -U yt-dlp`)
- `ffmpeg`/`ffprobe` no PATH
- Python 3.10+
- Chave SSH configurada pro host da VPS
- Export `VPS_HOST=user@ip-ou-hostname` na shell antes de rodar os scripts `.sh`

## Uso completo

```bash
cd scripts/radio

# 1. Ver playlists existentes (descobrir o ID)
./playlist-attach.sh kpop

# 2. Baixar as 100 K-pop
python download-batch.py kpop-top100.txt kpop

# 3. Enviar pra VPS
./upload-to-vps.sh downloads/kpop kpop

# 4. Aguardar ~90s pro AzuraCast detectar, verificar contagem:
ssh $VPS_HOST 'docker exec azuracast azuracast_cli dbal:run-sql "SELECT COUNT(*) FROM station_media WHERE path LIKE '\''kpop/%'\''"'

# 5. Associar à playlist (assumindo ID 2)
./playlist-attach.sh kpop 2

# 6. Iniciar/reiniciar rádio (se ainda não estiver no ar)
ssh $VPS_HOST 'docker exec azuracast azuracast_cli azuracast:radio:restart 1'
```

## Teste rápido com poucas músicas

```bash
python download-batch.py kpop-top100.txt kpop --limit 5 --workers 2
```
