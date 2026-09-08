# Auditoria de segurança — 07 e 08/09/2026

Revisão do projeto inteiro com evidência: dependências, autenticação,
autorização, injeção, XSS, cabeçalhos, segredos e superfície pública.

**08/09** acrescentou a camada que faltava — infraestrutura da VPS, ciclo de
vida de token, upload e CORS. Está na segunda metade do documento, a partir de
[Segunda passada](#segunda-passada--0809).

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

---

# Segunda passada — 08/09

A primeira passada olhou o código de aplicação. Esta olhou o que está **abaixo
e ao redor** dele: sistema operacional, rede, contêineres, e os pedaços do
código onde a falha não é lógica de negócio mas manuseio de caminho, token e
origem.

## Achado corrigido: upload escrevia fora do volume

`destination` do multer roda **antes** da validação da rota e antes de qualquer
checagem de conteúdo, sobre um valor tirado direto da URL:

```ts
const dir = path.join("/app/uploads/products", String(req.params.id || "temp"));
fs.mkdirSync(dir, { recursive: true });
```

O Express decodifica o parâmetro, então `..%2F..%2F` chega como `../../` e o
`path.join` sai do volume — criando diretório e gravando arquivo em qualquer
lugar que o contêiner alcance. Cinco lugares construíam a pasta assim; **quatro
sem nenhuma proteção** (fotos e vídeo de produto, foto de álbum, banner de
evento). O quinto, o upload de contrato, já tinha exatamente esse guarda, com um
comentário descrevendo o mesmo bug — a correção nunca foi propagada.

**Severidade real: média, não alta.** As cinco rotas exigem `authenticate` +
`requireRole('admin')`, então isso é defesa em profundidade, não porta aberta.
E o nome do arquivo sempre foi um UUID gerado por nós com extensão fixa, então
não dava para plantar um `.js` nem sobrescrever arquivo existente. O que dava
era criar diretório e despejar imagem/MP4 fora da árvore de uploads.

Corrigido com uma regra só, compartilhada pelos cinco:
`uploadDir()` em `server/api/src/utils/upload-path.ts` — a pasta só pode ser
nomeada por um UUID ou pelo sentinela `temp`. 11 testes, incluindo a invariante
"o que sair daqui nunca escapa da base".

## Infraestrutura da VPS

### O que está certo

|              |                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Firewall** | `ufw` ativo, default **deny incoming**. Só 80, 443, 22, 2022 (SFTP da rádio) e 8000-8046 (streams)                                                 |
| **Postgres** | Escuta em **127.0.0.1:5432** apenas — não está na internet                                                                                         |
| **Docker**   | Nenhum contêiner privilegiado, e **o socket do Docker não está montado em lugar nenhum** (é assim que um contêiner comprometido vira root no host) |
| **Segredos** | `.env` em `600 root`. Backups em `700 root`, diário às 03:00 e semanal, o de hoje presente                                                         |
| **Patches**  | `unattended-upgrades` ativo, Ubuntu 24.04.4, kernel 6.8                                                                                            |
| **SSH**      | Chave funciona; root **não** entra por senha (`permitrootlogin without-password`)                                                                  |

### O que precisa de atenção

**1. `PasswordAuthentication` está ligado, por conflito de arquivos.**
O `/etc/ssh/sshd_config` diz `no`, mas o `Include` da linha 12 lê o diretório
antes, e no SSH **vale o primeiro valor encontrado**:
`50-cloud-init.conf` diz `yes` e ganha de `60-cloudimg-settings.conf`, que diz
`no`. Conferido com `sshd -T`: **`passwordauthentication yes`**.

Hoje isso não abre nada, porque o único usuário com senha é o root e o root está
proibido de usar senha. É uma armadilha: no dia em que alguém criar um usuário
comum com senha, ele fica exposto a força bruta sem que ninguém tenha mudado a
configuração de propósito.

> Correção: um `/etc/ssh/sshd_config.d/99-hardening.conf` com
> `PasswordAuthentication no` — o `99` garante que ele é lido depois, mas como
> vale o primeiro valor, o certo é **editar o `50-cloud-init.conf`** ou removê-lo.
> Testar em uma segunda sessão antes de fechar a atual.

**2. Sem `fail2ban`.** 20 tentativas falhas no `auth.log`. Com autenticação
efetiva por chave, força bruta não passa — mas o custo de instalar é baixo e o
ruído nos logs some.

**3. A API roda como `root` dentro do contêiner.** Não é privilegiado nem tem o
socket do Docker, então o alcance é o próprio contêiner. Ainda assim, um
`USER node` no Dockerfile é a diferença entre "execução de código no contêiner"
e "execução de código como root no contêiner".

**4. Backups não são cifrados e ficam no mesmo host.** Contêm CPF, endereço,
e-mail e hash de senha de todos os membros. Quem comprometer a VPS, ou obtiver um
snapshot do disco, leva a base inteira. É o item de maior impacto LGPD da lista.

## Autenticação — ciclo de vida do token

**O que está certo.** Refresh token: 64 bytes aleatórios, guardado **hasheado**
em `refresh_sessions`, cookie httpOnly. Token de redefinição de senha:
HMAC-SHA256 com comparação em tempo constante, 1h de validade, e o uso
**revoga todas as sessões** — o caminho certo para uma conta possivelmente
roubada. Códigos de ingresso: `crypto.randomBytes` sobre alfabeto sem
ambiguidade, 60 bits no ingresso e 40 na reserva, com a entrada **queimando** o
código num UPDATE condicional (sem replay).

**Duas fraquezas.**

_O link de redefinição não é de uso único._ O token é stateless — não há linha
no banco — então ele continua valendo até expirar, **inclusive depois de já ter
sido usado**. Se o e-mail vazar dentro da hora (caixa compartilhada, encaminhado,
histórico do navegador), dá para redefinir a senha de novo. Guardar o `jti` numa
tabela e apagá-lo no primeiro uso resolve.

_Refresh token não rotaciona._ O uso estende a validade em vez de emitir um novo,
então um token roubado vale pelo prazo inteiro e não há como detectar reuso.

## CORS

Aceita **qualquer subdomínio** de `geeketoys.com.br` e `geekpoptoys.com.br`
sobre HTTPS, com `credentials: true`. Funciona e é conveniente, mas confia num
espaço maior do que os seis subdomínios que existem: um subdomínio pendurado
(DNS apontando para serviço de terceiro já liberado) passaria a falar com a API
com as credenciais do usuário. Listar os seis explicitamente custa pouco.

## Pendências do dono do projeto

Por ordem de impacto:

1. **Cifrar os backups e mandar uma cópia para fora do host** (LGPD)
2. **Rotacionar a `PAGARME_SECRET_KEY`** — colada no chat durante a configuração
3. **Desligar `PasswordAuthentication` de verdade**, corrigindo o drop-in do cloud-init
4. Instalar `fail2ban`
5. `USER node` no Dockerfile da API

---

## Aplicado em 08/09

As três correções de servidor foram feitas e verificadas.

### 1. SSH só por chave

`50-cloud-init.conf` passou a dizer `PasswordAuthentication no` — é o arquivo
que vencia o conflito, então mudá-lo é o que muda o valor efetivo. Um
`/etc/cloud/cloud.cfg.d/99-disable-ssh-pwauth.cfg` impede o cloud-init de
reescrever `yes` no próximo boot.

Feito com rollback armado: antes de tocar em nada, um `systemd-run --on-active=600`
restauraria o arquivo original se eu perdesse o acesso. Só cancelei depois de
uma conexão **nova** entrar por chave. `sshd -T` confirma
`passwordauthentication no`.

**Não afeta o deploy**: o workflow usa `VPS_SSH_KEY` com
`IdentitiesOnly=yes -i deploy_key` nos três passos. Nunca houve senha ali.

Como autorizar uma máquina nova: [`DEPLOY.md` §3.6](../DEPLOY.md).

### 2. fail2ban

Instalado, `enabled`, com jail **só do sshd** (`bantime 1h`, `maxretry 5`,
`banaction = ufw`, para não ter duas ferramentas escrevendo regras).

Uma jail de HTTP foi deixada de fora de propósito: o nginx roda em contêiner e
o tráfego dele passa por `DOCKER-USER`/`FORWARD`, não pela cadeia `INPUT` onde o
fail2ban escreve — banir ali daria falsa sensação de proteção.

### 3. Backups cifrados

O dump agora sai `pg_dump | gzip | gpg --symmetric --cipher-algo AES256`, com a
senha em `BACKUP_PASSPHRASE` no `.env` da VPS (que o `rsync --delete` do deploy
exclui, então sobrevive).

Três decisões que valem registro:

- **Sem senha, o backup recusa rodar** em vez de gravar em claro. Fallback
  silencioso é exatamente como se descobre, tarde demais, que "o backup estava
  cifrado" era mentira. Uma execução falha aparece no log e os dias anteriores
  seguem em disco.
- **A verificação decifra o arquivo de volta** e testa o gzip resultante.
  Conferir só o ciphertext passaria num backup que nada consegue abrir — a falha
  que só aparece no dia em que ele é necessário.
- **Os 11 backups antigos foram cifrados** e os originais apagados, cada um
  só depois de provar que voltava a ser um gzip íntegro. Não sobrou nenhum
  `.sql.gz` em claro.

`restore-postgres.sh` reconhece `.gpg` e ainda restaura um `.sql.gz` anterior a
esta data, para que backup antigo não fique órfão.

### 4. Cópia fora do host

Os 13 backups foram copiados para `Desktop\geekpop-backups\` e **os 13 foram
verificados nesta máquina, sem o servidor** — decifram e o gzip está íntegro (35
tabelas). Um backup que nunca foi lido não é backup: o dia em que ele é preciso
é um péssimo dia para descobrir que a senha não bate.

`scripts/backup-pull.sh` repete a cópia e refaz essa verificação. Ele aceita
`BACKUP_PASSPHRASE` do ambiente justamente para conferir a pasta **quando o
servidor não existir mais**, que é o cenário para o qual ela existe.

A senha ficou no `CLAUDE.local.md` (fora do repositório), além do `.env` da VPS.
Deliberadamente **não** foi colocada dentro da pasta de backups — seria a chave
na fechadura.

> **Pendência sua**: passar a `BACKUP_PASSPHRASE` para um gerenciador de senhas.
> Os dois lugares onde ela está hoje somem junto com a máquina ou com o
> servidor — exatamente o cenário em que os backups seriam necessários.
