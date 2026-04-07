# Guia de Deploy - Clube Geek & Toys

> **Ultima atualizacao:** 07 de Abril de 2026

Este documento descreve como realizar o deploy do sistema em producao na VPS.

## Requisitos

- VPS Ubuntu 24.04 (ou compativel)
- Docker e Docker Compose instalados
- Dominio configurado apontando para o IP da VPS
- Chave SSH para acesso ao servidor
- Conta no GitHub com acesso ao repositorio

## Arquitetura de Deploy

```
                    Internet
                       |
              ┌────────┴────────┐
              │   Nginx (443)   │  SSL termination (Let's Encrypt)
              └────────┬────────┘
         ┌─────────┬───┴───┬──────────┐
         │         │       │          │
    club.*     api.*   analytics.*  adm.*
    (SPA)    (Express)  (Umami)    (SPA)
         │         │       │
         │    ┌────┴────┐  │
         │    │ API:3001│  │
         │    └────┬────┘  │
         │         │       │
         │    ┌────┴────┐  ┌────┴────┐
         │    │PostgreSQL│  │umami-db │
         │    │  :5432   │  │  :5433  │
         │    └─────────┘  └─────────┘
         │
    /opt/clube-geek-toys/dist/
    (arquivos estaticos)
```

## 1. Deploy do Zero

### 1.1 Preparar a VPS

```bash
# Conectar na VPS
ssh root@76.13.114.173

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Instalar Docker Compose (se nao veio com Docker)
apt install -y docker-compose-plugin

# Criar diretorio do projeto
mkdir -p /opt/clube-geek-toys/{server,dist}
```

### 1.2 Clonar o Repositorio

```bash
cd /opt/clube-geek-toys
git clone <url-do-repositorio> .
```

### 1.3 Configurar Variaveis de Ambiente

```bash
cp server/.env.example server/.env
nano server/.env
```

Preencha todas as variaveis (veja secao "Variaveis de Ambiente" abaixo).

### 1.4 Subir os Containers

```bash
cd /opt/clube-geek-toys/server
docker compose up -d
```

Isso inicia todos os servicos: PostgreSQL, API Express, Nginx, Umami e Certbot.

### 1.5 Verificar Status

```bash
docker compose ps
# Todos devem estar "Up" e "healthy"

# Testar API
curl https://api.geeketoys.com.br/health
```

## 2. Variaveis de Ambiente

### server/.env

```env
# PostgreSQL
POSTGRES_USER=clube_geek
POSTGRES_PASSWORD=<senha_forte_aleatoria>
POSTGRES_DB=clube_geek_toys

# JWT
JWT_SECRET=<string_aleatoria_64_chars>
JWT_REFRESH_SECRET=<string_aleatoria_diferente_64_chars>
HMAC_SECRET=<outra_string_aleatoria_64_chars>

# PagBank
PAGBANK_TOKEN=<token_do_painel_PagBank>
PAGBANK_PUBLIC_KEY=<chave_publica_PagBank>

# Email (Resend)
RESEND_API_KEY=<api_key_do_Resend>
FROM_EMAIL=Clube Geek & Toys <contato@geeketoys.com.br>
ADMIN_EMAIL=admin@geeketoys.com.br

# URLs
FRONTEND_URL=https://club.geeketoys.com.br
API_URL=https://api.geeketoys.com.br
```

### Frontend (build via CI/CD)

As variaveis do frontend sao injetadas durante o build no GitHub Actions:

| Variavel                  | Valor                          |
| ------------------------- | ------------------------------ |
| `VITE_API_URL`            | `https://api.geeketoys.com.br` |
| `VITE_PAGBANK_PUBLIC_KEY` | Chave publica PagBank          |
| `VITE_PIX_KEY`            | Chave PIX da empresa           |
| `VITE_ENVIRONMENT`        | `production`                   |

## 3. SSL com Certbot

### Emissao Inicial de Certificados

```bash
# O container certbot gera automaticamente os certificados
# Mas para a primeira vez, pode ser necessario:
docker compose run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d club.geeketoys.com.br \
  -d admin.geeketoys.com.br \
  -d adm.geeketoys.com.br \
  -d api.geeketoys.com.br \
  -d analytics.geeketoys.com.br
```

### Renovacao Automatica

O container `certbot` renova os certificados automaticamente. O Nginx recarrega a cada 6 horas via cron interno.

## 4. Pipeline CI/CD

### Fluxo Automatico (GitHub Actions)

A cada push na branch `master`:

1. **Checkout** do codigo
2. **Build** do frontend (React/Vite) com variaveis de producao
3. **rsync** dos arquivos do servidor para `/opt/clube-geek-toys/server/`
4. **rsync** do frontend compilado para `/opt/clube-geek-toys/dist/`
5. **Rebuild** do container da API (`docker compose build --no-cache api`)
6. **Restart** dos containers API e Nginx
7. **Health check** automatico (`/api/health`)

### GitHub Secrets Necessarios

| Secret        | Descricao                     |
| ------------- | ----------------------------- |
| `VPS_HOST`    | IP da VPS (76.13.114.173)     |
| `VPS_USER`    | Usuario SSH (ex: `deploy`)    |
| `VPS_SSH_KEY` | Chave privada SSH para deploy |

### Deploy Manual

Se precisar fazer deploy manual:

```bash
# No repositorio local
npm run build

# Copiar frontend
rsync -avz --delete dist/ user@76.13.114.173:/opt/clube-geek-toys/dist/

# Copiar servidor
rsync -avz --delete --exclude='node_modules' --exclude='.env' \
  server/ user@76.13.114.173:/opt/clube-geek-toys/server/

# Na VPS
cd /opt/clube-geek-toys/server
docker compose build --no-cache api
docker compose up -d --force-recreate api nginx
```

## 5. Backup e Recuperacao

### Backup do PostgreSQL

```bash
# Backup manual
docker exec clube-geek-postgres pg_dump -U clube_geek clube_geek_toys > backup_$(date +%Y%m%d).sql

# Recomendacao: cron diario
# Adicionar ao crontab da VPS:
0 3 * * * docker exec clube-geek-postgres pg_dump -U clube_geek clube_geek_toys | gzip > /opt/backups/db_$(date +\%Y\%m\%d).sql.gz
```

### Restauracao

```bash
# Restaurar de um backup
cat backup.sql | docker exec -i clube-geek-postgres psql -U clube_geek clube_geek_toys
```

### Retencao Recomendada

- Backups diarios: 7 dias
- Backups semanais: 4 semanas
- Backups mensais: 12 meses

## 6. Monitoramento

### Containers Docker

```bash
# Status de todos os containers
docker compose ps

# Logs da API
docker compose logs -f api

# Logs do Nginx
docker compose logs -f nginx

# Uso de recursos
docker stats
```

### Analytics (Umami)

Acesse `https://analytics.geeketoys.com.br` para metricas de uso do sistema.

### Logs da Aplicacao

- `audit_logs` (PostgreSQL): Acoes criticas de admin
- `email_logs` (PostgreSQL): Emails enviados
- Logs Docker: `docker compose logs <servico>`

## 7. Troubleshooting

### API retorna 502 Bad Gateway

1. Verificar se o container API esta rodando: `docker compose ps api`
2. Verificar logs: `docker compose logs api`
3. Verificar se o PostgreSQL esta saudavel: `docker compose ps postgres`
4. Reiniciar: `docker compose restart api`

### Certificado SSL expirado

1. Verificar status do certbot: `docker compose logs certbot`
2. Renovar manualmente: `docker compose run --rm certbot renew`
3. Recarregar Nginx: `docker compose exec nginx nginx -s reload`

### Banco de dados sem conexao

1. Verificar status: `docker compose ps postgres`
2. Verificar logs: `docker compose logs postgres`
3. Verificar espaco em disco: `df -h`
4. Reiniciar: `docker compose restart postgres`

### Emails nao enviados

1. Verificar API key do Resend na `.env`
2. Verificar dominio verificado no painel Resend
3. Consultar `email_logs` no banco: `SELECT * FROM email_logs ORDER BY sent_at DESC LIMIT 10;`

### Webhook nao processado

1. Verificar `processed_webhooks`: `SELECT * FROM processed_webhooks ORDER BY processed_at DESC LIMIT 10;`
2. Verificar logs da API: `docker compose logs api | grep webhook`
3. Confirmar URL do webhook no painel PagBank

### Container com restart loop

```bash
# Ver motivo da falha
docker compose logs --tail=50 <servico>

# Verificar uso de memoria/disco
docker stats --no-stream
df -h
```

## 8. Seguranca da VPS

### Firewall (UFW)

```bash
# Portas abertas
ufw status
# Deve mostrar: 22 (SSH), 80 (HTTP), 443 (HTTPS)
```

### SSH

- Acesso apenas por chave (senha desabilitada)
- Root login desabilitado (usar usuario com sudo)

### Atualizacoes

```bash
# Manter sistema atualizado
apt update && apt upgrade -y

# Atualizar imagens Docker
docker compose pull
docker compose up -d
```

---

**Documentacao relacionada:**

- [SECURITY.md](docs/SECURITY.md) - Guia de seguranca
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitetura tecnica
- [TODO.md](docs/TODO.md) - Roadmap
