# Catálogo — pedidos Laura (14/08/2026)

> Origem: mensagens da Laura em 14/08 enquanto cadastrava as camisetas dos grupos.
> Entregue em 4 fases. Detalhe de variações continua em [`PRODUCT-VARIANTS.md`](PRODUCT-VARIANTS.md).

## Fase 0 — limites de foto e o bug de salvar

**O que ela relatou:** "aumenta o limite de imagens, mais de 6 por vez" e "quando eu coloco várias variações, dá problema".

As duas coisas eram o mesmo bug. A foto de variação era enviada pelo endpoint do
listing (`POST /products/:id/images`), que **anexa em `products.images`**. Cada
variação com foto somava uma imagem na galeria do produto. Passando do teto de 8
do Zod, o `PATCH /products/:id` — que reenvia o array inteiro — passava a ser
rejeitado com 400, e **o produto não podia mais ser salvo de jeito nenhum**.

| Antes                              | Agora                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------- |
| Galeria do listing: 8              | **30** (`MAX_PRODUCT_IMAGES`)                                               |
| Upload por requisição: 6           | **20** (`MAX_IMAGE_UPLOAD_BATCH`), seleções maiores são fatiadas no cliente |
| Fotos por variação: 1              | **10** (`MAX_VARIANT_IMAGES`)                                               |
| `client_max_body_size`: 40m global | **120m** no bloco `api.geeketoys.com.br`                                    |
| Teto só no Zod do PATCH            | Teto também em `addProductImages`                                           |
| Foto de variação ia pra galeria    | Vai por `POST /products/:id/media` (devolve só URLs)                        |

Regressão coberta por `product.service.test.ts` e pelo caso "não anexa foto de
variação na galeria do listing" em `ProductModal.test.tsx`.

## Fase 1 — velocidade de cadastro

### Duplicar produto

`POST /products/:id/duplicate`. Copia descrição, preço, medidas, peso, imagens
(por URL — não copia arquivo), categorias e variações.

- Nome vira `... (cópia)`, slug novo
- Entra **inativo** — não vaza pro catálogo antes de ser revisado
- **SKU não é copiado**: é único por natureza, quem duplica preenche o novo
- **Estoque nasce zerado** (do produto e das variações): é outro produto físico; copiar o número faria a loja anunciar peça que não está na prateleira
- O painel abre o clone já em edição

### Até 5 categorias por produto

Migration 014 — tabela `product_categories (product_id, category_id, position)`.

`products.category_id` continua existindo como **categoria principal**
(`position = 0`): sitemap, "você também pode gostar" e os cards da vitrine
seguem usando ela sem alteração. O filtro do catálogo e a busca passaram a olhar
todas as categorias via `EXISTS`.

No painel, as categorias viram checkboxes com um link "tornar principal".

## Fase 2 — estoque e vídeo

### Controle de estoque (aba Estoque)

Migration 015 — `stock_movements` + `products.low_stock_threshold`.

O número já existia; o que faltava era **por que** ele mudou. Agora toda
alteração grava um movimento:

| `kind`                     | Quando                                            |
| -------------------------- | ------------------------------------------------- |
| `sale`                     | Baixa por pedido pago (webhook ou PIX confirmado) |
| `restock`                  | Devolução por cancelamento/estorno                |
| `manual_in` / `manual_out` | Ajuste no painel                                  |

A aba lista **uma linha por SKU vendável**: produtos sem variação entram
direto, produtos com variação entram pelas variações (é nelas que a baixa
acontece). Edição inline, filtro Acabando/Esgotados, limiar por produto e
histórico por produto.

Os movimentos de pedido nascem **na mesma transação** da baixa — sem baixa não
há histórico, e o rollback leva os dois.

### Vídeos

Migration 016 — `products.videos JSONB`, itens `{ kind, url, title? }`.

- `youtube` / `instagram` — link colado, embedado na PDP (YouTube via domínio _nocookie_)
- `file` — MP4 no volume `/uploads`, `POST /products/:id/video`, até 100 MB

Máx. 5 por produto. Na PDP os vídeos ficam **abaixo** da galeria de fotos, não
misturados: o índice da galeria já governa a troca de foto por variação, e
intercalar vídeo ali quebraria essa correspondência.

## Fase 3 — perguntas e notificações

Migration 017 — `product_questions` + `notifications`.

**Modelo Mercado Livre** (decidido em 14/08): a pergunta aparece na loja assim
que é feita, marcada como "Aguardando resposta". Não há aprovação prévia, então
a contenção de spam é:

- Login obrigatório para perguntar
- Máx. **10 perguntas em aberto** por usuário (`MAX_OPEN_QUESTIONS_PER_USER`)
- `status = 'hidden'` como moderação a posteriori, na aba Perguntas

Ao responder, na mesma transação nasce a notificação do cliente; o e-mail
(`question-answered`, via Resend) sai depois, fora da transação e sem bloquear —
a notificação no perfil é o canal garantido, o e-mail é reforço.

O sininho no header da loja busca na montagem e ao abrir, **sem polling**: uma
resposta não é urgente a ponto de justificar tráfego constante.

Só o **primeiro nome** de quem perguntou vai pra vitrine.

## Endpoints novos

| Método | Path                           | Auth    |
| ------ | ------------------------------ | ------- |
| POST   | `/products/:id/media`          | admin   |
| POST   | `/products/:id/video`          | admin   |
| POST   | `/products/:id/duplicate`      | admin   |
| GET    | `/stock`                       | admin   |
| PATCH  | `/stock`                       | admin   |
| PATCH  | `/stock/:productId/threshold`  | admin   |
| GET    | `/stock/:productId/movements`  | admin   |
| GET    | `/questions/product/:slugOrId` | público |
| POST   | `/questions`                   | logado  |
| GET    | `/questions/me`                | logado  |
| GET    | `/questions/admin`             | admin   |
| POST   | `/questions/:id/answer`        | admin   |
| PATCH  | `/questions/:id/status`        | admin   |
| GET    | `/notifications`               | logado  |
| PATCH  | `/notifications/:id/read`      | logado  |
| POST   | `/notifications/read-all`      | logado  |

## Migrations

`014` categorias múltiplas · `015` estoque · `016` vídeos · `017` perguntas e
notificações. Todas idempotentes e espelhadas em `ensure-schema.ts`, aplicadas
no boot da API — não precisa rodar SQL na mão no deploy.

## Correções de 15/08

Relatos da Laura depois do primeiro deploy, e o que cada um era de fato.

### "Não tô conseguindo fazer a variação" — bug real

Reproduzido dirigindo o painel de produção com Playwright. O caminho natural
— digitar a opção no campo `Ex.: Rosa` e clicar direto em **Gerar combinações** —
descartava o texto, porque a opção só era confirmada ao clicar no `+`. O toast
que aparecia mandava usar o botão, mas o esperado é simplesmente funcionar.

Agora `Gerar combinações` recolhe o que está digitado antes de montar a matriz, e
a mensagem de erro distingue "falta nome do tipo" de "falta opção". Coberto por
dois casos em `ProductModal.test.tsx`.

### "Não tô conseguindo colocar vídeo" — não era bug

API responde 201 nos dois caminhos (link e MP4) e a UI está publicada e
funcional — verificado por Playwright no painel real. O problema era achar: o
modal tinha ~1100 linhas de campo numa rolagem só, e o bloco de vídeo caía no
terço final.

**Resolvido em 16/08** — ver [`CHECKUP-2026-08-16.md`](CHECKUP-2026-08-16.md).
O formulário virou 4 abas: **Básico** · **Categorias e envio** ·
**Fotos e vídeos** · **Variações**.

Três detalhes que separam "resolver" de "trocar de problema":

| Detalhe                                                | Por quê                                                                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Painéis ficam **montados** (`hidden`, não desmontados) | O `handleSubmit` lê estado, não DOM, e nenhum campo usa `required` nativo. Rascunho digitado numa aba entra no save disparado de outra — que é justamente o caminho corrigido em 15/08. |
| **Contador** no rótulo da aba                          | "Fotos e vídeos 4" mostra que há conteúdo sem precisar entrar. Sem isso, a aba só troca um problema de descoberta por outro. Conta o confirmado **e** o rascunho.                       |
| Erro de validação **troca de aba**                     | `fail(aba, msg)`: "Preço inválido na variação X" não ajuda quem está olhando o Básico.                                                                                                  |

Os E2E precisaram acompanhar: painel inativo é `display:none`, então o Playwright
abre a aba antes de tocar no campo — igual à Laura.

### Outros ajustes

- **Galeria da PDP**: arrastar para o lado troca a foto (limiar de 40px separa
  arrasto de toque), setas no desktop, indicadores de posição, e a moldura de
  foto em outro formato passou de cinza para branca
- **Scroll**: `ScrollToTop` leva a janela ao topo ao trocar de rota; voltar (POP)
  continua restaurando a posição da listagem
- **Ícone por categoria** (migration 018): `categories.icon` guarda só a chave; o
  mapa chave → componente vive em `src/lib/category-icons.ts`, e
  `guessCategoryIcon` dá um palpite por nome para as categorias que ainda não
  escolheram
- **Categorias novas** criadas em produção: K-pop (separada de Música), Pokémon,
  Beleza, Moda, Jogos, Anime

## Galeria com pastas (15/08)

Migration 019 — `gallery_albums` + `gallery_photos`. Só cria tabelas novas.

A galeria do site institucional passou a ser editável no painel (aba
**Galeria**), organizada em pastas: "Evento 6/9", "Loja presencial Copacabana".
As fotos ficam no volume `/uploads/gallery/:albumId`, ao lado das de produto.

| Método            | Path                                  | Auth                      |
| ----------------- | ------------------------------------- | ------------------------- |
| GET               | `/gallery`                            | público                   |
| GET               | `/gallery/:slug`                      | público                   |
| GET               | `/gallery/admin/albums`               | admin (inclui escondidos) |
| POST/PATCH/DELETE | `/gallery/albums[/:id]`               | admin                     |
| POST              | `/gallery/albums/:id/photos`          | admin                     |
| PATCH/DELETE      | `/gallery/albums/:id/photos/:photoId` | admin                     |
| PUT               | `/gallery/albums/:id/photos/order`    | admin                     |

Apagar álbum ou foto **remove o arquivo do disco**. URLs externas (fora de
`/uploads/`) são ignoradas na limpeza, então um álbum pode apontar para imagem
hospedada em outro lugar sem risco.

A capa é a coluna `cover_url` ou, na falta, a primeira foto — e remover a foto
que era capa devolve o álbum à capa automática.

**Importação:** as 41 fotos que estavam fixas no repo do home foram enviadas
para dois álbuns ("Loja GeekPop & Toys" com 6, "GeekPop Night — K-pop" com 35).
O consumo no site está em `geek-toys-home/docs/GALLERY.md`.

## Privacidade revisada (15/08)

Duas coisas novas expõem dado pessoal e entraram na política dos dois sites:

- **Perguntas de produto** são públicas com o **primeiro nome** de quem
  perguntou; excluir a conta anonimiza o texto
- **Fotos da galeria** podem conter pessoas identificáveis de eventos abertos e
  da loja física; remoção por e-mail, sem exigir justificativa
