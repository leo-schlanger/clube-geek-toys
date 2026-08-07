# Eventos na loja (shop.geeketoys.com.br)

> **Última atualização:** 7 de Agosto de 2026  
> **Pedido Laura:** evento **6/set/2026 (domingo) 14h–18h**, ingresso **R$ 20** (criança de colo e PCD isentos), WhatsApp loja `(11) 91466-2881`  
> **Onde roda:** loja (`shop.*`) neste repo **e** site institucional (`geek-toys-home`)

> **Galeria:** fotos oficiais ficam na **galeria geral do site principal** (`geeketoys.com.br#galeria`).  
> **Não** há seção `#fotos-evento` nem botões de download na loja/home.

---

## Superfícies

| Superfície         | Repo                     | URL                                 | Papel do evento                                         |
| ------------------ | ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| **Loja online**    | este (`clube-geek-toys`) | `https://shop.geeketoys.com.br`     | Banner, card, `/evento`, reserva WhatsApp               |
| Site institucional | `geek-toys-home`         | `https://geeketoys.com.br` / `www.` | Banner, `#evento`, `#ingressos`, **galeria** `#galeria` |

Config do evento (data, preço, textos) deve ficar **sincronizada** entre:

- `src/data/event.ts` (este repo)
- `geek-toys-home/src/data/event.ts`

Arquivos de foto (para a galeria do home):

- `geek-toys-home/public/eventos/<slug>/evento-*.jpg` — consumidos por `GallerySection`
- Cópia opcional em `public/eventos/<slug>/` neste repo (não alimenta UI da loja)

---

## O que a loja tem

| Feature                       | Onde                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| Banner no topo (páginas shop) | `EventAnnouncementBanner`                                      |
| Link “Evento” no header       | `ShopHeader`                                                   |
| Card na home                  | `EventPromoCard` em `ShopHome`                                 |
| Página completa               | `/evento` → `EventPage`                                        |
| Reserva WhatsApp              | `EventTicketForm`                                              |
| Link para fotos               | botão na página do evento → `https://geeketoys.com.br#galeria` |

---

## Operação (Laura)

1. Editar `src/data/event.ts` nos **dois** repos (título, data, preço, textos, WhatsApp)
2. Fotos novas: colocar em `geek-toys-home/public/eventos/<slug>/` e listar no array de `GallerySection` (ou manter padrão `evento-01.jpg` …)
3. Deploy loja: push `master` (CI)
4. Deploy home: push `main` (Vercel)

`enabled: false` esconde banner/card/link e redireciona `/evento` → home da loja.

---

## Evento ativo (referência)

| Campo            | Valor                          |
| ---------------- | ------------------------------ |
| Data             | Domingo, 6 de setembro de 2026 |
| Horário          | 14h–18h                        |
| Ingresso         | R$ 20 / pessoa                 |
| Isentos          | Criança de colo e criança PCD  |
| WhatsApp reserva | (11) 91466-2881                |

---

## Arquivos (loja)

| Arquivo                                            | Papel                  |
| -------------------------------------------------- | ---------------------- |
| `src/data/event.ts`                                | Config do evento ativo |
| `src/components/store/EventAnnouncementBanner.tsx` | Banner                 |
| `src/components/store/EventPromoCard.tsx`          | Destaque na home       |
| `src/components/store/EventTicketForm.tsx`         | Reserva                |
| `src/pages/shop/EventPage.tsx`                     | Página `/evento`       |

Detalhe e checklist do home: `geek-toys-home/docs/EVENTS.md`.
