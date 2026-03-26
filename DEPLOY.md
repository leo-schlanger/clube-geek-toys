# Guia de Deploy - Clube Geek & Toys

> **Última atualização:** 26 de Março de 2026

Este documento descreve os passos necessários para realizar o deploy do sistema em produção.

## Requisitos

- Node.js 18+ instalado
- Conta no Firebase (plano Spark gratuito é suficiente)
- Conta no Cloudflare (plano gratuito)
- Conta no Mercado Pago (Credenciais de Produção)
- Conta no Resend (plano gratuito: 3k emails/mês)

## Arquitetura de Deploy

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREBASE HOSTING                          │
│  - Frontend React (SPA)                                      │
│  - Headers de segurança (CSP, HSTS, etc.)                   │
│  - CDN global                                                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE WORKERS                        │
│  - API de pagamentos (Mercado Pago)                         │
│  - Webhooks (PIX, assinaturas)                              │
│  - Envio de emails (Resend)                                 │
│  - Rate limiting                                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       FIREBASE                               │
│  - Authentication (usuários)                                 │
│  - Firestore (banco de dados)                               │
│  - Storage (contratos PDF)                                   │
└─────────────────────────────────────────────────────────────┘
```

## 1. Configuração do Firebase

### Instalação do Firebase CLI

```bash
npm install -g firebase-tools
```

### Login e Inicialização

```bash
firebase login
firebase use --add clube-geek-toys
```

### Deploy das Regras de Segurança

```bash
# Deploy Firestore + Storage rules
npm run deploy:rules

# Ou separadamente:
firebase deploy --only firestore
firebase deploy --only storage
```

## 2. Configuração do Cloudflare Workers

### Instalação do Wrangler CLI

```bash
npm install -g wrangler
wrangler login
```

### Configuração de Secrets

```bash
cd api-worker

# Mercado Pago
wrangler secret put MERCADOPAGO_ACCESS_TOKEN
wrangler secret put MERCADOPAGO_WEBHOOK_SECRET

# Resend (emails)
wrangler secret put RESEND_API_KEY

# Firebase
wrangler secret put FIREBASE_API_KEY
```

### Deploy do Worker

```bash
cd api-worker
npm run deploy
```

**URL do Worker:** `https://api-worker.leoschlanger.workers.dev`

## 3. Configuração do Mercado Pago

1. Acesse o [Painel do Desenvolvedor](https://www.mercadopago.com.br/developers/panel)
2. Configure o Webhook:
   - URL: `https://api-worker.leoschlanger.workers.dev/webhook/mercadopago`
   - Eventos: `payment`, `subscription_preapproval`, `subscription_authorized_payment`
3. Copie o Webhook Secret para o Cloudflare

## 4. Configuração do Resend

1. Acesse [Resend Dashboard](https://resend.com/domains)
2. Adicione e verifique o domínio `geeketoys.com.br`
3. Copie a API Key para o Cloudflare Worker

## 5. Deploy do Frontend

### Build de Produção

```bash
npm run build
```

### Deploy no Firebase Hosting

```bash
firebase deploy --only hosting
```

**URLs de Produção:**

- https://clube-geek-toys.web.app
- https://clube-geek-toys.firebaseapp.com

## 6. Variáveis de Ambiente

### Frontend (.env.production)

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=clube-geek-toys.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=clube-geek-toys
VITE_FIREBASE_STORAGE_BUCKET=clube-geek-toys.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_MERCADOPAGO_PUBLIC_KEY=APP_USR-xxx
VITE_PAYMENT_API_URL=https://api-worker.leoschlanger.workers.dev
VITE_PIX_KEY=xxx
VITE_ENVIRONMENT=production
```

### Worker (via wrangler.toml)

```toml
[vars]
FIREBASE_PROJECT_ID = "clube-geek-toys"
FRONTEND_URL = "https://clube-geek-toys.web.app"
WORKER_URL = "https://api-worker.leoschlanger.workers.dev"
FROM_EMAIL = "Clube Geek & Toys <contato@geeketoys.com.br>"
```

## 7. Checklist de Deploy

### Antes do Deploy

- [ ] `npm audit` sem vulnerabilidades críticas
- [ ] `npm run lint` sem erros
- [ ] `npm run build` completa com sucesso
- [ ] Variáveis de ambiente configuradas
- [ ] Secrets do Worker configurados

### Após o Deploy

- [ ] Testar login/cadastro
- [ ] Testar pagamento PIX (sandbox)
- [ ] Verificar envio de emails
- [ ] Verificar webhook do Mercado Pago
- [ ] Testar rate limiting

## 8. Backup e Recuperação

### Backup Manual do Firestore

```bash
# Requer gcloud CLI configurado
npm run backup:firestore
```

### Restauração

```bash
gcloud firestore import gs://clube-geek-toys-backups/[backup-name] --project=clube-geek-toys
```

## 9. Monitoramento

### Firebase Console

- **Authentication:** Usuários e sessões
- **Firestore:** Uso e regras
- **Storage:** Arquivos e bandwidth

### Cloudflare Dashboard

- **Workers:** Requests, erros, latência
- **Rate limiting:** Requisições bloqueadas

### Logs

- `audit_logs` (Firestore): Ações de admin
- `email_logs` (Firestore): Emails enviados
- Console Cloudflare: Erros do Worker

## 10. Troubleshooting

### Worker retorna 500

1. Verificar logs no Cloudflare Dashboard
2. Confirmar secrets configurados
3. Testar endpoint `/health`

### Emails não enviados

1. Verificar API key do Resend
2. Confirmar domínio verificado
3. Checar `email_logs` no Firestore

### Webhook não processado

1. Verificar assinatura HMAC
2. Confirmar URL no painel MP
3. Checar `processed_webhooks` (idempotência)

### Rate limit atingido

1. Aguardar janela de tempo
2. Verificar se não é ataque
3. Ajustar limites se necessário

---

**Documentação relacionada:**

- [SECURITY.md](docs/SECURITY.md) - Guia de segurança
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Arquitetura técnica
- [TODO.md](docs/TODO.md) - Roadmap
