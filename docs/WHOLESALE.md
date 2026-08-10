# Atacado (B2B) — GeekPop & Toys

> Pedido operacional (Norberto, 10/08/2026): aba Atacado no site, desconto 25%, login com CNPJ correto, vender só quando houver disponibilidade e CNPJ alinhado ao objeto da compra. Estrutura pronta **antes** da importação de estoque.

## Resumo

| Item      | Valor                                                                    |
| --------- | ------------------------------------------------------------------------ |
| Canal     | `shop.geeketoys.com.br/atacado`                                          |
| Desconto  | **25%** server-side (`discount_reason = wholesale_25`)                   |
| Constante | `WHOLESALE_SHOP_DISCOUNT = 0.25` (API + front)                           |
| Login     | e-mail + senha + **CNPJ** (deve bater com o cadastro)                    |
| Aprovação | Admin confere CNPJ / atividade vs. o que vão comprar                     |
| Produtos  | Só entram no catálogo se `wholesale_enabled = true`                      |
| Carrinho  | `localStorage` key `clube_geek_shop_cart_wholesale` (separado do varejo) |

## Fluxo

```
Cliente                Shop /atacado              API                     Admin
   │                         │                     │                        │
   │  Cadastro CNPJ          │  POST /wholesale/   │                        │
   │────────────────────────►│  register           │                        │
   │                         │────────────────────►│ status=pending         │
   │                         │                     │                        │
   │                         │                     │  GET accounts          │
   │                         │                     │◄───────────────────────│
   │                         │                     │  PATCH approve/reject  │
   │                         │                     │◄───────────────────────│
   │  Login e-mail+CNPJ      │  POST /wholesale/   │                        │
   │────────────────────────►│  login              │                        │
   │  Catálogo wholesale     │  GET /products?     │                        │
   │────────────────────────►│  wholesale=true     │                        │
   │  Checkout               │  POST /orders       │                        │
   │────────────────────────►│  channel=wholesale  │ wholesale_25           │
```

1. Cliente acessa **Atacado** (aba no header da loja).
2. Cadastra CNPJ + dados da empresa (`/atacado/cadastro`) → status `pending`.
3. Admin em **Atacado** aprova ou recusa (motivo obrigatório na recusa).
4. Login em `/atacado/entrar` exige CNPJ correto.
5. Produtos liberados no admin (flag **Disponível no atacado** + qtd. mínima).
6. Checkout `/atacado/checkout` aplica 25% se conta `approved` e CNPJ confere.
7. Pedidos ficam com `channel = wholesale`, `customer_cnpj`, `wholesale_account_id`.

## Regras de negócio

| Regra                 | Detalhe                                                             |
| --------------------- | ------------------------------------------------------------------- |
| Não empilha com clube | Canal atacado **não** aplica `member_15`                            |
| Frete                 | Nunca recebe desconto                                               |
| Estoque               | Mesmo estoque do varejo; valida no create, baixa no paid            |
| Produto               | Sem `wholesale_enabled` → fora do catálogo e rejeitado no checkout  |
| Qtd. mínima           | `wholesale_min_qty` validado no checkout (qty max por linha: 999)   |
| CNPJ                  | Digitos + Modulo 11; storage só dígitos (14)                        |
| Objeto da compra      | Campo `business_activity` + revisão humana (sem CNAE automático RF) |

## Schema (migration 012 + ensureSchema)

| Objeto               | Campos                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------- |
| `wholesale_accounts` | user_id, cnpj UNIQUE, company, contact, business_activity, status, review\*             |
| `products`           | `wholesale_enabled` DEFAULT false, `wholesale_min_qty` DEFAULT 1 CHECK ≥1               |
| `orders`             | `channel` retail\|wholesale, `customer_cnpj`, `wholesale_account_id` FK                 |
| `config`             | `wholesale.enabled=true`, `wholesale.discount_percent=25` (seed; runtime usa constante) |

Aplicado automaticamente via `ensureSchema()` no boot da API (sem SSH manual).

### Integridade / LGPD

- Export: inclui `wholesaleAccount` (sem admin_notes sensíveis desnecessárias).
- Delete: conta `disabled`, CNPJ vira placeholder único, `customer_cnpj` zerado nos pedidos.
- Checkout: preços e desconto **sempre** do servidor.

## API

| Método | Path                                        | Auth                                       |
| ------ | ------------------------------------------- | ------------------------------------------ |
| POST   | `/wholesale/register`                       | público                                    |
| POST   | `/wholesale/login`                          | público (CNPJ obrigatório)                 |
| GET    | `/wholesale/me`                             | JWT                                        |
| GET    | `/wholesale/accounts`                       | admin                                      |
| PATCH  | `/wholesale/accounts/:id`                   | admin (`approve` \| `reject` \| `disable`) |
| GET    | `/products?wholesale=true`                  | público                                    |
| POST   | `/orders` body `channel: wholesale`, `cnpj` | JWT + conta aprovada                       |

## Rotas SPA (shop)

| Path                     | Página                        |
| ------------------------ | ----------------------------- |
| `/atacado`               | Catálogo B2B                  |
| `/atacado/cadastro`      | Solicitar acesso              |
| `/atacado/entrar`        | Login CNPJ                    |
| `/atacado/produto/:slug` | PDP (só se wholesale_enabled) |
| `/atacado/carrinho`      | Carrinho canal                |
| `/atacado/checkout`      | Checkout canal                |

## Operação (Laura / Norberto)

1. Após **deploy**, schema 012 aplica sozinho no restart da API.
2. Aba **Atacado** no admin: aprovar CNPJs (atividade alinhada à compra).
3. Em cada produto da importação: marcar **Disponível no atacado** se for vender no B2B.
4. Enquanto nenhum produto estiver marcado, a vitrine mostra “Catálogo atacado em preparação” — a **opção já existe** no site.

## Checklist “funciona bem”

- [x] Schema + ensureSchema idempotente
- [x] Validação CNPJ (front + back)
- [x] Login exige CNPJ correto
- [x] Desconto 25% só server-side
- [x] Produtos default fora do atacado
- [x] Carrinho separado varejo/atacado
- [x] LGPD export/delete cobre B2B
- [x] Admin aprovação + flag produto
- [ ] Deploy produção
- [ ] Operação: liberar SKUs + aprovar primeiros CNPJs
