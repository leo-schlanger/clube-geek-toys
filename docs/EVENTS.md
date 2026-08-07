# Eventos na loja (shop.geeketoys.com.br)

> **Última atualização:** 7 de Agosto de 2026  
> **Pedido Laura:** evento **6/set/2026 (domingo) 14h–18h**, ingresso **R$ 20** (criança de colo e PCD isentos), WhatsApp loja `(11) 91466-2881`  
> **Onde roda:** loja (`shop.*`) neste repo **e** site institucional (`geek-toys-home`)

> **Galeria (Laura, 07/08/2026):** fotos em `public/eventos/kpop-night/` entram na **galeria geral** (`#galeria` no home). Sem botão de download e sem seção `#fotos-evento`.

---

## Superfícies

| Superfície         | Repo                     | URL                             |
| ------------------ | ------------------------ | ------------------------------- |
| **Loja online**    | este (`clube-geek-toys`) | `https://shop.geeketoys.com.br` |
| Site institucional | `geek-toys-home`         | `https://geeketoys.com.br`      |

Config e conteúdo devem ficar **sincronizados** entre:

- `src/data/event.ts` (este repo)
- `geek-toys-home/src/data/event.ts`

Fotos em ambos (ou só na loja, se preferir):

- `public/eventos/<slug>/` (este repo)
- `geek-toys-home/public/eventos/<slug>/`

---

## O que a loja tem

| Feature                                | Onde                                      |
| -------------------------------------- | ----------------------------------------- |
| Banner no topo (todas as páginas shop) | `EventAnnouncementBanner` em `ShopRoutes` |
| Link “Evento” no header                | `ShopHeader`                              |
| Card na home                           | `EventPromoCard` em `ShopHome`            |
| Página completa                        | `/evento` → `EventPage`                   |
| Reserva WhatsApp                       | `EventTicketForm`                         |
| Fotos na galeria                       | `EventPhotosSection`                      |

---

## Operação (Laura)

1. Editar `src/data/event.ts` (título, data, preço, textos)
2. Subir fotos em `public/eventos/<slug>/` e listar em `photos[]`
3. Deploy (CI do clube sobe a loja no mesmo bundle)
4. Espelhar alterações no `geek-toys-home` se o evento também estiver no site raiz

`enabled: false` esconde banner, card, link e redireciona `/evento` → home.

---

## Arquivos

| Arquivo                                            | Papel                  |
| -------------------------------------------------- | ---------------------- |
| `src/data/event.ts`                                | Config do evento ativo |
| `src/components/store/EventAnnouncementBanner.tsx` | Banner                 |
| `src/components/store/EventPromoCard.tsx`          | Destaque na home       |
| `src/components/store/EventTicketForm.tsx`         | Reserva                |
| `src/components/store/EventPhotosSection.tsx`      | Galeria + download     |
| `src/pages/shop/EventPage.tsx`                     | Página `/evento`       |
| `public/eventos/`                                  | Assets de foto         |

Detalhe do pedido original e roadmap: ver também `geek-toys-home/docs/EVENTS.md`.
