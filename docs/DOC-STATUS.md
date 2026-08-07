# Status da documentação vs realidade (7 Ago 2026)

> Auditoria: docs ↔ código ↔ produção.  
> Objetivo: responder se o documentado está presente e funcional.

---

## Veredito

| Área                                     | Docs                      | Presente no código    | Funcional em produção                   |
| ---------------------------------------- | ------------------------- | --------------------- | --------------------------------------- |
| Stack clube + loja + API + PDV           | ✅ PROJECT / ARCHITECTURE | ✅                    | ✅ (E2E admin+loja + smoke público)     |
| Plano único R$ 149,99 / 15%              | ✅                        | ✅                    | ✅ (página assinar + checkout logic)    |
| Evento 6/set 14h–18h, R$ 20              | ✅ EVENTS                 | ✅ `event.ts` ×2      | ✅                                      |
| Galeria **geral** no home (sem download) | ✅ EVENTS (atualizado)    | ✅ `GallerySection`   | ✅ assets + JS                          |
| Reserva ingresso WhatsApp loja           | ✅                        | ✅                    | ✅ formulário → wa.me                   |
| Contatos dual WhatsApp                   | ✅ PROJECT                | ✅ `contacts.ts` home | ✅                                      |
| Shopee/ML removidos                      | ✅                        | ✅ home               | ✅                                      |
| Catálogo loja / produtos                 | ✅                        | ✅                    | ⚠️ **14 produtos sem foto** (conteúdo)  |
| Upload imagem admin                      | ✅ PROJECT                | ✅                    | ✅ E2E criou produto com URL de imagem  |
| Seeds Checkup ocultos                    | ✅ TODO                   | ✅ API filter         | ✅ total=14, sem Checkup                |
| Rádio AzuraCast                          | ✅ RADIO                  | ✅                    | ✅ now-playing                          |
| Design Hot Pink / light-first            | ✅ DESIGN / PROJECT       | ✅                    | ✅ SPA light                            |
| SSH passwordless nesta máquina           | ⚠️ CLAUDE.local           | chave local pronta    | ❌ chave ainda não em `authorized_keys` |

**Conclusão:** documentação operacional de produto/eventos/contatos está **alinhada** após esta revisão. O único gap “documentado como objetivo mas incompleto no ar” é **foto dos produtos de venda** (pendência de conteúdo da Laura, não de feature ausente).

---

## O que a documentação descreve e está OK

1. Domínios club / adm / shop / api / radio / analytics / home
2. Deploy clube via GitHub Actions → VPS
3. Home via Vercel (sem Actions no repo home)
4. Auth, members, payments Stripe/PIX, webhooks (código + guards API testados)
5. Fluxo admin: produto com imagem → vitrine → carrinho → checkout (sem cobrar) — **E2E 4/4**
6. Login membro → `/membro` — **UI E2E**

---

## Gaps conhecidos (honestos)

| Item                                                           | Tipo                   | Ação                                             |
| -------------------------------------------------------------- | ---------------------- | ------------------------------------------------ |
| 14 produtos sem `images[]`                                     | Conteúdo               | Admin → Produtos → upload                        |
| Cadastro público + e-mail + Stripe assinatura live             | E2E não rodado em LIVE | Usar modo test ou conta sandox se quiser validar |
| PDV ponta a ponta                                              | Não E2E nesta rodada   | Manual com seller                                |
| `ARCHITECTURE.md` ainda cita dark como “alvo” em trecho antigo | Doc cosmético          | Preferir DESIGN.md light-first                   |
| Checkup 2026-08-04                                             | Snapshot histórico     | Manter; não é fonte de verdade atual             |

---

## Fontes de verdade (ordem)

1. Código em `master` / `main`
2. Produção (shop, api, www)
3. `docs/EVENTS.md` + `docs/PROJECT.md` + `docs/DESIGN.md`
4. Checkups datados (`CHECKUP-*.md`) — histórico

---

## Credenciais E2E

Ver `CLAUDE.local.md` / `.e2e-creds.env` (gitignored):

- Admin: `e2e-admin@geeketoys.com.br`
- Member: `e2e-member@geeketoys.com.br`

Não commitar senhas.
