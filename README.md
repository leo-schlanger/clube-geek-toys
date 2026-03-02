# Clube Geek & Toys

Sistema completo de gerenciamento de clube de assinaturas para a loja Geek & Toys.

## Funcionalidades

### Planos Disponíveis

| Plano | Mensal | Anual | Desconto Produtos | Desconto Serviços |
|-------|--------|-------|-------------------|-------------------|
| Silver | R$ 19,90 | R$ 199,90 | 10% | 20% |
| Gold | R$ 39,90 | R$ 399,90 | 15% | 35% |
| Black | R$ 49,90 | R$ 349,90 | 20% | 50% |

### Módulos

- **Landing Page**: Apresentação dos planos e benefícios
- **Cadastro**: Registro com validação de CPF e integração com pagamento
- **Área do Membro**: Carteirinha digital com QR Code, renovação, upgrade
- **PDV (Vendedor)**: Verificação por QR Code ou CPF, validação de descontos
- **Admin Dashboard**: Estatísticas, gerenciamento de membros, exportação

## Tecnologias

- **Frontend**: React 19, TypeScript, Vite
- **Estilização**: Tailwind CSS, shadcn/ui components
- **Backend**: Firebase (Auth, Firestore, Cloud Functions)
- **Pagamentos**: Mercado Pago (PIX e Cartão)
- **Bibliotecas**: React Query, React Hook Form, Zod, jsQR

---

## Instalação Rápida

```bash
# 1. Clonar repositório
git clone <seu-repositorio>
cd clube-geek-toys

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env
# Editar .env com suas credenciais

# 4. Rodar em desenvolvimento
npm run dev
```

---

## Configuração Completa

### 1. Firebase

#### 1.1 Criar Projeto

1. Acesse [Firebase Console](https://console.firebase.google.com)
2. Clique em "Adicionar projeto"
3. Nome: `clube-geek-toys`
4. Desative Google Analytics (opcional)
5. Clique em "Criar projeto"

#### 1.2 Habilitar Billing

1. Acesse [Google Cloud Console](https://console.cloud.google.com/billing)
2. Vincule uma conta de faturamento ao projeto
3. O plano Spark (gratuito) é suficiente para começar

#### 1.3 Configurar Authentication

1. No Firebase Console, vá em **Authentication**
2. Clique em "Começar"
3. Ative o provedor **Email/Senha**
4. (Opcional) Configure templates de email em português

#### 1.4 Criar Firestore

1. Vá em **Firestore Database**
2. Clique em "Criar banco de dados"
3. Selecione **Iniciar no modo de produção**
4. Escolha a localização `southamerica-east1` (São Paulo)

#### 1.5 Aplicar Regras de Segurança

1. No Firestore, vá na aba **Regras**
2. Cole o conteúdo do arquivo `firestore.rules`
3. Clique em "Publicar"

#### 1.6 Criar Índices

1. No Firestore, vá na aba **Índices**
2. Importe o arquivo `firestore.indexes.json` via Firebase CLI:

```bash
firebase deploy --only firestore:indexes
```

#### 1.7 Obter Credenciais

1. Vá em **Configurações do projeto** (engrenagem)
2. Em **Geral**, role até "Seus apps"
3. Clique em **Web** (ícone `</>`)
4. Registre o app com nome "web"
5. Copie as credenciais para o arquivo `.env`

### 2. Mercado Pago

#### 2.1 Criar Aplicação

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers/panel)
2. Clique em "Criar aplicação"
3. Nome: `Clube Geek & Toys`
4. Selecione: "Pagamentos online" > "CheckoutPro"

#### 2.2 Obter Credenciais

1. Na aplicação criada, vá em **Credenciais de teste**
2. Copie:
   - **Public Key**: Para o frontend (`.env`)
   - **Access Token**: Para o backend (`functions/.env`)

#### 2.3 Configurar Webhooks

1. Na aplicação, vá em **Webhooks**
2. Configure a URL:
   ```
   https://southamerica-east1-clube-geek-toys.cloudfunctions.net/api/webhook/mercadopago
   ```
3. Selecione o evento: **Pagamentos**

### 3. Deploy das Cloud Functions

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login no Firebase
firebase login

# Instalar dependências das functions
cd functions
npm install
cd ..

# Configurar Access Token do Mercado Pago
firebase functions:config:set mercadopago.access_token="SEU_ACCESS_TOKEN"

# Deploy
firebase deploy --only functions
```

### 4. Deploy do Frontend

```bash
# Build
npm run build

# Deploy no Firebase Hosting
firebase deploy --only hosting
```

---

## Variáveis de Ambiente

### Frontend (.env)

```env
# Firebase
VITE_FIREBASE_API_KEY=sua-api-key
VITE_FIREBASE_AUTH_DOMAIN=seu-projeto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=seu-projeto-id
VITE_FIREBASE_STORAGE_BUCKET=seu-projeto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=seu-sender-id
VITE_FIREBASE_APP_ID=seu-app-id

# Mercado Pago
VITE_MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxxx
VITE_PAYMENT_API_URL=https://southamerica-east1-SEU-PROJETO.cloudfunctions.net/api

# PIX (chave da loja)
VITE_PIX_KEY=sua-chave-pix@email.com
```

### Backend (functions/.env)

```env
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxxx
```

---

## Estrutura de Pastas

```
clube-geek-toys/
├── src/
│   ├── components/          # Componentes React
│   │   ├── ui/              # Componentes UI base (shadcn)
│   │   ├── PaymentModal.tsx # Modal de pagamento PIX/Cartão
│   │   ├── QRScanner.tsx    # Scanner de QR Code
│   │   ├── MemberModal.tsx  # Modal criar/editar membro
│   │   ├── RenewModal.tsx   # Modal renovação
│   │   └── UpgradeModal.tsx # Modal upgrade
│   ├── contexts/            # Contextos React
│   │   └── AuthContext.tsx  # Autenticação Firebase
│   ├── lib/                 # Serviços e utilitários
│   │   ├── firebase.ts      # Configuração Firebase
│   │   ├── members.ts       # CRUD membros
│   │   ├── payments.ts      # Integração pagamentos
│   │   └── utils.ts         # Funções utilitárias
│   ├── pages/               # Páginas da aplicação
│   │   ├── Subscribe.tsx    # Landing page
│   │   ├── Register.tsx     # Cadastro
│   │   ├── Login.tsx        # Login
│   │   ├── ForgotPassword.tsx # Recuperar senha
│   │   ├── MemberDashboard.tsx # Área do membro
│   │   ├── PDV.tsx          # Verificação vendedor
│   │   ├── AdminDashboard.tsx # Painel admin
│   │   └── PaymentResult.tsx # Resultado pagamento
│   └── types/               # Tipos TypeScript
├── functions/               # Firebase Cloud Functions
│   ├── index.js             # API de pagamentos
│   └── package.json
├── firestore.rules          # Regras de segurança
├── firestore.indexes.json   # Índices do Firestore
├── firebase.json            # Configuração Firebase
└── .env.example             # Exemplo de variáveis
```

---

## Rotas da Aplicação

| Rota | Descrição | Acesso |
|------|-----------|--------|
| `/assinar` | Landing page com planos | Público |
| `/cadastro` | Formulário de cadastro | Público |
| `/login` | Tela de login | Público |
| `/recuperar-senha` | Recuperação de senha | Público |
| `/membro` | Dashboard do membro | Membros |
| `/pdv` | Verificação de membros | Vendedores |
| `/admin` | Painel administrativo | Admins |
| `/pagamento/sucesso` | Confirmação pagamento | Público |
| `/pagamento/erro` | Erro no pagamento | Público |
| `/pagamento/pendente` | Pagamento pendente | Público |

---

## Criar Primeiro Admin

Após o deploy, crie um usuário admin manualmente no Firestore:

1. Registre uma conta normalmente pelo app
2. No Firebase Console > Firestore
3. Na coleção `users`, encontre o documento do usuário
4. Mude o campo `role` de `"member"` para `"admin"`

---

## Scripts Disponíveis

```bash
npm run dev      # Servidor de desenvolvimento
npm run build    # Build para produção
npm run preview  # Preview do build
npm run lint     # Verificar código
```

---

## Licença

Privado - Geek & Toys Home
