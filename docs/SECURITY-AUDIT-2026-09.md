# Auditoria de segurança — 07/09/2026

Revisão do projeto inteiro com evidência: dependências, autenticação,
autorização, injeção, XSS, cabeçalhos, segredos e superfície pública.

---

## Achado crítico: a CSP bloqueava o pagamento com cartão ⚠️

O checkout tokeniza o cartão **no navegador**, chamando
`https://api.pagar.me/core/v5/tokens`. A `connect-src` da CSP listava
`api.stripe.com` e **não listava `api.pagar.me`** — herança da integração
anterior que a migração não acompanhou.

Efeito: o navegador bloquearia a chamada, e o cliente veria a tentativa falhar
**sem nada na tela explicando** (violação de CSP não vira erro de aplicação).
Cartão simplesmente não funcionaria.

Corrigido nos dois lugares que emitem a política — `server/nginx/shared-headers.conf`
(SPA) e o `helmet` em `server/api/src/index.ts` (API) — e conferido no cabeçalho
servido em produção.

> Nenhum teste pegaria isto: a CSP não existe no jsdom, e os testes mockam a
> chamada de rede. Só aparece num navegador de verdade, ou lendo o cabeçalho.

---

## Dependências

|          | Antes                                    | Depois          |
| -------- | ---------------------------------------- | --------------- |
| Frontend | 3 altas                                  | **0**           |
| Backend  | 1 crítica, 2 altas, 4 moderadas, 1 baixa | **4 moderadas** |

**Frontend**: `react-router` tinha _open redirect_ via URL relativa a protocolo
(`//evil.com`) — genuinamente explorável. Resolvido com `npm audit fix`.

**Backend**: a crítica (`tar`, escrita arbitrária de arquivo) e a alta
(`@mapbox/node-pre-gyp`) vinham do `bcrypt@5`, que os usa **na instalação** para
baixar binários — não são alcançáveis por entrada de usuário em runtime. Ainda
assim, `bcrypt@6` os elimina da árvore de vez (passou a usar `node-gyp-build`).

Como troca de módulo nativo é risco de deploy, foi verificada de ponta a ponta
antes de valer: a imagem Docker **compilou**, o container subiu `healthy`, e o
login de um hash gravado pelo bcrypt 5 **funciona** (o formato não mudou), com
senha errada ainda recusada com 401.

### As 4 moderadas que ficam, e por quê

| Pacote               | Risco real aqui                                                                                                                                                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-cron` → `uuid` | A falha é de _bounds_ em `uuid` v3/v5/v6 quando se passa `buf`; não é o uso do node-cron. Corrigir exige `node-cron@4` (**major**), e o cron é quem concilia pagamento — não é lugar de upgrade sem janela |
| `morgan`             | _Log forging_ com caracteres de controle na requisição. Real, impacto baixo: suja o log, não escala privilégio                                                                                             |
| `qs`                 | DoS em `qs.stringify`; o Express usa `parse`                                                                                                                                                               |
| `body-parser`        | DoS com `limit` inválido — valor nosso, não do cliente                                                                                                                                                     |

---

## O que foi verificado e está adequado

**Injeção de SQL — limpo.** Todo valor de usuário passa por `$n`. As
interpolações que existem são identificadores em **lista branca**
(`ORDER BY ${sortColumn}` só aceita `created_at`/`full_name`/`expiry_date`),
números já validados, ou constantes do código.

**XSS — sem superfície.** Nenhum `dangerouslySetInnerHTML` na SPA; o React
escapa. Os e-mails passam por `escapeHtml` no que vem do usuário.

**Autenticação.** `bcrypt` com rounds configurados; refresh token em cookie
**httpOnly + secure + sameSite=lax**, com escopo `/auth`.

**Sem enumeração de conta.** O login devolve a mesma mensagem para e-mail
inexistente e senha errada. O "esqueci a senha" **retorna em silêncio** para
e-mail desconhecido. Os quatro 404 de "usuário não encontrado" estão todos em
rotas que já exigem JWT ou token.

**Cabeçalhos.** HSTS com `includeSubDomains`, `nosniff`, `frame-ancestors 'none'`
na loja, `referrer-policy: no-referrer`, `object-src 'none'`, `base-uri 'self'`.

**Autorização.** `route-protection.test.ts` lê os 25 routers e reprova rota sem
guarda; o que é público está declarado com o motivo escrito.

**Upload.** PDF limitado a 5 MB, com verificação do **conteúdo** e não só do
mimetype declarado (que o cliente forja).

**Segredos.** Nada versionado (`.env` no `.gitignore`, só `.env.example`). O
`.env` da VPS está `600`, root. Os backups que a auditoria criou foram removidos
pelo `rsync --delete` do deploy.

**Rate limit.** 5 camadas (auth 20/5min, pagamento 10/min, consulta pública
15/min, e-mail 5/5min, padrão 100/min), com `trust proxy` para o IP real.

---

## Pontos fracos conhecidos (decisão, não descuido)

**Tokens no `localStorage`.** O access token e o refresh ficam lá além do
cookie httpOnly, porque a API é cross-origin. Um XSS os leria — mas não há
superfície de XSS hoje, e a CSP é restritiva. O cookie httpOnly já é o caminho
preferencial do refresh.

**Sem bloqueio por conta.** A proteção contra força bruta é só rate limit por
IP (20 tentativas / 5 min). Um atacante distribuído contorna. Aceitável para o
volume atual; se virar problema, o próximo passo é contar falhas por conta.

**`GET /members/cpf-exists/:cpf` é público.** Devolve `{exists: boolean}` e
permite sondar se um CPF é membro. Trade-off registrado: é o que avisa "CPF já
cadastrado" antes de criar a conta, e está a 15 req/min.

**Meia-entrada de evento é autodeclarada** — ver `MEMBER-CARD-TICKETS.md`.

---

## Ação pendente do dono do projeto

**Rotacionar a `PAGARME_SECRET_KEY`.** Ela foi colada no chat durante a
configuração e está no histórico daquela conversa. Trocar no painel e atualizar
o `.env` leva um minuto. A senha do webhook idem — embora essa seja menos grave,
porque o processador relê a cobrança na API antes de liquidar qualquer coisa.
