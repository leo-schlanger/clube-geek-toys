# Variações de produto (modelo Shopee)

> Pedido Laura (10/08/2026): produtos iguais com pequenas diferenças (ex.: bolsa em 4 cores) — um card na vitrine; no detalhe, escolher a variação.

## Como funciona (Shopee-like)

| Conceito                           | Implementação                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| **Listing**                        | Tabela `products` (nome, descrição, fotos gerais)                                  |
| **Tipos de variação** (ilimitados) | `products.variant_axes` JSONB — ex. `[{ name: "Cor", options: ["Rosa","Preto"] }]` |
| **SKU / combinação**               | Tabela `product_variants` — preço, estoque, SKU, **imagens por SKU**               |
| **Vitrine**                        | 1 card; preço “a partir de” = min das variantes ativas                             |
| **PDP**                            | `VariantPicker` com swatches; `resolveVariantImages` troca a galeria               |
| **Admin foto**                     | Por linha de SKU: **várias** fotos (upload, URL ou imagem da galeria do listing)   |
| **Busca loja**                     | Header Shopee-like (`ShopHeader`) → `/?search=`                                    |
| **Carrinho**                       | `variantId` + rótulo no item                                                       |
| **Pedido**                         | `order_items.variant_id` + `variant_label` (snapshot)                              |

## Admin

1. Produtos → editar/criar
2. Ativar **Variações**
3. **Tipo** = o eixo (ex. `Cor`). **Opções** = cada valor (Rosa, Preto, Azul…) — use **+ Opção** ou cole com vírgulas. **Sem limite** de opções nem de tipos.
4. Opcional: **Outro tipo** (ex. Tamanho) se precisar de matriz 2D+
5. **Gerar combinações** → preencher **fotos / preço / estoque / SKU** de cada linha
6. Em cada SKU: clique no quadrado da foto (upload, aceita seleção múltipla), cole URL, ou escolha uma imagem da **galeria do produto**. As fotos se **acumulam** — o botão vira `Add fotos (n/10)`; remova uma a uma no X da miniatura, ou use **Limpar**.
7. Salvar

> **Foto por variação (Shopee):** a PDP troca a galeria ao escolher a opção; o seletor mostra miniatura quando a variante tem imagem. Sem foto na variante, cai nas fotos gerais do listing.

> Erro comum: colocar o nome da cor no campo **Tipo** (ex. "Cor vermelha") e só 1 opção. O certo é Tipo=`Cor` e Opções=`Vermelha, Azul, Preto`.

## API

| Método | Path                     | Uso                                                        |
| ------ | ------------------------ | ---------------------------------------------------------- |
| GET    | `/products/:slug`        | Inclui `variants` + `variantAxes` se `hasVariants`         |
| PUT    | `/products/:id/variants` | Body `{ axes, variants[] }` (admin)                        |
| POST   | `/products/:id/media`    | Sobe arquivos e devolve **só as URLs** (admin)             |
| POST   | `/orders`                | Item pode enviar `variantId` (obrigatório se has_variants) |

> **Por que `/media` e não `/images`:** `/products/:id/images` anexa em `products.images` (galeria do listing). Foto de variação pertence ao SKU (`product_variants.images`, gravado no `PUT /variants`), então usa `/media`, que só devolve as URLs sem anexar em lugar nenhum. Reaproveitar `/images` para isso inflava a galeria do listing a cada variação — ver [Tetos de imagem](#tetos-de-imagem).

## Schema (migration 013)

- `products.has_variants`, `products.variant_axes`
- `product_variants` (FK product)
- `order_items.variant_id`, `order_items.variant_label`

Aplicado via `ensureSchema()` no boot da API.

## Regras

- Máx. **2 eixos** (igual Shopee seller center).
- Sem variação selecionada no checkout de produto com variantes → erro `VARIANT_REQUIRED`.
- Estoque: baixa na **variante**; parent atualiza soma para vitrine.

## Tetos de imagem

Fonte da verdade: `server/api/src/services/product.service.ts` (espelhado em `src/lib/products.ts`).

| Constante                 | Valor | O que limita                           |
| ------------------------- | ----- | -------------------------------------- |
| `MAX_PRODUCT_IMAGES`      | 30    | Galeria do listing (`products.images`) |
| `MAX_VARIANT_IMAGES`      | 10    | Fotos de uma variação                  |
| `MAX_IMAGE_UPLOAD_BATCH`  | 20    | Arquivos por requisição (multer)       |
| `PRODUCT_IMAGE_MAX_BYTES` | 40 MB | Tamanho de um arquivo                  |

Seleções maiores que `MAX_IMAGE_UPLOAD_BATCH` são fatiadas em várias requisições pelo `uploadProductImages`. O nginx precisa acompanhar: `client_max_body_size 120m` no bloco `api.geeketoys.com.br`.

> **Regressão de 14/08/2026 (não repetir):** o teto da galeria valia só no Zod do `PATCH /products/:id`, mas o upload anexava sem limite — e a foto de variação passava por ele. Cada variação com foto somava uma imagem em `products.images`; ao passar do teto, **o produto não podia mais ser salvo** (o PATCH reenvia o array inteiro e era rejeitado com 400). Correção: `/media` para variação + teto aplicado também em `addProductImages`. Coberto por `product.service.test.ts` e pelo caso "não anexa foto de variação na galeria do listing" em `ProductModal.test.tsx`.

> **Regressão de 15/08/2026 (não repetir):** o admin preenchia tipo + opções, clicava em **Salvar** e o produto era gravado **sem variação nenhuma**, com o toast de sucesso normal. Causa: a matriz de SKUs só existia depois de clicar em "Gerar combinações" — o `handleSubmit` lia `variantRows`, que continuava vazio, e o `PUT /variants` nem chegava a ser chamado. O mesmo padrão derrubava o **vídeo** (link colado e não confirmado no "+" era descartado), a **URL de foto do listing** e a **URL de foto por variação**. Correção: `handleSubmit` resolve todo rascunho pendente antes do primeiro write (`resolvePendingVideos`, `resolvePendingImages`, `resolvePendingVariantImages`) e monta a matriz que faltava com `mergeVariantMatrix`. Rascunho inválido agora **bloqueia** o save com mensagem em vez de sumir. Coberto por "ProductModal — rascunho pendente no Salvar" em `ProductModal.test.tsx`.

### `mergeVariantMatrix` vs "Gerar combinações"

| Caminho                       | O que faz                                                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Botão **Gerar combinações**   | Refaz a matriz a partir dos eixos: combinação que não existe mais **some**. Preserva preço/estoque/foto das linhas de mesmo nome.                                      |
| **Salvar** (merge automático) | Só **acrescenta** os SKUs que os eixos pedem e ainda não existem. Nunca apaga uma linha — ela pode ter estoque e foto. Se sobrar linha fora dos eixos, o painel avisa. |

## Editar produto no admin

`GET /products/:id/edit` (admin) — **não** use o detalhe público por slug. Aquele filtra `active = TRUE` no produto e nas variações, então produto inativo abria sem variação alguma e o save seguinte apagava as variações inativas que não vieram no payload.
