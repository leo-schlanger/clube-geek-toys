# Pagamentos — Pagar.me (API v5)

Migração de **Stripe → Pagar.me**, concluída em **01/09/2026**. Cobre PIX, cartão
de crédito, assinatura recorrente do clube, estornos, chargebacks e os avisos de
pagamento para a equipe.

> **A mudança que mais se sente:** o PIX agora **confirma sozinho**. O código
> antigo era um BR Code estático gerado por nós, que provedor nenhum vigiava —
> o cliente pagava e o pedido ficava `pending` até alguém conferir o extrato e
> clicar em confirmar. A Pagar.me emite um PIX **dinâmico**, concilia a
> transferência e dispara `charge.paid` em segundos.

---

## 1. Credenciais e configuração

| Variável                         | Onde                     | Para quê                                                                 |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| `PAGARME_SECRET_KEY`             | `.env` da VPS            | Autentica a API (Basic, `sk_...:`). **Obrigatória em produção.**         |
| `PAGARME_PUBLIC_KEY`             | `.env` da VPS            | Servida em `GET /payments/config`; o navegador tokeniza o cartão com ela |
| `PAGARME_ACCOUNT_ID`             | `.env` da VPS            | Só registro (`acc_...`)                                                  |
| `PAGARME_API_URL`                | default                  | `https://api.pagar.me/core/v5`                                           |
| `PAGARME_WEBHOOK_USER`           | `.env` + painel Pagar.me | Basic auth do webhook. **Obrigatória em produção.**                      |
| `PAGARME_WEBHOOK_PASSWORD`       | `.env` + painel Pagar.me | idem                                                                     |
| `PAGARME_STATEMENT_DESCRIPTOR`   | default `GEEKPOPTOYS`    | O que o comprador lê na fatura (PSP: máx. 13 caracteres)                 |
| `PAGARME_MAX_INSTALLMENTS`       | default `6`              | Teto de parcelas                                                         |
| `PAGARME_MIN_INSTALLMENT_AMOUNT` | default `20`             | Piso por parcela, em reais                                               |
| `PAGARME_PIX_EXPIRES_IN`         | default `3600`           | Validade do QR, em segundos                                              |

O `env.ts` **recusa subir em produção** sem `PAGARME_SECRET_KEY` e sem o par
usuário/senha do webhook. A segunda regra existe porque o webhook é a única
coisa que marca um PIX como pago: um endpoint sem autenticação em produção
deixaria qualquer um quitar um pedido de graça.

**A chave pública não é mais assada no build.** Ela vem de
`GET /payments/config` a cada carregamento do checkout — uma chave rotacionada
na VPS passa a valer sem deploy do frontend. O secret `VITE_STRIPE_PUBLISHABLE_KEY`
saiu do workflow.

### Webhook no painel da Pagar.me

Cadastrar em **Configurações → Webhooks**:

- **URL**: `https://api.geeketoys.com.br/webhook/pagarme`
- **Autenticação**: usuário e senha — os mesmos de `PAGARME_WEBHOOK_USER` /
  `PAGARME_WEBHOOK_PASSWORD`
- **Eventos**: `charge.paid`, `charge.payment_failed`, `charge.refunded`,
  `charge.partial_canceled`, `order.paid`, `order.payment_failed`,
  `order.canceled`, `chargeback.received`, `invoice.paid`,
  `invoice.payment_failed`, `subscription.canceled`

`GET /health` mostra o estado em `payments`:

```json
{
  "provider": "pagarme",
  "configured": true,
  "publicKey": true,
  "webhookAuth": true,
  "status": "ok"
}
```

`status` vira `not_configured` sem a secret key e `webhook_unauthenticated` sem
as credenciais do webhook — os dois falham em silêncio no boot, por isso estão
no health.

---

## 2. Como o dinheiro anda

### PIX (loja e clube)

```
navegador → POST /orders            → cria o pedido, segura o estoque
          → API cria order na Pagar.me com payment_method: pix
          → guarda qr_code, qr_code_url e expires_at na linha do pedido
          → devolve o QR

cliente paga no app do banco
          → Pagar.me concilia e dispara charge.paid
          → POST /webhook/pagarme
          → confere a cobrança na API, marca pago, baixa estoque, manda e-mail
```

O QR é **guardado**, não regenerado: um código da Pagar.me é dinâmico e carrega
o txid deles, ao contrário do BR Code estático que dava para reconstruir a
partir do valor e da chave. Perder a string é perder o código.

Além do webhook, `GET /orders/:id/status` e `GET /payment/status/:id`
**reconsultam a cobrança** quando a linha está `pending`. É só leitura — quem
baixa estoque e manda e-mail continua sendo o webhook —, mas faz a tela virar no
segundo em que o dinheiro cai, em vez de parecer que o pagamento falhou.

### Cartão

```
navegador → POST https://api.pagar.me/core/v5/tokens?appId=pk_...
          → { id: "token_..." }            (o cartão NUNCA passa pelo servidor)

          → POST /orders                    → pedido pendente, estoque seguro
          → POST /orders/:id/pay-card       → { card_token, installments }
          → API cria a order na Pagar.me e autoriza NA HORA
```

Duas etapas de propósito. A Pagar.me autoriza de forma **síncrona** a partir do
token, então não há nada para preparar antes — e separar as etapas é o que faz
"cartão recusado, tenta outro" ser uma **retentativa no mesmo pedido**, com o
mesmo estoque segurado e o mesmo cupom, em vez de um pedido novo.

Uma recusa volta como **402** com o motivo do banco já em português
(`describeChargeFailure` traduz o `acquirer_return_code`).

### Assinatura

`POST /subscriptions` com `billing_type: 'prepaid'`, `interval: 'month'`. A
Pagar.me guarda o cartão e cobra sozinha; `invoice.paid` estende a validade do
membro e **espelha a fatura em `payments`** — que é a única tabela que os
relatórios leem.

**Trocar o cartão** passou a funcionar de verdade: `PATCH
/subscriptions/:id/card` aponta a recorrência para um novo token, sem mexer no
ciclo. Antes o painel mandava cancelar e assinar de novo, o que custava ao
membro os dias já pagos.

**Pausar tem uma diferença visível.** A Pagar.me não tem pause: pausar
**cancela** a recorrência lá e mantém a linha como `paused`. Retomar exige o
cartão de novo, e o serviço devolve `RESUME_REQUIRES_CARD` dizendo isso — em vez
de falhar torto.

---

## 3. Segurança do webhook

A Pagar.me v5 **não assina o corpo**. A proteção é Basic auth configurada junto
com o webhook no painel deles. Isso é um segredo compartilhado, não uma prova de
origem — então o processador faz as duas coisas:

1. **Confere as credenciais** (comparação em tempo constante).
2. **Relê a cobrança na API** antes de acreditar em qualquer evento de dinheiro.
   Um `charge.paid` forjado não liquida nada: no pior caso gasta uma chamada.

Uma consulta que falha conta como "não confirmado", o evento fica sem processar
e a Pagar.me reentrega — melhor do que decidir no chute.

**Idempotência**: a claim em `processed_webhooks` é INSERIDA na **mesma
transação** dos efeitos. Falhou, o ROLLBACK desfaz as duas coisas e a reentrega
pode reprocessar. Por isso o endpoint responde **500** em erro: responder 200
mandaria a Pagar.me esquecer um pagamento capturado e nunca aplicado.

---

## 4. CPF do comprador

A operadora **recusa pedido sem documento válido**, nos dois métodos. Por isso:

- o checkout da loja pede **CPF** (o atacado usa o CNPJ da conta aprovada);
- `createOrder` valida **dígito verificador** antes de abrir a transação — um
  erro de digitação custa um campo corrigido, não um pedido cancelado com
  reserva liberada e cupom queimado;
- o clube usa o CPF do cadastro, e também confere os dígitos: um `111.111.111-11`
  tem onze caracteres e voltaria como um 422 de campo que o membro não sabe
  resolver, três passos depois.

---

## 5. Avisos de pagamento para a equipe

`admin-notification.service.ts`, dois canais separados:

- **Sino do admin** — uma linha em `notifications` por usuário `admin`/`seller`.
  O componente `AdminNotificationBell` fica no cabeçalho do painel e **pesquisa
  a cada 60s** (o sino do cliente, na loja, não pesquisa: pergunta respondida
  pode esperar, pagamento não).
- **E-mail** para `ADMIN_EMAIL`, template único `admin-payment-event`.

Eventos: `payment_received`, `payment_pending`, `payment_failed`,
`payment_refunded`, `payment_chargeback`.

Configurável na aba **Configurações**:

| Chave                                    | Default | O quê                    |
| ---------------------------------------- | ------- | ------------------------ |
| `notifications.admin_payment_inapp`      | `true`  | Sino a cada pagamento    |
| `notifications.admin_payment_email`      | `true`  | E-mail a cada pagamento  |
| `notifications.admin_payment_min_amount` | `0`     | Piso em R$ para o e-mail |

**Estorno e chargeback ignoram as duas chaves** e sempre avisam: é dinheiro
saindo.

Nada aqui pode derrubar um pagamento — toda função engole o próprio erro e loga.

---

## 6. Stripe, o que sobrou

Nada novo passa por lá. O que ficou:

- `utils/stripe.ts` — cliente, agora com a chave **opcional** e um 503 explicado
  quando ela não existe mais no ambiente;
- `webhook.service.ts` + `POST /webhook/stripe` — para os eventos que cobranças
  antigas ainda emitem;
- o ramo Stripe em `refundPayment`, `refundOrder` e nas assinaturas.

Quem decide é o **provider guardado**, nunca um palpite pelo formato do id:

- `orders.payment_provider` / `payments.provider` / `subscriptions.provider`;
- `provider` NULL significa Stripe — toda linha anterior à migração está assim,
  e é isso que as mantém estornáveis e canceláveis.

Em `payments`, o roteamento do estorno olha o prefixo de `provider_id` (`pi_` =
Stripe), porque as linhas antigas não têm a coluna `provider` preenchida de
forma confiável.

---

## 7. Banco

Migration `034-pagarme.sql` + etapa 36 do `ensureSchema` (aditivas, sem DROP):

- **`members`**: `pagarme_customer_id`
- **`orders`**: `pagarme_order_id`, `pagarme_charge_id`, `payment_provider`,
  `pix_qr_code`, `pix_qr_code_url`, `pix_expires_at`, `card_brand`,
  `card_last_four`, `installments`, `customer_document`
- **`payments`**: `provider`, `pagarme_order_id`, `pagarme_charge_id`,
  `installments`, `card_brand`, `card_last_four`
- **`subscriptions`**: `provider`
- `chk_payments_method` reescrito para aceitar `debit_card`

---

## 8. Testes

| Arquivo                           | Casos | O que trava                                                                                                             |
| --------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| `pagarme-webhook.service.test.ts` | 31    | Corpo forjado não liquida nada; claim e efeitos na mesma transação; recusa não cancela pedido; estoque baixa uma vez só |
| `payment.service.test.ts`         | 40    | Valor é do plano, nunca do cliente; centavos; token obrigatório; recusa é 402 traduzido; estorno roteado por provedor   |
| `order.service.test.ts`           | 84    | CPF validado antes da transação; QR guardado; cartão nasce sem cobrança                                                 |
| `subscription.service.test.ts`    | 28    | Valor e intervalo travados no servidor; os dois provedores convivem                                                     |
| `route-protection.test.ts`        | 20    | Rotas novas declaradas como públicas, com o motivo escrito                                                              |

```bash
npm run test:api    # 480 testes, ~40s
```

---

## 9. Ir para produção

1. `.env` da VPS com as sete variáveis `PAGARME_*`.
2. Webhook cadastrado no painel, com a mesma senha.
3. Deploy (`ensureSchema` roda a etapa 36 sozinho).
4. `GET /health` → `payments.status: "ok"`.
5. Um PIX de R$ 1,00 de ponta a ponta: o pedido tem de virar `paid` **sem
   ninguém clicar**.
6. Um cartão de teste, incluindo uma recusa (`4000 0000 0000 0002`), para ver a
   mensagem em português e a retentativa no mesmo pedido.

> Os PIX gerados **antes** da migração continuam sem vigilância: são códigos
> estáticos que provedor nenhum concilia. `confirmPixOrder` /
> `confirmPixPayment` seguem no painel para eles.
