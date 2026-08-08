# Status da documentação vs realidade (8 Ago 2026)

> Auditoria: docs ↔ código.  
> Inclui frete, minhas compras, reviews, crédito e hardening de dados (mig. 010–011).

---

## Veredito

| Área                          | Docs                               | Código      | Notas                                    |
| ----------------------------- | ---------------------------------- | ----------- | ---------------------------------------- |
| Stack clube + loja + API      | PROJECT / ARCHITECTURE             | ✅          | OK                                       |
| Plano único / 15%             | PROJECT                            | ✅          | Desconto server-side                     |
| Loja checkout Stripe/PIX      | PROJECT                            | ✅          | PIX manual admin                         |
| **Frete CEP + Melhor Envio**  | SHOP-ORDERS + PROJECT (atualizado) | ✅          | Fallback tabela sem token                |
| **Minhas compras (6 abas)**   | SHOP-ORDERS                        | ✅          | Ownership por `user_id` ou `member_id`   |
| **Rastreio + e-mail shipped** | SHOP-ORDERS                        | ✅          | Admin cola código                        |
| **Reviews + crédito loja**    | SHOP-ORDERS + PROJECT              | ✅          | R$1 default; unique 1×/pedido            |
| **LGPD shop (export/delete)** | SECURITY (abaixo)                  | ✅          | Corrigido 08/08 (orders/reviews/credits) |
| Eventos / rádio / design      | EVENTS / RADIO / DESIGN            | ✅          | OK                                       |
| Fotos de produto              | TODO                               | ⚠️ conteúdo | Laura                                    |
| Token Melhor Envio prod       | TODO / SHOP-ORDERS                 | ⚠️ ops      | Sem token = fallback                     |
| Site home SEO K-pop           | SHOP-ORDERS                        | ✅ código   | Deploy home separado                     |

**Conclusão:** docs principais de loja estavam **atrasados** em PROJECT (ainda migration 009 only). Atualizados nesta revisão. SHOP-ORDERS.md é a fonte operacional da loja.

---

## Modelo de dados da loja (fonte de verdade)

| Tabela                    | Propósito                                    | PII                                             |
| ------------------------- | -------------------------------------------- | ----------------------------------------------- |
| `categories` / `products` | Catálogo + peso/dims + rating                | Não                                             |
| `orders`                  | Pedido + frete + rastreio + crédito aplicado | **Sim** (nome, email, telefone, endereço JSONB) |
| `order_items`             | Snapshot de itens                            | Baixo (nome produto)                            |
| `product_reviews`         | Avaliação pós-entrega                        | Texto + user_id                                 |
| `store_credits`           | Saldo crédito                                | Financeiro usuário                              |
| `store_credit_ledger`     | Auditoria de crédito                         | Financeiro                                      |

### Regras de dinheiro (server-side)

```
subtotal     = Σ (price_db × qty_agregada)
member_15    = 15% se member ativo
credit       = min(saldo, subtotal − member_15)  se applyStoreCredit
discount     = member_15 + credit
shipping     = cotação HMAC revalidada (nunca do client)
total        = subtotal − discount + shipping
```

- Estoque: valida no create (qty **agregada** por produto); decrementa só no **paid**.
- Crédito: debita no create; **restaura** em cancel/fail/refund (idempotente).
- Review reward: 1× por `order_id` (unique index + mesma TX).

### Ownership

| Ação                                | Regra                                                 |
| ----------------------------------- | ----------------------------------------------------- |
| Minhas compras                      | `orders.user_id = auth` **ou** `member_id` do usuário |
| Avaliar                             | Pedido `delivered` + ownership acima                  |
| Admin pedidos                       | role admin                                            |
| Status público `/orders/:id/status` | Só `{id, status, orderNumber}` — sem PII              |

### LGPD

| Operação | Comportamento                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Export   | users, member, contracts, payments, subscriptions, **shopOrders + items**, **reviews**, **store credit + ledger**, audit, email_logs        |
| Delete   | Anonimiza user/member/contracts; **orders** customer\_\* + shipping_address; reviews hidden; crédito zerado; bloqueia se pedido em trânsito |

---

## Fontes de verdade (ordem)

1. Código `master` + migrations `009–011` + `ensure-schema.ts`
2. `docs/SHOP-ORDERS.md` (operação loja)
3. `docs/PROJECT.md` § loja (schema)
4. `docs/SECURITY.md` (LGPD / auth)
5. Checkups datados — histórico

---

## Gaps conscientes (não bloqueantes)

| Item                                    | Tipo                      | Mitigação                                       |
| --------------------------------------- | ------------------------- | ----------------------------------------------- |
| Oversell se muitos pending no mesmo SKU | Design (stock só no paid) | Qty agregada no check; reserva futura           |
| Etiqueta Melhor Envio automática        | Feature                   | Manual Correios + tracking admin                |
| Free shipping total 0 vs Stripe         | Edge                      | Frete mínimo atual evita; guard se frete grátis |
