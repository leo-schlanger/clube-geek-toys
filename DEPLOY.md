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
- Conta Pagar.me ativa (secret key `sk_` + public key `pk_`)
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

## 3.6 Acesso SSH — entrar de outra máquina

**Desde 08/09/2026 a VPS só aceita chave.** Senha foi desligada no SSH, então
uma máquina nova não entra sozinha: alguém precisa autorizar a chave dela a
partir de uma máquina que já entra.

Hoje entram como root três chaves — `geekpop-vps@Leo-...` (a sua),
`github-actions-deploy` (o CI) e `radio-hetzner`. Confira quando quiser:

```bash
ssh geekpop-vps 'ssh-keygen -lf /root/.ssh/authorized_keys'
```

### Autorizar uma máquina nova

**Na máquina nova**, gere um par e copie a parte pública (a que termina em
`.pub` — a outra nunca sai dali):

```bash
ssh-keygen -t ed25519 -C "descricao-da-maquina" -f ~/.ssh/id_ed25519_geekpop
cat ~/.ssh/id_ed25519_geekpop.pub
```

**De uma máquina que já entra**, autorize aquela linha:

```bash
ssh geekpop-vps 'cat >> /root/.ssh/authorized_keys' <<'PUB'
<cole aqui a linha inteira do .pub>
PUB
ssh geekpop-vps 'ssh-keygen -lf /root/.ssh/authorized_keys'   # confira que apareceu
```

**De volta na máquina nova**, adicione ao `~/.ssh/config` e teste:

```
Host geekpop-vps
  HostName <ip>
  User root
  IdentityFile ~/.ssh/id_ed25519_geekpop
  IdentitiesOnly yes
```

Use **uma chave por máquina**, com o comentário dizendo qual é. Assim, quando
uma máquina for vendida ou perdida, dá para revogar só ela apagando a linha
correspondente do `authorized_keys` — com uma chave compartilhada, revogar uma
tira todas do ar.

### Se nenhuma máquina entrar mais

Não há como se trancar do lado de fora: o **console do provedor** (VNC/recovery,
no painel web) não passa por SSH e ainda aceita a senha do root. Entre por ele e
acrescente a chave nova no `authorized_keys`. Guarde essa senha num gerenciador
— ela deixou de ser o acesso do dia a dia e virou o plano B.

### Por que não voltar a ligar a senha

Senha exposta na internet é adivinhável; chave não. A configuração que valia
antes vinha de um conflito, não de uma decisão: o `sshd_config` dizia `no`, mas
o `Include` da linha 12 lê `/etc/ssh/sshd_config.d/` **antes**, e no SSH vale o
**primeiro** valor encontrado — o `50-cloud-init.conf` dizia `yes` e ganhava.
Hoje esse arquivo diz `no`, e `/etc/cloud/cloud.cfg.d/99-disable-ssh-pwauth.cfg`
impede o cloud-init de reescrevê-lo no próximo boot. Confira o valor que vale
de verdade com `sshd -T | grep -i passwordauthentication` — ler o
`sshd_config` engana.

## 3.7 Melhor Envio — autorizar a conta da loja

Cotar frete e **comprar etiqueta** são permissões diferentes. Um token emitido
antes de a compra automática existir cotava frete e falhava em toda etiqueta com
403 — e um token já emitido **não ganha escopo novo** quando a lista muda no
`.env`: só reautorizando.

No painel: aba **Configurações** → cartão **Melhor Envio** → **Autorizar**. Abre
a página do Melhor Envio noutra aba, você confirma na conta da loja e volta. O
cliente nunca participa disso, e o cartão diz em qual dos três estados está:

- **Conectado e com permissão** — etiqueta funciona
- **Conectado, mas sem permissão para comprar etiqueta** — reautorize
- **Ainda não autorizado**

O terceiro estado é o óbvio; o do meio é o que já deixou a loja parada, porque
`authorized` respondia "sim" enquanto toda etiqueta morria. Conferir por fora:

```bash
curl -s -H "Authorization: Bearer <token-admin>" \
  https://api.geeketoys.com.br/shipping/melhor-envio/status | jq '{authorized, canBuyLabel, missingScopes}'
```

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

# Pagar.me (pagamentos) — ver docs/PAGARME.md
PAGARME_SECRET_KEY=sk_...
PAGARME_PUBLIC_KEY=pk_...
PAGARME_ACCOUNT_ID=acc_...
PAGARME_WEBHOOK_USER=<usuário do webhook, igual ao painel da Pagar.me>
PAGARME_WEBHOOK_PASSWORD=<senha do webhook, igual ao painel da Pagar.me>
# Faltando qualquer uma: a API sobe, mas não cobra — checkout responde 503 e o
# webhook recusa tudo. Confira em GET /health → payments.status.
PAGARME_STATEMENT_DESCRIPTOR=GEEKPOPTOYS
PAGARME_MAX_INSTALLMENTS=6

# Stripe — legado. Só para estornar cobrança anterior à migração de 01/09/2026.
# Pode ficar vazio quando não houver mais nenhuma cobrança antiga em aberto.
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

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

| Variável           | Descrição                                   |
| ------------------ | ------------------------------------------- |
| `VITE_API_URL`     | URL da API (`https://api.geeketoys.com.br`) |
| `VITE_PIX_KEY`     | Chave PIX da empresa                        |
| `VITE_ENVIRONMENT` | `production`                                |

> A chave pública da Pagar.me **não** é injetada no build: o checkout a lê de
> `GET /payments/config` em runtime, para que uma rotação na VPS valha sem
> deploy do frontend.

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

| Domínio                                               | Backend                          |
| ----------------------------------------------------- | -------------------------------- |
| `club.geeketoys.com.br`                               | Arquivos estáticos (SPA)         |
| `adm.geeketoys.com.br` (canônico)                     | Arquivos estáticos (SPA admin)   |
| `admin.geeketoys.com.br` / `admin.geekpoptoys.com.br` | **301 →** `adm.*` correspondente |
| `api.geeketoys.com.br`                                | Proxy para `api:3001`            |
| `analytics.geeketoys.com.br`                          | Proxy para `umami:3000`          |
| `radio.geeketoys.com.br`                              | Proxy para `azuracast:80`        |

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

| Secret         | Descrição               |
| -------------- | ----------------------- |
| `VPS_HOST`     | IP ou hostname da VPS   |
| `VPS_USER`     | Usuário SSH para deploy |
| `VPS_SSH_KEY`  | Chave privada SSH       |
| `VITE_PIX_KEY` | Chave PIX da empresa    |

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

## 9. Webhook da Pagar.me

O webhook é **a única coisa que marca um PIX como pago**. Sem ele, todo pedido
fica `pending` para sempre.

1. Acesse **Pagar.me → Configurações → Webhooks**
2. URL: `https://api.geeketoys.com.br/webhook/pagarme`
3. **Autenticação**: informe usuário e senha — os mesmos valores de
   `PAGARME_WEBHOOK_USER` e `PAGARME_WEBHOOK_PASSWORD` no `.env`
4. Eventos:
   - `charge.paid`, `charge.payment_failed`, `charge.refunded`, `charge.partial_canceled`
   - `order.paid`, `order.payment_failed`, `order.canceled`
   - `chargeback.received`
   - `invoice.paid`, `invoice.payment_failed`, `subscription.canceled`
5. Reinicie a API:

```bash
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && docker compose up -d --force-recreate api"
```

6. Confirme em `GET /health` → `payments.status` deve ser `"ok"`. Enquanto
   estiver `webhook_unauthenticated`, as credenciais não bateram.

> A Pagar.me v5 **não assina o corpo** — a proteção é essa Basic auth. Por isso o
> processador ainda relê a cobrança na API antes de acreditar em qualquer evento
> de dinheiro; ver [`docs/PAGARME.md`](docs/PAGARME.md).

### Stripe (legado)

O endpoint `POST /webhook/stripe` continua no ar para os eventos que cobranças
anteriores à migração ainda emitem. Não crie novos webhooks lá.

---

## 10. Backup e Recuperação

### Backup automático

Dumps `pg_dump | gzip | gpg` no disco da VPS (`/opt/clube-geek-toys/backups/`),
**cifrados em AES-256** desde 08/09/2026 — carregam CPF, endereço, e-mail e hash
de senha de todo membro. Credenciais e senha de cifra vêm do `.env` via
`cron-backup*.sh` (nada de segredo no crontab).

| Job          | Quando (UTC)                    | Pasta                                  | Retenção   |
| ------------ | ------------------------------- | -------------------------------------- | ---------- |
| Diário       | `0 3 * * *` (00:00 BRT)         | `/opt/clube-geek-toys/backups/`        | 7 dias     |
| Semanal      | `0 4 * * 0` (domingo 01:00 BRT) | `/opt/clube-geek-toys/backups/weekly/` | 12 semanas |
| Drill mensal | `0 5 1 * *` (dia 1º)            | — (container descartável)              | —          |

```bash
chmod 755 /opt/clube-geek-toys/server/scripts/*.sh

# crontab root — /bin/bash so a future deploy that drops +x cannot break cron:
# 0 3 * * * /bin/bash /opt/clube-geek-toys/server/scripts/cron-backup.sh >> /var/log/clube-backup.log 2>&1
# 0 4 * * 0 /bin/bash /opt/clube-geek-toys/server/scripts/cron-backup-weekly.sh >> /var/log/clube-backup-weekly.log 2>&1
# 0 5 1 * * /bin/bash /opt/clube-geek-toys/server/scripts/cron-restore-test.sh >> /var/log/clube-restore-test.log 2>&1
# */5 * * * * /bin/bash /opt/clube-geek-toys/server/scripts/health-check.sh >> /var/log/clube-health.log 2>&1
```

> Os scripts são versionados e o deploy faz `rsync --delete` em `server/`:
> **edite no repositório, nunca direto na VPS**, senão o próximo deploy desfaz.
> O `.env` está no `--exclude`, então os segredos sobrevivem.

### Três camadas, e o que cada uma cobre

| Camada                  | Resolve                                   | Não resolve         |
| ----------------------- | ----------------------------------------- | ------------------- |
| Dump cifrado no disco   | erro humano, `DROP TABLE`, migration ruim | perder a VPS        |
| Cópia off-site (bucket) | perder a VPS, trocar de plano/servidor    | backup que não abre |
| Drill de restauração    | backup que não abre, dump que não carrega | —                   |

Um backup que ninguém restaurou é fé, não garantia. O drill (`0 5 1 * *`) sobe um
`postgres:16-alpine` descartável, restaura o backup mais recente e **confere o que
saiu**: as tabelas essenciais existem e `users`/`products` voltaram com linhas.
Uma loja vazia "restaura com sucesso" e ainda assim é um desastre.

Rodar à mão:

```bash
ssh $VPS_HOST '/bin/bash /opt/clube-geek-toys/server/scripts/cron-restore-test.sh'
```

Ele nunca toca na produção: container próprio, nome único por execução, dados em
`tmpfs`. O único ponto de contato com o sistema vivo é ler o arquivo de backup.

### Cópia off-site (object storage)

Enquanto o backup mora no mesmo disco do banco, perder a VPS perde os dois. O
`backup-offsite.sh` empurra os `.gpg` para um bucket S3-compatível (Cloudflare R2
ou Backblaze B2 — no volume deste banco, centavos por mês) depois de cada dump.

Os arquivos já saem cifrados do host, então **o provedor de storage não entra na
fronteira de confiança**: ele guarda bytes que não sabe ler.

**Instale o rclone oficial, não o do apt.** O pacote do Ubuntu é a v1.60 (2022) e
falha contra o R2: o PUT funciona, o R2 devolve `X-Amz-Version-Id`, o rclone relê
o objeto com `?versionId=` e o R2 responde **501 Not Implemented** — porque não
implementa endereçar objeto por versão. A retentativa passa, então parece só
barulho no log, mas dobra o trabalho e **pula a etapa de exclusões**. Verifique com
`rclone version` — precisa ser 1.75 ou mais novo.

```bash
V=$(curl -fsSL https://downloads.rclone.org/version.txt | awk '{print $2}')
cd /tmp && curl -fsSLO "https://downloads.rclone.org/${V}/rclone-${V}-linux-amd64.zip" \
        && curl -fsSLO "https://downloads.rclone.org/${V}/SHA256SUMS"
# A chave vem de um keyserver independente do site do download.
gpg --keyserver keyserver.ubuntu.com --recv-keys FBF737ECE9F8AB18604BD2AC93935E02FF3B54FA
gpg --verify SHA256SUMS && sha256sum -c SHA256SUMS 2>/dev/null | grep linux-amd64
unzip -qo "rclone-${V}-linux-amd64.zip"
install -m 755 "rclone-${V}-linux-amd64/rclone" /usr/local/bin/rclone
```

Vai para `/usr/local/bin`, que **não está no PATH do cron** (`/usr/bin:/bin`) — por
isso `offsite-remote.sh` prefixa o PATH. Sem isso o cron voltaria a usar a v1.60
silenciosamente.

Configure no `.env` da VPS:

```bash
BACKUP_OFFSITE_BUCKET=clube-geek-backups
BACKUP_OFFSITE_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
BACKUP_OFFSITE_ACCESS_KEY=...
BACKUP_OFFSITE_SECRET_KEY=...
BACKUP_OFFSITE_PROVIDER=Cloudflare      # use "Other" no Backblaze B2
# BACKUP_OFFSITE_PREFIX=clube-geek-toys
```

Valores reais em `CLAUDE.local.md` (fora do repo). O token é restrito ao bucket:
se vazar, o alcance é escrever num bucket que só contém dado cifrado.

**Ativo desde 08/09/2026.** Uso: 220 MB de 10 GB gratuitos (2,2%).

Sem `BACKUP_OFFSITE_BUCKET` ele **pula e avisa**, sem derrubar o backup: jogar
fora um dump bom porque a cópia dele não saiu do host seria a troca errada. Com o
bucket setado e algo faltando, aí sim falha com a variável nomeada.

Depois de enviar, ele **baixa o mais recente de volta do bucket e abre**. `rclone
copy` dizer "ok" só significa que os bytes foram aceitos; o que precisa ser
verdade é que a cópia no bucket ainda decifra — ela é a que vai ser usada no dia
em que o servidor não existir.

### Uploads (fotos, galeria, contratos)

`uploads-offsite.sh` roda junto com o dump e espelha o volume `server_uploads`
(~220 MB, 500+ arquivos) no mesmo bucket. Duas diferenças em relação ao banco:

- **`rclone crypt`, não gpg.** O nome do arquivo também é cifrado — um contrato
  nomeado com o id do membro vazaria sozinho — e só o que mudou sobe. Reenviar o
  volume inteiro toda noite não escalaria conforme o catálogo cresce. Mesma
  `BACKUP_PASSPHRASE`.
- **Exclusão é guardada.** `--backup-dir` põe o que foi apagado ou substituído em
  `uploads-deleted/<data>/`, por 30 dias (`UPLOADS_DELETED_RETENTION_DAYS`).
  Apagar uma foto sem querer no painel deixa de ser definitivo.

A verificação é `rclone cryptcheck`, que lê **através** da camada de cifra e
compara com a origem — é o único check que prova que o que está lá decifra de
volta nos bytes que temos aqui.

Restaurar:

```bash
# tudo, direto no volume (VPS nova, depois de restaurar o banco)
/opt/clube-geek-toys/server/scripts/uploads-restore.sh

# só olhar, sem mexer no volume
/opt/clube-geek-toys/server/scripts/uploads-restore.sh /tmp/conferir

# recuperar o que foi apagado num dia
/opt/clube-geek-toys/server/scripts/uploads-restore.sh --deleted 2026-09-08 /tmp/recuperado
```

Ele usa `copy`, nunca `sync`: restauração não é hora de apagar arquivo que já
está no destino.

### Testar o pipeline sem bucket

`BACKUP_OFFSITE_LOCAL_DIR=/tmp/x` troca o bucket por um diretório. Exercita
cifra, sync, verificação e restauração inteiras — e serve também para manter uma
segunda cópia num disco montado.

### Cópia na sua máquina

```bash
bash scripts/backup-pull.sh    # baixa e confere que cada arquivo abre
```

Dump manual (hoje, sem esperar o domingo):

```bash
ssh $VPS_HOST /bin/bash /opt/clube-geek-toys/server/scripts/cron-backup-weekly.sh
```

### Backup manual

```bash
ssh $VPS_HOST "docker exec clube-geek-postgres pg_dump -U \$POSTGRES_USER \$POSTGRES_DB > /tmp/backup.sql"
```

### Restauração

```bash
# Restore em container limpo
ssh $VPS_HOST "cd /opt/clube-geek-toys/server && ./scripts/restore-postgres.sh /opt/clube-geek-toys/backups/weekly/<arquivo>.sql.gz"
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

1. Verificar se `PAGARME_WEBHOOK_USER` e `PAGARME_WEBHOOK_PASSWORD` batem com o painel da Pagar.me
2. Consultar tabela `processed_webhooks`: `SELECT * FROM processed_webhooks ORDER BY processed_at DESC LIMIT 10;`
3. Verificar logs: `docker compose logs api | grep webhook`
4. Confirmar o endpoint no painel da Pagar.me (e as entregas com falha, que ela reenvia)

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
