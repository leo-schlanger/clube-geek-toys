/**
 * Script para inicializar o Firestore com dados iniciais
 * Usa Firebase Admin SDK para bypass das regras de segurança
 *
 * Pré-requisito:
 * 1. Baixe a service account key do Firebase Console
 * 2. Salve como serviceAccountKey.json na raiz do projeto
 *
 * Uso: npm run setup:firestore
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to service account key
const serviceAccountPath = resolve(__dirname, '../serviceAccountKey.json')

// Check if service account exists
if (!existsSync(serviceAccountPath)) {
  console.error('')
  console.error('❌ Erro: serviceAccountKey.json não encontrado!')
  console.error('')
  console.error('   Para obter a service account key:')
  console.error('   1. Acesse: https://console.firebase.google.com')
  console.error('   2. Selecione seu projeto')
  console.error('   3. Vá em Configurações > Contas de serviço')
  console.error('   4. Clique em "Gerar nova chave privada"')
  console.error('   5. Salve o arquivo como serviceAccountKey.json na raiz do projeto')
  console.error('')
  process.exit(1)
}

// Load service account
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'))

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

// System configuration
const SYSTEM_CONFIG = {
  // Points system configuration
  points: {
    points_per_real: 1,
    expiration_months: 6,
    redemption_rules: [
      { points: 500, value: 25, description: 'R$ 25 de desconto' },
      { points: 800, value: 50, description: 'R$ 50 de desconto' },
      { points: 1500, value: 100, description: 'R$ 100 de desconto' },
    ],
    multipliers: {
      silver: 1,
      gold: 2,
      black: 3,
    },
  },
  // Plan prices (in BRL)
  plans: {
    silver: {
      monthly: 19.90,
      annual: 199.90,
      discount_products: 10,
      discount_services: 20,
    },
    gold: {
      monthly: 39.90,
      annual: 399.90,
      discount_products: 15,
      discount_services: 35,
    },
    black: {
      monthly: 49.90,
      annual: 499.90,
      discount_products: 20,
      discount_services: 50,
    },
  },
  // System metadata
  metadata: {
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  },
}

async function setupFirestore() {
  console.log('')
  console.log('🚀 Clube Geek & Toys - Setup do Firestore')
  console.log('=========================================')
  console.log('')
  console.log(`   Projeto: ${serviceAccount.project_id}`)
  console.log('')

  try {
    // 1. Create/update config documents
    console.log('📋 Configurando coleção "config"...')

    // Points config
    await db.collection('config').doc('points').set(SYSTEM_CONFIG.points, { merge: true })
    console.log('   ✅ config/points criado')

    // Plans config
    await db.collection('config').doc('plans').set(SYSTEM_CONFIG.plans, { merge: true })
    console.log('   ✅ config/plans criado')

    // Metadata
    const metadataDoc = await db.collection('config').doc('metadata').get()
    if (!metadataDoc.exists) {
      await db.collection('config').doc('metadata').set(SYSTEM_CONFIG.metadata)
      console.log('   ✅ config/metadata criado')
    } else {
      await db.collection('config').doc('metadata').set({
        ...SYSTEM_CONFIG.metadata,
        created_at: metadataDoc.data()?.created_at || SYSTEM_CONFIG.metadata.created_at,
      }, { merge: true })
      console.log('   ✅ config/metadata atualizado')
    }

    // 2. Check collections
    console.log('')
    console.log('📊 Verificando coleções...')

    const collections = ['users', 'members', 'payments', 'point_transactions', 'audit_logs']
    for (const colName of collections) {
      try {
        const snapshot = await db.collection(colName).limit(1).get()
        const count = snapshot.size
        if (count > 0) {
          // Get actual count
          const allDocs = await db.collection(colName).get()
          console.log(`   ✅ ${colName}: ${allDocs.size} documento(s)`)
        } else {
          console.log(`   ⚪ ${colName}: vazia (será criada ao adicionar dados)`)
        }
      } catch {
        console.log(`   ⚪ ${colName}: não existe (será criada automaticamente)`)
      }
    }

    // 3. Summary
    console.log('')
    console.log('=========================================')
    console.log('✅ Setup do Firestore concluído!')
    console.log('')
    console.log('📌 Próximos passos:')
    console.log('')
    console.log('1. Deploy das regras e índices:')
    console.log('   npm run deploy:firestore')
    console.log('')
    console.log('2. Criar primeiro admin:')
    console.log('   a) Acesse o app e crie uma conta normal')
    console.log('   b) No Firebase Console > Authentication, copie o UID')
    console.log('   c) Execute: npm run setup:admin <UID> <EMAIL>')
    console.log('')

  } catch (error) {
    console.error('')
    console.error('❌ Erro durante o setup:', error)
    process.exit(1)
  }
}

// Run setup
setupFirestore().then(() => process.exit(0))
