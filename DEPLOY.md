# Guia de Deploy - Clube Geek & Toys

Este documento descreve os passos necessários para realizar o deploy do sistema em produção.

## Requisitos
- Conta no Firebase com plano Blaze (necessário para Cloud Functions)
- Conta no Mercado Pago (Credenciais de Produção)
- Node.js 18+ instalado

## 1. Configuração do Firebase

### Instalação do Firebase CLI
```bash
npm install -g firebase-tools
```

### Login e Inicialização
```bash
firebase login
firebase use --add [PROJECT_ID]
```

### Variáveis de Ambiente (Cloud Functions)
Configure as credenciais do Mercado Pago e outras variáveis:

```bash
firebase functions:config:set mercadopago.access_token="SEU_ACCESS_TOKEN" \
mercadopago.webhook_secret="SEU_WEBHOOK_SECRET"
```

*Nota: O `WEBHOOK_SECRET` é gerado ao criar o Webhook no painel do Mercado Pago.*

## 2. Configuração do Mercado Pago

1. Vá para o [Painel do Desenvolvedor](https://www.mercadopago.com.br/developers/panel)
2. Configure o Webhook para apontar para a URL da sua Cloud Function:
   `https://southamerica-east1-[PROJECT_ID].cloudfunctions.net/api/mercadoPagoWebhook`
3. Habilite os eventos: `payment`, `application`, `plan_subscription`.

## 3. Deploy

### Deploy Total
```bash
firebase deploy
```

### Deploy Apenas de Partes
```bash
firebase deploy --only hosting
firebase deploy --only functions
firebase deploy --only firestore:rules
```

## 4. Variáveis de Ambiente (Frontend)
Certifique-se de configurar as variáveis no seu serviço de CI/CD ou arquivo local `.env.production`:

```env
VITE_FIREBASE_API_KEY=xxx
VITE_FIREBASE_AUTH_DOMAIN=xxx
VITE_FIREBASE_PROJECT_ID=xxx
VITE_FIREBASE_STORAGE_BUCKET=xxx
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_FIREBASE_APP_ID=xxx
VITE_API_URL=https://southamerica-east1-[PROJECT_ID].cloudfunctions.net/api
```

## 5. Manutenção e Monitoramento
- **Logs:** Acesse o painel do Firebase > Functions > Logs para monitorar pagamentos e erros.
- **Audit Logs:** Verifique a aba de logs no Dashboard Admin do sistema.
- **Segurança:** As regras do Firestore já estão configuradas em `firestore.rules`.
