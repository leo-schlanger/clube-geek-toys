# Segurança — Clube GeekPop & Toys

> **Última atualização:** 8 de Agosto de 2026

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

| Token   | Tipo                                  | Expiração | Armazenamento      |
| ------- | ------------------------------------- | --------- | ------------------ |
| Access  | JWT HS256 (`{ userId, email, role }`) | 1 hora    | Memória (frontend) |
| Refresh | 64 bytes random hex                   | 30 dias   | Cookie httpOnly    |

**Refresh token — detalhes:**

- Armazenado no banco como **hash SHA-256** (o valor em texto nunca é persistido)
- Cookie configurado com `sameSite: lax`, `secure: true` em produção, `path: /auth`, `maxAge: 30 dias`
- **Rotação obrigatória**: a cada refresh, o token antigo é invalidado e um novo é emitido
- **Uma sessão por dispositivo** (migration 024): cada sessão é uma linha em
  `refresh_sessions`, com `expires_at` no servidor. Antes existia uma única
  coluna `users.refresh_token_hash`, então entrar no celular derrubava o login
  do computador no refresh seguinte — era a reclamação "desloga muito rápido".
- Logout encerra **só a sessão do aparelho** que pediu (identificada pelo token
  no cookie). Sem token, encerra todas.
- Troca de senha, reset de senha, conta desativada e exclusão LGPD encerram
  **todas** as sessões — a credencial mudou, nada aberto com a antiga vale.
- O cron diário limpa as sessões vencidas.

### Fluxo de Refresh

1. Access token expira (1 h)
2. Frontend envia cookie com refresh token para `POST /auth/refresh`
3. API acha a **sessão** pelo hash do token (ou pelo token anterior, dentro da
   janela de 30 s que evita corrida entre abas) e confere `expires_at`
4. Gera novo access token + novo refresh token, rotacionando **só aquela linha**
5. Token antigo invalidado imediatamente; sessões dos outros aparelhos intactas

**Falha de rede não é logout**: o cliente só apaga os tokens quando o servidor
responde 400/401/403 no refresh. Timeout, offline ou 5xx (a API reiniciando num
deploy) devolvem `transient` e a sessão continua — antes qualquer falha caía no
mesmo ramo e deslogava o cliente.

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

| Role       | Permissões                                                                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `member`   | Perfil próprio, pagamentos próprios, gerenciamento da própria assinatura, pedidos próprios da loja                                                                                             |
| `seller`   | Tudo de member + verificar qualquer membro (CPF/QR) no PDV, visualizar detalhes de membros                                                                                                     |
| `admin`    | Tudo de seller + confirmar/estornar pagamentos (assinatura e loja), gerenciar membros, alterar status, gerenciar produtos/categorias e pedidos, visualizar relatórios, gerenciamento de emails |
| `disabled` | Todo acesso bloqueado                                                                                                                                                                          |

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

| Campo             | Validação                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| CPF               | Algoritmo de checksum (Módulo 11) + consulta Brasil API + unicidade no banco                                                     |
| Email             | RFC 5322 + detecção de descartáveis (400+ domínios) + verificação DNS MX                                                         |
| Senha             | Mínimo 8 caracteres + 1 maiúscula + 1 número                                                                                     |
| Valores numéricos | Assinatura: validada contra `CLUB_PLAN_PRICE` (R$ 12,50). Loja: totais recalculados server-side a partir dos preços dos produtos |

### Sanitização

- **sanitizeName**: remove tags `<script>`, URIs `javascript:`, event handlers, caracteres de controle
- **escapeHtml**: aplicado em todas as variáveis interpoladas em templates de email
- **Remoção de caracteres de controle** em campos de texto

## 5. Rate Limiting

Implementado via middleware `rate-limit.ts`, baseado em IP do cliente:

| Limiter               | Limite  | Janela | Endpoints                                 |
| --------------------- | ------- | ------ | ----------------------------------------- |
| `authLimiter`         | 20 req  | 5 min  | Register, login, refresh, logout          |
| `publicLookupLimiter` | 15 req  | 1 min  | Verificação de CPF existente              |
| `paymentLimiter`      | 10 req  | 1 min  | Operações de pagamento                    |
| `emailLimiter`        | 5 req   | 5 min  | Envio de emails                           |
| `webhookLimiter`      | 60 req  | 1 min  | Webhooks da Pagar.me (e do Stripe legado) |
| `defaultLimiter`      | 100 req | 1 min  | Demais endpoints                          |

Headers de resposta: `X-RateLimit-Remaining`, `Retry-After`.

### Conteúdo gerado por usuário (perguntas na loja)

As perguntas de produto (migration 017) aparecem na vitrine **sem aprovação
prévia** — decisão de produto de 14/08/2026, modelo Mercado Livre. Como o
limitador de IP sozinho não segura uma conta determinada, a contenção é por
conta:

- **Login obrigatório** para perguntar (`POST /questions` exige JWT) — a pergunta tem dono
- **Máx. 10 perguntas em aberto** por usuário (`MAX_OPEN_QUESTIONS_PER_USER`); só volta a poder perguntar quando as anteriores forem respondidas → `429 TOO_MANY_OPEN_QUESTIONS`
- Corpo limitado a 1000 caracteres (resposta, 2000), validado no Zod e no service
- Moderação a posteriori: `PATCH /questions/:id/status` com `hidden` tira da vitrine
- Na vitrine sai apenas o **primeiro nome** de quem perguntou, nunca o nome completo nem o e-mail

Notificações são sempre lidas/escritas com o `userId` do JWT — nunca com id
vindo da query — então um usuário não alcança as notificações de outro.

**LGPD:** o export inclui `productQuestions` e `notifications`; a exclusão de
conta troca o texto da pergunta por `REDACTED`, limpa a resposta pública (ela
cita a pergunta) e apaga as notificações, que não têm valor de auditoria.

## 6. Segurança de Pagamentos

### Pagar.me (cartão de crédito)

- **Fora do escopo PCI**: o navegador troca o cartão por um `card_token` direto
  em `api.pagar.me/core/v5/tokens?appId=pk_...`, com a chave **pública**. A
  requisição não pode nem carregar header de autorização.
- **Nenhum dado de cartão toca nosso servidor** — só o token, a bandeira e os
  quatro últimos dígitos.
- Autorização **síncrona**: uma recusa volta como 402 com o motivo do banco
  traduzido, em vez de uma linha `pending` que ninguém resolve.
- `PAGARME_SECRET_KEY` obrigatória em produção (schema Zod de env).

### Webhook da Pagar.me

A v5 **não assina o corpo**. Duas camadas cobrem isso:

1. **Basic auth** com `PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASSWORD`,
   conferidas em tempo constante. As duas são obrigatórias em produção — sem
   elas o endpoint que liquida pagamento ficaria aberto.
2. **Releitura na API** (`GET /charges/:id`) antes de acreditar em qualquer
   evento de dinheiro. Um `charge.paid` forjado não liquida nada.

Falha na consulta = "não confirmado": o evento fica sem processar e a Pagar.me
reentrega, em vez de o sistema decidir no chute.

### Idempotência de Webhooks

- Chave: `pagarme_{eventId}` (e `stripe_{eventId}` para os eventos legados)
- Tabela `processed_webhooks` com `INSERT ... ON CONFLICT DO NOTHING`
- Impede processamento duplicado de qualquer evento

### PIX

- QR **dinâmico** emitido pela Pagar.me e conciliado por ela; o pagamento
  confirma sozinho via `charge.paid`, em segundos
- O código é **guardado** na linha do pedido: carrega o txid do provedor e não
  dá para reconstruir, ao contrário do BR Code estático que gerávamos antes
- Confirmação manual (`confirmPixOrder` / `confirmPixPayment`) segue no painel
  como exceção: para os códigos anteriores à migração e para o webhook que não
  chega
- Prevenção de pagamento duplicado: `findRecentPayment` (janela de 7 dias)
- O CPF do comprador é obrigatório e tem o dígito verificador conferido antes de
  a transação abrir — a operadora recusa cobrança sem documento válido

### Validação de Valores

- Assinatura: valor validado contra `CLUB_PLAN_PRICE` (R$ 12,50) e intervalo travado em mensal (`CLUB_PLAN_INTERVAL`) — o cliente não escolhe nem o valor nem a periodicidade
- Loja: subtotal, desconto e total são **recalculados no servidor** a partir dos preços dos produtos travados no banco (`SELECT ... FOR UPDATE`); o valor enviado pelo cliente nunca é usado

### Desconto de Membro na Loja (server-side)

- O desconto de **10%** só é aplicado quando há um membro `active` autenticado no checkout (`expiry_date >= CURRENT_DATE`)
- O backend resolve o `member_id` a partir do token — nunca confia em flag/valor enviado pelo cliente
- Aplicação registrada em `orders.discount_reason = 'member_10'` (constante `MEMBER_SHOP_DISCOUNT = 0.10`)
- Frete **nunca** recebe desconto de membro

### Desconto Atacado B2B (server-side)

- Canal `channel = 'wholesale'` no `POST /orders`
- Exige JWT + conta em `wholesale_accounts` com `status = 'approved'`
- CNPJ do body deve bater com o cadastrado (dígitos + checksum Modulo 11)
- Desconto de **25%** (`WHOLESALE_SHOP_DISCOUNT = 0.25`, reason `wholesale_25`)
- **Não empilha** com `member_10` (canais mutuamente exclusivos no cálculo)
- Só produtos com `wholesale_enabled = true`; valida `wholesale_min_qty` e estoque
- Login atacado (`POST /wholesale/login`) exige CNPJ correto — credenciais sozinhas não bastam

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

| Mecanismo                                | Uso                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| Row-level locking (`FOR UPDATE`)         | Checkout da loja (trava produtos, valida e baixa estoque)     |
| Transações (`BEGIN`/`COMMIT`/`ROLLBACK`) | Todas as operações compostas                                  |
| UUID como primary keys                   | Não-sequenciais, não-previsíveis                              |
| `CHECK` constraints                      | Campos enum (status, role, plan, method, order status, stock) |
| Cascading deletes                        | Onde apropriado para integridade referencial                  |

### Schema aplicado no boot (`ensureSchema`)

O DDL idempotente que roda quando a API sobe está dividido em **18 etapas
nomeadas**, cada uma com seu próprio `try` (desde 16/08/2026 — antes era um
`try` único sobre 460 linhas, e uma etapa quebrando abortava as seguintes em
silêncio, com o `/health` respondendo `ok`).

| Superfície         | Quem vê | O que expõe                                    |
| ------------------ | ------- | ---------------------------------------------- |
| `GET /health`      | público | `schema.status` + **quantas** etapas falharam  |
| `GET /logs/schema` | admin   | **quais** etapas falharam e a mensagem de erro |

A separação é deliberada: nome de tabela e de coluna é informação de dentro e
não vai na rota pública. O deploy consome o `/health` e **reprova** em
`degraded` — schema pela metade não passa em verde.

### Dados Sensíveis

- Senhas: apenas hash bcrypt armazenado
- Refresh tokens: apenas hash SHA-256 armazenado
- Dados de cartão: nunca armazenados (tokenização no navegador, direto com a Pagar.me)
- CPF: armazenado sem formatação (11 dígitos), mascarado na UI

## 9. CORS e Headers

### CORS

Whitelist de origens (middleware `cors.ts`):

- `FRONTEND_URL` + `ALLOWED_ORIGINS` (env)
- **Qualquer subdomínio HTTPS** de `geeketoys.com.br` e do espelho `geekpoptoys.com.br`
  (ex.: `club.*`, `adm.*`, `admin.*`, `shop.*`, `api.*`)
- `localhost` apenas em desenvolvimento

**Admin canônico:** use `https://adm.geeketoys.com.br` (ou `adm.geekpoptoys.com.br`).  
`admin.*` redireciona 301 → `adm.*` (nginx) para evitar bloqueios de adblock/filtros no label `admin`.

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

### Eventos da Loja

- `order_created`, `order_paid`, `order_status_changed`, `order_refunded`, `product_created`, `product_updated`

### Logs Especializados

| Tabela       | Campos-chave                                          |
| ------------ | ----------------------------------------------------- |
| `email_logs` | template, recipient, status, resend_id, error_message |
| `error_logs` | message, stack, context, severity, source             |

## 12. LGPD (Lei Geral de Proteção de Dados)

### Princípios Aplicados

| Princípio            | Implementação                                                                          |
| -------------------- | -------------------------------------------------------------------------------------- |
| Minimização de dados | Apenas dados essenciais (clube: nome, email, CPF, telefone; loja: endereço de entrega) |
| Consentimento        | Checkbox explícito durante o cadastro                                                  |
| Finalidade           | Clube + loja própria (pedidos, frete, avaliações, crédito de loja)                     |
| Mascaramento         | CPF exibido como `***.***.789-00` na interface                                         |
| Não compartilhamento | Pagar.me (pagamentos), Resend (email), ViaCEP/Melhor Envio (frete)                     |

### Direitos do Titular (API)

| Direito                    | Endpoint / comportamento                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Acesso / portabilidade** | `GET /lgpd/export` — JSON com user, member, contracts, payments, subscriptions, **pedidos da loja + itens**, **reviews**, **crédito + ledger**, audit e email logs                                         |
| **Eliminação**             | `POST /lgpd/delete` (senha) — anonimiza user/member/contracts; **redige orders** (nome/email/telefone/endereço); oculta textos de review; zera crédito; bloqueia se assinatura ativa ou pedido em trânsito |
| **Retenção**               | `audit_logs` e ledger financeiro mantidos (compliance/contábil) com PII reduzida                                                                                                                           |
| **Comunicação**            | Apenas e-mails transacionais (sem marketing sem consentimento)                                                                                                                                             |

### Dados da loja (PII)

| Dado                               | Onde                             | Notas                                             |
| ---------------------------------- | -------------------------------- | ------------------------------------------------- |
| Nome, email, telefone do comprador | `orders.customer_*`              | Também em convidados                              |
| Endereço completo                  | `orders.shipping_address` JSONB  | CEP, rua, número, bairro, cidade, UF              |
| Rastreio                           | `tracking_code` / `tracking_url` | Limpo no delete LGPD                              |
| Avaliação                          | `product_reviews`                | Autor público só como "Cliente" ou nome de membro |
| Crédito                            | `store_credits` / ledger         | Restaurado se pedido cancela/falha/reembolsa      |

### Compra de convidado adotada pela conta (migration 023)

O checkout aceita compra sem login, e esse pedido nasce com `user_id NULL` — ou
seja, invisível em "Minhas compras" mesmo para quem depois cria conta com o
**mesmo e-mail**. A adoção liga os dois, mas só com **e-mail verificado**:

- O pedido carrega endereço e telefone. Casar por e-mail sem prova de posse
  deixaria qualquer pessoa se cadastrar com o e-mail alheio e ler esses dados —
  vazamento de dado pessoal, não conveniência.
- A checagem `users.email_verified = TRUE` está **dentro do SQL** do `UPDATE`,
  não no chamador, para que nenhum caminho novo consiga pular a prova.
- Trocar o e-mail da conta zera `email_verified`, então não dá para usar a troca
  como atalho para adotar pedido de terceiro.
- Enquanto não verifica, a loja mostra quantas compras estão esperando e o botão
  de reenviar a confirmação — o cliente sabe que o pedido existe.

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

| Secret                            | Uso                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `VPS_HOST`                        | Endereço do servidor para deploy                                               |
| `VPS_USER`                        | Usuário SSH                                                                    |
| `VPS_SSH_KEY`                     | Chave privada SSH                                                              |
| ~~`VITE_STRIPE_PUBLISHABLE_KEY`~~ | Removida: a chave pública da Pagar.me vem de `GET /payments/config` em runtime |
| `VITE_PIX_KEY`                    | Chave PIX (injetada no build)                                                  |

## Contatos

- **Incidentes de segurança**: contato@geeketoys.com.br
- **ANPD (vazamento de dados)**: www.gov.br/anpd
- **Status da Pagar.me**: status.pagar.me
