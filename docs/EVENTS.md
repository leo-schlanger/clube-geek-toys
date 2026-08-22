# Eventos na loja (shop.geeketoys.com.br)

> **Última atualização:** 22 de Agosto de 2026  
> **Evento em cartaz:** **20/set/2026 (domingo) 14h–18h**, Mar Palace Copacabana Hotel, entrada **R$ 20** (criança de colo e PCD isentos), WhatsApp loja `(11) 91466-2881`  
> **Onde roda:** loja (`shop.*`) neste repo **e** site institucional (`geek-toys-home`)  
> **Quem edita:** a admin, na aba **Eventos** — não é mais deploy. Ver [Trocar de evento](#trocar-de-evento-sem-deploy).

> **Galeria:** fotos oficiais ficam na **galeria geral do site principal** (`geeketoys.com.br#galeria`).  
> **Não** há seção `#fotos-evento` nem botões de download na loja/home.

---

## Superfícies

| Superfície         | Repo                     | URL                                 | Papel do evento                                         |
| ------------------ | ------------------------ | ----------------------------------- | ------------------------------------------------------- |
| **Loja online**    | este (`clube-geek-toys`) | `https://shop.geeketoys.com.br`     | Banner, card, `/evento`, reserva + ingresso nominal     |
| Site institucional | `geek-toys-home`         | `https://geeketoys.com.br` / `www.` | Banner, `#evento`, `#ingressos`, **galeria** `#galeria` |

### Trocar de evento (sem deploy)

Config do evento (data, local, preço, textos, banner) vive na tabela **`events`**
(migration 029) e é editada na aba **Eventos** do admin. A API expõe
`GET /events/active`, e as duas vitrines consomem:

```
                    ┌─► loja  (shop.*)  — useActiveEvent()
banco `events` ──► GET /events/active
                    └─► home  (geeketoys.com.br) — useActiveEvent()
```

Só o evento com status **`published`** aparece. Entre vários publicados ganha o
que ainda não terminou e começa antes; se todos já passaram, o mais recente.
Isso faz o banner sumir sozinho quando o evento acaba.

Fluxo da Laura quando um evento termina:

1. Aba **Eventos** → **Duplicar** no evento que acabou (nasce rascunho, sem
   banner, com reservas fechadas)
2. Ajusta data, local e textos; envia o **flyer novo** (JPG/PNG/WebP, até 8 MB)
3. **Publicar** — o antigo pode ser **Encerrado** (arquivado)

Nada de deploy, nada de mexer nos dois repos.

> **Os arquivos `event.ts` ainda existem, mas viraram fallback.** Eles cobrem só
> o primeiro paint (e a API fora do ar). **Editá-los não muda o que o site
> mostra.** São três, e devem espelhar a linha semeada pela migration:
>
> - `src/data/event.ts` (loja) — `FALLBACK_EVENT`
> - `geek-toys-home/src/data/event.ts` (site) — `FALLBACK_EVENT`
> - `server/api/src/config/events.ts` (API) — `FALLBACK_EVENT`

O preço nunca vem do cliente: quem manda o POST da reserva mandaria o preço
junto se ele viesse do front. O servidor calcula o total a partir da **linha do
banco**, via `event-config.service`.

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

1. Aba **Eventos** do admin: criar (ou **Duplicar** o anterior), preencher, enviar o banner
2. **Publicar** — loja e site atualizam em até 1 minuto (cache curto do `/events/active`)
3. Fotos do evento: aba **Galeria** → aparecem em `geeketoys.com.br#galeria`
4. Ao encerrar: **Encerrar** (arquiva) e publicar o próximo

Status `draft`/`archived` esconde banner/card/link e redireciona `/evento` → home
da loja. Para parar de vender sem esconder o evento, desmarque **Aceitar novas
reservas** — os ingressos já emitidos continuam válidos na portaria.

---

## Evento ativo (referência)

| Campo                 | Valor                                                      |
| --------------------- | ---------------------------------------------------------- |
| Título                | Photocard Trading + Dança Livre de K-pop                   |
| Data                  | Domingo, 20 de setembro de 2026                            |
| Horário               | 14h–18h                                                    |
| Local                 | Mar Palace Copacabana Hotel — Av. N. S. de Copacabana, 552 |
| Entrada               | R$ 20 / pessoa (lanches grátis)                            |
| Isentos               | Criança de colo e criança PCD                              |
| WhatsApp reserva      | (11) 91466-2881                                            |
| Ingressos por reserva | sem teto (freio anti-abuso da API: 50)                     |

---

## Arquivos (loja)

| Arquivo                                            | Papel                  |
| -------------------------------------------------- | ---------------------- |
| `src/data/event.ts`                                | Tipos + fallback       |
| `src/hooks/useActiveEvent.ts`                      | Evento vivo (API)      |
| `src/lib/events.ts`                                | Cliente do cadastro    |
| `src/components/admin/EventConfigTab.tsx`          | **Aba Eventos** (CRUD) |
| `src/components/store/EventAnnouncementBanner.tsx` | Banner                 |
| `src/components/store/EventPromoCard.tsx`          | Destaque na home       |
| `src/components/store/EventTicketForm.tsx`         | Reserva + ingressos    |
| `src/components/store/TicketCard.tsx`              | O ingresso (QR)        |
| `src/pages/shop/EventPage.tsx`                     | Página `/evento`       |
| `src/pages/shop/TicketPage.tsx`                    | `/ingresso(s)/:code`   |
| `src/lib/event-tickets.ts`                         | Cliente da API         |
| `src/components/admin/EventTicketsTab.tsx`         | Painel + portaria      |
| `server/api/src/config/events.ts`                  | Tipos + fallback (API) |
| `server/api/src/services/event-config.service.ts`  | Cadastro no banco      |
| `server/api/src/services/event.service.ts`         | Reservas e check-in    |
| `server/api/src/routes/event.routes.ts`            | Endpoints `/events`    |

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
