# Logs, alertas e monitoramento

> Desde 02/10/2026. Antes disso: log em texto livre com 30 prefixos inventados,
> apagado a cada deploy; falha de backup e de cron escrita em arquivo que ninguém
> lia; e o único monitor rodando na mesma VPS que ele vigiava.

## 1. Onde está cada coisa

| O quê                                     | Onde                                              | Retenção               | Como ler                                                              |
| ----------------------------------------- | ------------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| Log da API (eventos, erros, acesso HTTP)  | journald do host, `CONTAINER_NAME=clube-geek-api` | 30 dias / 2 GB         | `journalctl CONTAINER_NAME=clube-geek-api --since -1d -o cat \| jq`   |
| Log de acesso do nginx                    | journald, `CONTAINER_NAME=clube-geek-nginx`       | idem                   | `journalctl CONTAINER_NAME=clube-geek-nginx --since -1h -o cat \| jq` |
| Erros 5xx da API e erros do navegador     | tabela `error_logs`                               | 90 dias                | painel admin → Logs → Erros                                           |
| Ações sensíveis (pagamento, papel, login) | tabela `audit_logs`                               | sem limpeza            | painel admin → Auditoria                                              |
| E-mails enviados                          | tabela `email_logs`                               | 1 ano                  | painel admin → Logs → E-mails                                         |
| Saída dos crons do host                   | `/var/log/clube-*.log`                            | 12 semanas (logrotate) | `tail /var/log/clube-backup.log`                                      |

O log sobrevive ao deploy porque a API e o nginx usam `logging: driver: journald`
(`server/docker-compose.yml`). `docker compose logs api` continua funcionando.

## 2. Formato

Uma linha = um objeto JSON (`pino`). Campos fixos:

| Campo    | Exemplo                                          | Para quê                                          |
| -------- | ------------------------------------------------ | ------------------------------------------------- |
| `time`   | `2026-10-02T09:12:03.120Z`                       | ISO, UTC                                          |
| `level`  | `info` / `warn` / `error`                        | `error` = alguém precisa olhar                    |
| `module` | `order`, `payment`, `reconcile`, `cron`, `http`… | filtrar por área — é o nome do arquivo do service |
| `reqId`  | `9f8e7d6c5b4a…`                                  | uma requisição de ponta a ponta                   |
| `err`    | `{ type, message, stack }`                       | erro serializado                                  |

**O `reqId` é o fio da meada.** O nginx gera (`$request_id`), registra no log
de acesso dele, repassa à API em `X-Request-Id`; a API usa o mesmo id em toda
linha daquela requisição, devolve no cabeçalho `X-Request-Id`, grava no
`context` do `error_logs`, e num erro 500 o corpo da resposta traz `requestId`
— que a SPA mostra ao cliente como _"Erro interno do servidor (código
9f8e7d6c)"_. O suporte cola o código:

```bash
journalctl CONTAINER_NAME=clube-geek-api --since -2d -o cat \
  | jq 'select(.reqId // .req.id | tostring | startswith("9f8e7d6c"))'
```

Outras consultas úteis:

```bash
# só erros da última hora
journalctl CONTAINER_NAME=clube-geek-api --since -1h -o cat | jq 'select(.level=="error")'
# tudo de pagamento hoje
journalctl CONTAINER_NAME=clube-geek-api --since today -o cat | jq 'select(.module|test("payment|pagarme|reconcile|order"))'
# respostas 4xx/5xx de uma rota
journalctl CONTAINER_NAME=clube-geek-api --since -1d -o cat | jq 'select(.req.path=="/orders" and .res.status>=400)'
```

### Níveis

- **4xx não é erro.** Cartão recusado, token vencido, produto removido: é o
  cliente, e sai como `info`/`warn`. Antes saía `[ERROR]`, igual a um 500, e o
  sinal real afogava.
- **5xx, falha de integração, falha de cron:** `error`.
- Recusa da Pagar.me (4xx dela) → `warn` e `severity: 'warning'` no `error_logs`;
  credencial recusada ou operadora fora (401/403/5xx) → `error`.

### O que nunca entra num log

Senha, token, cartão (`card_token`, `cvv`), CPF/documento, cookie, cabeçalho
`Authorization` — o logger redige esses campos sozinho (`config/logger.ts`,
`redact`). O log de acesso grava **o caminho sem a query string** (busca e UUID
de pedido de convidado ficam de fora). E-mail de cliente vai mascarado
(`maskEmail`: `lu***@gmail.com`); prefira o id.

### Escrevendo log

```ts
import { moduleLogger } from "../config/logger.js";
const log = moduleLogger("order");

log.info({ orderId, status }, "order cancelled");
log.error({ err, orderId }, "refund failed");
// dentro de rota/middleware, prefira req.log — já vem com o reqId
```

Não use `console.*` no backend (o único que sobra é o script de CLI
`db/seed-admin.ts`). Em teste o logger fica mudo (`VITEST` → `silent`); para
afirmar que algo foi logado, mocke `../config/logger.js` (exemplo em
`services/shipping.service.test.ts`).

## 3. Alertas

Dois canais, separados de propósito:

- **Negócio** (`admin-notification.service`) — pagamento recebido, recusado,
  estornado, chargeback: sino no painel + e-mail para `ADMIN_EMAIL`. Recusas do
  mesmo pedido são **agrupadas**: um aviso por pedido a cada 30 min (um cliente
  insistindo no cartão gerava dez e-mails por hora).
- **Operação** (`ops-alert.service` e `scripts/job-status.sh`) — o que só quem
  mantém o sistema resolve. Vai para `OPS_ALERT_EMAIL` (cai em `ADMIN_EMAIL` se
  vazio), assunto `[ALERTA] …`.

| Alerta                            | Dispara quando                                    | Repetição mínima |
| --------------------------------- | ------------------------------------------------- | ---------------- |
| `http_5xx_burst`                  | 20 respostas 500 em 10 min                        | 1 h              |
| `reconcile_failing`               | a conciliação falha em 2 rodadas seguidas         | 2 h              |
| `email_failing`                   | 3 envios do Resend falham em 1 h                  | 3 h              |
| `schema_degraded`                 | `ensureSchema` termina com etapa falhando no boot | 30 min           |
| `cron_failed`                     | uma tarefa agendada da API falha                  | 6 h              |
| `backup_daily`, `backup_weekly`   | o backup do host para com erro                    | a cada falha     |
| `offsite_dump`, `offsite_uploads` | a cópia para o R2 falha                           | a cada falha     |
| `restore_drill`                   | o teste mensal de restauração falha               | a cada falha     |

A "repetição mínima" fica gravada na tabela `config` (`utils/cooldown.ts`), não
em memória: uma API reiniciando em loop manda **um** e-mail, não sessenta.

## 4. Monitor externo

`.github/workflows/uptime.yml` roda **nos servidores do GitHub** a cada 10 min.
O `health-check.sh` do cron da VPS continua, mas não enxerga a própria VPS cair;
este enxerga. O GitHub manda e-mail quando a execução falha (para quem editou o
`schedule` por último). Falha se:

- `/health` não responde, ou `status`/`payments.status` ≠ `ok`, ou a
  conciliação está parada (`reconcileStale`);
- algum cron do host está com o último sucesso velho demais (`jobs.*.stale`);
- loja, clube ou admin não respondem 200;
- o certificado vence em menos de 14 dias.

Tenta três vezes, um minuto entre elas — o minuto do deploy não é queda.

### `GET /health → jobs`

Cada cron do host chama `job_ok <tarefa>` (`scripts/job-status.sh`) quando dá
certo, e isso grava `job_ok_<tarefa>` na tabela `config`. O `/health` informa a
idade:

| Tarefa                                            | Velho depois de |
| ------------------------------------------------- | --------------- |
| `backup_daily`, `offsite_dump`, `offsite_uploads` | 26 h            |
| `backup_weekly`                                   | 8 dias          |
| `restore_drill`                                   | 32 dias         |

`stale: null` = ainda não rodou desde que o mecanismo existe (não é alarme).
Isso resolve o caso que nenhum alerta de falha pega: **o cron que parou de
rodar** (crontab apagado, script quebrado) não falha — ele simplesmente some.
O `status` geral do `/health` ignora `jobs` de propósito: o deploy lê o
`status`, e um backup atrasado não pode travar um deploy.

## 5. Defesas de borda (host)

Arquivos em `server/ops/`, instalados à mão (ver `DEPLOY.md` §11):

- **journald** (`ops/journald/clube.conf`) — 30 dias, 2 GB.
- **logrotate** (`ops/logrotate/clube`) — `/var/log/clube-*.log`.
- **fail2ban** (`ops/fail2ban/`) — jail `clube-nginx-scan`: 3 pedidos em 10 min
  a caminhos que não existem nesta pilha (`.php`, `/.env`, `/.git/`,
  `/wp-admin`…) banem o IP por um dia. Lê o log JSON do nginx no journald, e
  bane na chain `DOCKER-USER` — a `INPUT` padrão não pega tráfego para porta
  publicada de container. A rádio (AzuraCast, que é PHP) fica de fora.
- **nginx**: `server_tokens off`; limite de 20 req/s por IP com rajada de 120
  (`limit_req`, folgado de propósito: uma página carrega dezenas de arquivos, e
  operadora de celular põe muita gente atrás de um IP só); `X-XSS-Protection: 0`
  (recomendação atual do OWASP).
- **API**: corpo JSON limitado a 1 MB (15 MB só em `/contracts` e `/email`, que
  carregam assinatura e PDF).

## 6. Login

- Limite por IP (já existia): 20 tentativas / 5 min.
- **Por conta** (migration 039): 5 senhas erradas bloqueiam o login por 1 min,
  dobrando a cada nova falha até 64 min; o dono recebe e-mail
  (`account-locked`) quando o bloqueio liga. Vale para o login do atacado
  também — senão ele seria o desvio.
- **Admin em aparelho novo**: login de admin de um navegador/sistema que a conta
  não usou nos últimos 30 dias manda e-mail para o próprio admin
  (`admin-new-login`), com aparelho, IP e horário. Compara pela família do
  navegador, sem número de versão — atualização do Chrome não dispara aviso.

## 7. Achados corrigidos nesta rodada (02/10/2026)

- **Cron legado fora do repositório** (`/etc/cron.d/clube-geek-backup`) ainda
  rodava: um `pg_dump` diário **sem cifra** em `/opt/backups/` e um script que
  reiniciava a API quando o `/health` falhava — inclusive no meio dos deploys.
  Removidos; os dumps em claro foram destruídos com `shred`. O backup oficial
  (cifrado, off-site, com drill) cobre as mesmas datas.
- **Logs apagados a cada deploy** (driver `json-file` + `--force-recreate`).
- **`morgan`** com aviso de injeção de log (`npm audit`) — substituído por
  `pino-http`.
- **Falhas silenciosas**: purge noturno de `processed_webhooks` falhando havia
  semanas; cancelamento automático sem registro de auditoria (ator de sistema
  não cabia no `user_id` UUID).
- **Ruído no `error_logs`**: `GoogleOther` passava pelo filtro de robôs.

`npm audit` de produção entrou no CI (nível `high`), e o Dependabot abre PRs
semanais agrupados (`.github/dependabot.yml`).
