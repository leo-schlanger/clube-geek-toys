# Segurança e Compliance - Clube Geek & Toys

**Última atualização:** 26 de março de 2026

## Visão Geral

Este documento descreve as medidas de segurança implementadas na plataforma Clube Geek & Toys.

## 1. Autenticação e Autorização

### Firebase Authentication

- Login com email/senha
- Verificação de email obrigatória
- Proteção contra brute force nativa do Firebase
- Tokens JWT com expiração automática

### Roles (Papéis)

| Role     | Acesso                                   |
| -------- | ---------------------------------------- |
| `member` | Dashboard pessoal, pontos, contratos     |
| `seller` | PDV, verificar membros, adicionar pontos |
| `admin`  | Painel completo, gestão de usuários      |

## 2. Firestore Security Rules

### Princípios

- **Deny by default**: Tudo é negado exceto explicitamente permitido
- **Role-based access**: Validação de papel do usuário
- **Owner validation**: Usuários só acessam seus próprios dados
- **Audit trail**: Coleções críticas são imutáveis (sem delete)

### Coleções Imutáveis

- `payments` - Histórico de pagamentos
- `point_transactions` - Transações de pontos
- `audit_logs` - Logs de auditoria
- `email_logs` - Logs de emails
- `contracts` - Contratos assinados

## 3. Storage Security Rules

- **Contratos (PDF)**: Máx. 5MB, apenas owner pode criar, owner/admin podem ler
- **Fotos de membros**: Máx. 2MB, apenas imagens, owner pode criar/deletar
- **Default deny**: Qualquer outro path é negado

## 4. API Worker (Cloudflare)

### Rate Limiting

Implementado via Cache API (gratuito):

| Endpoint                | Limite  | Janela |
| ----------------------- | ------- | ------ |
| `/pix/create`           | 10 req  | 1 min  |
| `/checkout/create`      | 10 req  | 1 min  |
| `/subscription/create`  | 5 req   | 1 min  |
| `/email/send`           | 20 req  | 1 min  |
| `/email/password-reset` | 3 req   | 5 min  |
| Outros                  | 100 req | 1 min  |

### Endpoints Protegidos

**Relatórios (GET):**

- `/reports/daily` - Requer CORS origin válida ou Bearer token
- `/reports/monthly` - Requer CORS origin válida ou Bearer token

**Cron Jobs (POST):**

- `/cron/expire-points` - Requer header `X-Cloudflare-Cron: true` ou Bearer token
- `/cron/renewal-reminders` - Requer header `X-Cloudflare-Cron: true` ou Bearer token

O Bearer token é o mesmo `MERCADOPAGO_WEBHOOK_SECRET` configurado nos secrets.

### CORS

Whitelist de origens permitidas:

- `https://clube-geek-toys.web.app`
- `https://clube-geek-toys.firebaseapp.com`
- `https://club.geeketoys.com.br`
- `https://adm.geeketoys.com.br`
- `localhost` (desenvolvimento)

### Webhook Security

- Validação HMAC-SHA256 obrigatória
- Timestamp validation (máx. 5 minutos)
- Idempotência via `processed_webhooks`

### Input Validation

- Zod schemas para todos os endpoints
- Sanitização HTML para emails (XSS prevention)
- Limites de tamanho em todas as requisições

## 5. Headers de Segurança

Configurados no `firebase.json`:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: [configurado com whitelist]
```

### CSP Directives

- `frame-ancestors 'none'` - Proteção clickjacking
- `base-uri 'self'` - Proteção base injection
- `form-action 'self'` - Restrição de form submissions

## 6. Gestão de Secrets

### Secrets via Wrangler (Worker)

```bash
wrangler secret put MERCADOPAGO_ACCESS_TOKEN
wrangler secret put RESEND_API_KEY
wrangler secret put FIREBASE_API_KEY
wrangler secret put MERCADOPAGO_WEBHOOK_SECRET
```

### Variáveis de Ambiente (Frontend)

- Armazenadas em `.env` (não commitado)
- Prefix `VITE_` para exposição no build

### Nunca Commitar

- `.env`, `.env.local`, `.env.production`
- `serviceAccountKey.json`
- Qualquer arquivo `.pem`, `.key`

## 7. Backup e Recuperação

### Backup Manual do Firestore

```bash
npm run backup:firestore
```

Exporta para: `gs://clube-geek-toys-backups/YYYYMMDD_HHMMSS`

### Restauração

```bash
gcloud firestore import gs://clube-geek-toys-backups/[backup-name] --project=clube-geek-toys
```

### Retenção Recomendada

- Backups diários: 7 dias
- Backups semanais: 4 semanas
- Backups mensais: 12 meses

## 8. LGPD Compliance

### Dados Coletados

- Nome, email, CPF, telefone (cadastro)
- Endereço IP, user agent (contratos)
- Dados de navegação (cookies)

### Tempo de Retenção

| Dado              | Período                  |
| ----------------- | ------------------------ |
| Cadastro          | 5 anos após cancelamento |
| Pagamentos        | 5 anos (fiscal)          |
| Contratos         | 10 anos                  |
| Logs de navegação | 6 meses                  |

### Direitos do Titular

- Acesso, correção, exclusão
- Portabilidade, revogação
- Contato: contato@geeketoys.com.br

## 9. Monitoramento

### Logs Disponíveis

- `audit_logs`: Ações críticas de admin
- `email_logs`: Emails enviados
- Console Cloudflare: Erros do Worker
- Firebase Console: Auth e Firestore

### Alertas Recomendados

1. Falhas de autenticação em massa
2. Erros de webhook
3. Rate limit atingido frequentemente
4. Tentativas de acesso não autorizado

## 10. Checklist de Segurança

### Deploy

- [ ] Verificar .gitignore inclui .env
- [ ] Rodar `npm audit` sem vulnerabilidades críticas
- [ ] Testar rate limiting
- [ ] Validar CORS em produção
- [ ] Confirmar webhook secret configurado

### Manutenção Mensal

- [ ] Revisar dependências com `npm audit`
- [ ] Verificar logs de auditoria
- [ ] Confirmar backups funcionando
- [ ] Revisar acessos de usuários admin

### Anual

- [ ] Rotacionar secrets
- [ ] Revisar política de privacidade
- [ ] Teste de penetração (opcional)
- [ ] Atualizar documentação

## 11. Contatos de Emergência

- **Incidentes de Segurança**: contato@geeketoys.com.br
- **ANPD (Vazamento de Dados)**: www.gov.br/anpd
- **Firebase Status**: status.firebase.google.com
- **Cloudflare Status**: www.cloudflarestatus.com
