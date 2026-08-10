# Variações de produto (modelo Shopee)

> Pedido Laura (10/08/2026): produtos iguais com pequenas diferenças (ex.: bolsa em 4 cores) — um card na vitrine; no detalhe, escolher a variação.

## Como funciona (Shopee-like)

| Conceito                           | Implementação                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| **Listing**                        | Tabela `products` (nome, descrição, fotos gerais)                                  |
| **Tipos de variação** (ilimitados) | `products.variant_axes` JSONB — ex. `[{ name: "Cor", options: ["Rosa","Preto"] }]` |
| **SKU / combinação**               | Tabela `product_variants` — preço, estoque, SKU, imagens por opção                 |
| **Vitrine**                        | 1 card; preço “a partir de” = min das variantes ativas                             |
| **PDP**                            | `VariantPicker`: botões por eixo; preço/estoque/imagem mudam                       |
| **Carrinho**                       | `variantId` + rótulo no item                                                       |
| **Pedido**                         | `order_items.variant_id` + `variant_label` (snapshot)                              |

## Admin

1. Produtos → editar/criar
2. Ativar **Variações**
3. Adicionar tipos (Cor, Tamanho, Material…) + opções separadas por vírgula
4. **Adicionar tipo** quantas vezes precisar (sem limite)
5. **Gerar combinações** → preencher preço/estoque/SKU de cada linha
6. Salvar

## API

| Método | Path                     | Uso                                                        |
| ------ | ------------------------ | ---------------------------------------------------------- |
| GET    | `/products/:slug`        | Inclui `variants` + `variantAxes` se `hasVariants`         |
| PUT    | `/products/:id/variants` | Body `{ axes, variants[] }` (admin)                        |
| POST   | `/orders`                | Item pode enviar `variantId` (obrigatório se has_variants) |

## Schema (migration 013)

- `products.has_variants`, `products.variant_axes`
- `product_variants` (FK product)
- `order_items.variant_id`, `order_items.variant_label`

Aplicado via `ensureSchema()` no boot da API.

## Regras

- Máx. **2 eixos** (igual Shopee seller center).
- Sem variação selecionada no checkout de produto com variantes → erro `VARIANT_REQUIRED`.
- Estoque: baixa na **variante**; parent atualiza soma para vitrine.
