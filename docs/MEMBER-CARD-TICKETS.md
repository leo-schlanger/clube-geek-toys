# Carteirinha, benefícios e ingressos

Revisão completa de 06/09/2026. Cobre a carteirinha digital, os benefícios do
associado, as interações por QR Code e os ingressos de evento.

---

## 1. Carteirinha digital

### Como funciona

O QR da carteirinha (`MembershipCard.tsx`) codifica uma **URL real**:

```
https://club.geeketoys.com.br/verificar/{memberId}
```

Quem escaneia com a câmera do celular — sem app nenhum — abre a página pública
`/verificar/:id`, que chama `GET /members/verify/:id` e mostra nome, situação,
validade e o desconto vigente.

### Validado em produção

| Verificação               | Resultado                                         |
| ------------------------- | ------------------------------------------------- |
| Membro real (`53d5009a…`) | ✅ `isCurrent: true`, validade 16/08/2027         |
| Página `/verificar/<id>`  | ✅ HTTP 200                                       |
| UUID inexistente          | ✅ 404 "Carteirinha não encontrada"               |
| Identificador malformado  | ✅ 400, barrado pelo regex antes de tocar o banco |

`isCurrent` exige as três coisas juntas: `status = 'active'`, ter `expiry_date` e
essa data não ter passado. Um membro ativo **sem** validade lê como vencido —
foi por isso que o webhook passou a ancorar a data em hoje quando ela está vazia
ou velha.

### O que a rota expõe

Nome, situação, validade, desconto e nome do plano. Nada de CPF, e-mail ou
telefone. O id é UUID — não dá para varrer.

---

## 2. Benefício do associado

`MEMBER_SHOP_DISCOUNT = 0.10` no servidor é o que o checkout aplica, sempre
recalculado server-side. `MEMBER_DISCOUNT_PERCENT` no front é a mesma coisa para
o texto.

### A armadilha que existia

Havia no catálogo de configurações a chave **`plan.club.discount_products`**,
com padrão **15**, descrita como _"Desconto do membro em produtos (%)"_,
editável e salvável na aba Configurações — e **nada no código lia esse valor**.
O checkout aplicava 10% o tempo todo.

Alguém subindo para 20% numa promoção salvaria a mudança, veria a tela
confirmar, e os membros continuariam pagando o mesmo.

**A chave foi removida, não ligada.** Ligá-la criaria uma mentira pior: a
porcentagem está escrita nos **Termos de Uso** (documento legal), na descrição
de SEO, no onboarding e na tela de boas-vindas. Mudá-la é deploy de qualquer
forma, e um botão que sugere o contrário só deixaria o checkout discordar do
contrato.

O que passou a existir: `MEMBER_DISCOUNT_PERCENT` como fonte única, e as telas
que **afirmam** o benefício derivam dela — plano, onboarding, boas-vindas, selo
da loja, login/cadastro, página de produto, SEO e a página de assinatura. Os
Termos de Uso seguem com o número literal, de propósito, com comentário
explicando: contrato se lê como promessa fixa.

### Onde o desconto entra

`retailDiscountCandidates` devolve os candidatos e `pickBestDiscount` escolhe o
maior — eles **não se somam**. Empate fica com o membro, porque é o que a pessoa
perderia ao cancelar. Atacado troca o conjunto inteiro pelos 25% dele.

---

## 3. Ingressos de evento

### O ciclo

```
reserva (público)  → tickets criados já, status `pending`
confirmação (admin)→ tickets viram `valid`, e-mail com os QR
portaria (admin)   → check-in queima o ingresso
```

O QR do ingresso codifica `https://shop.geeketoys.com.br/ingresso/{code}`.

### Validado em produção

| Verificação                      | Resultado                               |
| -------------------------------- | --------------------------------------- |
| Ingresso real `T-NRFH-7J3A-9CMP` | ✅ nome, evento, local, `status: valid` |
| Página `/ingresso/<code>`        | ✅ HTTP 200                             |
| Código inexistente               | ✅ 404                                  |

### O que está bem resolvido

**Check-in é atômico.** `UPDATE ... WHERE code = $1 AND status = 'valid'` — quem
queima o ingresso é o próprio UPDATE, então escanear duas vezes não libera duas
entradas. A segunda leitura cai no ramo `already_used` e mostra a hora da
primeira, **no fuso de São Paulo** (o container roda em UTC; sem fixar a zona a
portaria leria três horas a mais e discutiria com a pessoa na porta).

**A costura scanner → check-in está coberta.** O QR contém uma URL, o check-in
espera um código: `extractTicketCode` tira o código de `/ingresso/{code}`, e o
mesmo caminho serve para o código digitado à mão. Tem teste para URL, código
puro e link com query string.

**QR só aparece em ingresso liberado.** Um ingresso `pending` não desenha QR —
um QR bonito com pagamento pendente é exatamente a impressão que a portaria não
pode aceitar.

### Meia-entrada é autodeclarada

`POST /events/:eventId/reservations` é público e aceita `kind: 'member'` pelo
valor de face: **ninguém verifica se a pessoa é sócia**. Como só o nome do
acompanhante é informado, não há o que verificar server-side.

O controle é humano, em dois momentos: ao confirmar o pagamento e na portaria.
A tela de check-in já mostrava o tipo; a **lista de reservas não mostrava** — a
linha de uma meia era idêntica à de uma inteira, justo onde a equipe decide se
o valor recebido está certo. Agora os tipos que custam menos aparecem marcados
(inteira não, para não virar ruído).

Hoje em produção: 8 inteiras (R$ 160), 1 meia (R$ 10), 1 isento.

---

## 4. Resumo

| Área                               | Situação                                           |
| ---------------------------------- | -------------------------------------------------- |
| QR da carteirinha                  | ✅ real, validado de ponta a ponta                 |
| Rota de verificação                | ✅ trata inexistente e malformado                  |
| Desconto no checkout               | ✅ server-side, não empilha                        |
| ~~Configuração morta de desconto~~ | ✅ removida                                        |
| Texto do benefício nas telas       | ✅ deriva de uma constante só                      |
| QR do ingresso                     | ✅ real, validado                                  |
| Check-in                           | ✅ atômico, idempotente, fuso correto              |
| Scanner → código                   | ✅ coberto e testado                               |
| Meia-entrada                       | ⚠️ honra; controle humano, agora visível no painel |
