# Segurança — Clube Geek & Toys

> **Última atualização:** 19 de Abril de 2026

## 1. Visão Geral de Segurança

A plataforma adota uma postura de **defesa em profundidade**:

- **Validação em duas camadas**: toda entrada é validada no cliente (React Hook Form + Zod) e novamente no servidor (middleware Zod), impedindo que dados malformados cheguem à lógica de negócio.
- **Princípio do menor privilégio (RBAC)**: cada role possui acesso estritamente ao que precisa. Nenhum endpoint depende apenas de autenticação — sempre há verificação de role e, quando aplicável, de ownership.
- **Zero trust**: toda entrada é tratada como potencialmente maliciosa, todo token é verificado criptograficamente, toda operação sensível é auditada.

## 2. Autenticação

### Hash de Senhas

- Algoritmo: **bcrypt** com **12 rounds** de salt
- Requisitos mínimos: 8 caracteres, pelo menos 1 maiúscula e 1 número
- Senhas nunca armazenadas em texto puro — apenas o hash bcrypt na coluna `password_hash`

### Tokens de Acesso e Refresh

| Token   | Tipo                                  | Expiração  | Armazenamento      |
| ------- | ------------------------------------- | ---------- | ------------------ |
| Access  | JWT HS256 (`{ userId, email, role }`) | 15 minutos | Memória (frontend) |
| Refresh | 64 bytes random hex                   | 30 dias    | Cookie httpOnly    |

**Refresh token — detalhes:**

- Armazenado no banco como **hash SHA-256** (o valor em texto nunca é persistido)
- Cookie configurado com `sameSite: lax`, `secure: true` em produção, `path: /auth`, `maxAge: 30 dias`
- **Rotação obrigatória**: a cada refresh, o token antigo é invalidado e um novo é emitido
- Invalidação no logout (hash removido do banco)

### Fluxo de Refresh

1. Access token expira (15 min)
2. Frontend envia cookie com refresh token para `POST /auth/refresh`
3. API valida refresh token contra hash SHA-256 no banco
4. Gera novo access token + novo refresh token
5. Token antigo invalidado imediatamente

### Verificação de Email

- **Detecção de email descartável**: 400+ domínios bloqueados (lista mantida em código)
- **Verificação DNS MX**: confirma que o domínio do email possui registros MX válidos
- **Token de verificação**: HMAC, expiração de 24h, uso único (tabela `consumed_verification_tokens`)

### Reset de Senha

- Token HMAC com expiração de 1 hora
- Uso único — consumido após utilização

### Google OAuth

- Verificação via endpoint `tokeninfo` do Google
- Validação de `audience` para garantir que o token foi emitido para nossa aplicação

## 3. Autorização (RBAC)

### Permissões por Role

| Role       | Permissões                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `member`   | Perfil próprio, pagamentos próprios, histórico de pontos próprio, gerenciamento da própria assinatura                                                  |
| `seller`   | Tudo de member + verificar qualquer membro, adicionar/resgatar pontos, visualizar detalhes de membros                                                  |
| `admin`    | Tudo de seller + pontos bônus, confirmar/estornar pagamentos, gerenciar membros, alterar planos/status, visualizar relatórios, gerenciamento de emails |
| `disabled` | Todo acesso bloqueado                                                                                                                                  |

### Cadeia de Middlewares

```
Request → authenticate → requireRole → verifyMemberOwnership → handler
```

- `authenticate`: valida JWT e extrai `userId`, `email`, `role`
- `requireRole`: verifica se o role do usuário está na lista permitida
- `verifyMemberOwnership`: garante que o membro só acesse seus próprios recursos (admins e sellers fazem bypass)

## 4. Validação de Input

### Zod Schemas

Todos os endpoints validam entrada com schemas Zod (request body, params e query):

- Middleware `validate` encapsula Zod e retorna **400** com erros por campo
- Frontend: React Hook Form + Zod resolver (validação espelhada)

### Validações Específicas

| Campo             | Validação                                                                    |
| ----------------- | ---------------------------------------------------------------------------- |
| CPF               | Algoritmo de checksum (Módulo 11) + consulta Brasil API + unicidade no banco |
| Email             | RFC 5322 + detecção de descartáveis (400+ domínios) + verificação DNS MX     |
| Senha             | Mínimo 8 caracteres + 1 maiúscula + 1 número                                 |
| Valores numéricos | Validados contra `PLAN_PRICES` (whitelist server-side)                       |

### Sanitização

- **sanitizeName**: remove tags `<script>`, URIs `javascript:`, event handlers, caracteres de controle
- **escapeHtml**: aplicado em todas as variáveis interpoladas em templates de email
- **Remoção de caracteres de controle** em campos de texto

## 5. Rate Limiting

Implementado via middleware `rate-limit.ts`, baseado em IP do cliente:

| Limiter               | Limite  | Janela | Endpoints                        |
| --------------------- | ------- | ------ | -------------------------------- |
| `authLimiter`         | 20 req  | 5 min  | Register, login, refresh, logout |
| `publicLookupLimiter` | 15 req  | 1 min  | Verificação de CPF existente     |
| `paymentLimiter`      | 10 req  | 1 min  | Operações de pagamento           |
| `emailLimiter`        | 5 req   | 5 min  | Envio de emails                  |
| `webhookLimiter`      | 60 req  | 1 min  | Webhooks do Stripe               |
| `defaultLimiter`      | 100 req | 1 min  | Demais endpoints                 |

Headers de resposta: `X-RateLimit-Remaining`, `Retry-After`.

## 6. Segurança de Pagamentos

### Stripe (Cartão de Crédito)

- **PCI DSS compliant**: tokenização client-side via Stripe Elements
- **Nenhum dado de cartão toca nosso servidor** — apenas tokens e IDs do Stripe
- `PaymentIntent` criado no servidor, confirmado no cliente
- Webhook verificado com **HMAC-SHA256** via Stripe SDK (`constructEvent`)
- `STRIPE_WEBHOOK_SECRET` obrigatório em produção (validado pelo schema Zod de env)

### Idempotência de Webhooks

- Chave: `stripe_{eventId}`
- Tabela `processed_webhooks` com `INSERT ... ON CONFLICT DO NOTHING`
- Impede processamento duplicado de qualquer evento

### PIX

- QR code gerado localmente (padrão EMV)
- Confirmação manual pelo admin no dashboard
- Prevenção de pagamento duplicado: `findRecentPayment` (janela de 7 dias)

### Validação de Valores

- Valor do pagamento validado contra `PLAN_PRICES` (whitelist server-side)
- Não é possível criar pagamento com valor arbitrário

## 7. Segurança do Contrato Digital

Em conformidade com a **Lei 14.063/2020** (assinatura eletrônica):

| Aspecto              | Implementação                                               |
| -------------------- | ----------------------------------------------------------- |
| Metadados capturados | IP do cliente, user-agent, timestamp                        |
| Hash do documento    | SHA-256 dos dados do membro + conteúdo do contrato          |
| Hash do PDF          | SHA-256 do arquivo PDF gerado                               |
| Contratos ativos     | Apenas 1 por membro (anteriores marcados como `superseded`) |
| Validação de upload  | Magic bytes do PDF verificados (impede upload de não-PDF)   |
| Limite de arquivo    | 5 MB máximo                                                 |

## 8. Segurança do Banco de Dados

### Prevenção de SQL Injection

- **Queries parametrizadas** em toda a aplicação (driver `pg` com placeholders `$1`, `$2`, ...)
- Sem ORM — SQL direto, sem vetores de injection via query builders

### Integridade de Dados

| Mecanismo                                | Uso                                            |
| ---------------------------------------- | ---------------------------------------------- |
| Row-level locking (`FOR UPDATE`)         | Operações de saldo de pontos                   |
| `SKIP LOCKED`                            | Cron jobs (impede processamento duplo)         |
| Transações (`BEGIN`/`COMMIT`/`ROLLBACK`) | Todas as operações compostas                   |
| UUID como primary keys                   | Não-sequenciais, não-previsíveis               |
| `CHECK` constraints                      | Campos enum (status, role, plan, method, type) |
| Cascading deletes                        | Onde apropriado para integridade referencial   |

### Dados Sensíveis

- Senhas: apenas hash bcrypt armazenado
- Refresh tokens: apenas hash SHA-256 armazenado
- Dados de cartão: nunca armazenados (tokenização via Stripe)
- CPF: armazenado sem formatação (11 dígitos), mascarado na UI

## 9. CORS e Headers

### CORS

Whitelist de origens permitidas (middleware `cors.ts`):

- `https://club.geeketoys.com.br`
- `https://admin.geeketoys.com.br`
- `localhost` apenas em desenvolvimento

### Headers de Segurança

- **Helmet.js** para headers de segurança padrão
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`

## 10. Segurança de Rede (Docker)

| Camada       | Configuração                                                            |
| ------------ | ----------------------------------------------------------------------- |
| API          | Não exposta diretamente — acessível apenas via nginx (proxy reverso)    |
| PostgreSQL   | Porta não exposta ao host — acessível apenas pela rede Docker interna   |
| Nginx        | `client_max_body_size 15MB`                                             |
| SSL/TLS      | Let's Encrypt com renovação automática (Certbot)                        |
| Health check | Usa `127.0.0.1` (não `localhost`, para evitar resolução IPv6 no Alpine) |

### Firewall (UFW)

Apenas portas essenciais abertas: SSH (22), HTTP (80), HTTPS (443).

### SSH

- Acesso apenas por chave pública (autenticação por senha desabilitada)
- Root login desabilitado

## 11. Auditoria

### Tabela `audit_logs`

Estrutura: `action`, `member_id`, `user_id`, `details` (JSONB), `timestamp`.

Logs são **imutáveis** (INSERT only, sem UPDATE/DELETE).

### Eventos de Segurança

- `login`, `register`, `email_verified`, `login_failed` (com motivo)

### Eventos de Pagamento

- `created`, `received`, `failed`, `confirmed`, `refunded`

### Eventos de Assinatura

- `created`, `paused`, `resumed`, `cancelled`

### Eventos de Membros

- `activated`, `expired`, `updated` (com diff antes/depois)

### Eventos de Pontos

- `earn`, `bonus`, `redeem`, `expired`, `reconciled`

### Logs Especializados

| Tabela       | Campos-chave                                          |
| ------------ | ----------------------------------------------------- |
| `email_logs` | template, recipient, status, resend_id, error_message |
| `error_logs` | message, stack, context, severity, source             |

## 12. LGPD (Lei Geral de Proteção de Dados)

### Princípios Aplicados

| Princípio            | Implementação                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Minimização de dados | Apenas dados essenciais coletados (nome, email, CPF, telefone)                             |
| Consentimento        | Checkbox explícito durante o cadastro                                                      |
| Finalidade           | Dados utilizados exclusivamente para operações do clube                                    |
| Mascaramento         | CPF exibido como `***.***.789-00` na interface                                             |
| Não compartilhamento | Dados não compartilhados com terceiros (exceto Stripe para pagamentos e Resend para email) |

### Direitos do Titular

- **Acesso**: membro pode visualizar todos os seus dados
- **Portabilidade**: contrato em PDF disponível para download
- **Retenção**: logs de auditoria mantidos para fins de compliance
- **Comunicação**: apenas emails transacionais (sem marketing sem consentimento)

### Analytics (Umami)

- Self-hosted (dados não saem da infraestrutura própria)
- Anonimizado por padrão (sem cookies de rastreamento, sem tracking pessoal)
- Conformidade LGPD/GDPR nativa

## 13. Proteção contra Ataques Comuns

| Ataque               | Mitigação                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **XSS**              | `sanitizeName` remove tags script, URIs `javascript:`, event handlers. Templates de email escapam variáveis com `escapeHtml()` |
| **CSRF**             | Cookies com `sameSite: lax` + header `Authorization` para chamadas à API                                                       |
| **SQL Injection**    | Queries parametrizadas exclusivamente (placeholders `$1`, `$2`)                                                                |
| **Brute force**      | Rate limiting + hashing lento com bcrypt                                                                                       |
| **Token replay**     | Tokens de verificação de uso único, rotação de refresh token                                                                   |
| **Webhook replay**   | Idempotência via tabela `processed_webhooks`                                                                                   |
| **Upload malicioso** | Validação de magic bytes, limite de tamanho, restrição de tipo                                                                 |
| **Enumeração**       | Verificação de CPF retorna apenas booleano (sem dados do membro); erro de login não revela se email existe                     |

## 14. Gestão de Secrets

### Princípios

- **Todos os secrets em variáveis de ambiente** — nunca no código-fonte
- Repositório é **público** — nenhum dado sensível commitado

### Arquivos Protegidos

| Arquivo                                 | Status                                                 |
| --------------------------------------- | ------------------------------------------------------ |
| `.env`, `.env.local`, `.env.production` | Listados no `.gitignore`                               |
| `CLAUDE.local.md`                       | Listado no `.gitignore` (dados operacionais sensíveis) |
| Chaves SSH (`*.pem`, `*.key`)           | Nunca commitadas                                       |
| Backups do banco                        | Nunca commitados                                       |

### Secrets de Produção

- Armazenados no arquivo `.env` da VPS (permissões `chmod 600`)
- Criados manualmente no servidor

### CI/CD (GitHub Secrets)

| Secret                        | Uso                                      |
| ----------------------------- | ---------------------------------------- |
| `VPS_HOST`                    | Endereço do servidor para deploy         |
| `VPS_USER`                    | Usuário SSH                              |
| `VPS_SSH_KEY`                 | Chave privada SSH                        |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Chave pública Stripe (injetada no build) |
| `VITE_PIX_KEY`                | Chave PIX (injetada no build)            |

## Contatos

- **Incidentes de segurança**: contato@geeketoys.com.br
- **ANPD (vazamento de dados)**: www.gov.br/anpd
- **Status do Stripe**: status.stripe.com
