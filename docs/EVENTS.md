# Eventos na loja (shop.geeketoys.com.br)

> **Última atualização:** 28 de Setembro de 2026  
> **Evento em cartaz:** **11/out/2026 (domingo) 14h–18h**, Mar Palace Copacabana Hotel, entrada **R$ 20** (membro R$ 10; criança de colo e PCD isentos), WhatsApp loja `(11) 91466-2881`  
> **Pagamento:** PIX da Pagar.me — **confirma sozinho** e libera os ingressos. Ver [Compra do ingresso](#compra-do-ingresso-pagarme-28092026).  
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

> **Quem esconde o evento passado é a vitrine, não a API** (26/09/2026). A API
> continua devolvendo o último publicado depois que ele termina, e o
> `FALLBACK_EVENT` embutido nos bundles é sempre um evento passado. Até 26/09,
> `isEventVisible` olhava só o `status`, então o evento de 20/09 seguia no ar
> no primeiro paint e em toda falha de rede — no navegador do Instagram, no 4G.
> Agora ela exige `published` **e** não terminado (`endsAt`, ou 24h depois do
> início quando não há término). A regra é a mesma nos dois repos.

Fluxo da Laura quando um evento termina:

1. Aba **Eventos** → **Duplicar** no evento que acabou (nasce rascunho, sem
   banner, com reservas fechadas)
2. Ajusta data, local e textos; envia o **flyer novo** (JPG/PNG/WebP, até 8 MB)
3. **Publicar** — o antigo pode ser **Encerrado** (arquivado)

Nada de deploy, nada de mexer nos dois repos.

### Compra do ingresso: Pagar.me (28/09/2026)

Até aqui o ingresso ainda usava o PIX **estático** anterior à migração: a
cliente pagava e os ingressos ficavam "aguardando confirmação" até alguém
conferir o extrato e clicar em **Confirmar pagamento** na aba **Ingressos**.
Agora é o mesmo PIX dinâmico da loja:

1. O formulário (loja `/evento` e `geeketoys.com.br#ingressos`) pede também o
   **CPF de quem paga** — a Pagar.me não emite a cobrança sem ele. Reserva só de
   isentos não pede.
2. A API cria a cobrança e devolve o QR. Na loja o QR aparece na hora; no site
   institucional, o botão leva a `shop.*/ingressos/<código>`.
3. A tela fica esperando ("esta tela atualiza sozinha"). Quando o PIX cai, a
   reserva vira **confirmada**, os ingressos ficam **válidos** e a cliente recebe
   o e-mail com os QR Codes. Ninguém precisa clicar em nada.
4. O código vale **24 horas**. Vencido, a página avisa e oferece nova reserva.

Na aba **Ingressos** do painel, a reserva pendente mostra **PIX automático**.
"Confirmar à mão" continua existindo para dinheiro que chegou por outro meio, e
pede confirmação. **Cancelar uma reserva paga estorna o valor** pela Pagar.me.
Detalhes técnicos em [`PAGARME.md`](PAGARME.md#pix-de-ingresso-de-evento-desde-28092026).

### Aba Ingressos: um evento por vez (28/09/2026)

Pedido da Laura: _"como vou saber quais ingressos são novos e quais são os
antigos? Não entendi se alguém comprou ou se já usou. Evento que acabou vira
histórico, senão eu me perco."_ Os números do topo somavam **todos** os
eventos: com o evento de 11/10 sem nenhuma venda paga, a aba dizia "8 válidos,
18 já entraram" — tudo do evento de 20/09. E a lista não dizia de qual evento
era cada compra.

- **Seletor "Qual evento?"** no topo. Abre no próximo evento que ainda não
  acabou (arquivado não conta); os que já aconteceram ficam no grupo
  **Histórico**. Existe também "Todos os eventos juntos", que mostra o nome do
  evento em cada compra. Regra em `pickCurrentEvent()` / `isEventOver()`
  (`src/data/event.ts`).
- **Números do evento escolhido**: _Ingressos pagos_, _Já entraram_, _Ainda vão
  entrar_ (no histórico: _Não compareceram_) e _Aguardando pagamento_. A API
  filtra o resumo por `eventId`; status e busca mexem só na lista.
- **Cada ingresso diz o que aconteceu**: "Entrou 20/09 às 14:32", "Pago — ainda
  não entrou", "Não compareceu" (evento passado), "Aguardando pagamento",
  "Cancelado" — `ticketSituation()` em `src/lib/event-tickets.ts`. A lista abre
  em **Pagas**, que é o que responde "quem comprou".
- **O valor de cada pessoa fica na compra** (06/10/2026): três ingressos com
  duas meias saíam como "3 ingresso(s) · R$ 40,00" numa grade de duas colunas,
  e o selo de meia cabia cortado. R$ 40 é o preço de duas inteiras, então a
  lista parecia ter dois nomes pagos. Cada pessoa agora ocupa uma linha, com o
  preço, e o total diz a mistura ("1 inteira + 2 meias de membro"). A busca
  também acha o nome de quem vai entrar, não só de quem pagou.
- **A meia não sai na palavra de quem compra** (06/10/2026). `kind: member` só
  cobra a metade quando o CPF daquele ingresso é de um sócio **ativo** e não
  vencido, e o nome é o da carteirinha. Cada sócio tem uma meia por evento. Se
  a conferência falha, a reserva inteira é recusada e nada é cobrado. Meia
  antiga, sem essa conferência, aparece como **Meia sem sócio conferido**.
  Isento (colo ou PCD) continua sem cadastro para conferir.
- **No histórico** a portaria some da tela e aparece o aviso de que aqueles
  ingressos não valem para outro evento.

**A portaria agora confere o evento.** Até aqui o check-in queimava qualquer
ingresso `valid`, de qualquer evento: os 8 ingressos pagos de 20/09 que não
foram usados entrariam em 11/10. O código só é aceito de **12h antes do início
até 6h depois do fim** do próprio evento (sem fim cadastrado, 24h depois do
início). Fora disso: _ENTRADA NEGADA — "Este ingresso é de outro evento:
Photocard Trading (20/09). Não vale para hoje."_, e o código **não** é
queimado. A janela está no próprio `UPDATE` (relógio do banco, uma instrução
só). Um ingresso já usado em evento passado diz o dia e o evento. Entrada
liberada mostra também o nome do evento.

### Portaria no PDV (28/09/2026)

O vendedor faz a portaria pelo **PDV** (`/pdv`, botão **Portaria**), sem conta
de admin. É o mesmo componente da aba Ingressos (`TicketCheckIn`), então as
duas telas respondem igual: leitor de QR, código digitado, ENTRADA LIBERADA /
NEGADA com o motivo. Em cima, o evento publicado (`GET /events/active`) e três
contadores — já entraram, ainda vão entrar, aguardando pagamento — de
`GET /events/admin/:eventId/stats`, que já aceitava `seller`; atualizam a cada
leitura. Sem evento publicado e em andamento/futuro, o PDV diz isso em vez de
mostrar números de um evento velho (o `FALLBACK_EVENT` embutido é passado). O
vendedor não vê a lista de compradores: `GET /events/admin/reservations`
continua só de admin, porque traz CPF, e-mail e telefone.

### Validação do cadastro (28/09/2026)

O valor da entrada é o que o PIX cobra, então o painel passou a recusar o que
não dá para cobrar: valor que não é número (antes virava "gratuito" em
silêncio), reserva aberta sem valor (use 0,00 para gratuito), máximo por reserva
fora de 1–500, WhatsApp sem DDI e link do Maps que não começa com `https://`.
Os limites de tamanho de cada texto são os mesmos da API, com o nome do campo na
mensagem.

E o **preço nos textos**: a faixa do topo, a vantagem do membro, as observações
da reserva, a descrição e os destaques repetem o preço à mão. Se algum deles
citar um valor diferente da entrada ou da meia de membro, o painel pergunta
antes de salvar — foi assim que o evento de 11/10 ficou dizendo R$ 22 em cinco
lugares quando a entrada era R$ 20. Da descrição e dos destaques só entram as
linhas que falam em "entrada" ou "ingresso": a linha da premiação (R$ 200 ao 1º
lugar) não é preço.

### Layout da página do evento (27/09/2026)

A loja (`/evento`) e o site (`#evento`) seguem o desenho das páginas de
ingresso: a primeira tela responde **o quê, quando, onde e quanto** — título,
"Quando" (data + horário), "Local" (com mapa), "Entrada" (com o preço de membro)
— e traz **Reservar ingresso** e os botões de link. O cartaz principal fica ao
lado no desktop e abaixo no celular; os outros cartazes vêm em "Mais sobre o
evento" com os botões de novo. No celular da loja há uma barra fixa "Reservar"
que some quando o formulário entra na tela. Antes, os dois cartazes vinham
primeiro e empurravam tudo isso para depois de ~1000 px de imagem.

Datas e horas saem de `formatEventDay` / `formatEventTime` (`14h às 18h`), em
horário do Rio. O último evento lido fica em `localStorage` e pinta de imediato
na próxima visita — sem isso, com o fallback sempre passado, uma rede lenta
mostrava a loja sem evento até a API responder.

### Preview do link do evento (27/09/2026)

Link de **produto** já saía com foto, nome e preço no WhatsApp; o de
**`/evento`** — o que a loja mais divulga — saía com o card genérico da loja,
porque WhatsApp/Instagram não rodam JavaScript e leem só o shell estático.
Agora o nginx manda crawler (`$is_link_crawler`) de `/evento` para
`GET /events/active/share`, que devolve um HTML mínimo com:

- `og:image` = o cartaz (banner, ou a primeira arte extra)
- título com a data (`Evento GeeKpop! — Domingo, 11 de outubro, 14h às 18h`) e
  descrição com local e preço (e o de membro)
- JSON-LD `schema.org/Event` com local, horário e oferta

Desde 30/09/2026 o Google **não** passa mais por aqui: buscador recebe a SPA, e
o `Event` que ele lê sai do `EventPage` (`src/lib/structured-data.ts`). Ver
`docs/SEO.md`.

Mesma regra da vitrine: evento que já terminou responde 404. Cache de 5 min. O
WhatsApp guarda o preview do link por dias — para ver o novo, compartilhe o link
com um parâmetro qualquer (`/evento?v=2`).

### Mais imagens e botões de link (26/09/2026)

Um evento pode ter mais de uma arte e mais de uma chamada. O caso que motivou:
o evento de 11/10 tem o cartaz do evento **e** o da competição de dança, e a
inscrição da competição é um formulário externo. A Laura procurou como "criar
link para imagem" e não havia onde — o cadastro tinha um banner e nenhum link.

Na aba **Eventos**, ao editar:

- **Mais imagens** — envia outra arte (até 6). Aparece depois do banner, na
  ordem de envio. `POST /events/admin/events/:id/flyers`; remover é `PATCH` com
  a lista `flyers` sem ela.
- **Botões de link** — texto + link (até 6), salvos com o botão **Salvar**. Link
  colado sem `https://` ganha o prefixo; qualquer outro esquema é recusado no
  painel, na API (Zod) e de novo na vitrine, porque vira `href`.

Na página do evento (loja `/evento` e `geeketoys.com.br#evento`) as artes ficam
lado a lado — tocar abre em tamanho cheio, porque o texto de cartaz é pequeno no
celular — e embaixo vêm **Reservar ingresso** (se as reservas estão abertas) e
os botões cadastrados. Colunas `flyers`/`links` em JSONB, migration 036.
**Duplicar** leva os botões (revise o link) e não leva as artes.

> **O envio de imagem estava quebrado de 08/09 a 26/09.** A guarda contra path
> traversal no upload (`uploadDir`) só aceitava UUID, e o id do evento é slug —
> todo envio de banner respondia "Evento inválido.". Corrigido com
> `{ allowSlug: true }`, que aceita só letras minúsculas, dígitos e hífen interno.

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
| Reserva + ingresso nominal    | `EventTicketForm` (CPF + PIX Pagar.me, espera a confirmação)   |
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
5. Aba **Ingressos**: abre sozinha no próximo evento; o que já passou fica em
   **Histórico** no seletor "Qual evento?"

Status `draft`/`archived` esconde banner/card/link e redireciona `/evento` → home
da loja. Para parar de vender sem esconder o evento, desmarque **Aceitar novas
reservas** — os ingressos já emitidos continuam válidos na portaria.

---

## Evento ativo (referência)

| Campo                 | Valor                                                      |
| --------------------- | ---------------------------------------------------------- |
| Título                | Evento GeeKpop! (id `evento-geekpop`)                      |
| Data                  | Domingo, 11 de outubro de 2026                             |
| Horário               | 14h–18h                                                    |
| Local                 | Mar Palace Copacabana Hotel — Av. N. S. de Copacabana, 552 |
| Entrada               | R$ 20 / pessoa · membro do Clube R$ 10                     |
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
   todos `pending`), o cliente recebe e-mail com o link `/ingressos/<código>` e o
   admin recebe aviso. Se a API estiver fora, o formulário ainda abre o WhatsApp
   — a venda não morre no formulário, só entra à mão no painel.
3. **Pagamento (PIX na tela)** — a reserva já nasce com QR Code e copia-e-cola
   (mesmo EMV da loja, `pix_txid` guardado na migration 031). O código aparece na
   tela de confirmação, na página `/ingressos/<código>` enquanto estiver pendente
   e **no e-mail** — cliente de e-mail não desenha QR, então lá vai o
   copia-e-cola. Botão _Reenviar por e-mail_ em
   `POST /events/reservations/:code/payment-link` para quem fechou a aba.
   O WhatsApp virou secundário: antes disto, se o popup não abrisse (comum no
   celular), a reserva ficava sem nenhuma forma de pagar.
4. **Confirmação** — admin confere o pagamento e clica _Confirmar pagamento_ na
   aba **Ingressos**. Os ingressos viram `valid` e o QR aparece para o cliente.
   Antes disso o QR nem é renderizado: um QR bonito com pagamento pendente é
   exatamente o print que a portaria não deveria aceitar.
5. **Portaria** — aba **Ingressos** → _Portaria_: leitor de QR (ou código
   digitado). A leitura **queima** o código (`valid` → `used`). A segunda leitura
   do mesmo QR mostra _ENTRADA NEGADA_ com a hora da primeira. Ingresso de
   outro evento (fora da janela de 12h antes a 6h depois) é negado sem ser
   queimado. `seller` também tem acesso: quem fica na porta é quem opera o PDV.

### Estados

| Reserva     | Ingresso    | Significado                              |
| ----------- | ----------- | ---------------------------------------- |
| `pending`   | `pending`   | Aguardando confirmação do pagamento      |
| `confirmed` | `valid`     | Vale entrada (QR liberado)               |
| `confirmed` | `used`      | Já entrou — `used_at` guarda a hora      |
| `cancelled` | `cancelled` | Não vale; quem já entrou continua `used` |

### Endpoints

| Método | Rota                                      | Quem                   |
| ------ | ----------------------------------------- | ---------------------- |
| POST   | `/events/:eventId/reservations`           | público (optionalAuth) |
| GET    | `/events/tickets/:code`                   | público                |
| GET    | `/events/reservations/:code`              | público                |
| POST   | `/events/reservations/:code/payment-link` | público (rate limit)   |
| GET    | `/events/my-reservations`                 | cliente logada         |
| GET    | `/events/admin/reservations`              | admin                  |
| POST   | `/events/admin/reservations/:id/confirm`  | admin                  |
| POST   | `/events/admin/reservations/:id/cancel`   | admin                  |
| POST   | `/events/admin/check-in`                  | admin/seller           |
| GET    | `/events/admin/:eventId/stats`            | admin/seller           |

Os códigos públicos são inadivinháveis (alfabeto sem `0/O/1/I/L`, para o dia em
que a câmera não colaborar e alguém digitar). O link não é o que protege a
portaria — o que protege é o check-in queimar o código.

### Acompanhar no perfil

A reserva aparece em **Meu perfil → Meus ingressos** (`GET /events/my-reservations`),
com status e botão _Pagar_ quando pendente. Casa por `user_id` **ou** pelo e-mail
do cadastro, então quem reservou deslogada e criou conta depois também encontra a
compra sem falar com a loja.

### Onde a pendência aparece

Reserva `pending` entra no **Painel do dia** (`ActionCenter`, card _Ingressos
aguardando_, rotina) e na fila `event_tickets_pending` do digest diário. Desde
28/09/2026 a Pagar.me confirma o PIX sozinha; quem permanece na fila gerou o
código e não pagou. Confirmar à mão continua existindo para o caso em que o
valor caiu e o webhook não chegou — e só depois disso.

### Pendências conhecidas

- ~~O site institucional (`geek-toys-home`) tem **a sua própria** cópia do
  formulário, ainda só-WhatsApp.~~ **Resolvido em 23/08/2026** — o formulário
  de lá agora faz o mesmo `POST /events/:id/reservations` e manda a pessoa para
  `/ingressos/<código>` desta loja, onde o PIX é exibido. As duas vitrines caem
  na mesma tabela.

  > Esta pendência ficou aberta e **cobrou o preço**: em 23/08 uma reserva de 2
  > ingressos (R$ 40) chegou como mensagem solta de WhatsApp. Não existia no
  > banco, a cliente nunca viu o PIX e a admin não foi notificada — ninguém
  > conseguia pagar nem confirmar. Foi lançada à mão (`R-PWW2-ZVLZ`). Antes
  > dela, o sistema inteiro tinha **uma** reserva registrada.

- ~~A API aceita check-in de `seller`, mas a tela vive no painel admin~~ —
  resolvido em 28/09/2026: o PDV ganhou o modo **Portaria** (ver abaixo).
- Não há limite de capacidade do evento (lotação). Se precisar, o lugar é uma
  contagem por `event_id` em `event_tickets` antes do INSERT.
