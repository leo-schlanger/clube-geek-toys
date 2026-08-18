# TODO - Plano de Melhorias do Projeto

> **Ultima atualizacao:** 18 de Agosto de 2026

## Revisão de negócio — 18/08/2026

Revisão dos fluxos já implementados na ótica de quem **opera a loja no dia a dia**
(não de quem mantém o código). A pergunta guia foi: abrindo o painel de manhã,
o sistema me diz o que fazer?

### Entregue em 18/08/2026

- [x] **Painel do dia (`ActionCenter`)** — o dashboard respondia "quanto vendi"
      e nada respondia "o que está me esperando". Agora a primeira coisa da tela
      é a lista de filas com pendência: PIX a confirmar, pedidos a separar, a
      postar, enviados há +10 dias sem entrega, perguntas sem resposta,
      avaliações a moderar, CNPJ de atacado a aprovar, SKUs esgotados/no mínimo,
      assinaturas vencendo em 7 dias e membros que não pagaram. Cada card leva
      pra aba que resolve, mostra há quantos dias o item mais antigo espera, e
      fila zerada não aparece. `GET /reports/action-items` + 9 testes.
- [x] **Digest diário por e-mail (`admin-daily-digest`)** — o painel só avisa
      quem abre o painel. O cron das 6h UTC passou a mandar as mesmas filas pro
      `ADMIN_EMAIL`, e **só quando há pendência**, pra o e-mail não virar ruído.
      Dedup por `email_logs` no mesmo dia (restart de container não duplica).
- [x] **`countUnanswered()` deixa de ser código morto** — existia no
      `question.service.ts` com o comentário "for the admin tab badge", sem rota
      e sem uso desde que foi escrito. O contador de perguntas sem resposta
      agora sai pelo painel.

### Em aberto — por impacto no caixa

- [ ] **ALTO — Sem reserva de estoque entre `create` e `paid`.** O estoque só
      baixa na confirmação (`decrementStockForOrder`, chamado no webhook do
      Stripe e no confirm-PIX). Como a confirmação de PIX é **manual**, a última
      unidade fica disponível por horas ou dias depois do primeiro pedido. Pior:
      o decremento usa `GREATEST(0, stock - qty)`, então o segundo pedido
      confirma **sem erro** e o estoque para em 0 — a venda a descoberto não
      aparece em lugar nenhum. Sugestão: `stock_reserved` no pending com TTL, ou
      no mínimo falhar (em vez de clampar) quando o saldo não cobre.
- [ ] **ALTO — PIX continua sem confirmação automática.** Não há webhook: cada
      pedido PIX exige alguém comparar o TX ID com o extrato. É a fila mais cara
      do painel (o cliente já pagou e não é atendido). Gateway PIX com webhook
      resolveria de vez; enquanto não vier, o painel + digest ao menos tornam a
      fila visível.
- [ ] **MEDIO — Não existe cupom / código promocional.** Os únicos descontos são
      automáticos por perfil (`member_15`, `wholesale_25`). Não dá pra rodar
      campanha (Black Friday, comeback, cupom de influencer, primeira compra),
      que é a alavanca de marketing mais básica de uma loja. Precisaria de
      tabela `coupons` (código, tipo, valor, validade, uso máximo, mínimo de
      compra) e aplicação server-side no `createOrder`, sem empilhar com os
      descontos de perfil.
- [ ] **MEDIO — Nenhum relatório de mercadoria.** Os relatórios são todos de
      receita e de membro (`daily`, `monthly`, `churn`, `plan-distribution`).
      Falta o que o lojista usa pra comprar: **mais vendidos** por período,
      **parados** (sem venda em N dias), e **valor imobilizado em estoque**.
      Hoje a decisão de reposição é feita no olho.
- [ ] **MEDIO — Sem custo de produto, logo sem margem.** `products` não tem
      `cost_price`. Sem isso não há lucro por pedido, margem por produto nem
      CMV — só faturamento bruto. É uma coluna + um campo no modal do produto,
      e destrava todo o resto do relatório de mercadoria.
- [ ] **MEDIO — Carrinho abandonado não é recuperado.** O carrinho vive no
      `CartContext` (client-side) e um pedido `pending` que nunca é pago só
      envelhece. Não há e-mail de recuperação nem visibilidade de quanto se
      perde aí.
- [ ] **BAIXO — Sem nota fiscal.** Nenhuma emissão de NF-e/NFC-e nem campo pra
      anexar. Com CNPJ ativo (52.846.344/0001-10) e venda a atacado, em algum
      momento isso deixa de ser opcional.
- [ ] **BAIXO — `shipped` → `delivered` é 100% manual e sem data.** Não existe
      `shipped_at`/`delivered_at`; o card "enviados sem entrega" usa `updated_at`
      como aproximação da data de postagem. Rastreio automático pelos Correios /
      Melhor Envio fecharia o ciclo e daria prazo médio de entrega real.
- [ ] **BAIXO — Etiqueta Melhor Envio + token em produção** — já rastreado na
      seção da loja; segue bloqueado no `MELHOR_ENVIO_TOKEN` vazio.

## Aberto pelo checkup de 16/08/2026

Detalhes e evidências em [`CHECKUP-2026-08-16.md`](CHECKUP-2026-08-16.md).
Foco: base de dados, estrutura e layout.

### Resolvido em 16/08/2026

- [x] **Schema deixa de falhar em silêncio** — o `ensureSchema()` era um `try`
      único sobre 460 linhas de DDL: a etapa 12 quebrando abortava as 13–18, com
      a API servindo tráfego e o `/health` respondendo `ok`. Agora são 18 etapas
      nomeadas com falha isolada, `schema.status` no `/health`, `GET /logs/schema`
      no admin e o deploy falhando em `degraded`. Os 113 statements SQL foram
      conferidos idênticos antes/depois. 5 testes.
- [x] **Cobertura passa a medir o backend** — o `include` do vitest era
      `src/**` + `server/api/src/utils/**`, então os "74%" eram do front. Medido
      com o backend: **7,15%** antes dos testes novos (`order.service` 840 l,
      `webhook.service` 569, `payment.service` 521 e `stock.service` 409 todos
      em **0%**), **11,80%** depois. Thresholds agora são dois, por área.
- [x] **Cobertura do front estava desatualizada** — os 74% eram de 10/08; hoje
      são **67,55%**. O catálogo (variações, estoque, vídeos, perguntas,
      galeria, atacado) entrou mais rápido que os testes. O threshold global de
      70% **já falhava** e ninguém tinha notado, porque a run completa leva
      ~26 min e não está no CI. Piso passou a ser o valor medido, como catraca.
- [x] **Checkout ganha teste** — 25 casos em `order.service.test.ts`: preço do
      banco, membro × atacado sem empilhar, frete fora do desconto, agregação de
      linhas contra oversell, crédito sem total negativo, variações e atacado.
      Validados por mutação (3 regressões plantadas, 3 pegas).
- [x] **`npm run build` volta a proteger** — falhava com 154 erros de tipo e o CI
      usava `vite build`, que não checa tipo: erro de tipo em produção nunca
      barrou um deploy. Os 40 erros de produção corrigidos, incluindo 2 bugs
      reais no `ImageCropDialog` (tamanho padrão como string e `panX/panY`
      virando `NaN`) e o tipo `Member` desalinhado do schema do backend.
      Deploy ganhou passo `npx tsc -b`.
- [x] **`npm run lint` volta a valer** — 99 erros, todos de `server/api/dist`
      (pasta de build gitignorada que o `globalIgnores(['dist'])` não pegava).
      **0 erros** agora.
- [x] **PWA parou de baixar 11 MB** — `globPatterns` incluía `jpg` e as 35 fotos
      do evento entravam no precache do service worker, na primeira visita de
      todo mundo. **11.205 KiB → 2.335 KiB**; fotos foram para `runtimeCaching`.
- [x] **`ProductModal` em abas** — a dívida de UX nº 1 (2297 linhas em rolagem
      única; foi o que fez a Laura não achar o campo de vídeo). 4 abas com
      contador, painéis montados (rascunho sobrevive à troca) e erro de validação
      levando à aba certa. 6 testes novos; os 15 antigos passaram sem alteração.
      E2E atualizados.

- [x] **Varredura do padrão "altura chutada"** — dois bloqueios reais achados e
      corrigidos: na **loja**, o banner de evento (`sticky top-0 z-50`) cobria o
      `ShopHeader` (`sticky top-0 z-40`) inteiro ao rolar, travando carrinho,
      login, busca e tema em **todas** as larguras, desktop incluído; e o
      **aviso de offline** (`fixed top-0 z-[9999]`) cobria a primeira linha do
      header nas três SPAs enquanto a conexão estivesse caída. Junto saiu a
      `--shop-event-banner-h`, calculada com números fixos e lida por ninguém.

### Em aberto

- [ ] **MEDIO** — ~99 erros de tipo em arquivos de teste (mocks do `apiRequest`
      sem o campo `status`). Não bloqueiam deploy desde a separação
      build × typecheck; medir com `npm run typecheck`.
- [ ] **MEDIO** — Cobertura do backend em **11,80%** (meta 70%). Próximos por
      prejuízo se quebrarem: `webhook.service` (confirma pagamento e baixa
      estoque), `payment.service`, `stock.service`.
- [ ] **MEDIO** — Cobertura do front em **67,55%** (meta 70%). Recuperar os
      ~2,5 pontos perdidos desde 10/08 — as telas de catálogo que entraram sem
      teste são o buraco.
- [ ] **BAIXO** — Rodar cobertura no CI. Hoje a única forma de saber que ela
      caiu é rodar 26 min na mão, que é por isso que a queda de 74% → 67,55%
      passou despercebida por seis dias.
- [ ] **BAIXO** — Tipos duplicados: front (466 linhas) × backend (257). Duas
      fontes de verdade para o mesmo contrato — foi o que deixou `Member`
      desalinhado do `updateMemberSchema` sem ninguém perceber.
- [ ] **BAIXO** — 45 `<img>` sem `loading="lazy"`. Vários estão acima da dobra,
      onde lazy é errado; vale caso a caso.

## Aberto pelo checkup de 15/08/2026

Detalhes e evidências em [`CHECKUP-2026-08-15.md`](CHECKUP-2026-08-15.md).

### Em aberto

- [ ] **ALTO** — Conferir a renovação do certificado por volta de **17/09/2026**. O
      certbot ficou 3 semanas parado; foi religado, o webroot ACME está validado
      nos 5 domínios testados e o deploy agora garante o container de pé — mas o
      primeiro ciclo real de renovação merece um olhar.
- [ ] **ALTO** — Preencher `MELHOR_ENVIO_TOKEN` na VPS. Sem ele toda cotação é
      PAC R$ 24 / SEDEX R$ 42 fixo, sem variar por distância: prejuízo na primeira
      venda para fora do Sudeste.
- [ ] **MEDIO** — Rotacionar/isolar `e2e-admin@geeketoys.com.br`: é admin de
      produção com senha fixa documentada. Ideal seria E2E contra staging.
- [ ] **MEDIO** — SSH: `PasswordAuthentication no` do `sshd_config` está sendo
      sobrescrito por `sshd_config.d/50-cloud-init.conf` (`yes`). Hoje ninguém
      entra por senha (root barrado por `PermitRootLogin without-password`,
      `ubuntu` com senha travada), mas o efetivo contraria a intenção. Corrigir o
      drop-in e instalar fail2ban.
- [ ] **BAIXO** — Revisar os 4 admins (de 9 usuários) e remover a conta residual
      `stripe-smoke-…` de abril.

### Resolvido em 15/08/2026 (mesmo dia)

- [x] **E2E de variação e vídeo** — `admin-shop-flows.spec.ts` passo `3b`. Preenche
      os eixos e cola o link **sem** clicar em "Gerar combinações"/"Adicionar",
      salva, reabre e confere que os 2 SKUs e o vídeo ficaram gravados. É esse
      caminho que reproduzia o bug; clicar nos botões faria o teste passar mesmo
      com a regressão de volta. Fica depois do funil de compra porque produto com
      variação exige escolher SKU no carrinho.
- [x] **CSP nas SPAs** — em `server/nginx/shared-headers.conf`, aplicado a
      club/shop/adm. Sem `unsafe-inline` nem `unsafe-eval` em `script-src`: o boot
      saiu do `index.html` para [`public/boot.js`](../public/boot.js) e o zod já cai
      sozinho no caminho sem `eval`. Cada host da lista veio do código. Validado no
      navegador contra a produção com [`scripts/qa/csp-probe.mjs`](../scripts/qa/csp-probe.mjs)
      — **rode essa sonda antes de subir integração externa nova**.
- [x] **Cache de build** — `docker builder prune -af --filter until=24h` no fim do
      deploy. Rodado na hora: 34 GB → 24 GB em disco (36% → 25%).
- [x] **IP fora do repo público** — `server/azuracast/README.md` agora usa
      `$VPS_HOST`, com nota apontando para o `CLAUDE.local.md`. `git grep` do IP
      não retorna mais nada.
- [x] **Suíte de testes** — `maxWorkers` 2 → 6 (medido: 14 arquivos em 126s → 85s;
      10 workers só chega a 78s, não compensa) e os testes do servidor saíram do
      jsdom para um projeto `node`. Para o dia a dia o que resolve é
      `npm run test:changed`, que roda só o que o diff afeta (25 arquivos em ~3 min
      em vez de 165 em ~23 min). Também há `test:api` e `test:web`.

## Legenda

- **CRITICO** - Deve ser feito imediatamente
- **ALTO** - Proximo sprint
- **MEDIO** - Planejado
- **BAIXO** - Nice to have
- **FUTURO** - Backlog

---

## Concluido

### Plano Unico + Loja E-commerce (branch `feat/single-plan-and-store`)

- [x] **Plano unico anual** - Descontinuados os tiers Silver/Gold/Black e a opcao mensal; agora um unico plano "Clube GeekPop & Toys" (R$ 149,99/ano)
- [x] **Beneficio simplificado** - 15% de desconto em qualquer produto + brinde especial + entrada gratuita em eventos participantes
- [x] **Remocao do sistema de pontos** - Removidos `point_transactions`, `members.points`, `points.service`/`points.routes`, PointsTab/PointsSection/PointsChart, resgate, expiracao e multiplicadores
- [x] **PDV simplificado** - Agora e apenas verificacao de membro (CPF/QR) exibindo status + 15%; nao registra mais compras nem pontos
- [x] **Migration 008** - Colapsa `plan` para `'club'`, forca `payment_type = 'annual'` e dropa a estrutura de pontos
- [x] **Loja e-commerce propria** - `shop.geeketoys.com.br` no mesmo bundle Vite (subdominio detectado por `getAppMode()`)
- [x] **Migration 009** - Tabelas `categories`, `products`, `orders`, `order_items`
- [x] **Checkout da loja** - Catalogo publico -> carrinho (`CartContext`, localStorage) -> Stripe/PIX -> webhook confirma e baixa estoque
- [x] **Desconto server-side** - 15% aplicado no backend no checkout (`discount_reason = 'member_15'`), nunca confiando no cliente
- [x] **Backend da loja** - `product.service`/`order.service`, `product.routes`/`order.routes`, `webhook.service` estendido para `metadata.kind = 'shop_order'`
- [x] **Admin da loja** - Novas abas Produtos e Pedidos; imagens de produto no volume `/uploads`
- [x] **Email `order-confirmed`** - Confirmacao de pedido de loja (substitui `points-expiring` na lista de templates)

### Auditoria de Cadastro (Abril 2026)

- [x] **Fix PIX polling** - Corrigido polling que chamava Stripe API com UUID local, nunca detectava confirmacao de pagamento
- [x] **Email de boas-vindas na ativacao** - Template existia mas nunca era disparado; agora envia na primeira ativacao do membro
- [x] **Fix URLs nos emails** - CTA corrigido de /minha-conta para /membro
- [x] **Fix label PIX enganoso** - Removido "aprovacao instantanea" (PIX requer confirmacao manual admin)
- [x] **Notificacao admin novo membro** - Template admin-new-member enviado automaticamente no cadastro
- [x] **Copia do contrato para admin** - Email de contrato enviado automaticamente para admin (fallback env.ADMIN_EMAIL)
- [x] **Mascara de CPF no contrato** - CPF formatado com mascara (XXX.XXX.XXX-XX) na revisao do contrato
- [x] **Nome real no Stripe** - Pagamentos agora enviam nome real do membro (antes era hardcoded 'Membro')

### Auditoria de Pontos (Abril 2026) — superseded

> O sistema de pontos foi removido na reforma de plano unico (migration 008). Os itens abaixo ficam apenas como registro historico.

- [x] **Fix redeemPoints com pontos expirados** - Corrigido resgate permitindo pontos expirados mas nao processados pelo cron
- [x] **Fix newBalance com drift** - Corrigido calculo usando members.points (drifted) em vez do saldo real calculado
- [x] **Fix getBalance retornando valor stale** - Agora calcula a partir das transacoes excluindo expiradas
- [x] **Fix getExpiringPoints** - Corrigido retorno de TODAS as transacoes earn; agora filtra pela janela de 30 dias
- [x] **Reconciliacao diaria no cron** - Adicionado reconcilePointsBalances ao cron diario
- [x] **Estilo bonus no historico** - Icone amarelo para transacoes do tipo bonus no historico de pontos
- [x] **Fix export CSV** - Corrigido escaping para nomes com virgulas

### Auditoria de Planos (Abril 2026) — superseded

> Os multiplos planos e o upgrade de tier foram descontinuados na reforma de plano unico. Itens abaixo como registro historico.

- [x] **Fix RenewModal/UpgradeModal** - Corrigido memberId nao passado ao PaymentModal (era 'temp_member', resultava em 403)
- [x] **Remover override de expiry no frontend** - Renovacao agora deixa webhook calcular corretamente, preservando dias restantes
- [x] **Fix assinaturas pausadas nao expirando** - Cron agora inclui subscription_status='paused'
- [x] **Fix mensagem de pausa** - Corrigido de "beneficios suspensos" para "validos ate vencimento"

### Auditoria de Emails (Abril 2026)

- [x] **Redesign de 17 templates** - Todos os templates com logo, CNPJ real, links sociais e branding
- [x] **Template member-expired** - Email enviado quando cron expira um membro
- [x] **Template subscription-resumed** - Email enviado ao retomar assinatura
- [x] **Welcome email com nome do plano** - Email de boas-vindas agora inclui o nome do plano
- [x] **Fix admin-pix-pending** - Corrigido member_id ausente para rastreamento de log de email

### Carteirinha Digital (Abril 2026)

- [x] **Redesign carteirinha digital** - Estetica de cartao fisico com visual premium
- [x] **Gradiente metalico da carteirinha** - Visual metalico premium do Clube GeekPop & Toys
- [x] **Smart chip e icone contactless** - Elementos visuais de cartao moderno
- [x] **Shimmer holografico** - Efeito de brilho holografico animado
- [x] **Numero do membro formato cartao** - Formatado no padrao de cartao de credito
- [x] **Textura circuit board** - Textura geek no fundo do cartao
- [x] **Flip 3D com animacao** - Animacao cubic-bezier para virar o cartao
- [x] **Verso com tarja magnetica e QR code** - QR code com glow do tier correspondente

### Documentacao (Abril 2026)

- [x] **Reescrita completa da documentacao** - README.md, ARCHITECTURE.md, PROJECT.md, SECURITY.md, DEPLOY.md
- [x] **Remocao de referencias PagBank** - Todas as referencias substituidas por Stripe
- [x] **Fluxos documentados end-to-end** - Todos os fluxos do sistema documentados

### Infraestrutura (Abril 2026)

- [x] **Migracao para VPS self-hosted** - Docker + PostgreSQL + Express + Nginx
- [x] **CI/CD com GitHub Actions** - Deploy automatico no push para master
- [x] **SSL com Let's Encrypt** - Certbot com renovacao automatica
- [x] **Analytics com Umami** - Self-hosted em analytics.geeketoys.com.br
- [x] **Docker Compose** - Todos os servicos containerizados com resource limits
- [x] **Nginx reverse proxy** - SSL termination + security headers + SPA serving
- [x] **Backup automatico PostgreSQL** - Script pg_dump + cron diario (7 dias) + semanal domingo (12 semanas)
- [x] **Log rotation** - Docker json-file driver com max-size 10m em todos os servicos
- [x] **Health check + alertas** - Script cron 5min + alerta via Resend
- [x] **Cron health monitoring** - Timestamp last_cron_run salvo em config table

### Backend (Abril 2026)

- [x] **API Express** - Migrado de Cloudflare Workers para Node.js + Express
- [x] **PostgreSQL** - Migrado de Firestore para PostgreSQL 16
- [x] **Autenticacao JWT** - JWT customizado (bcrypt 12 rounds + refresh tokens)
- [x] **Stripe** - Cartao de credito via Stripe Elements + PIX local com QR code
- [x] **Audit logging** - Registro de acoes criticas (auth, pagamentos, contratos, email)
- [x] **Cron jobs** - Expiracao de membros e lembretes de renovacao
- [x] **Rate limiting** - Em todos endpoints criticos incluindo refresh, webhooks e LGPD delete
- [x] **RBAC + Ownership** - Middleware centralizado de verificacao de propriedade
- [x] **Error tracking local** - error_logs no PostgreSQL + captura global frontend
- [x] **13 email templates** - Todos conectados (webhook, cron, frontend, backend auto)
- [x] **LGPD endpoints** - Export dados + delete account + revogacao de contrato

### Seguranca (Marco-Abril 2026)

- [x] **Validacao Zod** - Schemas rigorosos em todos endpoints (incluindo contratos e email templates)
- [x] **Sanitizacao HTML** - Prevencao XSS em emails
- [x] **Webhook verification** - Assinatura criptografica Stripe (STRIPE_WEBHOOK_SECRET obrigatorio em prod)
- [x] **Idempotencia** - Key baseada em eventId Stripe
- [x] **IDOR protection** - Middleware ownership em pagamentos, contratos, pedidos
- [x] **Amount validation** - Rejeicao estrita de valores invalidos
- [x] **CSP habilitado** - Content Security Policy via Helmet
- [x] **CPF checksum** - Validacao Modulo 11 server-side
- [x] **Senha forte** - Min 8 chars + 1 maiuscula + 1 numero
- [x] **Transacoes atomicas** - BEGIN/COMMIT em subscriptions e email change
- [x] **Contrato IP server-side** - IP capturado no backend (nao client)
- [x] **Contrato timestamp server** - Gerado no server (nao client)
- [x] **Contract hash verify** - Endpoint GET /contracts/:id/verify
- [x] **PDF hash** - SHA-256 do PDF armazenado para verificacao de integridade
- [x] **Cookie consent** - Banner com opcoes essencial/analytics
- [x] **LGPD block active sub** - Impede exclusao com assinatura ativa
- [x] **PIX key via env** - Removido fallback hardcoded, PIX_KEY obrigatorio via env schema
- [x] **CORS configuravel** - Dominios de producao via env var ALLOWED_ORIGINS
- [x] **Dockerfile non-root** - Container API roda como user `node`, nao root
- [x] **Umami secrets obrigatorios** - Removidos defaults inseguros do docker-compose
- [x] **Indices otimizados** - subscriptions(status,created_at), audit_logs(user_id)
- [x] **Health check HTTPS** - CI/CD health check migrado de HTTP para HTTPS
- [x] **.env.production limpo** - Secrets via GitHub Secrets, nao commitados

### Assinatura Digital (Abril 2026)

- [x] **Lei 14.063/2020** - Assinatura eletronica simples com validade juridica
- [x] **SHA-256 hash** - memberId|nome|cpf|email|plano|timestamp|IP
- [x] **PDF gerado** - pdf-lib com logo, clausulas, dados, assinatura, hash de validacao
- [x] **IP server-side** - Capturado via req.ip (nao client-side)
- [x] **Timestamp server** - Gerado no backend
- [x] **PDF hash armazenado** - SHA-256 do binario do PDF para integridade
- [x] **Endpoint de verificacao** - Recalcula hash e compara com armazenado
- [x] **Contratos versionados** - Status active/superseded/revoked
- [x] **Audit trail** - Assinatura e revogacao logadas

### Frontend (Marco-Abril 2026)

- [x] **Landing page redesign** - Logo VIP, animacoes CSS, shimmer text, glow
- [x] **SEO completo** - OG image 1200x630, Schema.org Product + FAQ, meta tags VIP
- [x] **PWA** - Manifest com logo VIP, categories, icons
- [x] **Email verification auto-polling** - Detecta verificacao a cada 5s
- [x] **Registration flow recovery** - Detecta user existente e resume do passo correto
- [x] **Contract scroll UX** - Indicador "role ate o final", scroll-to-checkbox
- [x] **Privacy checkbox** - Checkbox separado para Politica de Privacidade
- [x] **Admin member detail** - Pagamentos, assinatura e contrato no modal
- [x] **Font Outfit** - Tipografia moderna para headings

### Pagamentos (Marco-Abril 2026)

- [x] **Stripe Elements** - Pagamento com cartao via Stripe
- [x] **PIX local** - QR code gerado localmente com confirmacao manual admin
- [x] **Webhooks Stripe** - Assinatura verificada + idempotencia
- [x] **Cancelamento automatico** - Apos 3 falhas consecutivas com email
- [x] **Expiracao automatica** - Cron marca membros expirados diariamente
- [x] **Calculo correto de expiry** - Plano anual: +1 ano a partir da data de expiracao vigente

### Pontuacao (Abril 2026) — superseded

> Sistema de pontos removido na migration 008. Itens abaixo como registro historico.

- [x] **Promocao corrigida** - Backend da 0 pontos (nao 2x)
- [x] **Resgate validado** - Server-side contra REDEMPTION_RULES
- [x] **Status check** - Apenas membros ativos podem ganhar/resgatar
- [x] **CHECK constraint** - points >= 0 no banco
- [x] **Audit completo** - Expiracao logada no audit_logs
- [x] **Reconciliacao** - Funcao para recalcular saldo

---

## Pendente

### Eventos — loja + site institucional (pedido Laura — Ago/2026)

> **Loja (`shop.*`):** este repo — `docs/EVENTS.md`, `src/data/event.ts`, rota `/evento`  
> **Home (`geeketoys.com.br`):** repo `geek-toys-home` — `docs/EVENTS.md`

- [x] **Planejamento** - Banner + infos + reserva de ingresso + galeria geral
- [x] **Site institucional** - Banner, seções, reserva, fotos (geek-toys-home)
- [x] **Loja (shop)** - Banner em todas as páginas, card na home, `/evento`, reserva, fotos
- [x] **Galeria geral** - fotos no home `#galeria` (sem download)
- [x] **Reserva online de ingresso** - Formulário → WhatsApp da loja
- [x] **Conteúdo real GeekPop Night** - 6/set/2026 14h–18h, R$ 20, colo/PCD isentos (07/08/2026)
- [x] **35 fotos do evento** - `public/eventos/kpop-night/` nos dois repos (sem duplicatas)
- [x] **WhatsApp loja principal** - (11) 91466-2881 + secundário (21) 98546-4666
- [x] **E2E users** - e2e-admin@ / e2e-member@ (CLAUDE.local.md)
- [ ] **ALTO** Laura: enviar fotos reais dos 14 produtos ativos (vitrine mostra "Sem foto")
- [x] **Filtro seed Checkup** - não listar na API pública / categorias
- [x] **Admin highlight** - badge "Sem foto" + contagem no catálogo
- [ ] **FUTURO** Validar membro do Clube na reserva / pagamento Stripe de ingresso

### Loja / pedidos (pedido Laura — Ago/2026)

- [x] **Estudo + plano** - frete Correios, minhas compras, reviews, SEO K-pop
- [x] **SEO/bio K-pop** - geek-toys-home title/OG/Hero/About; e-mail footer; shop hero/sitemap
- [x] **Deploy home em produção** - `www.geeketoys.com.br` já serve título/copy "Loja de K-pop" (Vercel auto a partir de `main`)
- [x] **Frete no checkout** - CEP ViaCEP + cotação Melhor Envio (fallback tabela) + frete no total
- [x] **Endereço de entrega** - formulário checkout + `shipping_address` tipado
- [x] **Minhas compras** - abas Tudo / A pagar / Preparando / A caminho / Finalizado / Cancelado
- [x] **Rastreio** - admin salva código Correios; cliente vê link em Minhas compras
- [x] **Você também pode gostar** - related por categoria no PDP
- [x] **Formas de pagamento (trust)** - badges PIX/cartão no checkout, PDP e footer
- [ ] **ALTO** Conta Melhor Envio + `MELHOR_ENVIO_TOKEN` em produção — **token ainda vazio** na VPS (cotação = fallback PAC/SEDEX). Código OK; falta o Bearer da conta ME (ver SHOP-ORDERS.md)
- [x] **Avaliações + crédito fixo** - review pós-entrega, R$1 default, checkout com crédito, admin moderação
- [ ] **MEDIO** Etiqueta automática Melhor Envio
- [x] **Sitemap dinâmico de produtos** + OG title shop via nginx sub_filter
- [x] **E-mails** order-shipped + order-confirmed no PIX confirm
- [ ] **BAIXO** Google Meu Negócio / Instagram bio (manual Laura)

### MEDIO - Planejado

- [x] **Aumentar cobertura de testes** - Meta 70% atingida em 10/08 noite: stmts 74.0% · lines 76.2% · funcs 70.1% · branches 68.0% (2192 testes ✓).
      **Não vale mais**: remedido em 16/08 com 2278 testes, o front caiu para
      **67,55% stmts / 69,31% lines** — o catálogo (variações, estoque, vídeos,
      perguntas, galeria, atacado) entrou mais rápido que os testes. Ver a
      tabela de métricas no fim deste documento.
- [ ] **Testes E2E** - Playwright (cadastro, login, pagamento)
- [ ] **Settings/preferencias do membro** - Permitir editar preferencias pessoais e notificacoes
- [ ] **Structured logging** - Substituir console.log por logger com niveis (Pino/Winston)
- [ ] **Backup off-site** - Upload automatico de backups para S3/GCS/Backblaze (local: diario 7d + semanal 12 sem. na VPS)
- [ ] **Fluxo de atualizar metodo de pagamento** - Atualmente requer cancelar e re-assinar
- [x] **Calculo de frete na loja** - ViaCEP + Melhor Envio / fallback (migration 010)
- [ ] **Gateway PIX automatico na loja** - Confirmacao de PIX de pedido ainda e manual pelo admin

### Dados / LGPD / integridade loja (Ago/2026)

- [x] **LGPD export** inclui pedidos, itens, reviews e crédito de loja
- [x] **LGPD delete** anonimiza pedidos/endereço, oculta reviews, zera crédito
- [x] **Fix email_logs** no export (member_id / recipient, não user_id inexistente)
- [x] **Restaurar store credit** em cancel, payment_failed e refund
- [x] **Race review_reward** — unique index + crédito na mesma TX
- [x] **orders.user_id** para ownership de Minhas compras
- [x] **Agregar qty** no checkout (anti oversell por linhas duplicadas)
- [x] **Docs** PROJECT / DOC-STATUS / SHOP-ORDERS / SECURITY alinhados ao schema 010–011
- [ ] **FUTURO** Reserva de estoque (hold) entre create e paid

### Atacado B2B (pedido Norberto 10/08/2026)

- [x] **Schema 012** - `wholesale_accounts`, flags de produto, `orders.channel` / CNPJ
- [x] **API** - register/login CNPJ, admin approve, checkout `wholesale_25`
- [x] **Shop** - aba `/atacado`, cadastro, login, carrinho separado, checkout
- [x] **Admin** - aba Atacadistas + flag "Disponível no atacado" no produto
- [x] **LGPD** - export/delete cobrem conta atacado e `customer_cnpj`
- [x] **Docs** - WHOLESALE, PROJECT, ARCH, SHOP-ORDERS, SECURITY, DOC-STATUS, README
- [x] **Testes unitários Atacado** - cnpj, wholesale API client, pages, store components
- [ ] **Cobertura global 70%** - meta de projeto (baseline ~11%); expandir gradualmente
- [x] **Deploy** - Atacado + variações em prod (master CI)
- [x] **Operação** - 55 SKUs com `wholesale_enabled` em prod (10/08; min 2/3/6 por faixa de preço; exclui Checkup)
- [ ] **Operação** - Laura/Norberto: aprovar CNPJs de clientes B2B quando se cadastrarem

### Variações de produto estilo Shopee (pedido Laura 10/08/2026)

- [x] **Schema 013** - `has_variants`, `variant_axes`, `product_variants`, snapshot no pedido
- [x] **API** - PUT `/products/:id/variants`, checkout com `variantId`
- [x] **Admin** - eixos + gerar combinações + preço/estoque por SKU
- [x] **PDP** - seletor de variações abaixo do produto (como Shopee)
- [x] **Docs** - `PRODUCT-VARIANTS.md`
- [x] **Ilimitado** - removido max 2 eixos; UI com chips de opção + textos claros (10/08)
- [x] **Dados prod** - eixos da Bolsa/BT21 normalizados (Cor / Personagem)
- [x] **Foto por variação** - admin: upload/URL/galeria por SKU; PDP: galeria + swatches (12/08)
- [x] **Busca loja estilo Shopee** - barra sempre visível + borda brand + botão Buscar (12/08)
- [x] **Testes** - VariantPicker (swatches/`resolveVariantImages`), ShopHeader busca, PDP troca de foto

### Filtros do catálogo + recorte de foto (pedido Laura 13/08/2026)

- [x] **Ordenação na loja/atacado** - A–Z, Z–A, postagem (mais recentes/antigos), menor/maior preço (`?sort=`, `ORDER BY` no Postgres + `LIMIT/OFFSET`)
- [x] **Paginação** - loja/atacado `?page=` (24/página); admin 10/25/50/100; troca de sort/busca volta à página 1
- [x] **Ordenação no admin** - mesma grade na aba Produtos via API (padrão A–Z para agrupar photocards)
- [x] **Recorte no post** - diálogo ao enviar imagem (proporção Quadrado/Photocard/Retrato/Paisagem/Livre + tamanho 800/1200/1600/personalizado)
- [x] **Testes** - product-sort, ProductSortSelect, ImageCropDialog, crop math, ShopHome/Wholesale/CategoryNav/ShopHeader

### Catálogo: limites de foto e variações (pedido Laura 14/08/2026)

- [x] **Fase 0 — mais fotos** - galeria do listing 8 → **30**; upload 6 → **20** por lote (seleções maiores são fatiadas no cliente); `client_max_body_size` 120m no bloco da API
- [x] **Fase 0 — fix "dá problema nas variações"** - foto de variação anexava em `products.images` e, passando do teto, o `PATCH /products/:id` passava a ser rejeitado: **o produto não podia mais ser salvo**. Agora vai por `POST /products/:id/media` (devolve só as URLs) e o teto vale também no upload, não só no Zod
- [x] **Fase 0 — várias fotos por variação** - até 10 por SKU, com miniaturas, remoção individual e contador `n/10`
- [x] **Fase 0 — descoberta** - bloco Variações explica que cada opção ganha foto própria após _Gerar combinações_
- [x] **Fase 0 — testes** - `product.service.test.ts` (teto: cabe / corta excedente / cheio / 404) + 3 casos em `ProductModal.test.tsx`, um deles travando a regressão da galeria
- [x] **Fase 1 — duplicar produto** - `POST /products/:id/duplicate`; copia medidas, peso, imagens (por URL), categorias e variações; entra inativo, sem SKU, e o painel abre o clone em edição
- [x] **Fase 1 — até 5 categorias** - migration 014 `product_categories`; `products.category_id` segue como principal (position 0), então sitemap/relacionados/cards não mudam; filtro e busca passam a olhar todas
- [x] **Fase 2 — controle de estoque** - migration 015 `stock_movements` + `low_stock_threshold`; aba Estoque com edição inline por SKU, filtro acabando/esgotado e histórico; venda e cancelamento gravam movimento na mesma transação da baixa
- [x] **Fase 2 — vídeos** - migration 016 `products.videos`; link YouTube/Instagram embedado + upload de MP4 (100 MB) no volume /uploads; exibidos abaixo da galeria na PDP
- [x] **Fase 3 — perguntas e respostas** - migration 017 `product_questions`; pergunta visível na hora (modelo Mercado Livre), login obrigatório, máx. 10 em aberto por usuário, aba Perguntas no admin com esconder/responder
- [x] **Fase 3 — notificações** - migration 017 `notifications`; sininho no header da loja (sem polling) + e-mail `question-answered` via Resend ao responder
- [x] **Docs** - `CATALOG-2026-08.md`, PRODUCT-VARIANTS (tetos de imagem), PROJECT (endpoints)
- [x] **Testes** - `product.service.test.ts` (tetos de imagem e vídeo), `product-video.test.ts` (parse/embed de link), 3 casos novos em `ProductModal.test.tsx`
- [x] **Fix 15/08 — variação** - "Gerar combinações" descartava a opção digitada quando faltava clicar no "+"; reproduzido no painel de produção com Playwright e corrigido
- [x] **Fix 15/08 — galeria da PDP** - arrastar para o lado troca a foto, setas no desktop, indicadores, e moldura branca em foto de outro formato
- [x] **Fix 15/08 — scroll** - produto abre no topo (`ScrollToTop`); voltar mantém a posição da listagem
- [x] **15/08 — ícone por categoria** (schema 018) + K-pop, Pokémon, Beleza, Moda, Jogos e Anime criadas em produção
- [x] **15/08 — galeria com pastas** (schema 019) + aba Galeria no admin + página `/galeria` no home; 41 fotos importadas
- [x] **15/08 — bandeiras de pagamento** - vetores reais no lugar dos badges de texto
- [x] **15/08 — home** - busca de produtos no Navbar e tema claro/escuro
- [x] **15/08 — privacidade** - política dos dois sites cobre foto de evento e pergunta pública
- [x] **Dívida de UX** - modal de produto em 4 abas com contador (16/08); painéis ficam montados, então rascunho digitado numa aba entra no save disparado de outra
- [x] **Dívida** - `npm run build` verde (16/08). Os 40 erros em código de produção foram corrigidos — 2 eram bugs reais no `ImageCropDialog`. Os erros restantes são de `*.test.tsx` e saíram do build para o `npm run typecheck`; o CI agora roda `tsc -b` antes do `vite build`
- [ ] **Operação** - Laura: revisar os produtos que já passaram de 8 fotos antes do fix (nenhum dado foi perdido; só o save estava travado)

### Hardening (10/08/2026 — validação de fluxos)

- [x] **Admin criar membro** - cria user do e-mail (não amarra no JWT do admin)
- [x] **Assinatura Stripe** - valor sempre `CLUB_PLAN_PRICE` no server
- [x] **Restock** - cancel/refund após pago devolve estoque
- [x] **Ativar membro manual** - preenche start/expiry +1 ano se faltar
- [x] **Categorias** - "Assessório"→"Acessório", "Vestuario"→"Vestuário"

### BAIXO - Nice to Have

- [ ] **Storybook** - Documentar componentes UI
- [ ] **Otimizar bundle** - Tree-shaking mais agressivo
- [ ] **Image optimization** - Logo VIP 2.3MB PNG → WebP, lazy load
- [ ] **Notificacoes push** - Lembretes de vencimento da assinatura
- [ ] **ARIA labels** - Melhorar acessibilidade em botoes com apenas icone
- [ ] **httpOnly cookies** - Migrar JWT tokens de localStorage para cookies seguros

---

## FUTURO v2.0+

### Novos Produtos

- [ ] **App Mobile (React Native)** - App nativo para iOS/Android
- [ ] **Multi-tenancy** - Suportar multiplas lojas
- [ ] ~~**Integracao com marketplaces (Shopee/ML)**~~ — **cancelado** (Laura: não usam mais; loja própria)
- [ ] **Sistema de indicacao** - Tracking + rewards

### Infraestrutura

- [ ] **Redis** - Cache para consultas frequentes + rate limiting cross-instance
- [ ] **Replica PostgreSQL** - Read replica para relatorios
- [ ] **Monitoring stack** - Prometheus + Grafana

---

## Domínios / Admin (Agosto 2026)

- [x] **Diagnóstico admin.geekpoptoys.com.br** - DNS/cert/CORS/HTML OK nos quatro hosts (admin/adm × geeketoys/geekpoptoys)
- [x] **Canônico adm.\*** - nginx 301 `admin.geeketoys.com.br` e `admin.geekpoptoys.com.br` → `adm.*` correspondente
- [x] **Links internos** - `getSubdomainUrl('admin')` gera `adm.*` (não `admin.*`)
- [x] **Deploy nginx** - `admin.*` → 301 `adm.*` ok em produção

## Design System / Branding (Agosto 2026)

Fonte de verdade: [`docs/DESIGN.md`](DESIGN.md) | Referencia: [`docs/assets/brand-reference.jpg`](assets/brand-reference.jpg)

Paleta oficial: **Hot Pink** `#F04080` + **Pop Yellow** `#FCBE04` | UI dark-first | Outfit + Inter.

### Documentacao

- [x] **DESIGN.md** - Paleta, tokens, inventário de componentes, gaps e regras de uso
- [x] **Referencia visual versionada** - `docs/assets/brand-reference.jpg`
- [x] **ARCHITECTURE / PROJECT** - Carteirinha, e-mails e secao de branding atualizados

### Alinhamento de codigo

- [x] **Tokens CSS** primary/accent HSL da peça (`340 85% 59%` / `45 97% 50%`) + glows em `index.css`
- [x] **Carteirinha digital** (`MembershipCard`) — gradiente rosa/amarelo metalico (sem roxo residual no shimmer)
- [x] **`CLUB_PLAN.color`** → `#F04080`
- [x] **Badge `club`** → `bg-primary` (não violet)
- [x] **E-mails** — Hot Pink/Pop Yellow + wordmark "GeekPop & Toys" (footer loja K-pop RJ)
- [x] **Residual purple** removido em Subscribe, SubscriptionManagement, RealtimeMetrics (08/08/2026)
- [x] **`tailwind.config.js`** `fontFamily.heading` → Outfit
- [ ] **BAIXO** Revisar OG image / favicon se precisar de borda pink comic da peça

---

## Debitos Tecnicos

1. MapperUtils usa `any` (necessario para flexibilidade)
2. Soft-delete de usuarios (role → `disabled`, nao deleta)
3. vendor-charts bundle (435KB) - Lazy loaded via ReportsTab
4. ~~Erros TypeScript pre-existentes~~ — código de produção zerado em 16/08; restam ~99 em arquivos de teste (mocks do `apiRequest` sem `status`), fora do build
5. ~~Residuos de cor roxo/dourado fora da marca~~ — limpos 08/08/2026 (Subscribe/SubscriptionManagement/RealtimeMetrics/MembershipCard)

---

## Metricas

### Qualidade

| Metrica                     | Medido em 16/08/2026                  | Meta  |
| --------------------------- | ------------------------------------- | ----- |
| Cobertura — front (`src/`)  | **67,55% stmts** / 69,31% lines       | 70%   |
| Cobertura — API (`server/`) | **11,80% stmts** / 11,78% lines       | 70%   |
| Cobertura — total           | 49,23% stmts                          | —     |
| Suíte                       | **2278 testes, 165 arquivos, verdes** | verde |
| TypeScript strict           | Sim                                   | Sim   |
| `npm run build` (tsc+vite)  | ✅ verde                              | verde |
| `npm run typecheck` (test)  | ⚠️ ~99 erros de mock                  | 0     |
| ESLint errors               | **0**                                 | 0     |

> Duas coisas foram acertadas em 16/08:
>
> 1. **O número não cobria o backend.** O `include` do vitest era `src/**` mais
>    3 arquivos de util, então checkout, webhook, pagamento e estoque não
>    entravam na conta. Agora entram — e mostram 11,80%.
> 2. **O número do front estava velho.** Os "74%" eram de 10/08. Com variações,
>    estoque, vídeos, perguntas, galeria e atacado entrando mais rápido que os
>    testes, caiu para 67,55% — ou seja, o threshold global de 70%
>    **já estava falhando** e ninguém tinha visto, porque a run completa leva
>    ~26 min e não está no CI.
>
> Os thresholds agora são o valor medido, por área: **catraca contra regressão**,
> não meta. A meta segue 70% nos dois lados.

### Infraestrutura

| Servico        | Tipo         | Custo              |
| -------------- | ------------ | ------------------ |
| VPS            | Self-hosted  | Custo fixo/mes     |
| PostgreSQL     | Docker (VPS) | Incluido           |
| Nginx          | Docker (VPS) | Incluido           |
| Umami          | Docker (VPS) | Incluido           |
| Resend (Email) | SaaS         | Free: 3k/mes       |
| Stripe         | SaaS         | Taxa por transacao |
| GitHub Actions | SaaS         | Free tier          |

---

_Documento atualizado em 16 de Agosto de 2026_
