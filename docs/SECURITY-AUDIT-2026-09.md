# Auditoria de segurança — 07 e 08/09/2026

Revisão do projeto inteiro com evidência: dependências, autenticação,
autorização, injeção, XSS, cabeçalhos, segredos e superfície pública.

**08/09** acrescentou a camada que faltava — infraestrutura da VPS, ciclo de
vida de token, upload e origens aceitas.

> **Leia antes de acrescentar coisa aqui.** O repositório é **público**. Este
> arquivo registra o que **já foi corrigido** e as regras que decorrem disso.
> Falha ainda aberta vai para `docs/SECURITY-PRIVATE.md`, fora do repositório —
> descrever em público um buraco que ainda existe é publicar o mapa dele.

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

## O que ficou em aberto

Fica fora deste arquivo, de propósito.

**Este repositório é público.** Uma lista de fraquezas ainda não corrigidas,
com endpoint, limite e mecanismo, é um mapa pronto para quem quiser usá-lo — e
não ajuda ninguém que trabalhe no código, porque o que se precisa saber para
não reintroduzir um problema são as **regras**, e essas estão aqui e no
`CLAUDE.md`.

O inventário do que segue aberto está em `docs/SECURITY-PRIVATE.md`, que o
`.gitignore` mantém fora do repositório. Item resolvido migra para cá:
corrigido, deixa de ser mapa e vira história.

---

# Segunda passada — 08/09

A primeira passada olhou o código de aplicação. Esta olhou o que está **abaixo
e ao redor** dele: sistema operacional, rede, contêineres, e os pedaços do
código onde a falha não é lógica de negócio mas manuseio de caminho, token e
origem. O que ela achou e foi corrigido está abaixo; o que achou e continua
aberto está na nota privada.

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

### 5. Off-site e drill de restauração

Duas camadas que faltavam, implementadas em 08/09:

**`backup-offsite.sh`** empurra os `.gpg` para um bucket S3-compatível depois de
cada dump. Como os arquivos já saem cifrados do host, o provedor de storage não
entra na fronteira de confiança — guarda bytes que não sabe ler. Depois de
enviar, **baixa o mais recente de volta e abre**: `rclone copy` dizer "ok" só diz
que os bytes foram aceitos, e a cópia que importa é a do bucket. Sem bucket
configurado ele pula e avisa; jogar fora um dump bom porque a cópia não saiu do
host seria a troca errada.

**`backup-restore-test.sh`** (cron `0 5 1 * *`) sobe um `postgres:16-alpine`
descartável, restaura o backup mais recente e confere o resultado: as tabelas
essenciais existem e `users`/`products` voltaram com linhas — uma loja vazia
"restaura com sucesso" e ainda assim é um desastre. Nunca toca a produção:
container próprio, nome único por execução, dados em `tmpfs`.

Validado em 08/09 contra os dados reais: 35 tabelas, 252 produtos, 30 usuários,
em 5 segundos. E validado ao contrário, que é o que dá valor ao teste —
**reprova** com backup truncado e **reprova** com senha errada.

Falta ligar o bucket: `BACKUP_OFFSITE_*` no `.env` (o `rclone` já está
instalado). Até lá, a cópia externa é manual, via `scripts/backup-pull.sh`.
