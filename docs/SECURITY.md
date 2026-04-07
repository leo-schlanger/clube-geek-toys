# Seguranca e Compliance - Clube Geek & Toys

> **Ultima atualizacao:** 07 de Abril de 2026

## Visao Geral

Este documento descreve as medidas de seguranca implementadas na plataforma Clube Geek & Toys, hospedada em VPS propria com Docker.

## 1. Autenticacao (JWT + bcrypt)

### Hash de Senhas

- **bcrypt** com 12 rounds de salt
- Senhas nunca armazenadas em texto puro
- Hash armazenado na coluna `password_hash` da tabela `users`

### Tokens JWT

| Token   | Expiracao | Armazenamento      | Uso                       |
| ------- | --------- | ------------------ | ------------------------- |
| Access  | 15 min    | Memoria (frontend) | Autenticacao de requests  |
| Refresh | 7 dias    | localStorage       | Renovacao do access token |

- **Access token**: Payload `{ userId, email, role }`, assinado com `JWT_SECRET`
- **Refresh token**: Assinado com `JWT_REFRESH_SECRET`, hash armazenado no banco
- Rotacao de refresh token a cada renovacao
- Invalidacao ao fazer logout (limpa hash do banco)

### Fluxo de Refresh

1. Access token expira (15 min)
2. Frontend envia refresh token para `POST /auth/refresh`
3. API valida refresh token contra hash no banco
4. Gera novo access token + novo refresh token
5. Antigo refresh token invalidado

## 2. Autorizacao (RBAC)

### Roles (Papeis)

| Role     | Acesso                                   |
| -------- | ---------------------------------------- |
| `member` | Dashboard pessoal, pontos, contratos     |
| `seller` | PDV, verificar membros, adicionar pontos |
| `admin`  | Painel completo, gestao de usuarios      |

### Middleware de Autorizacao

```
Request → auth.ts (verifica JWT) → role check → route handler
```

- Middleware `requireAuth` valida o token JWT em todas as rotas protegidas
- Middleware `requireRole(['admin'])` verifica se o role do usuario esta na lista permitida
- Frontend usa `ProtectedRoute` para proteger rotas por role

### Protecao por Endpoint

| Endpoint                | Roles Permitidos                |
| ----------------------- | ------------------------------- |
| `POST /auth/login`      | Publico                         |
| `POST /auth/register`   | Publico                         |
| `GET /members`          | admin                           |
| `GET /members/:id`      | admin, seller, owner            |
| `PUT /members/:id`      | admin, owner (campos limitados) |
| `POST /points/add`      | admin, seller                   |
| `GET /reports/*`        | admin                           |
| `GET /logs`             | admin                           |
| `POST /webhook/pagbank` | Publico (validado por HMAC)     |

## 3. Seguranca do Banco de Dados

### PostgreSQL

- **Acesso restrito**: Porta 5432 vinculada apenas a `127.0.0.1` (nao acessivel externamente)
- **Parametrized queries**: Todas as queries usam placeholders `$1, $2, ...` (prevencao de SQL injection)
- **CHECK constraints**: Campos enum validados no banco (role, status, plan, method)
- **Foreign keys**: Integridade referencial com ON DELETE CASCADE/SET NULL
- **Tabelas imutaveis**: `point_transactions`, `audit_logs`, `email_logs` nao permitem UPDATE/DELETE via aplicacao
- **UUID** como primary keys (nao sequencial, nao previsivel)

### Dados Sensiveis

- Senhas: apenas hash bcrypt armazenado
- Refresh tokens: apenas hash armazenado
- CPF: armazenado sem formatacao (11 digitos)
- Dados de cartao: nunca armazenados (tokenizacao via PagBank)

## 4. Seguranca de Rede

### Firewall (UFW)

Apenas 3 portas abertas na VPS:

| Porta | Protocolo | Servico                    |
| ----- | --------- | -------------------------- |
| 22    | TCP       | SSH                        |
| 80    | TCP       | HTTP (redirect para HTTPS) |
| 443   | TCP       | HTTPS                      |

### SSH

- Acesso apenas por chave publica (senha desabilitada)
- Root login desabilitado
- Recomendacao: usar usuario dedicado com sudo

### SSL/TLS

- Certificados Let's Encrypt via Certbot
- Renovacao automatica (container certbot)
- HTTP Strict Transport Security (HSTS) habilitado
- Redirect automatico HTTP -> HTTPS

### Headers de Seguranca (Nginx)

Configurados em `shared-headers.conf`, aplicados a todos os dominios:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
```

### CORS

Whitelist de origens permitidas (middleware `cors.ts`):

- `https://club.geeketoys.com.br`
- `https://admin.geeketoys.com.br`
- `https://adm.geeketoys.com.br`
- `localhost` (apenas desenvolvimento)

## 5. Seguranca de Webhooks

### Validacao PagBank

- Verificacao de assinatura HMAC do payload
- Idempotencia: tabela `processed_webhooks` evita processamento duplicado
- Webhook key = combinacao de `type + action + data_id`

### Idempotencia

```
Webhook recebido
  → Gera webhook_key (type + action + data_id)
  → Consulta processed_webhooks
  → Se ja processado: retorna 200 (ignora)
  → Se novo: processa + insere em processed_webhooks
```

## 6. Rate Limiting

Implementado no middleware `rate-limit.ts`:

| Endpoint                    | Limite  | Janela |
| --------------------------- | ------- | ------ |
| `POST /auth/login`          | 5 req   | 5 min  |
| `POST /auth/register`       | 5 req   | 5 min  |
| `POST /payment/pix`         | 10 req  | 1 min  |
| `POST /payment/checkout`    | 10 req  | 1 min  |
| `POST /auth/password-reset` | 3 req   | 5 min  |
| Outros endpoints            | 100 req | 1 min  |

- Headers de resposta: `X-RateLimit-Remaining`, `Retry-After`
- Baseado em IP do cliente

## 7. Validacao de Entrada

### Zod Schemas

Todos os endpoints validam entrada com schemas Zod:

- Limites de tamanho em todos os campos (email: max 254 chars, nome: max 200 chars)
- Validacao de formato (email, CPF, UUID)
- Enums validados (plan, method, role)
- Valores numericos com limites (amount > 0, points > 0)

### Sanitizacao

- HTML escapado em templates de email (prevencao XSS)
- Path sanitization para uploads (prevencao path traversal)
- CPF validado com algoritmo completo

## 8. Audit Logging

### Eventos Registrados

| Acao                     | Quem registra |
| ------------------------ | ------------- |
| `user_login`             | Sistema       |
| `user_login_failed`      | Sistema       |
| `member_created`         | Sistema       |
| `member_updated`         | Admin/Owner   |
| `member_activated`       | Sistema       |
| `points_added`           | Seller/Admin  |
| `points_redeemed`        | Seller/Admin  |
| `points_expired`         | Cron          |
| `payment_created`        | Sistema       |
| `payment_confirmed`      | Webhook       |
| `contract_signed`        | Membro        |
| `subscription_created`   | Sistema       |
| `subscription_cancelled` | Admin/Membro  |
| `role_changed`           | Admin         |

### Dados do Log

```json
{
  "action": "member_activated",
  "member_id": "uuid",
  "user_id": "uuid",
  "details": { "plan": "gold", "payment_id": "uuid" },
  "timestamp": "2026-04-07T10:00:00Z"
}
```

- Logs sao imutaveis (INSERT only, sem UPDATE/DELETE)
- Acessiveis apenas para admins via `GET /logs`

## 9. Protecao de Dados (LGPD)

### Dados Coletados

- Nome, email, CPF, telefone (cadastro)
- Endereco IP, user agent (contratos e logs de auth)
- Dados de navegacao (Umami Analytics - anonimizado)

### Tempo de Retencao

| Dado              | Periodo                  |
| ----------------- | ------------------------ |
| Cadastro          | 5 anos apos cancelamento |
| Pagamentos        | 5 anos (fiscal)          |
| Contratos         | 10 anos                  |
| Logs de auditoria | 2 anos                   |
| Logs de email     | 1 ano                    |

### Direitos do Titular

- Acesso, correcao, exclusao dos dados pessoais
- Portabilidade, revogacao de consentimento
- Contato: contato@geeketoys.com.br

### Analytics (Umami)

- Self-hosted (dados nao saem da VPS)
- Anonimizado por padrao (sem cookies, sem tracking pessoal)
- Conformidade LGPD/GDPR nativa

## 10. Gestao de Secrets

### Servidor (server/.env)

Arquivo `.env` no servidor com:

- Credenciais PostgreSQL
- JWT secrets (access + refresh)
- HMAC secret (webhooks)
- PagBank token e public key
- Resend API key

**Regras:**

- `.env` nunca commitado (listado no `.gitignore`)
- Criado manualmente na VPS
- Permissoes restritas (`chmod 600`)

### CI/CD (GitHub Secrets)

| Secret        | Uso                        |
| ------------- | -------------------------- |
| `VPS_HOST`    | IP do servidor para deploy |
| `VPS_USER`    | Usuario SSH                |
| `VPS_SSH_KEY` | Chave privada SSH          |

### Nunca Commitar

- `.env`, `.env.local`, `.env.production`
- Chaves SSH (`*.pem`, `*.key`)
- Tokens de acesso
- Backups do banco de dados

## 11. Backup e Recuperacao

### Backup do PostgreSQL

```bash
# Backup manual
docker exec clube-geek-postgres pg_dump -U clube_geek clube_geek_toys > backup.sql

# Backup comprimido
docker exec clube-geek-postgres pg_dump -U clube_geek clube_geek_toys | gzip > backup.sql.gz
```

### Restauracao

```bash
cat backup.sql | docker exec -i clube-geek-postgres psql -U clube_geek clube_geek_toys
```

### Retencao

- Backups diarios: 7 dias
- Backups semanais: 4 semanas
- Backups mensais: 12 meses

## 12. Checklist de Seguranca

### Deploy

- [ ] Verificar `.gitignore` inclui `.env`
- [ ] Rodar `npm audit` sem vulnerabilidades criticas
- [ ] Confirmar firewall (UFW) com apenas portas 22, 80, 443
- [ ] Verificar certificados SSL validos
- [ ] Testar rate limiting
- [ ] Confirmar CORS em producao
- [ ] Confirmar health check passando

### Manutencao Mensal

- [ ] Revisar dependencias com `npm audit`
- [ ] Verificar logs de auditoria para atividades suspeitas
- [ ] Confirmar backups automaticos funcionando
- [ ] Revisar acessos de usuarios admin
- [ ] Atualizar imagens Docker (`docker compose pull`)

### Anual

- [ ] Rotacionar JWT secrets
- [ ] Rotacionar credenciais PagBank
- [ ] Revisar politica de privacidade
- [ ] Atualizar sistema operacional da VPS
- [ ] Revisar regras de firewall

## 13. Contatos de Emergencia

- **Incidentes de Seguranca**: contato@geeketoys.com.br
- **ANPD (Vazamento de Dados)**: www.gov.br/anpd
- **PagBank Status**: status.pagseguro.uol.com.br
