# Arquitetura Tecnica - Clube GeekPop & Toys

> **Ultima atualizacao:** 10 de Agosto de 2026

## 1. Visao Geral do Sistema

O Clube GeekPop & Toys opera duas stacks independentes compartilhando a mesma VPS:

| Stack               | Diretorio na VPS        | Proposito                                                                  |
| ------------------- | ----------------------- | -------------------------------------------------------------------------- |
| **Clube SaaS**      | `/opt/clube-geek-toys/` | Plataforma de assinatura, loja e-commerce, PDV, admin, carteirinha digital |
| **Radio AzuraCast** | `/opt/azuracast/`       | Radio online com painel de gestao e streaming                              |

Ambas sao orquestradas via Docker Compose. Um unico Nginx atua como reverse proxy e faz terminacao SSL (Let's Encrypt) para todos os dominios. O certificado unico cobre todos os subdominios via SAN.

```
 Navegador                       VPS (Ubuntu 24.04 + Docker)
 ─────────                 ┌──────────────────────────────────────────────┐
                           │                                              │
  club.*  ─────────┐       │  ┌──────────────────────────────────────┐    │
  admin.* ─301→adm  ┤       │  │         Nginx (80/443)               │    │
  adm.*   ─────────┤       │  │  SSL termination + Reverse Proxy     │    │
  shop.*  ─────────┤──────►│  │  Security headers (HSTS, nosniff)    │    │
  api.*   ─────────┤       │  │  (mesmo bundle SPA; getAppMode())    │    │
  analytics.* ─────┤       │  └──┬──────┬──────┬──────┬──────────────┘    │
  radio.* ─────────┘       │     │      │      │      │                   │
                           │     ▼      ▼      ▼      ▼                   │
                           │  ┌─────┐┌─────┐┌─────┐┌──────────┐          │
                           │  │ SPA ││ API ││Umami││AzuraCast │          │
                           │  │dist/││:3001││:3000││  :80     │          │
                           │  └─────┘└──┬──┘└──┬──┘└──────────┘          │
                           │            │      │                          │
                           │      ┌─────┴──┐┌──┴───┐                     │
                           │      │Postgres││umami-│                     │
                           │      │ :5432  ││ db   │                     │
                           │      └────────┘└──────┘                     │
                           │                                              │
                           │  ┌──────────┐                                │
                           │  │ Certbot  │  Auto-renovacao SSL            │
                           │  └──────────┘                                │
                           └──────────────────────────────────────────────┘
                                      │                │
                                ┌─────┴──────┐  ┌──────┴──────┐
                                │  Pagar.me  │  │   Resend    │
                                │ (payments) │  │  (emails)   │
                                └────────────┘  └─────────────┘
```

---

## 2. Stack Tecnologico

### Frontend

| Tecnologia             | Versao | Uso                                                  |
| ---------------------- | ------ | ---------------------------------------------------- |
| React                  | 19     | SPA com subdomain routing                            |
| Vite                   | 7      | Build tooling, code splitting, HMR                   |
| Tailwind CSS           | 3      | Estilizacao utility-first                            |
| TanStack Query         | 5      | Cache de estado do servidor                          |
| Framer Motion          | 12     | Animacoes (flip da carteirinha, transicoes)          |
| React Hook Form + Zod  | 7 / 4  | Formularios com validacao tipada                     |
| qrcode.react           | 4      | QR Code da carteirinha digital                       |
| signature_pad          | 5      | Captura de assinatura digital no canvas              |
| pdf-lib                | 1.17   | Geracao de PDF do contrato no client-side            |
| (sem SDK de pagamento) | —      | O cartao e tokenizado por `fetch` direto na Pagar.me |
| React Router           | 7      | Roteamento SPA                                       |
| Recharts               | 2      | Graficos no painel admin                             |
| Lucide React           | -      | Icones                                               |

### Backend

| Tecnologia         | Versao              | Uso                                                      |
| ------------------ | ------------------- | -------------------------------------------------------- |
| Node.js            | 22 (runtime Docker) | Runtime do servidor                                      |
| Express            | 4                   | Framework HTTP                                           |
| PostgreSQL         | 16 (Alpine)         | Banco principal (pg driver)                              |
| JWT (jsonwebtoken) | 9                   | Autenticacao stateless                                   |
| bcrypt             | 5                   | Hash de senhas (12 rounds)                               |
| node-cron          | 3                   | Tarefas agendadas                                        |
| Zod                | 3                   | Validacao de entrada em todos os endpoints               |
| Stripe SDK         | 22                  | **Legado**: so estorno de cobranca anterior a 01/09/2026 |
| Helmet             | 8                   | Security headers                                         |
| multer             | 1.4                 | Upload de arquivos (contratos)                           |

### Infraestrutura

| Tecnologia     | Uso                                                          |
| -------------- | ------------------------------------------------------------ |
| Docker Compose | Orquestracao de containers                                   |
| Nginx Alpine   | Reverse proxy, SSL, SPA serving                              |
| Certbot        | Emissao e renovacao automatica de certificados Let's Encrypt |
| GitHub Actions | CI/CD — build + deploy automatico no push pra `master`       |

### Servicos Externos

| Servico                 | Uso                                            |
| ----------------------- | ---------------------------------------------- |
| Pagar.me (API v5)       | Cartao, PIX dinamico e assinaturas recorrentes |
| Resend API              | Envio transacional de emails (22 templates)    |
| Umami (self-hosted)     | Analytics de navegacao e eventos               |
| AzuraCast (self-hosted) | Radio online (Liquidsoap + Icecast)            |

---

## 3. Diagrama de Rede Docker

O Nginx do clube participa de **duas redes Docker** simultaneamente:

```
┌──────────────────────────────────────────────────────────────┐
│                    server_default (rede interna)              │
│                                                              │
│  ┌───────┐  ┌──────┐  ┌──────────┐  ┌───────┐  ┌────────┐  │
│  │ nginx │  │ api  │  │ postgres │  │ umami │  │umami-db│  │
│  │ 80/443│  │ 3001 │  │  5432    │  │ 3000  │  │  5432  │  │
│  └───┬───┘  └──────┘  └──────────┘  └───────┘  └────────┘  │
│      │                                                       │
└──────┼───────────────────────────────────────────────────────┘
       │
       │  (nginx tambem conecta na rede externa)
       │
┌──────┼───────────────────────┐
│      ▼    azuracast_network  │
│  ┌──────────┐    (external)  │
│  │azuracast │                │
│  │   :80    │                │
│  └──────────┘                │
└──────────────────────────────┘
```

**Ordem de inicializacao importa:** a rede `azuracast_network` e criada pelo compose do AzuraCast. Se o AzuraCast nao estiver rodando quando o nginx do clube subir, a rede externa nao existe e o nginx falha ao iniciar.

O Nginx resolve `http://azuracast:80` pelo DNS interno do Docker para fazer proxy do painel da radio.

Streams Icecast nas portas `8000-8046` sao expostas diretamente no host (bypass do nginx), porque Icecast nao suporta HTTP upgrade necessario para proxy.

---

## 4. Fluxo de Autenticacao (JWT)

```
  ┌──────────┐     POST /auth/login      ┌─────────────┐
  │  Login   │ ─────────────────────────► │   bcrypt    │
  │  Form    │                            │   verify    │
  └──────────┘                            └──────┬──────┘
                                                  │
                                           ┌──────┴──────┐
                                           │ Gera tokens: │
                                           │ • access     │
                                           │ • refresh    │
                                           └──────┬──────┘
                                                  │
                               ┌──────────────────┴──────────────────┐
                               ▼                                     ▼
                       ┌──────────────┐                    ┌──────────────┐
                       │   Response:  │    (15min expira)  │ POST /auth   │
                       │   tokens +   │ ──────────────────►│  /refresh    │
                       │   user data  │                    └──────┬───────┘
                       └──────────────┘                           │
                                                           ┌──────┴──────┐
                                                           │ Novo access │
                                                           │ + refresh   │
                                                           │ (rotacao)   │
                                                           └─────────────┘
```

### Detalhes

| Aspecto                  | Implementacao                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Access token**         | JWT assinado com HS256, payload `{ userId, email, role }`, expira em **15 minutos**                                                     |
| **Refresh token**        | 64 bytes aleatorios (crypto.randomBytes), hash SHA-256 armazenado na coluna `users.refresh_token_hash`, validade efetiva de **30 dias** |
| **Rotacao**              | A cada refresh, o token antigo e invalidado e um novo par e emitido                                                                     |
| **Cookie**               | Refresh token enviado como httpOnly cookie (sameSite: lax)                                                                              |
| **Hash de senha**        | bcrypt com 12 rounds                                                                                                                    |
| **RBAC**                 | Middleware `requireRole()` verifica `role` do JWT antes de permitir acesso                                                              |
| **Roles**                | `member`, `seller`, `admin`, `disabled`                                                                                                 |
| **Google OAuth**         | Verificacao de ID token via endpoint `oauth2.googleapis.com/tokeninfo`, com validacao de `audience`                                     |
| **Verificacao de email** | Token HMAC com TTL de 24h, uso unico via tabela `consumed_verification_tokens`                                                          |

---

## 5. Fluxo de Cadastro (3 etapas)

O cadastro e dividido em 3 etapas sequenciais. O usuario pode interromper e retomar de onde parou (deteccao de etapa ja concluida). Dados parciais sao salvos em `localStorage` como rascunho.

### Etapa 1: Conta + Dados Pessoais

1. Criar conta com email + senha **ou** Google OAuth
2. Verificar email (link HMAC com validade de 24h)
3. Preencher dados pessoais: nome completo, CPF (validado), telefone
4. Confirmar a assinatura do plano unico mensal (Clube GeekPop & Toys, R$ 12,50/mes) — sem selecao de tier nem de frequencia

### Etapa 2: Contrato Digital

1. Exibir termos do contrato para leitura
2. Coletar assinatura manuscrita via canvas HTML5 (`signature_pad`)
3. Gerar PDF no client-side com `pdf-lib`, incluindo:
   - Texto do contrato
   - Imagem da assinatura
   - Metadados: IP, user-agent, timestamp, hash SHA-256
4. Upload do PDF para o servidor (`/app/uploads/contracts/`)
5. Email com PDF anexado para o membro + copia para o admin

### Etapa 3: Pagamento

1. Escolher metodo: PIX (QR Code da Pagar.me) ou Cartao (formulario proprio, token da Pagar.me)
2. Processar pagamento (ver secao 6)
3. Membro ativado apos confirmacao

### Protecoes

- **Deteccao de usuario retornando:** ao fazer login, o frontend verifica quais etapas ja foram concluidas e pula automaticamente
- **Rascunho auto-save:** `localStorage` persiste dados parciais do formulario
- **Protecao contra envio duplo:** `findRecentPayment()` verifica se existe pagamento pago nos ultimos 7 dias antes de criar outro

---

## 6. Fluxo de Pagamento

> Migracao Stripe → **Pagar.me** concluida em 01/09/2026. Detalhes de operacao,
> credenciais e webhook em [`PAGARME.md`](PAGARME.md).

### 6.1 Cartao de Credito (Pagar.me)

O cartao e trocado por um `card_token` **no navegador**, direto com a Pagar.me,
usando a chave publica. A autorizacao e **sincrona**: nao existe `clientSecret`
para resgatar, a chamada ja volta com o resultado.

```
  Frontend                         API                        Pagar.me
  ────────                     ────────                       ────────
     │                            │                              │
     │  POST api.pagar.me/tokens?appId=pk_...                    │
     │───────────────────────────────────────────────────────────►│
     │      { id: "token_..." }   │                              │
     │◄───────────────────────────────────────────────────────────│
     │  (o cartao NUNCA passa pelo nosso servidor)               │
     │                            │                              │
     │  POST /orders              │                              │
     │───────────────────────────►│  pedido `pending`,           │
     │      { order, requiresCard }  estoque segurado            │
     │◄───────────────────────────│                              │
     │                            │                              │
     │  POST /orders/:id/pay-card │                              │
     │  { card_token, installments}                              │
     │───────────────────────────►│  POST /orders (credit_card)  │
     │                            │─────────────────────────────►│
     │                            │◄─────────────────────────────│
     │      { status: 'paid' }    │  autorizado na hora          │
     │◄───────────────────────────│                              │
     │                            │  webhook: charge.paid        │
     │                            │◄─────────────────────────────│
     │                            │  baixa estoque, e-mails      │
```

**Por que duas etapas.** Nada precisa ser preparado antes, entao separar
`POST /orders` de `POST /orders/:id/pay-card` existe por outro motivo: uma
recusa vira **retentativa no mesmo pedido**, com o mesmo estoque segurado e o
mesmo cupom. Cancelar o pedido na recusa foi o que uma vez fez a segunda
tentativa cair num pedido morto — dinheiro capturado, estoque nunca baixado.

O clube usa o mesmo token em `POST /checkout/card/create`, em uma unica chamada
(nao ha estoque a segurar).

**Recusa** volta como **402** com o motivo do banco ja traduzido, a partir do
`acquirer_return_code`. A linha e gravada como `failed`, nao deixada `pending`.

### 6.2 PIX (Pagar.me, confirmacao automatica)

O QR e **dinamico**, emitido e conciliado pela Pagar.me. Isto substituiu o BR
Code estatico que geravamos localmente e que provedor nenhum vigiava: o cliente
pagava e o pedido ficava `pending` ate alguem conferir o extrato.

```
  Frontend                        API                        Pagar.me
  ────────                    ────────                       ────────
     │                           │                              │
     │  POST /pix/create         │  POST /orders (pix)          │
     │──────────────────────────►│─────────────────────────────►│
     │                           │◄─────────────────────────────│
     │   { pixData, paymentId }  │  guarda qr_code e expires_at │
     │◄──────────────────────────│                              │
     │  Exibe QR Code            │                              │
     │                           │                              │
     │  (cliente paga no app do banco)                          │
     │                           │                              │
     │                           │  webhook: charge.paid        │
     │                           │◄─────────────────────────────│
     │                           │  RELE a cobranca na API      │
     │                           │─────────────────────────────►│
     │                           │  activateMember() / baixa    │
     │                           │  estoque + e-mails           │
     │                           │                              │
     │  GET /payment/status/:id  │  se `pending`, consulta a    │
     │──────────────────────────►│  cobranca direto na Pagar.me │
     │   { mapped_status: 'paid' }  (so leitura)                │
     │◄──────────────────────────│                              │
```

**Fluxo detalhado:**

1. API cria uma order `pix` na Pagar.me e **guarda** `qr_code`, `qr_code_url` e
   `expires_at` na linha — o codigo carrega o txid do provedor e nao da para
   reconstruir depois
2. Frontend exibe o QR; a equipe recebe um aviso de "aguardando", nao uma tarefa
3. O cliente paga; a Pagar.me concilia e dispara `charge.paid`
4. O processador **confere Basic auth e rele a cobranca na API** antes de
   liquidar — a v5 nao assina o corpo
5. Pedido vira `paid`, estoque baixa, e-mails saem

O polling continua existindo, mas so para a tela virar no segundo em que o
dinheiro cai: ele **reporta**, quem aplica efeito e o webhook.

`confirmPixOrder` / `confirmPixPayment` seguem no painel como excecao — para os
codigos anteriores a migracao e para o webhook que nao chega.

### 6.3 Assinatura Recorrente (Pagar.me)

```
  Frontend                        API                         Pagar.me
  ────────                    ────────                        ────────
     │                           │                              │
     │  tokeniza o cartao (pk_)  │                              │
     │──────────────────────────────────────────────────────────►│
     │                           │                              │
     │ POST /subscription/create │  POST /subscriptions         │
     │  { card_token }           │  billing_type: prepaid       │
     │──────────────────────────►│─────────────────────────────►│
     │  { status, cardBrand,     │◄─────────────────────────────│
     │    cardLastFour }         │                              │
     │◄──────────────────────────│                              │
     │                           │                              │
     │                           │  webhook: invoice.paid       │
     │                           │◄─────────────────────────────│
     │                           │  estende expiry_date         │
     │                           │  ESPELHA a fatura em         │
     │                           │  `payments` (relatorios)     │
     │                           │  email: subscription-payment │
```

A Pagar.me guarda o cartao e cobra sozinha. **Nao ha `clientSecret`**: a
primeira cobranca e autorizada na hora, e a chamada volta com o resultado.

**Ciclo de vida da assinatura:**

| Evento                                        | Acao                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `POST /subscription/create`                   | Cria a assinatura com `card_token`; valor e intervalo **travados no servidor** (`CLUB_PLAN_*`)           |
| `invoice.paid` (webhook)                      | Estende `expiry_date`, zera `failed_payments`, grava `next_payment_date`, espelha em `payments`, e-mail  |
| `invoice.payment_failed`                      | Incrementa `failed_payments`, e-mail `subscription-payment-failed`                                       |
| 3 falhas consecutivas                         | Cancela na operadora e no banco, e-mail `subscription-cancelled`                                         |
| `PUT /subscription/:id/pause`                 | **Cancela a recorrencia na Pagar.me** (eles nao tem pause) e mantem a linha `paused`                     |
| `PUT /subscription/:id/resume`                | `RESUME_REQUIRES_CARD` — pede o cartao de novo, porque a recorrencia foi encerrada la                    |
| `PUT /subscription/:id/cancel`                | Cancela na operadora, status `cancelled`, `auto_renewal = FALSE`, e-mail                                 |
| `PUT /subscription/:id/update-payment-method` | Aponta a recorrencia para um novo `card_token` **sem mexer no ciclo** — o membro nao perde os dias pagos |
| `subscription.canceled` (webhook)             | Cancelamento externo (painel da Pagar.me); a guarda em `subscription_status` evita o e-mail duplicado    |

> Assinaturas anteriores a 01/09/2026 continuam no Stripe. Quem decide o ramo e
> a coluna `subscriptions.provider` — `NULL` significa Stripe.

## 7. Loja E-commerce (`shop.geeketoys.com.br`)

A loja e servida pelo **mesmo bundle Vite** do SPA. O subdominio e detectado em runtime por `getAppMode()` (`src/lib/subdomain.ts`): `shop.*` renderiza a loja, `admin.*`/`adm.*` renderiza o admin, e o restante renderiza a area de membro. Em desenvolvimento, `?subdomain=shop` forca o modo loja no localhost.

### Fluxo de compra

```
  Loja (shop.*)                    API                          Pagar.me
  ─────────────                ────────                       ────────────────
     │                            │                              │
     │  Catalogo publico          │  GET /products?sort=&page=   │
     │  (ORDER BY + LIMIT/OFFSET) │  GET /products/:slug         │
     │───────────────────────────►│                              │
     │                            │                              │
     │  Carrinho (localStorage)   │                              │
     │  CartContext               │                              │
     │                            │                              │
     │  POST /orders (checkout)   │                              │
     │───────────────────────────►│  createOrder():              │
     │  channel=retail|wholesale  │   • retail: member_10 se ativo│
     │                            │   • wholesale: approved CNPJ  │
     │                            │     → wholesale_25 (25%)      │
     │                            │   • frete HMAC revalidado     │
     │                            │   • cria PaymentIntent/PIX     │
     │   { order, clientSecret }  │     (metadata.kind=shop_order) │
     │◄───────────────────────────│                              │
     │                            │                              │
     │  Cartao: POST /pay-card    │  webhook: charge.paid        │
     │  PIX: exibe QR + polling   │           succeeded          │
     │                            │◄─────────────────────────────│
     │                            │  marca pedido paid + baixa    │
     │                            │  estoque + email order-confirmed│
     │                            │                              │
     │  PIX de loja:              │  POST /orders/:id/confirm-pix│
     │                            │◄──────────────────── Admin ──│
```

### Desconto de membro (server-side)

O desconto de **10%** so e aplicado quando ha um membro **ativo** autenticado no checkout **no canal retail**. O backend nunca confia no valor enviado pelo cliente:

- `order.service` resolve o `member_id` do usuario autenticado e verifica `status = 'active'` e `expiry_date >= CURRENT_DATE`
- Se valido, calcula `discount = subtotal * 0.10` e grava `discount_reason = 'member_10'`; caso contrario, `discount = 0`
- Constante `MEMBER_SHOP_DISCOUNT = 0.10` em `server/api/src/types/index.ts`

### Canal Atacado B2B (`/atacado`)

Aba dedicada no mesmo host `shop.*`. Detalhes operacionais: [`WHOLESALE.md`](WHOLESALE.md).

- Cadastro: `POST /wholesale/register` (CNPJ validado + empresa + atividade)
- Login: `POST /wholesale/login` (email + senha + **CNPJ que confere**)
- Admin: `GET/PATCH /wholesale/accounts` (aprovar / recusar / desativar)
- Catalogo: `GET /products?wholesale=true` (so `wholesale_enabled`); mesma `?sort=` da loja
- Checkout: `channel=wholesale` + `cnpj` → `WHOLESALE_SHOP_DISCOUNT = 0.25` (`wholesale_25`)
- Carrinho separado em `localStorage` (`clube_geek_shop_cart_wholesale`)
- Schema: migration **012** + `ensureSchema` no boot da API

### Estoque

Duas contas, nao uma. `stock` e o fisico (o que esta na prateleira) e `reserved`
e o que pedidos pendentes ja seguram. A loja vende contra a diferenca.

- Produtos sao travados (`SELECT ... FOR UPDATE`) durante a criacao do pedido; a validacao usa **`stock - reserved`**, nao `stock`
- A **reserva** e criada na mesma transacao do pedido (`reserveStockForOrder`). Sem ela, a ultima unidade continuaria a venda durante as horas ate a confirmacao manual do PIX, e dois clientes pagariam pela mesma peca
- O estoque so e **baixado apos a confirmacao do pagamento** (webhook `payment_intent.succeeded` ou confirmacao manual de PIX), via `decrementStockForOrder()`, que **consome a reserva** antes de decrementar — as unidades deixam de ser reservadas no mesmo instante em que deixam de existir
- A reserva volta em quatro caminhos: cancelamento pelo cliente, cancelamento/estorno pelo admin, falha ao criar a cobranca, e **TTL** (`STOCK_RESERVATION_TTL_HOURS`, padrao 24h) varrido pelo cron diario. A flag `orders.stock_reserved` e virada na mesma instrucao que reclama a liberacao, entao um cancelamento duplo libera uma vez so
- O TTL **nao cancela o pedido**: soltar a reserva nao e decidir que a venda morreu. Um PIX atrasado ainda pode ser confirmado
- `stock` tem `CHECK (stock >= 0)`, entao a baixa trunca em zero. O truncamento e medido **antes** do UPDATE: quando falta estoque, sai um `stock_movements` de ajuste ("Venda a descoberto: N unidade(s)") e um `auditLog('order.oversold')`. Antes disso a venda a descoberto sumia na diferenca entre dois numeros

### Imagens de produto

Imagens sao enviadas por `POST /products/:id/images` (multipart) e armazenadas no volume `/uploads`, servidas publicamente pelo nginx via `api.geeketoys.com.br`. No painel, o admin recorta e escolhe o tamanho (px) no cliente antes do multipart; fotos 4K continuam sendo redimensionadas automaticamente.

---

## 8. Ciclo de Vida do Membro

```
                    ┌───────────────────────────────────────┐
                    │                                       │
                    ▼                                       │
  ┌─────────┐   pagamento   ┌────────┐   expiry_date   ┌────────┐
  │ pending │──────────────►│ active │──────────────►│expired │
  └─────────┘   confirmado  └────┬───┘   (cron)       └────┬───┘
                                 │                          │
                                 │ renovacao                │ novo
                                 │ (preserva dias)          │ pagamento
                                 │                          │
                                 ▼                          ▼
                            ┌────────┐              ┌────────┐
                            │ active │              │ active │
                            │(expiry │              │(fresh  │
                            │extended)│              │start)  │
                            └────────┘              └────────┘
```

| Transicao                        | Condicao                                | Comportamento                                                                        |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `pending` -> `active`            | Pagamento confirmado (webhook ou admin) | Define `start_date`, calcula `expiry_date` (+1 mes, plano mensal)                    |
| `active` -> `active` (renovacao) | Pagamento enquanto ainda ativo          | Estende `expiry_date` a partir da data de expiracao atual (nao perde dias restantes) |
| `active` -> `expired`            | `expiry_date < hoje` + cron diario      | Marca `status = 'expired'`, envia email `member-expired`                             |
| `expired` -> `active`            | Novo pagamento                          | Fresh start: `expiry_date` calculado a partir de hoje                                |
| Assinatura ativa                 | `auto_renewal = TRUE`                   | Nao expira pelo cron (a Pagar.me cobra sozinha e estende via webhook `invoice.paid`) |
| Assinatura pausada               | `subscription_status = 'paused'`        | Cron pode expirar normalmente (nao ha cobranca enquanto pausada)                     |

---

## 9. Contrato Digital

O contrato digital segue conformidade com a **Lei 14.063/2020** (assinaturas eletronicas).

### Fluxo

1. Frontend exibe termos do contrato para leitura obrigatoria
2. Membro desenha assinatura em canvas HTML5 (`signature_pad`)
3. Frontend gera PDF com `pdf-lib`, embutindo:
   - Texto integral do contrato
   - Imagem da assinatura
   - Metadados de evidencia
4. PDF enviado para o servidor via upload (`multer`)
5. Servidor armazena em `/app/uploads/contracts/` (volume Docker `uploads`)
6. Email com PDF anexado enviado para o membro
7. Copia do email enviada para o admin

### Metadados de Evidencia

| Campo           | Descricao                            |
| --------------- | ------------------------------------ |
| `ip_address`    | IP do signatario (via `trust proxy`) |
| `user_agent`    | Navegador e sistema operacional      |
| `signed_at`     | Timestamp com timezone (TIMESTAMPTZ) |
| `document_hash` | SHA-256 do conteudo do PDF           |
| `pdf_hash`      | SHA-256 do arquivo PDF armazenado    |

### Status do Contrato

- `active` — contrato vigente
- `superseded` — substituido por versao mais recente (upgrade de plano)
- `revoked` — revogado administrativamente

---

## 10. Carteirinha Digital

A carteirinha digital e renderizada inteiramente no frontend (`MembershipCard`) com proporcoes de cartao de credito (1.586:1).

**Design de marca (alvo):** gradiente metalico **rosa → amarelo** (`#F04080` / `#FCBE04`), nao roxo. Ver [`DESIGN.md`](DESIGN.md) §7.

### Frente

- Gradiente metalico pop da marca GeekPop & Toys (rosa / amarelo)
- Icone de chip inteligente (smart chip)
- Icone de pagamento contactless (NFC)
- Efeito holografico com shimmer animado (CSS)
- Nome do membro, plano, data de validade

### Verso

- QR Code gerado com `qrcode.react` contendo dados do membro em formato JSON v1:
  ```json
  {
    "v": 1,
    "id": "uuid",
    "name": "Nome Completo",
    "plan": "club",
    "status": "active",
    "expiry": "2027-04-19"
  }
  ```
- Informacoes do clube

### Interacao

- Animacao de flip 3D (CSS transform / perspectiva) ao clicar — rotacao de 180 graus

> **Gap conhecido:** o codigo ainda usa gradiente roxo (`#6d28d9` / `#7c3aed`) e `CLUB_PLAN.color = '#7c3aed'`. Alinhamento documentado em [`DESIGN.md`](DESIGN.md) §6.

---

## 11. Emails (22 templates)

Todos os emails usam a API do **Resend** com templates HTML inline renderizados server-side.

**Design de marca (alvo):** dark-theme com **Hot Pink** `#F04080` (primary) + **Pop Yellow** `#FCBE04` (accent), fundo `#0a0a1a` / `#0D0D0D`, wordmark **GeekPop & Toys**. Ver [`DESIGN.md`](DESIGN.md) §5.6.

> **Gap conhecido:** o shell atual em `email.service.ts` ainda usa dourado `#d4a520` e o wordmark "GEEK & TOYS". Migrar para a paleta oficial no mesmo PR de design.

| #   | Template                      | Gatilho                                                           |
| --- | ----------------------------- | ----------------------------------------------------------------- |
| 1   | `verify-email`                | Apos registro de conta — link HMAC valido por 24h                 |
| 2   | `password-reset`              | Solicitacao de redefinicao de senha — link valido por 1h          |
| 3   | `welcome`                     | Primeira ativacao do membro (pagamento confirmado)                |
| 4   | `payment-confirmed`           | Qualquer pagamento confirmado (cartao ou PIX)                     |
| 5   | `payment-failed`              | Cobranca recusada (`charge.payment_failed`)                       |
| 6   | `subscription-created`        | Assinatura recorrente criada                                      |
| 7   | `subscription-payment`        | Cobranca recorrente processada (`invoice.paid`)                   |
| 8   | `subscription-paused`         | Membro pausou assinatura                                          |
| 9   | `subscription-resumed`        | Membro reativou assinatura                                        |
| 10  | `subscription-cancelled`      | Cancelamento (manual ou apos 3 falhas)                            |
| 11  | `subscription-payment-failed` | Falha na cobranca recorrente (`invoice.payment_failed`)           |
| 12  | `renewal-reminder`            | Cron: 5-8 dias antes da expiracao (apenas `auto_renewal = FALSE`) |
| 13  | `member-expired`              | Cron: membro marcado como expirado                                |
| 14  | `order-confirmed`             | Pedido de loja pago (webhook ou confirmacao manual de PIX)        |
| 15  | `contract-signed`             | Apos assinatura do contrato digital — PDF anexado                 |
| 16  | `admin-pix-pending`           | Pagamento PIX gerado — notifica admin para confirmacao manual     |
| 17  | `admin-new-member`            | Novo membro completou cadastro                                    |
| 18  | `order-shipped`               | Admin salvou o codigo de rastreio — pedido vai para `shipped`     |
| 19  | `question-answered`           | Admin respondeu uma pergunta na pagina do produto                 |
| 20  | `admin-pix-order-pending`     | Pedido de loja gerou PIX — notifica admin para confirmacao manual |
| 21  | `admin-order-cancelled`       | Cliente cancelou um pedido ainda nao pago                         |
| 22  | `admin-daily-digest`          | Cron 6h UTC: filas do Painel do dia, so quando ha pendencia       |

### Deduplicacao

Emails de cron (templates 12-13) usam query `NOT EXISTS` contra `email_logs` para evitar envio duplicado dentro de uma janela de 5-7 dias. O digest (22) usa a mesma tabela com janela de **um dia**, para que um restart do container nao mande a segunda copia.

---

## 12. Cron Jobs (diario, 6:00 AM UTC)

Todos executados sequencialmente pelo `node-cron` dentro do container da API. Cada job e independente — falha em um nao impede execucao dos demais.

| #   | Job                    | Descricao                                                                                                                                                                                        |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `sendRenewalReminders` | Envia `renewal-reminder` para membros ativos com `expiry_date` entre 5-8 dias no futuro e `auto_renewal = FALSE`. Deduplicado via `email_logs`.                                                  |
| 2   | `expireMembers`        | Marca `active` -> `expired` para membros com `expiry_date < hoje` **e** (`auto_renewal = FALSE` **ou** `subscription_status = 'paused'`). Nao expira assinaturas ativas. Envia `member-expired`. |

Apos todos os jobs, registra `last_cron_run` na tabela `config` para monitoramento de saude.

---

## 13. Banco de Dados (PostgreSQL 16)

### Tabelas

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│    users     │     │   members    │     │    payments      │
├──────────────┤     ├──────────────┤     ├──────────────────┤
│ id (UUID PK) │◄────│ user_id (FK) │     │ id (UUID PK)     │
│ email (UQ)   │     │ cpf (UQ)     │     │ member_id (FK)   │
│ password_hash│     │ full_name    │     │ amount           │
│ role (enum)  │     │ email        │     │ method (enum)    │
│ email_verified│    │ phone        │     │ status (enum)    │
│ refresh_token│     │ plan ('club')│     │ provider_id      │
│  _hash       │     │ status (enum)│     │ provider_status  │
│ created_at   │     │ payment_type │     │ reference        │
│ updated_at   │     │ start_date   │     │ paid_at          │
└──────────────┘     │ expiry_date  │     │ webhook_processed│
                     │ pending_     │     │  _at             │
                     │  payment     │     │ created_at       │
                     │  (JSONB)     │     │ updated_at       │
                     │ subscription_│     └──────────────────┘
                     │  id          │
                     │ auto_renewal │
                     │ stripe_      │
                     │  customer_id │
                     │ payment_count│
                     │ activated_at │
                     │ created_at   │
                     │ updated_at   │
                     └──────┬──────┘
                            │
                   ┌────────┴────────┐
                   │                 │
            ┌──────┴───────┐  ┌──────┴────────┐
            │subscriptions │  │  contracts    │
            ├──────────────┤  ├───────────────┤
            │ id (TEXT PK) │  │ id (TEXT PK)  │
            │ member_id FK │  │ member_id FK  │
            │ provider_id  │  │ member_name   │
            │ status (enum)│  │ member_cpf    │
            │ plan         │  │ member_email  │
            │ frequency_   │  │ plan          │
            │  type (enum) │  │ signature_    │
            │ transaction_ │  │  preview      │
            │  amount      │  │ signed_at     │
            │ failed_      │  │ ip_address    │
            │  payments    │  │ user_agent    │
            │ card_last_   │  │ document_hash │
            │  four        │  │ pdf_url       │
            │ card_brand   │  │ pdf_path      │
            │ payer_email  │  │ pdf_hash      │
            │ created_at   │  │ status (enum) │
            │ cancelled_at │  │ created_at    │
            │ paused_at    │  └───────────────┘
            └──────┬──────┘
                   │
         ┌─────────┴──────────┐
         │subscription_       │
         │ payments           │
         ├────────────────────┤
         │ id (TEXT PK)       │
         │ subscription_id FK │
         │ member_id FK       │
         │ amount             │
         │ status             │
         │ payment_date       │
         │ provider_payment_id│
         │ failure_reason     │
         └────────────────────┘

Loja (migrations 009–012):

┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  categories  │     │    products      │     │     orders       │     │   order_items    │
├──────────────┤     ├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (UUID PK) │◄────│ id (UUID PK)     │◄────│ id (UUID PK)     │◄────│ id (UUID PK)     │
│ name         │     │ category_id (FK) │     │ order_number     │     │ order_id (FK)    │
│ slug (UQ)    │     │ name             │     │ member_id (FK)   │     │ product_id (FK)  │
│ description  │     │ slug (UQ)        │     │ user_id (FK)     │     │ product_name     │
│ active       │     │ price            │     │ customer_*       │     │ unit_price / qty │
│ sort_order   │     │ stock / images   │     │ subtotal/discount│     │ line_total       │
└──────────────┘     │ wholesale_enabled│     │ channel retail|  │     └──────────────────┘
                     │ wholesale_min_qty│     │   wholesale      │
                     │ weight / dims    │     │ customer_cnpj    │
                     │ rating_*         │     │ wholesale_acct FK│──┐
                     └──────────────────┘     │ shipping/track   │  │
                                              │ store_credit_app │  │
                                              └──────────────────┘  │
┌────────────────────┐                                             │
│ wholesale_accounts │◄────────────────────────────────────────────┘
├────────────────────┤
│ id (UUID PK)       │
│ user_id (UQ FK)    │
│ cnpj (UQ 14 dig)   │
│ company_name       │
│ contact_name       │
│ business_activity  │
│ status pending|    │
│   approved|…       │
└────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌───────────────────┐
│  audit_logs  │  │  email_logs  │  │processed_webhooks │
├──────────────┤  ├──────────────┤  ├───────────────────┤
│ id (UUID PK) │  │ id (UUID PK) │  │ webhook_key (PK)  │
│ action       │  │ member_id FK │  │ type              │
│ member_id FK │  │ template     │  │ action            │
│ user_id FK   │  │ recipient    │  │ data_id           │
│ details JSONB│  │ status       │  │ request_id        │
│ timestamp    │  │ resend_id    │  │ processed_at      │
└──────────────┘  │ error_message│  └───────────────────┘
                  │ sent_at      │
                  └──────────────┘

┌──────────────────────────┐  ┌──────────────┐  ┌──────────────────┐
│consumed_verification_    │  │  error_logs  │  │     config       │
│ tokens                   │  ├──────────────┤  ├──────────────────┤
├──────────────────────────┤  │ id (UUID PK) │  │ key (VARCHAR PK) │
│ token_hash (PK)          │  │ severity     │  │ value (JSONB)    │
│ user_id FK               │  │ message      │  │ updated_at       │
│ consumed_at              │  │ stack        │  └──────────────────┘
└──────────────────────────┘  │ source (enum)│
                              │ context JSONB│
                              │ user_id FK   │
                              │ url          │
                              │ user_agent   │
                              │ ip_address   │
                              │ created_at   │
                              └──────────────┘
```

**Total: 16 tabelas** no diagrama acima (o sistema de pontos foi removido na migration 008; as tabelas da loja `categories`/`products`/`orders`/`order_items` foram adicionadas na migration 009)

Tabelas acrescentadas depois, fora do diagrama:

| Tabela               | Migration | Papel                                                                    |
| -------------------- | --------- | ------------------------------------------------------------------------ |
| `wholesale_accounts` | 012       | Contas B2B com CNPJ e aprovação admin                                    |
| `product_variants`   | 013       | SKU por combinação de opções (preço, estoque, fotos próprias)            |
| `product_categories` | 014       | Produto ↔ categoria (até 5); `position 0` espelha `products.category_id` |
| `stock_movements`    | 015       | Livro-razão do estoque: venda, devolução e ajuste manual                 |
| `product_questions`  | 017       | Perguntas na PDP + resposta da loja                                      |
| `notifications`      | 017       | Avisos no perfil do cliente (ex.: pergunta respondida)                   |
| `customer_profiles`  | 020       | Dado pessoal de quem compra sem assinar (1:1 com `users`)                |

Migrations 016 e as colunas novas de `products` (`videos`, `low_stock_threshold`,
`has_variants`, `variant_axes`) não criam tabela. Detalhes em
[`CATALOG-2026-08.md`](CATALOG-2026-08.md).

As migrations **021** (`reserved` em produto/variação, `stock_reserved` e
`reservation_expires_at` em `orders`) e **022** (`cost_price` em produto/variação
e `unit_cost` em `order_items`) também são só colunas. `unit_cost` é fotografia
do custo no momento da venda: sem ela, um reajuste de fornecedor reescreveria a
margem de todos os meses anteriores.

### Como o schema chega em producao

O `docker-entrypoint-initdb.d` do Postgres so roda na **primeira** criacao do
volume, e migration manual por SSH e facil de esquecer. Entao o
`server/api/src/db/ensure-schema.ts` roda DDL idempotente no boot da API.

Desde 16/08/2026 sao **18 etapas nomeadas**, cada uma com seu proprio `try`
(as migrations vao ate a 019; a Wave 2.5 e so um comentario e nao gera etapa):

- Uma etapa que falha **nao cancela as seguintes** (antes era um `try` unico em
  volta de 460 linhas — a etapa 12 quebrando abortava as 13-18, em silencio,
  com a API servindo trafego e o `/health` respondendo `ok`)
- A API **nunca cai** por falha de schema; ela sobe degradada e avisa
- `GET /health` → `schema.status`: `pending` | `ok` | `degraded` + contagem
- `GET /logs/schema` (admin) → qual etapa falhou e por que
- O deploy espera sair de `pending` e **falha** se vier `degraded`

Regras ao acrescentar uma etapa: DDL idempotente (`IF NOT EXISTS`), nunca `DROP`
nem rename (isso e migration de verdade), e uma etapa nova por migration.

### Recursos do PostgreSQL

- **UUID** como primary keys (extensao `uuid-ossp` + `pgcrypto`)
- **CHECK constraints** em campos enum (`role`, `status`, `plan`, `method`, `type`, etc.)
- **Foreign keys** com `ON DELETE CASCADE` ou `ON DELETE SET NULL`
- **Indices otimizados** para queries frequentes (compostos, parciais, DESC para paginacao)
- **Triggers** `update_updated_at()` para auto-update de `updated_at` em `users`, `members`, `payments`, `categories`, `products`, `orders`
- **JSONB** para dados flexiveis (`details`, `pending_payment`, `context`, `value`)
- **Queries parametrizadas** em todos os acessos ($1, $2...) — prevencao de SQL injection

---

## 14. Middleware Pipeline

```
Request
  → Request ID (x-request-id ou UUID gerado)
  → Helmet (security headers, CSP)
  → Compression (gzip)
  → Morgan (access logs)
  → CORS whitelist
  → Body parser (JSON 15mb / raw para webhook)
  → Rate limiting (por endpoint)
  → JWT authentication (rotas protegidas)
  → Role check — requireRole() (RBAC)
  → Ownership check — requireOwnership() (membro so acessa seus proprios dados)
  → Zod validation (body / params / query)
  → Route handler
  → Error handler global (AppError com status code, mensagem e codigo)
Response
```

### Rate Limits

Os limites sao definidos por endpoint no middleware `rate-limit.ts`, com janelas e thresholds diferentes para rotas publicas (auth, registro) e protegidas (API geral).

---

## 15. CI/CD Pipeline

Acionado automaticamente no push para `master` via GitHub Actions (`.github/workflows/deploy.yml`).

```
  ┌────────────────────────────────────────────────────────────┐
  │                  GitHub Actions Runner                      │
  │                                                            │
  │  1. Checkout                                               │
  │  2. Setup Node.js 20 (com cache npm)                       │
  │  3. npm ci                                                 │
  │  4. npx tsc -b  (typecheck do codigo de producao)          │
  │  5. npx vite build --mode production                       │
  │     (injeta VITE_API_URL, VITE_STRIPE_PUBLISHABLE_KEY,     │
  │      VITE_PIX_KEY, VITE_ENVIRONMENT via env vars)          │
  │  6. Setup SSH (deploy key)                                 │
  │                                                            │
  │  6. rsync server/ → VPS:/opt/clube-geek-toys/server/       │
  │     (exclui node_modules, .env, scripts/)                  │
  │                                                            │
  │  7. rsync dist/ → VPS:/opt/clube-geek-toys/dist/           │
  │                                                            │
  │  8. SSH:                                                   │
  │     docker compose build --no-cache api                    │
  │     docker compose up -d --force-recreate api nginx        │
  │                                                            │
  │  9. Health check:                                          │
  │     curl https://api.geeketoys.com.br/health               │
  │     (usa dominio, nao IP — IP nao tem cert SAN)            │
  │     espera schema.status sair de `pending`;                │
  │     `degraded` reprova o deploy                            │
  └────────────────────────────────────────────────────────────┘
```

### Pontos de atencao

- **`tsc -b` antes do build (16/08/2026):** ate entao o CI rodava so `vite build`, que transpila sem checar tipo — erro de tipo em codigo de producao **nunca** barrou um deploy neste projeto. O `tsc -b` cobre `src/` sem os testes; a checagem dos testes e o `npm run typecheck`, de proposito fora do caminho do deploy
- **`--no-cache` no build da API:** qualquer mudanca em validacao de env (Zod) precisa ser testada localmente antes, senao a API entra em restart loop em producao
- **rsync de `server/` inclui `server/azuracast/`**, mas isso nao afeta o container do AzuraCast (que roda de `/opt/azuracast/`). A pasta no repo serve como fonte-verdade versionada
- **`--force-recreate`:** necessario porque `docker compose restart` nao re-le o `.env`
- **Timeout:** job limitado a 15 minutos

---

## 16. Containers Docker

| Container             | Imagem                   | Porta          | Funcao                          |
| --------------------- | ------------------------ | -------------- | ------------------------------- |
| `clube-geek-nginx`    | nginx:alpine             | 80/443 (host)  | Reverse proxy, SSL, SPA serving |
| `clube-geek-api`      | Build local (Dockerfile) | 3001 (interno) | API Express                     |
| `clube-geek-postgres` | postgres:16-alpine       | 127.0.0.1:5432 | Banco principal                 |
| `clube-geek-umami`    | umami:postgresql-latest  | 3000 (interno) | Analytics                       |
| `clube-geek-umami-db` | postgres:16-alpine       | 5432 (interno) | Banco do Umami                  |
| `clube-geek-certbot`  | certbot/certbot          | -              | Renovacao SSL a cada 12h        |

### Volumes

| Volume         | Conteudo                              |
| -------------- | ------------------------------------- |
| `pgdata`       | Dados do PostgreSQL                   |
| `uploads`      | Contratos PDF e uploads               |
| `umami-pgdata` | Dados do Umami                        |
| `certbot-etc`  | Certificados SSL (`/etc/letsencrypt`) |
| `certbot-www`  | Challenge ACME                        |

### Limites de Recursos

| Container | CPU     | Memoria |
| --------- | ------- | ------- |
| postgres  | 2 cores | 2 GB    |
| api       | 2 cores | 1 GB    |

---

## 17. Webhooks

### Pagar.me — `POST /webhook/pagarme`

`pagarme-webhook.service.ts`. E o que liquida dinheiro: sem ele, todo PIX fica
`pending` para sempre.

| Evento                                           | Acao                                                                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `charge.paid` / `order.paid`                     | **Rele a cobranca na API**; loja: pedido `paid` + baixa estoque + `order-confirmed`. Clube: ativa o membro + e-mails |
| `charge.payment_failed` / `order.payment_failed` | Registra a recusa. **Nao cancela o pedido** — o estoque segue segurado para a retentativa                            |
| `charge.refunded` / `charge.partial_canceled`    | Pedido `refunded`, devolve estoque e credito da loja                                                                 |
| `order.canceled`                                 | O unico evento que encerra um pedido: `cancelled`, libera a reserva, devolve o credito                               |
| `charge.chargedback` / `chargeback.received`     | **Nao muda o status** — chargeback precisa de decisao humana. Avisa por e-mail e no sino                             |
| `invoice.paid`                                   | Estende `expiry_date`, zera falhas, espelha em `payments`                                                            |
| `invoice.payment_failed`                         | Incrementa falhas; cancela na terceira                                                                               |
| `subscription.canceled`                          | Cancela a assinatura e espelha no membro                                                                             |

### Autenticidade

A Pagar.me v5 **nao assina o corpo**. Duas camadas:

1. **Basic auth** (`PAGARME_WEBHOOK_USER` / `PAGARME_WEBHOOK_PASSWORD`),
   comparada em tempo constante. Obrigatoria em producao pelo schema de env.
2. **Releitura da cobranca na API** antes de acreditar em qualquer evento de
   dinheiro. Um `charge.paid` forjado nao liquida nada.

Consulta que falha conta como "nao confirmado": o evento fica sem processar e a
Pagar.me reentrega.

### Idempotencia

1. **Claim atomico:** `INSERT INTO processed_webhooks ... ON CONFLICT DO NOTHING`
   dentro da **mesma transacao** dos efeitos
2. **Rollback completo:** falhou, o `ROLLBACK` desfaz o claim junto com os side
   effects — e por isso o endpoint responde **500**, para a operadora reentregar
3. **E-mails apos COMMIT:** enfileirados durante a transacao, enviados so depois

### Stripe — `POST /webhook/stripe` (legado)

Continua no ar para os eventos que cobrancas anteriores a 01/09/2026 ainda
emitem (`payment_intent.*`, `invoice.*`, `customer.subscription.deleted`), com a
mesma estrategia de idempotencia. A assinatura HMAC e verificada por
`stripe.webhooks.constructEvent()` sobre o body cru (`express.raw()`).
