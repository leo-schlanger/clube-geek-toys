# Status da documentação vs realidade (10 Ago 2026)

> Auditoria: docs ↔ código.  
> Inclui frete, minhas compras, reviews, crédito (010–011) e **Atacado B2B (012)**.

---

## Veredito

| Área                          | Docs                              | Código      | Notas                                   |
| ----------------------------- | --------------------------------- | ----------- | --------------------------------------- |
| Stack clube + loja + API      | PROJECT / ARCHITECTURE            | ✅          | OK                                      |
| Plano único / 15%             | PROJECT                           | ✅          | Desconto server-side                    |
| Loja checkout Stripe/PIX      | PROJECT                           | ✅          | PIX manual admin                        |
| **Frete CEP + Melhor Envio**  | SHOP-ORDERS + PROJECT             | ✅          | Fallback tabela sem token               |
| **Minhas compras (6 abas)**   | SHOP-ORDERS                       | ✅          | Ownership por `user_id` ou `member_id`  |
| **Rastreio + e-mail shipped** | SHOP-ORDERS                       | ✅          | Admin cola código                       |
| **Reviews + crédito loja**    | SHOP-ORDERS + PROJECT             | ✅          | R$1 default; unique 1×/pedido           |
| **Atacado B2B (CNPJ / 25%)**  | WHOLESALE + PROJECT + SHOP-ORDERS | ✅          | Schema 012; deploy necessário em prod   |
| **LGPD shop + wholesale**     | SECURITY / DOC-STATUS             | ✅          | Export/delete cobrem CNPJ e conta B2B   |
| Eventos / rádio / design      | EVENTS / RADIO / DESIGN           | ✅          | OK                                      |
| Fotos de produto              | TODO                              | ⚠️ conteúdo | Laura (listing + por variação)          |
| **Variações + foto por SKU**  | PRODUCT-VARIANTS + PROJECT        | ✅          | Admin upload/URL/galeria; PDP swatches  |
| **Busca loja estilo Shopee**  | PROJECT / README                  | ✅          | Header sempre visível + botão Buscar    |
| **Ordenação do catálogo**     | PROJECT / ARCHITECTURE / TODO     | ✅          | `?sort=` no SQL + `?page=` LIMIT/OFFSET |
| **Recorte de foto no admin**  | PROJECT / ARCHITECTURE / TODO     | ✅          | Proporção + tamanho px no upload        |
| Token Melhor Envio prod       | TODO / SHOP-ORDERS                | ⚠️ ops      | Sem token = fallback                    |
| Site home SEO K-pop           | SHOP-ORDERS                       | ✅          | Vercel www                              |
| Design pink/yellow            | DESIGN / TODO                     | ✅          | Residual purple limpo 08/08             |

**Conclusão:** docs alinhados ao código do Atacado (012). Fonte operacional B2B: [`WHOLESALE.md`](WHOLESALE.md).

---

## Modelo de dados da loja (fonte de verdade)

| Tabela                    | Propósito                                     | PII                                             |
| ------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `categories` / `products` | Catálogo + peso/dims + rating + flags atacado | Não                                             |
| `orders`                  | Pedido + frete + rastreio + crédito + canal   | **Sim** (nome, email, telefone, endereço, CNPJ) |
| `order_items`             | Snapshot de itens                             | Baixo (nome produto)                            |
| `product_reviews`         | Avaliação pós-entrega                         | Texto + user_id                                 |
| `store_credits`           | Saldo crédito                                 | Financeiro usuário                              |
| `store_credit_ledger`     | Auditoria de crédito                          | Financeiro                                      |
| `wholesale_accounts`      | Conta B2B + CNPJ + aprovação                  | **Sim** (CNPJ, empresa, telefone)               |

### Regras de dinheiro (server-side)

```
subtotal          = Σ (price_db × qty_agregada)
channel           = retail | wholesale  (do body; wholesale exige auth + conta approved)

retail:
  member_15       = 15% se member ativo
  credit          = min(saldo, subtotal − member_15)  se applyStoreCredit
  discount        = member_15 + credit
  reason          = member_15 | store_credit | member_15+store_credit

wholesale:
  wholesale_25    = 25% se conta approved + CNPJ confere
  credit          = min(saldo, subtotal − wholesale_25)  se applyStoreCredit
  discount        = wholesale_25 + credit
  reason          = wholesale_25 | wholesale_25+store_credit | store_credit
  (não empilha com member_15)

shipping          = cotação HMAC revalidada (nunca do client; nunca recebe desconto)
total             = subtotal − discount + shipping
```

- Estoque: valida no create (qty **agregada**); decrementa só no **paid**.
- Atacado: só produtos `wholesale_enabled`; respeita `wholesale_min_qty`.
- Crédito: debita no create; **restaura** em cancel/fail/refund (idempotente).
- Review reward: 1× por `order_id` (unique index + mesma TX).

### Ownership

| Ação                                | Regra                                                 |
| ----------------------------------- | ----------------------------------------------------- |
| Minhas compras                      | `orders.user_id = auth` **ou** `member_id` do usuário |
| Checkout atacado                    | JWT + `wholesale_accounts.status = approved` + CNPJ   |
| Avaliar                             | Pedido `delivered` + ownership acima                  |
| Admin pedidos / atacadistas         | role admin                                            |
| Status público `/orders/:id/status` | Só `{id, status, orderNumber}` — sem PII              |

### LGPD

| Operação | Comportamento                                                                                                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Export   | users, member, contracts, payments, subscriptions, **shopOrders + items**, **reviews**, **store credit + ledger**, **wholesaleAccount**, audit, email_logs                                         |
| Delete   | Anonimiza user/member/contracts; **orders** customer\_\* + shipping + **customer_cnpj**; reviews hidden; crédito zerado; **wholesale** disabled + CNPJ placeholder; bloqueia se pedido em trânsito |

---

## Fontes de verdade (ordem)

1. Código `master` + migrations `009–012` + `ensure-schema.ts`
2. `docs/WHOLESALE.md` (canal atacado)
3. `docs/SHOP-ORDERS.md` (operação loja varejo)
4. `docs/PROJECT.md` § loja (schema)
5. `docs/SECURITY.md` (LGPD / auth / descontos)
6. Checkups datados — histórico

---

## Gaps conscientes (não bloqueantes)

| Item                                    | Tipo                      | Mitigação                                                 |
| --------------------------------------- | ------------------------- | --------------------------------------------------------- |
| Oversell se muitos pending no mesmo SKU | Design (stock só no paid) | Qty agregada no check; reserva futura                     |
| Etiqueta Melhor Envio automática        | Feature                   | Manual Correios + tracking admin                          |
| Free shipping total 0 vs Stripe         | Edge                      | Frete mínimo atual evita; guard se frete grátis           |
| CNAE automático Receita Federal         | Ops                       | Aprovação manual admin (objeto da compra)                 |
| % atacado lido de `config` em runtime   | Nice-to-have              | Constante `WHOLESALE_SHOP_DISCOUNT=0.25` + config seed 25 |
