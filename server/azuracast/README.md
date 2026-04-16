# AzuraCast — Rádio online (geeketoys)

Stack isolada para rodar rádio online em `radio.geeketoys.com.br`, coexistindo com a stack do clube-geek-toys sem conflitos.

## Decisões de arquitetura

| Decisão                                                                    | Motivo                                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Compose próprio em `/opt/azuracast/` (não junto do clube)                  | Deploy, update e rollback independentes. O CI/CD do clube não toca aqui.                                            |
| Sem `nginx-proxy` + `acme-companion` (default da imagem)                   | As portas 80/443 já pertencem ao nginx do clube.                                                                    |
| Painel web **sem** port binding no host                                    | Zero exposição pública do painel; nginx do clube alcança via rede docker compartilhada.                             |
| Streams em `0.0.0.0:8000–8046`                                             | Icecast/Shoutcast precisam de acesso público direto (não passam por proxy).                                         |
| Certificado SSL via certbot do clube (`--expand`)                          | Um único cert, uma única renovação automática.                                                                      |
| Rede `azuracast_network` criada aqui; nginx do clube entra como _external_ | Nginx resolve o container pelo nome (`azuracast:80`). Postgres/API do clube ficam isolados nas suas próprias redes. |
| Limites: 1.5 vCPU / 3 GB RAM                                               | Preserva folga para o clube (restam ~4 GB RAM + 0.5 vCPU).                                                          |
| MariaDB embutido com senhas via `.env`                                     | A imagem `:latest` exige `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` no primeiro boot.                                 |

## Pré-requisitos na VPS

Comandos para rodar **uma vez** antes do primeiro `docker compose up`:

```bash
# 1. Criar swap de 2 GB (VPS está com 0 swap)
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# 2. Abrir portas no firewall
sudo ufw allow 2022/tcp           # SFTP AzuraCast
sudo ufw allow 8000:8046/tcp      # Streams Icecast/Shoutcast

# 3. DNS — criar registro A apontando para a VPS
# radio.geeketoys.com.br  A  76.13.114.173

# 4. Expandir certificado incluindo o novo subdomínio
#    (rode no host, depois que o DNS propagar e o bloco nginx
#     já estiver em conf.d/default.conf, que o redireciona)
docker exec clube-geek-certbot certbot certonly \
  --webroot -w /var/www/certbot \
  --expand \
  -d club.geeketoys.com.br \
  -d admin.geeketoys.com.br \
  -d adm.geeketoys.com.br \
  -d api.geeketoys.com.br \
  -d analytics.geeketoys.com.br \
  -d radio.geeketoys.com.br

# 5. Recarregar nginx pra ler o novo cert
docker exec clube-geek-nginx nginx -s reload
```

## Deploy inicial do AzuraCast

```bash
# Copiar arquivos para a VPS
ssh root@76.13.114.173 "mkdir -p /opt/azuracast"
scp docker-compose.yml .env.example root@76.13.114.173:/opt/azuracast/

# Na VPS — gerar senhas e preencher .env
ssh root@76.13.114.173
cd /opt/azuracast
cp .env.example .env
sed -i "s|gerar-com-openssl-rand-hex-24|$(openssl rand -hex 24)|" .env   # MYSQL_PASSWORD
sed -i "s|gerar-com-openssl-rand-hex-24|$(openssl rand -hex 24)|" .env   # MYSQL_ROOT_PASSWORD
chmod 600 .env

# Subir
docker compose pull
docker compose up -d

# Como o nginx do clube depende da rede azuracast_network
# (que é criada pelo compose acima), recrie-o pra entrar na rede:
cd /opt/clube-geek-toys/server
docker compose up -d nginx

# Acompanhe a inicialização do AzuraCast (leva 1–3 min no primeiro start)
docker compose -f /opt/azuracast/docker-compose.yml logs -f azuracast
```

## Após subir

1. Acesse `https://radio.geeketoys.com.br` — o wizard do AzuraCast vai pedir os dados do admin inicial.
2. Crie a estação (Stations → Add Station).
3. Upload de músicas: web panel ou SFTP em `radio.geeketoys.com.br:2022`.

## Integração com o SPA do clube (player embutido)

Para embedar um player no `club.geeketoys.com.br`, adicione no painel do AzuraCast em _System → Settings → Web Hooks / CORS_:

```
Allowed CORS Origins:
  https://club.geeketoys.com.br
  https://geeketoys.com.br
```

## Operação

```bash
cd /opt/azuracast

# Status
docker compose ps

# Logs
docker compose logs -f azuracast

# Update (cuidado em prod)
docker compose pull && docker compose up -d

# Backup (gera dump em azuracast_backups)
docker exec azuracast /var/azuracast/www/bin/console azuracast:backup

# Restart
docker compose restart
```

## Impacto no clube-geek-toys

Mudanças feitas no compose do clube para suportar o AzuraCast:

- `server/docker-compose.yml`: nginx agora participa da rede `azuracast_network` (external), permitindo resolver o container `azuracast` por nome.
- `server/nginx/conf.d/default.conf`: adicionado bloco `server` para `radio.geeketoys.com.br` e incluído o subdomínio no redirect HTTP→HTTPS.
- `server/docker-compose.yml`: healthcheck do nginx trocado de `localhost` para `127.0.0.1` (fix do "unhealthy" causado por resolução IPv6).

**Ordem de deploy importa**: a rede `azuracast_network` precisa existir ANTES do nginx do clube subir. Se o AzuraCast estiver parado, o nginx do clube falhará ao iniciar (external network não encontrada). Para derrubar tudo, derrube o nginx do clube primeiro.

Nenhuma dessas mudanças quebra o fluxo existente do clube — todas são aditivas ou corrigem bug existente.

## Rollback

Se der errado, o AzuraCast é 100% reversível:

```bash
cd /opt/azuracast
docker compose down -v   # remove containers + volumes
```

E no nginx do clube, basta remover o bloco de `radio.geeketoys.com.br` e recarregar.
