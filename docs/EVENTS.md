# Eventos na loja (shop.geeketoys.com.br)

> **Última atualização:** 21 de Agosto de 2026  
> **Pedido Laura:** evento **6/set/2026 (domingo) 14h–18h**, ingresso **R$ 20** (criança de colo e PCD isentos), WhatsApp loja `(11) 91466-2881`  
> **Onde roda:** loja (`shop.*`) neste repo **e** site institucional (`geek-toys-home`)

> **Galeria:** fotos oficiais ficam na **galeria geral do site principal** (`geeketoys.com.br#galeria`).  
> **Não** há seção `#fotos-evento` nem botões de download na loja/home.

---

## Superfícies

| Superfície         | Repo                     | URL                                 | Papel do evento                                         |
| ------------------ | ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| **Loja online**    | este (`clube-geek-toys`) | `https://shop.geeketoys.com.br`     | Banner, card, `/evento`, reserva + ingresso nominal     |
| Site institucional | `geek-toys-home`         | `https://geeketoys.com.br` / `www.` | Banner, `#evento`, `#ingressos`, **galeria** `#galeria` |

Config do evento (data, preço, textos) deve ficar **sincronizada** entre:

- `src/data/event.ts` (este repo — vitrine da loja)
- `geek-toys-home/src/data/event.ts` (site institucional)
- `server/api/src/config/events.ts` (**API** — preço e janela de venda)

A cópia da API não é redundância preguiçosa: quem manda o POST da reserva também
mandaria o preço se ele viesse do cliente. O servidor calcula o total a partir
**da sua** tabela.

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
| Reserva + ingresso nominal    | `EventTicketForm`                                              |
| Ingressos da compra           | `/ingressos/:code` → `TicketPage mode="reservation"`           |
| Ingresso avulso (QR)          | `/ingresso/:code` → `TicketPage mode="ticket"`                 |
| Portaria e reservas (admin)   | aba **Ingressos** → `EventTicketsTab`                          |
| Link para fotos               | botão na página do evento → `https://geeketoys.com.br#galeria` |

---

## Operação (Laura)

1. Editar `src/data/event.ts` nos **dois** repos + `server/api/src/config/events.ts` (título, data, preço, textos, WhatsApp)
2. Fotos novas: colocar em `geek-toys-home/public/eventos/<slug>/` e listar no array de `GallerySection` (ou manter padrão `evento-01.jpg` …)
3. Deploy loja: push `master` (CI)
4. Deploy home: push `main` (Vercel)

`enabled: false` esconde banner/card/link e redireciona `/evento` → home da loja.

---

## Evento ativo (referência)

| Campo                 | Valor                                  |
| --------------------- | -------------------------------------- |
| Data                  | Domingo, 6 de setembro de 2026         |
| Horário               | 14h–18h                                |
| Ingresso              | R$ 20 / pessoa                         |
| Isentos               | Criança de colo e criança PCD          |
| WhatsApp reserva      | (11) 91466-2881                        |
| Ingressos por reserva | sem teto (freio anti-abuso da API: 50) |

---

## Arquivos (loja)

| Arquivo                                            | Papel                   |
| -------------------------------------------------- | ----------------------- |
| `src/data/event.ts`                                | Config do evento ativo  |
| `src/components/store/EventAnnouncementBanner.tsx` | Banner                  |
| `src/components/store/EventPromoCard.tsx`          | Destaque na home        |
| `src/components/store/EventTicketForm.tsx`         | Reserva + ingressos     |
| `src/components/store/TicketCard.tsx`              | O ingresso (QR)         |
| `src/pages/shop/EventPage.tsx`                     | Página `/evento`        |
| `src/pages/shop/TicketPage.tsx`                    | `/ingresso(s)/:code`    |
| `src/lib/event-tickets.ts`                         | Cliente da API          |
| `src/components/admin/EventTicketsTab.tsx`         | Painel + portaria       |
| `server/api/src/config/events.ts`                  | Preço/janela (servidor) |
| `server/api/src/services/event.service.ts`         | Reservas e check-in     |
| `server/api/src/routes/event.routes.ts`            | Endpoints `/events`     |

Detalhe e checklist do home: `geek-toys-home/docs/EVENTS.md`.

---

## Ingressos nominais (21/08/2026)

Antes disto, o "ingresso" era a mensagem de WhatsApp da reserva: qualquer print
valia na porta e a reserva só existia na conversa. Uma família também esbarrou
no teto de 6 por reserva. As duas coisas foram resolvidas juntas.

### Como funciona

1. **Reserva** (`/evento#ingressos`) — o cliente informa o nome **de cada
   pessoa** e o tipo do ingresso (inteira, membro 50%, isento). Sem teto de
   quantidade; a API recusa acima de 50 (`MAX_TICKETS_PER_RESERVATION`) só para
   não virar porta de abuso.
2. A reserva é gravada (`event_reservations` + um `event_tickets` por pessoa,
   todos `pending`), o cliente recebe e-mail com o link `/ingressos/<código>`, o
   admin recebe aviso, e o WhatsApp abre com o **código da reserva** na mensagem.
   Se a API estiver fora, o formulário ainda abre o WhatsApp — a venda não morre
   no formulário, só entra à mão no painel.
3. **Confirmação** — admin confere o pagamento e clica _Confirmar pagamento_ na
   aba **Ingressos**. Os ingressos viram `valid` e o QR aparece para o cliente.
   Antes disso o QR nem é renderizado: um QR bonito com pagamento pendente é
   exatamente o print que a portaria não deveria aceitar.
4. **Portaria** — aba **Ingressos** → _Portaria_: leitor de QR (ou código
   digitado). A leitura **queima** o código (`valid` → `used`). A segunda leitura
   do mesmo QR mostra _ENTRADA NEGADA_ com a hora da primeira. `seller` também
   tem acesso: quem fica na porta é quem opera o PDV.

### Estados

| Reserva     | Ingresso    | Significado                              |
| ----------- | ----------- | ---------------------------------------- |
| `pending`   | `pending`   | Aguardando confirmação do pagamento      |
| `confirmed` | `valid`     | Vale entrada (QR liberado)               |
| `confirmed` | `used`      | Já entrou — `used_at` guarda a hora      |
| `cancelled` | `cancelled` | Não vale; quem já entrou continua `used` |

### Endpoints

| Método | Rota                                     | Quem         |
| ------ | ---------------------------------------- | ------------ |
| POST   | `/events/:eventId/reservations`          | público      |
| GET    | `/events/tickets/:code`                  | público      |
| GET    | `/events/reservations/:code`             | público      |
| GET    | `/events/admin/reservations`             | admin        |
| POST   | `/events/admin/reservations/:id/confirm` | admin        |
| POST   | `/events/admin/reservations/:id/cancel`  | admin        |
| POST   | `/events/admin/check-in`                 | admin/seller |
| GET    | `/events/admin/:eventId/stats`           | admin/seller |

Os códigos públicos são inadivinháveis (alfabeto sem `0/O/1/I/L`, para o dia em
que a câmera não colaborar e alguém digitar). O link não é o que protege a
portaria — o que protege é o check-in queimar o código.

### Onde a pendência aparece

Reserva `pending` entra no **Painel do dia** (`ActionCenter`, card _Ingressos a
confirmar_, severidade urgente) e na fila `event_tickets_pending` do digest
diário por e-mail. Motivo: uma reserva esquecida não é só dinheiro parado — é
uma família barrada na porta no domingo.

### Pendências conhecidas

- O site institucional (`geek-toys-home`) tem **a sua própria** cópia do
  formulário, ainda só-WhatsApp. Enquanto ela existir, quem reserva por lá não
  ganha ingresso nominal. O caminho mais curto é apontar o CTA de lá para
  `shop.geeketoys.com.br/evento#ingressos`.
- A API aceita check-in de `seller`, mas a tela vive no painel admin, que só
  abre para `admin`. Na prática a portaria roda com a conta da Laura; para o
  vendedor operar sozinho, a tela precisa de um atalho no PDV.
- Não há limite de capacidade do evento (lotação). Se precisar, o lugar é uma
  contagem por `event_id` em `event_tickets` antes do INSERT.
