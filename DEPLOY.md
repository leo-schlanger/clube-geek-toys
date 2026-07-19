# Deploy — Clube GeekPop & Toys

> Guia completo de deploy e operação em produção.

---

## 1. Visão Geral

| Item            | Detalhe                                                                |
| --------------- | ---------------------------------------------------------------------- |
| **VPS**         | Ubuntu 24.04, Docker 29.4                                              |
| **Stack Clube** | Deploy automático via GitHub Actions (push em `master`)                |
| **Stack Rádio** | Deploy manual separado — ver seção 14                                  |
| **SSL**         | Let's Encrypt, certificado único com SAN cobrindo todos os subdomínios |
| **CI/CD**       | `.github/workflows/deploy.yml`                                         |

Duas stacks independentes compartilham a mesma VPS. O deploy automático cuida apenas da stack do clube. A rádio (AzuraCast) é gerenciada manualmente.

---

## 2. Pré-requisitos

- VPS com Ubuntu 22+ e Docker 27+ (com Docker Compose plugin)
- Domínio apontado para o IP da VPS (registros A para todos os subdomínios)
- Chave SSH configurada no GitHub Secrets para deploy automatizado
- Conta Stripe ativa (publishable key + secret key)
- Conta Resend com API key e domínio verificado
- Chave PIX (UUID) configurada

---

## 3. Deploy Inicial (primeiro setup)

Todos os comandos abaixo usam `$VPS_HOST` — exporte na sua shell antes:

```bash
export VPS_HOST=user@ip-ou-hostname
```

### 3.1 Preparar a VPS

```bash
# Conectar na VPS
ssh $VPS_HOST

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Instalar Docker Compose (se não veio com Docker)
apt install -y docker-compose-plugin

# Criar diretório do projeto
mkdir -p /opt/clube-geek-toys/{server,dist}
```

### 3.2 Clonar o Repositório

```bash
cd /opt/clube-geek-toys
git clone https://github.com/leo-schlanger/clube-geek-toys.git .
```

### 3.3 Configurar Variáveis de Ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

Preencha todas as variáveis conforme a seção 4.

### 3.4 Subir os Containers

```bash
cd /opt/clube-geek-toys/server
docker compose up -d
```

### 3.5 Verificar Status

```bash
docker compose ps
# Todos devem estar "Up" e "healthy"

curl https://api.geeketoys.com.br/health
```

---

## 4. Variáveis de Ambiente (.env)

Arquivo: `server/.env`

```env
# Ambiente
NODE_ENV=production
PORT=3001

# PostgreSQL (banco principal)
POSTGRES_USER=<usuario_postgres>
POSTGRES_PASSWORD=<senha_forte_aleatoria>
POSTGRES_DB=<nome_do_banco>
DATABASE_URL=postgresql://<usuario>:<senha>@postgres:5432/<banco>

# JWT / Autenticação
JWT_SECRET=<string aleatória, mínimo 32 caracteres>
JWT_REFRESH_SECRET=<string aleatória diferente, mínimo 32 caracteres>
HMAC_SECRET=<string aleatória diferente, mínimo 32 caracteres>

# Stripe (pagamentos)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Resend)
RESEND_API_KEY=re_...
FROM_EMAIL=GeekPop & Toys <contato@geeketoys.com.br>
ADMIN_EMAIL=geeketoys@gmail.com

# URLs
FRONTEND_URL=https://club.geeketoys.com.br
API_URL=https://api.geeketoys.com.br
ALLOWED_ORIGINS=https://club.geeketoys.com.br,https://admin.geeketoys.com.br

# PIX
PIX_KEY=<UUID da chave PIX>
PIX_MERCHANT_NAME=GEEK E TOYS
PIX_MERCHANT_CITY=RIO DE JANEIRO
```

> **Atenção:** o schema Zod em `server/api/src/config/env.ts` normaliza strings vazias para `undefined` antes do parse. No Compose, `${VAR:-}` expande para vazio, mas `.optional()` rejeita `""` — a normalização evita esse bug. Qualquer mudança na validação de env deve ser testada localmente antes do deploy, senão a API entra em restart loop.

### Variáveis do Frontend (build via CI/CD)

Injetadas durante o build no GitHub Actions:

| Variável                      | Descrição                                   |
| ----------------------------- | ------------------------------------------- |
| `VITE_API_URL`                | URL da API (`https://api.geeketoys.com.br`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Chave pública do Stripe                     |
| `VITE_PIX_KEY`                | Chave PIX da empresa                        |
| `VITE_ENVIRONMENT`            | `production`                                |

---

## 5. Docker Compose

### Containers

| Container  | Imagem            | Porta interna | Descrição                                     |
| ---------- | ----------------- | ------------- | --------------------------------------------- |
| `api`      | Node.js / Express | 3001          | API REST principal                            |
| `postgres` | PostgreSQL 16     | 5432          | Banco de dados principal (volume persistente) |
| `nginx`    | Nginx / Alpine    | 80, 443       | Reverse proxy + SSL termination               |
| `umami`    | Umami             | 3000          | Analytics                                     |
| `umami-db` | PostgreSQL        | 5433          | Banco de dados do Umami                       |

### Redes

| Rede                | Tipo    | Propósito                                                 |
| ------------------- | ------- | --------------------------------------------------------- |
| `server_default`    | Interna | Comunicação entre todos os containers do clube            |
| `azuracast_network` | Externa | Permite nginx resolver `azuracast:80` para proxy da rádio |

> **Ordem importa:** a rede `azuracast_network` é criada pelo compose do AzuraCast em `/opt/azuracast/`. O AzuraCast precisa estar rodando **antes** do nginx do clube subir, senão a rede externa não existe e o nginx falha ao iniciar.

---

## 6. Nginx

O nginx atua como reverse proxy central:

- **Proxy reverso** para `api`, `umami` e `azuracast`
- **SSL termination** com certificados Let's Encrypt
- **`client_max_body_size`**: 15MB (upload de contratos)
- **Gzip compression** habilitado
- **Health check** usa `GET /` em `127.0.0.1` (não `localhost`)

> **Gotcha:** o wget do Alpine resolve `localhost` como `::1` (IPv6), mas o nginx só escuta IPv4. Usar `127.0.0.1` evita que o healthcheck falhe perpetuamente.

### Subdomínios servidos

| Domínio                                           | Backend                        |
| ------------------------------------------------- | ------------------------------ |
| `club.geeketoys.com.br`                           | Arquivos estáticos (SPA)       |
| `admin.geeketoys.com.br` / `adm.geeketoys.com.br` | Arquivos estáticos (SPA admin) |
| `api.geeketoys.com.br`                            | Proxy para `api:3001`          |
| `analytics.geeketoys.com.br`                      | Proxy para `umami:3000`        |
| `radio.geeketoys.com.br`                          | Proxy para `azuracast:80`      |

---

## 7. SSL / Certificados

- **Certbot** com Let's Encrypt
- Certificado **único com SAN** cobrindo todos os subdomínios
- Renovação automática via timer do certbot

### Emissão inicial

O clube roda em **dois domínios espelho**: `geeketoys.com.br` e `geekpoptoys.com.br`.
Os mesmos subdomínios (club, admin/adm, shop, api, analytics, radio) valem para os dois,
e o certificado SAN único cobre ambos.

> **Importante — `--entrypoint certbot`**: o serviço `certbot` no compose tem um
> entrypoint próprio (loop `certbot renew; sleep 12h`). Sem sobrescrever o
> entrypoint, `docker compose run certbot certonly ...` ignora o `certonly` e cai
> no loop de renovação (o comando "trava" indefinidamente). Sempre passe
> `-T --entrypoint certbot` para emitir/expandir manualmente.

```bash
docker compose run --rm -T --entrypoint certbot certbot certonly \
  --webroot -w /var/www/certbot \
  -d club.geeketoys.com.br \
  -d admin.geeketoys.com.br \
  -d adm.geeketoys.com.br \
  -d shop.geeketoys.com.br \
  -d api.geeketoys.com.br \
  -d analytics.geeketoys.com.br \
  -d radio.geeketoys.com.br \
  -d club.geekpoptoys.com.br \
  -d admin.geekpoptoys.com.br \
  -d adm.geekpoptoys.com.br \
  -d shop.geekpoptoys.com.br \
  -d api.geekpoptoys.com.br \
  -d analytics.geekpoptoys.com.br \
  -d radio.geekpoptoys.com.br
```

### Adicionar um subdomínio/domínio ao cert existente

Use `--expand` para incluir novos domínios mantendo os já emitidos. Pré-requisito: os
registros DNS `A/CNAME` (ex.: `*.geekpoptoys.com.br`) já apontando para a VPS.

```bash
docker compose run --rm -T --entrypoint certbot certbot certonly --webroot -w /var/www/certbot --expand \
  --cert-name club.geeketoys.com.br \
  -d club.geeketoys.com.br \
  -d admin.geeketoys.com.br \
  -d adm.geeketoys.com.br \
  -d shop.geeketoys.com.br \
  -d api.geeketoys.com.br \
  -d analytics.geeketoys.com.br \
  -d radio.geeketoys.com.br \
  -d club.geekpoptoys.com.br \
  -d admin.geekpoptoys.com.br \
  -d adm.geekpoptoys.com.br \
  -d shop.geekpoptoys.com.br \
  -d api.geekpoptoys.com.br \
  -d analytics.geekpoptoys.com.br \
  -d radio.geekpoptoys.com.br

# recarrega o nginx do clube com o cert atualizado (graceful, sem downtime)
docker exec clube-geek-nginx nginx -t && docker exec clube-geek-nginx nginx -s reload
```

### Verificar renovação

```bash
docker compose run --rm -T --entrypoint certbot certbot renew --dry-run
```

---

## 8. CI/CD (GitHub Actions)

**Arquivo:** `.github/workflows/deploy.yml`
**Trigger:** push na branch `master`

### Pipeline

1. Build do frontend Vite com variáveis de produção
2. `rsync` de `server/` para `/opt/clube-geek-toys/server/` na VPS
3. `rsync` de `dist/` para `/opt/clube-geek-toys/dist/` na VPS
4. SSH: `docker compose build --no-cache api`
5. SSH: `docker compose up -d --force-recreate api nginx`
6. Health check: `curl https://api.geeketoys.com.br/health`

> **Nota:** o `--no-cache` é intencional — qualquer mudança em validação de env precisa rebuild completo.

### GitHub Secrets necessários

| Secret                        | Descrição                      |
| ----------------------------- | ------------------------------ |
| `VPS_HOST`                    | IP ou hostname da VPS          |
| `VPS_USER`                    | Usuário SSH para deploy        |
| `VPS_SSH_KEY`                 | Chave privada SSH              |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Chave pública do Stripe (live) |
| `VITE_PIX_KEY`                | Chave PIX da empresa           |

### Deploy manual (emergência)

```bash
# No repositório local
npm run build

# Copiar frontend
rsync -avz --delete dist/ $VPS_HOST:/opt/clube-geek-toys/dist/

# Copiar servidor
rsync -avz --delete --exclude='node_modules' --exclude='.env' \
  server/ $VPS_HOST:/opt/clube-geek-toys/server/

# Na VPS
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && \
  docker compose build --no-cache api && \
  docker compose up -d --force-recreate api nginx"
```

---

## 9. Stripe Webhook Setup

1. Acesse **Stripe Dashboard > Developers > Webhooks**
2. Adicione o endpoint: `https://api.geeketoys.com.br/webhook/stripe`
3. Selecione os eventos:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
4. Copie o **signing secret** (`whsec_...`) para a variável `STRIPE_WEBHOOK_SECRET` no `.env`
5. Reinicie a API:

```bash
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose up -d --force-recreate api"
```

> **Importante:** se o webhook foi criado em modo test e depois mudou para live, o signing secret muda. Verifique e atualize no `.env`.

---

## 10. Backup e Recuperação

### Backup automático

```bash
# Na VPS, tornar script executável
chmod +x /opt/clube-geek-toys/server/scripts/backup-postgres.sh

# Adicionar ao crontab (backup diário às 3h UTC, retenção 7 dias)
crontab -e
# Adicionar a linha:
0 3 * * * cd /opt/clube-geek-toys/server && ./scripts/backup-postgres.sh >> /var/log/clube-backup.log 2>&1
```

### Backup manual

```bash
ssh $VPS_HOST "docker exec clube-geek-postgres pg_dump -U \$POSTGRES_USER \$POSTGRES_DB > /tmp/backup.sql"
```

### Restauração

```bash
# Restore em container limpo
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && ./scripts/restore-postgres.sh /opt/clube-geek-toys/backups/<arquivo>.sql.gz"
```

### Contratos (PDFs)

Os PDFs de contrato ficam em `/app/uploads/contracts/` dentro do container da API. Para backup:

```bash
ssh $VPS_HOST "docker cp clube-geek-api:/app/uploads/contracts/ /opt/clube-geek-toys/backups/contracts/"
```

---

## 11. Monitoramento

### Endpoints e tabelas

| Recurso           | Onde verificar                               |
| ----------------- | -------------------------------------------- |
| Health da API     | `GET /health`                                |
| Cron health       | Tabela `config`, campo `last_cron_run`       |
| Logs de auditoria | Tabela `audit_logs`                          |
| Logs de email     | Tabela `email_logs`                          |
| Logs de erro      | Tabela `error_logs`                          |
| Analytics         | `https://analytics.geeketoys.com.br` (Umami) |

### Comandos úteis

```bash
# Logs da API (tempo real)
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose logs -f api"

# Logs do Nginx
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose logs -f nginx"

# Status de todos os containers
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose ps"

# Uso de recursos
ssh $VPS_HOST "docker stats --no-stream"
```

---

## 12. Operações Comuns

```bash
# Ver logs da API
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose logs -f api"

# Restart da API (com re-leitura do .env)
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose up -d --force-recreate api"

# Acessar PostgreSQL
ssh $VPS_HOST "docker exec -it clube-geek-postgres psql -U \$POSTGRES_USER \$POSTGRES_DB"

# Backup manual do banco
ssh $VPS_HOST "docker exec clube-geek-postgres pg_dump -U \$POSTGRES_USER \$POSTGRES_DB > /tmp/backup.sql"

# Rebuild completo da API
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose build --no-cache api && docker compose up -d --force-recreate api"
```

> **Atenção:** `docker compose restart` **não** re-lê o `.env`. Sempre use `up -d --force-recreate` quando alterar variáveis de ambiente.

---

## 13. Troubleshooting

### API em restart loop

1. Verificar logs: `docker compose logs api`
2. Causa mais comum: variáveis de ambiente inválidas (validação Zod falha no boot)
3. Corrigir o `.env` e recriar: `docker compose up -d --force-recreate api`

### Webhook não processando

1. Verificar se `STRIPE_WEBHOOK_SECRET` está correto no `.env`
2. Consultar tabela `processed_webhooks`: `SELECT * FROM processed_webhooks ORDER BY processed_at DESC LIMIT 10;`
3. Verificar logs: `docker compose logs api | grep webhook`
4. Confirmar endpoint no Stripe Dashboard

### Email não enviando

1. Verificar `RESEND_API_KEY` no `.env`
2. Verificar domínio verificado no painel Resend
3. Consultar tabela `email_logs`: `SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;`

### Health check do nginx falhando

- Causa: nginx usa `localhost` que resolve para `::1` (IPv6) no Alpine, mas nginx escuta apenas IPv4
- Solução: configurar health check com `127.0.0.1` em vez de `localhost`

### Certificado SSL — renovação falhou

```bash
certbot renew --dry-run
# Se falhar, verificar logs do certbot e se as portas 80/443 estão acessíveis
```

### Nginx não resolve `azuracast`

- A stack do AzuraCast (`/opt/azuracast/`) precisa estar rodando **antes** do nginx do clube
- A rede `azuracast_network` é criada pelo compose do AzuraCast
- Se o nginx falhar ao subir, inicie o AzuraCast primeiro e depois recrie o nginx

### API retorna 502 Bad Gateway

1. Verificar se o container da API está rodando: `docker compose ps api`
2. Verificar logs: `docker compose logs api`
3. Verificar se o PostgreSQL está saudável: `docker compose ps postgres`
4. Recriar: `docker compose up -d --force-recreate api`

### Container sem espaço em disco

```bash
# Verificar espaço
df -h

# Limpar imagens Docker não utilizadas
docker system prune -a
```

---

## 14. Stack da Rádio (AzuraCast)

A rádio é deployada **separadamente** e não faz parte do CI/CD automático.

| Item            | Detalhe                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------ |
| **Localização** | `/opt/azuracast/` na VPS                                                                         |
| **Domínio**     | `radio.geeketoys.com.br`                                                                         |
| **Proxy**       | Nginx do clube faz proxy para `azuracast:80`                                                     |
| **Streams**     | Portas `8000-8046` expostas diretamente no host (bypass nginx, Icecast não suporta HTTP upgrade) |

Para documentação completa, consulte:

- [`server/azuracast/README.md`](server/azuracast/README.md) — Setup da stack
- [`docs/RADIO.md`](docs/RADIO.md) — Operação da rádio
- [`scripts/radio/README.md`](scripts/radio/README.md) — Scripts de biblioteca musical

---

## Documentação Relacionada

- [`CLAUDE.md`](CLAUDE.md) — Guia operacional para sessões do Claude Code
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Arquitetura técnica e decisões
- [`docs/SECURITY.md`](docs/SECURITY.md) — Segurança, LGPD, rate limits
- [`docs/PROJECT.md`](docs/PROJECT.md) — Escopo e roadmap
- [`docs/TODO.md`](docs/TODO.md) — Tarefas pendentes
- [`docs/RADIO.md`](docs/RADIO.md) — Operação da rádio
