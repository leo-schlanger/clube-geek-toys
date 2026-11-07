# Design System — GeekPop & Toys

> **Última atualização:** 4 de Agosto de 2026  
> **Referência visual:** [`docs/assets/brand-reference.jpg`](assets/brand-reference.jpg)  
> **Escopo:** paleta, tipografia, tokens CSS, inventário de componentes e gaps de alinhamento

Este documento é a **fonte de verdade de marca** do Clube GeekPop & Toys (SPA membros, admin, loja, e-mails e carteirinha). Qualquer mudança de cor ou estilo deve partir daqui.

---

## 1. Personalidade da marca

Extraída da peça oficial de marketing (K-pop merch, fundo claro, tipografia pop):

| Atributo      | Direção                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| **Tom**       | Divertido, energético, colecionável, jovem                                       |
| **Estética**  | Pop / comic / K-culture — contornos pretos, estrelas, corações, balões de fala   |
| **Contraste** | Rosa quente + amarelo ouro sobre branco (marketing) ou dark UI (produto digital) |
| **Não é**     | Roxo corporativo, dourado “luxo só”, minimalismo frio                            |

**Nome de marca (sempre):** `GeekPop & Toys` (não “Geek & Toys”).

---

## 2. Paleta oficial

Cores amostradas da referência de marca e normalizadas para tokens de produto.

### 2.1 Cores primárias (core brand)

| Token                   | Hex       | HSL (aprox.)  | Uso                                                             |
| ----------------------- | --------- | ------------- | --------------------------------------------------------------- |
| **Hot Pink** (primary)  | `#F04080` | `340 85% 59%` | CTAs, logo “Pop”, bordas de peça, badges de marca, ring de foco |
| **Pop Yellow** (accent) | `#FCBE04` | `45 97% 50%`  | Destaques (“Toys”, preços, bursts), accent UI, shimmer          |
| **Ink Black**           | `#141414` | `0 0% 8%`     | Contornos comic, texto em peças claras, outline de tipografia   |
| **Pure White**          | `#FFFFFF` | `0 0% 100%`   | Fundos de marketing, texto sobre primary, QR area               |

Variações úteis:

| Nome                    | Hex                       | Uso                           |
| ----------------------- | ------------------------- | ----------------------------- |
| Hot Pink dark           | `#E11D6A` / `340 85% 50%` | Hover de botões primary       |
| Hot Pink soft           | `#F472A6` / `340 85% 70%` | Glows, chips, hover light     |
| Yellow deep             | `#E6A800` / `45 100% 45%` | Hover accent, bordas de preço |
| Pink border (marketing) | `#F83978`                 | Molduras de material gráfico  |

### 2.2 Pastéis de produto (secundárias — merch / categorias)

Usar **apenas** em vitrines, filtros de coleção K-pop e ilustrações — não como cor de ação principal.

| Nome               | Hex aprox.            | Exemplo na peça       |
| ------------------ | --------------------- | --------------------- |
| Baby Pink          | `#F9C2D4`             | Case Stray Kids / BTS |
| Soft Blue          | `#A8D4F0`             | Case SKZ              |
| Soft Yellow        | `#FFE566`             | Case SKZ              |
| Soft Brown         | `#C4A484`             | Case SKZ              |
| Soft Purple        | `#C4A8E8`             | Case BTS              |
| Soft White / Black | `#FAFAFA` / `#1A1A1A` | Cases neutros         |

### 2.3 Semânticas (produto digital)

| Token       | Claro (`:root`)                           | Escuro (`.dark`)                      | Uso                        |
| ----------- | ----------------------------------------- | ------------------------------------- | -------------------------- |
| Success     | `142 72% 29%` `#157F3C`, texto branco     | `142 70% 40%` `#1FAD53`, texto escuro | Pagamento ok, status ativo |
| Warning     | `38 92% 50%` `#F59F0A`, texto quase preto | igual                                 | Pendente, expirando        |
| Destructive | `0 84% 55%` `#ED2C2C`                     | `0 75% 58%` `#E44444`                 | Erro, cancelamento         |
| Info        | `#3B82F6` (Tailwind blue)                 | —                                     | Avisos neutros (admin)     |

`Button`/`Badge` `success` e `warning` usam esses tokens (`bg-warning text-warning-foreground`); branco sobre amarelo era ilegível (07/11/2026).
**Texto de status** (verde, amarelo, âmbar, esmeralda, vermelho, azul) leva sempre o par claro/escuro: `text-green-700 dark:text-green-500`, `text-red-600 dark:text-red-400`. Os tons 400–600 sozinhos somem no fundo branco (verde-400 sobre branco = 1,9:1). `text-warning` como texto: `text-amber-700 dark:text-warning`.

### 2.4 Superfícies — tema light / dark (app)

O produto digital (**club / admin / shop**, mesmo bundle) tem **tema claro e escuro** com preferência `light` | `dark` | `system`, salva em `localStorage` (`geekpop-theme`, a mesma chave do site institucional).

- **Omissão: `system`** (desde 07/11/2026, igual ao `geek-toys-home`): segue o `prefers-color-scheme` do aparelho até a pessoa escolher. Antes era sempre claro.
- **Sem flash:** `public/boot.js` aplica `.dark` antes da primeira pintura. É um arquivo externo e síncrono no `<head>` de `index.html` e `shop.html`, e não um script inline, porque a CSP das SPAs não tem `'unsafe-inline'` em `script-src` (ver o comentário no próprio arquivo).
- **Seletor:** `ThemeToggle variant="icon"` é um botão de 44 px que gira Claro → Escuro → Sistema (o ícone mostra o modo atual); `variant="segmented"` mostra os três (admin). Está na loja, `/assinar`, `/login`, `/membro`, admin, PDV, e no canto de `/cadastro`, `/recuperar-senha`, `/verificar-email` e `/pagamento/*` (`ThemeCornerLayout`).

**Arquivo de verdade no código:** `src/index.css` (`:root` + `.dark`) + `ThemeProvider` (`src/contexts/ThemeContext.tsx`).

**Paleta igual à dos outros sites** (decisão do Leo, 07/11/2026: «a paleta deveria ser a mesma e sem questionamentos»). O `.dark` copia token a token o de `geek-toys-home/src/index.css`; mudou lá, muda aqui. O claro já era igual (o rosa continua `#F04080` com texto branco).

| Token CSS                | Claro (`:root`)         | Escuro (`.dark`) = home | Papel                 |
| ------------------------ | ----------------------- | ----------------------- | --------------------- |
| `--background`           | `330 40% 99%` `#FDFBFC` | `240 18% 8%` `#111118`  | Fundo da página       |
| `--foreground`           | `240 20% 12%` `#181825` | `330 20% 96%` `#F7F3F5` | Texto principal       |
| `--card`/`--popover`     | `0 0% 100%`             | `240 16% 11%` `#181821` | Cards, painéis        |
| `--primary`              | `340 85% 59%` `#F04080` | `340 85% 65%` `#F25A8C` | Marca                 |
| `--primary-foreground`   | `0 0% 100%`             | `240 20% 10%` `#14141F` | Texto sobre o rosa    |
| `--secondary`            | `330 55% 96%`           | `330 20% 18%`           | Faixas / superfícies  |
| `--secondary-foreground` | `330 50% 28%`           | `330 30% 92%`           |                       |
| `--muted`                | `330 25% 95%`           | `240 12% 16%`           | Superfície secundária |
| `--muted-foreground`     | `240 8% 42%`            | `330 10% 68%`           | Texto auxiliar        |
| `--accent`               | `45 97% 50%` `#FCBE04`  | `45 95% 55%` `#F9C31F`  | Amarelo pop           |
| `--accent-foreground`    | `240 20% 12%`           | `240 20% 10%`           |                       |
| `--border`               | `340 45% 88%`           | `330 15% 24%`           | Bordas                |
| `--input`                | `340 30% 94%`           | `330 12% 22%`           | Campos                |
| `--ring`                 | = primary               | = primary               | Focus ring            |

`theme-color` do navegador: `#F04080` no claro, `#111118` no escuro (o `ThemeProvider` troca).

### 2.5 Superfícies — tema claro (marketing / e-mail opcional)

| Uso                 | Hex                              |
| ------------------- | -------------------------------- |
| Fundo peça          | `#FFFFFF`                        |
| Moldura             | `#F83978` (~3–4px)               |
| Faixa de rodapé     | `#141414` com texto branco       |
| CTA em e-mail light | primary `#F04080` → texto branco |

---

## 3. Tipografia

| Papel                                   | Família                                            | Peso    | Onde                                   |
| --------------------------------------- | -------------------------------------------------- | ------- | -------------------------------------- |
| **Display / headings**                  | [Outfit](https://fonts.google.com/specimen/Outfit) | 600–800 | Títulos de página, logo wordmark, hero |
| **Body**                                | [Inter](https://fonts.google.com/specimen/Inter)   | 400–600 | UI, formulários, tabelas               |
| **Marketing comic** (só peças gráficas) | Display arredondado + **contorno preto**           | 800–900 | Stories, ads — não usar no app         |

Carregamento atual (`index.html`):

```
Outfit 400/600/800 + Inter 400/500/600
```

**Regra de app:** headings em `font-heading` / Outfit; body em `font-body` / Inter.  
`--font-heading` (no `@theme` de `src/index.css`) é Outfit, com Space Grotesk só como fallback.

### Hierarquia sugerida

| Nível    | Classe típica                                                                          |
| -------- | -------------------------------------------------------------------------------------- |
| H1 hero  | `text-4xl md:text-5xl font-heading font-extrabold` + `gradient-text` ou `text-shimmer` |
| H2 seção | `text-2xl font-heading font-bold`                                                      |
| H3 card  | `text-lg font-heading font-semibold`                                                   |
| Body     | `text-sm` / `text-base text-muted-foreground`                                          |
| Caption  | `text-xs text-muted-foreground`                                                        |

### Gradiente de marca (texto)

```css
/* Rosa → amarelo (oficial) */
.gradient-text {
  background: linear-gradient(to right, #f04080, #fcbe04);
  -webkit-background-clip: text;
  color: transparent;
}
```

Evitar gradientes **rosa → fúcsia/roxo** (`from-pink-500 to-fuchsia-600`) em CTAs novos; preferir `from-[#F04080] to-[#E11D6A]` ou solid `bg-primary`, com accent amarelo só em detalhes.

---

## 4. Efeitos e motion

Já implementados em `src/index.css` e alinhados à marca (glow rosa + shimmer amarelo):

| Classe / animação                                   | Função                          |
| --------------------------------------------------- | ------------------------------- |
| `text-glow-primary`                                 | Glow em títulos                 |
| `border-glow-primary`                               | Borda luminosa em cards premium |
| `hover-glow-primary`                                | Lift + glow no hover            |
| `btn-glow`                                          | Pulse em CTA principal          |
| `gradient-text`                                     | Texto rosa → amarelo            |
| `text-shimmer`                                      | Shimmer animado (rosa/âmbar)    |
| `card-glow`                                         | Hover sutil em cards            |
| `hero-glow`                                         | Radial + conic no hero          |
| `animate-float` / `fade-in` / `shake` / `checkmark` | Feedback e microinterações      |
| `glass`                                             | Blur glass dark                 |

**Marketing (fora do app):** contorno preto espesso, estrelas ✨, corações 💗, balões comic, burst de preço amarelo — usar em OG images, stories e e-mails promocionais, não em formulários admin.

---

## 5. Inventário de componentes

### 5.1 Design system UI (`src/components/ui/`)

Base **shadcn/ui** + CVA. Cores via tokens CSS (`bg-primary`, `text-muted-foreground`, etc.).

| Componente             | Arquivo                      | Variantes / notas de cor                                                                                                   |
| ---------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Button                 | `button.tsx`                 | `default` (primary), `destructive`, `outline`, `secondary`, `ghost`, `link`, `success` (green-500), `warning` (yellow-500) |
| Badge                  | `badge.tsx`                  | `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, **`club` (violet-600 — desalinhado)**              |
| Card                   | `card.tsx`                   | `bg-card`, borda token                                                                                                     |
| Dialog / Sheet         | `dialog.tsx`, `sheet.tsx`    | Overlay escuro                                                                                                             |
| Input / Label          | `input.tsx`, `label.tsx`     | `border-input`, ring primary                                                                                               |
| Tabs                   | `tabs.tsx`                   | Active com primary                                                                                                         |
| Progress               | `progress.tsx`               | Track muted, fill primary                                                                                                  |
| Skeleton               | `skeleton.tsx`               | Inclui `SkeletonMemberCard`                                                                                                |
| Loading                | `loading.tsx`                | Spinner primary                                                                                                            |
| Pagination             | `pagination.tsx`             |                                                                                                                            |
| Dropdown               | `dropdown-menu.tsx`          |                                                                                                                            |
| Form feedback          | `form-feedback.tsx`          | success / error                                                                                                            |
| Offline banner         | `offline-banner.tsx`         | yellow-500                                                                                                                 |
| Lazy image             | `lazy-image.tsx`             |                                                                                                                            |
| Skip link              | `skip-link.tsx`              | A11y                                                                                                                       |
| Section error boundary | `section-error-boundary.tsx` |                                                                                                                            |
| Success animation      | `success-animation.tsx`      |                                                                                                                            |

### 5.2 Domínio — membro

| Componente                                                                                 | Arquivo                         | Cores / estilo                                                                                                   |
| ------------------------------------------------------------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **MembershipCard**                                                                         | `member/MembershipCard.tsx`     | Só a frente (gradiente rosa → amarelo da marca); cinza com `paused` (vencida). O verso com QR saiu em 07/11/2026 |
| CardQrDialog                                                                               | `member/CardQrDialog.tsx`       | QR em tela cheia, fundo branco nos dois temas, moldura rosa, token anti-print renovado sozinho                   |
| StatusChip                                                                                 | `member/StatusChip.tsx`         | Texto `foreground` + bolinha/fundo/borda na cor do estado (nunca texto colorido)                                 |
| MemberSection / MemberDiscount / MemberEvents / MemberOrders / MemberAccount / RenewNotice | `member/*`                      | Painel do membro (Fase 2a, 07/11/2026): h2 com ícone `text-primary`, `p-4 rounded-xl`                            |
| SubscriptionCard                                                                           | `member/SubscriptionCard.tsx`   | Só aparece para quem ainda tem assinatura recorrente antiga                                                      |
| WelcomeCelebration                                                                         | `member/WelcomeCelebration.tsx` | Confetti com pink/gold + primary; CTA «Ver minha carteirinha»                                                    |
| BenefitsSection / AccountSection                                                           | `member/*`                      | Tokens + primary                                                                                                 |

### 5.3 Domínio — admin / PDV / relatórios

| Área        | Componentes                                                                                                                       | Notas de cor                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Admin shell | `admin/AdminSidebar`, tabs (Members, Orders, Products, Users, Logs, Reports, Settings), `RealtimeMetrics`                         | Sidebar dark; alertas yellow                             |
| Tabelas     | `DataTable`, `VirtualTable`, `MembersTable`, `MemberFilters`                                                                      | Status: green / yellow / red                             |
| Modais      | `MemberModal`, `UserModal`, `PaymentModal`, `RenewModal`, `ProfileEditModal`, `ContractModal`, `OrderDetailModal`, `ProductModal` | Tokens + warning yellow                                  |
| PDV         | `QRScanner`, páginas PDV                                                                                                          | Scanner animation, primary                               |
| Charts      | `reports/RevenueChart`, `MembersChart`, `ChurnMetrics`                                                                            | Hardcoded `#10b981`, `#3b82f6`, `#ef4444` (ok semântico) |

### 5.4 Domínio — loja

| Componente                                           | Arquivo                         | Notas                                                          |
| ---------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| ShopHeader / CategoryNav / ProductGrid / ProductCard | `store/*`                       | Primary + cards                                                |
| MemberDiscountBadge                                  | `store/MemberDiscountBadge.tsx` | Badge de 10%                                                   |
| CartDrawer                                           | `store/CartDrawer.tsx`          |                                                                |
| Páginas                                              | `pages/shop/*`                  | Hero com `from-primary/10` + **violet residual** em `ShopHome` |

### 5.5 Domínio — registro e auth

| Componente                                       | Arquivo               | Notas                                               |
| ------------------------------------------------ | --------------------- | --------------------------------------------------- |
| RegistrationStepper + steps                      | `registration/*`      | Stepper primary                                     |
| GoogleSignInButton, Turnstile, StripePaymentForm | raiz `components/`    | Neutros / vendor                                    |
| Landing Subscribe                                | `pages/Subscribe.tsx` | CTAs `pink→fuchsia` (ajustar para primary/hot pink) |

### 5.6 E-mails (server)

Arquivo: `server/api/src/services/email.service.ts`

| Elemento              | Cor atual             | Alvo marca                                         |
| --------------------- | --------------------- | -------------------------------------------------- |
| Fundo body            | `#0a0a1a`             | Manter dark ou `#0D0D0D`                           |
| Accent títulos / logo | **`#d4a520` dourado** | **`#F04080` primary** + accent `#FCBE04`           |
| CTA gradient          | `#d4a520 → #b8860b`   | `#F04080 → #E11D6A` (texto branco)                 |
| Wordmark              | “GEEK & TOYS” dourado | **“GeekPop & Toys”** (Pop em pink, Toys em yellow) |
| Success / fail        | `#4ade80` / `#f87171` | Manter semântica                                   |

### 5.7 PDF / contrato

`src/lib/contract-generator.ts`: gold `#E9B84A` + dark text — aceitável para documento formal; opcional reforçar header com primary pink.

### 5.8 Constantes de plano

```ts
// src/types/index.ts
CLUB_PLAN.color = "#7c3aed"; // ← roxo; alvo: '#F04080'
```

---

## 6. Auditoria: estado atual vs marca

### 6.1 O que já está alinhado

- Tema dark com **primary rosa** e **accent amarelo** em `src/index.css`
- Utilitários glow / shimmer / gradient-text rosa→âmbar
- `theme-color` meta `#F04080`
- Confetti e vários CTAs com pink
- Borders com matiz rosado (`--border`)

### 6.2 Alinhamento de código (Ago/2026)

Todos os gaps da peça de marca foram aplicados no SPA (club / admin / shop compartilham o bundle):

- Tokens `--primary` / `--accent` / glows em `src/index.css`
- Carteirinha, badge `club`, CTAs, e-mails, confetti, Stripe Elements
- Site institucional promove Loja + Clube + Evento (`ChannelsSection`, hero, nav)

### 6.3 Escopo de superfícies

| Superfície                   | Tema                   | Marca                         |
| ---------------------------- | ---------------------- | ----------------------------- |
| club / admin / shop / PDV    | **Light UI** (tokens)  | Rosa primary + amarelo accent |
| E-mails transacionais        | Dark HTML (inbox)      | Primary pink + accent yellow  |
| Peças de marketing / stories | Light + borda pink     | Comic outlines, yellow bursts |
| Carteirinha digital          | Gradiente rosa/amarelo | Premium pop, **não roxo**     |
| Contrato PDF                 | Light formal           | Gold secundário ok            |

---

## 7. Tokens CSS canônicos

Os valores vivos estão em `src/index.css` e na tabela do §2.4 (`:root` = claro, `.dark` = o mesmo do `geek-toys-home`). Este capítulo trazia um bloco "alvo" de agosto, todo escuro, que já não batia com o código e foi tirado em 07/11/2026.

### Gradiente da carteirinha (alvo)

```css
/* MembershipCard planStyles.club.bg */
linear-gradient(
  135deg,
  #1a0610 0%,
  #4a1028 18%,
  #F04080 45%,
  #FCBE04 55%,
  #F04080 70%,
  #3a0d20 88%,
  #1a0610 100%
)
/* accent chip: #FCBE04 → #FFE566 */
/* glow: rgba(240, 64, 128, 0.4) */
```

---

## 8. Regras de uso

1. **Uma cor de ação:** CTAs usam `primary` (hot pink). Amarelo é **destaque**, não botão principal (exceto promo de preço).
2. **Sem roxo de marca:** `#7c3aed`, `violet-*`, `fuchsia-*` como identidade → migrar para pink/yellow. Roxo só se for cor de produto de terceiros (ex. merch).
3. **Sem dourado como única brand color em e-mail:** gold antigo `#d4a520` vira **accent secundário** no máximo; primary vira pink.
4. **Contraste:** texto em primary → sempre branco. Texto em accent yellow → ink black `#141414`.
5. **Radius:** `--radius: 0.75rem` (cards/modais); botões hero podem ser `rounded-full`.
6. **Ícones:** Lucide; stroke 2; cor `currentColor` ou `text-primary` / `text-accent`.
7. **A11y:** ring `focus-visible` = primary; não depender só de cor em status (ícone + label).
8. **Não inventar hex soltos** em componentes novos — usar tokens Tailwind (`bg-primary`, `text-accent`, `border-border`).
9. **Mascote Nono** (tigre branco de moletom GeekPop): pequeno, **um por tela**, só onde a tela estaria vazia, convida ou agradece — `NonoMascot` (`wave`, `heart`, `standing`, `glasses`). Arquivos em `public/mascot/` (WebP, 2 tamanhos via `srcset`; o e-mail usa `nono-heart-email.png`, porque o Outlook não mostra WebP); a arte original fica fora do repo.
   - **Loja**: `wave` nos estados vazios e produto não encontrado; `heart` no pagamento confirmado.
   - **Clube** (06/11/2026): `standing` com balão de fala em HTML antes do cartão do plano em `/assinar` — o balão nunca leva preço, desconto ou promoção (CONANDA 163/2014), o preço fica no cartão; `heart` em `/pagamento/sucesso`, nas boas-vindas do `/membro` (só até 7 dias depois da ativação e enquanto não for fechada — `lib/welcome.ts`) e no topo do e-mail `welcome`; `glasses` de 44 px na frente da carteirinha, à direita do número (o QR fica no verso), escondido enquanto as boas-vindas aparecem; `wave` em "Nenhuma assinatura encontrada".
   - **Nunca**: formulários de cadastro, cartão ou PIX, "Falta o pagamento", `/verificar/:id`, login e recuperar senha, admin e PDV.

---

## 9. Arquivos-fonte de design no código

**Tailwind 4 (desde 06/10/2026).** Não há mais `tailwind.config.js`: tema,
cores e animações ficam no `@theme` de `src/index.css`. A migração manteve a
interface idêntica à da v3 (112 capturas comparadas, claro e escuro, celular e
desktop), e para isso o `index.css` tem regras de compatibilidade — **não as
remova sem comparar as telas**:

- `space-y-*` com a semântica da v3 (margem em cima dos irmãos). Na v4 a margem
  vai embaixo, e embaixo de um `<label>` inline ela não faz nada: todo formulário
  perdia o espaço entre rótulo e campo. Valor novo de `space-y` precisa entrar na
  lista.
- Alturas de linha absolutas da v3 (`--text-*--line-height`), paleta da v3 para
  os tons usados, placeholder cinza e `cursor: pointer` em botões.
- Degradês com `/srgb` (`bg-linear-to-r/srgb`): a v4 interpola em oklab e o
  rosa→amarelo da marca mudava de meio-tom.
- Em `@utility`, escreva `-webkit-backdrop-filter` **antes** de
  `backdrop-filter`: na ordem inversa o minificador descarta o padrão e o Chrome
  fica sem desfoque.

| Arquivo                                           | Responsabilidade                          |
| ------------------------------------------------- | ----------------------------------------- |
| `src/index.css`                                   | Tokens CSS, utilitários glow/shimmer/hero |
| `src/index.css` (`@theme`)                        | Mapa de cores → tokens, fonts, animações  |
| `index.html`                                      | Google Fonts, `theme-color`               |
| `src/components/ui/*`                             | Primitivos shadcn                         |
| `src/components/member/MembershipCard.tsx`        | Visual da carteirinha                     |
| `src/types/index.ts`                              | `CLUB_PLAN.color`                         |
| `server/api/src/services/email.service.ts`        | Shell HTML de e-mail                      |
| `src/lib/contract-generator.ts`                   | PDF do contrato                           |
| `public/logo-vip.png`, `logo.jpg`, `og-image.png` | Assets de marca                           |
| `docs/assets/brand-reference.jpg`                 | Peça de referência oficial                |

---

## 10. Checklist de PR de design

Ao alterar UI ou e-mail:

- [ ] Cores novas vêm desta paleta (ou semântica success/warning/destructive)
- [ ] Nenhum `violet` / `#7c3aed` / gold-only brand em superfície de marca
- [ ] Wordmark “GeekPop & Toys” correto
- [ ] Gradiente de marca = pink → yellow (não pink → purple)
- [ ] Fontes: Outfit headings, Inter body
- [ ] Contraste AA em texto sobre primary/accent
- [ ] Atualizar este doc se a paleta oficial mudar

---

## 11. Referências cruzadas

- Visão de produto: [`PROJECT.md`](PROJECT.md)
- Arquitetura (carteirinha, e-mails): [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Tarefas de alinhamento: [`TODO.md`](TODO.md)
- Operação: [`../CLAUDE.md`](../CLAUDE.md)
  )
