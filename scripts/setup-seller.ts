/**
 * Script para criar/atualizar usuário vendedor (seller)
 * Usa Firebase Admin SDK para bypass das regras de segurança
 *
 * Uso: npm run setup:seller <UID> <EMAIL>
 *
 * Exemplo: npm run setup:seller abc123xyz vendedor@geektoys.com
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
  console.error('   Execute primeiro: npm run setup:firestore')
  console.error('   E siga as instruções para baixar a service account key.')
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

async function setupSeller(uid: string, email: string) {
  console.log('')
  console.log('🛒 Configurando Vendedor (Seller)')
  console.log('=================================')
  console.log('')

  try {
    // Check if user exists in Firebase Auth
    try {
      const userRecord = await admin.auth().getUser(uid)
      console.log(`   ✅ Usuário encontrado no Auth: ${userRecord.email}`)
    } catch {
      console.log(`   ⚠️ Usuário não encontrado no Auth (UID: ${uid})`)
      console.log('   O documento será criado, mas certifique-se que o UID está correto.')
    }

    // Create/update user document
    await db.collection('users').doc(uid).set({
      email,
      role: 'seller',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true })

    console.log('')
    console.log(`   ✅ Usuário ${email} configurado como VENDEDOR!`)
    console.log('')
    console.log('   O usuário agora pode:')
    console.log('   - Acessar o PDV (Ponto de Venda)')
    console.log('   - Verificar membros pelo QR Code')
    console.log('   - Adicionar pontos aos membros')
    console.log('')
    console.log('   ⚠️ O vendedor NÃO pode:')
    console.log('   - Acessar o painel administrativo')
    console.log('   - Gerenciar usuários ou pagamentos')
    console.log('')

  } catch (error) {
    console.error('')
    console.error('❌ Erro ao configurar vendedor:', error)
    process.exit(1)
  }
}

// Parse arguments
const args = process.argv.slice(2)

if (args.length < 2) {
  console.log('')
  console.log('⚠️ Uso: npm run setup:seller <UID> <EMAIL>')
  console.log('')
  console.log('   Exemplo: npm run setup:seller abc123xyz vendedor@geektoys.com')
  console.log('')
  console.log('   Para obter o UID:')
  console.log('   1. Acesse o Firebase Console')
  console.log('   2. Vá em Authentication > Users')
  console.log('   3. Copie o "User UID" do usuário desejado')
  console.log('')
  console.log('   Ou crie o usuário primeiro:')
  console.log('   1. O vendedor se cadastra em club.geektoys.com.br')
  console.log('   2. Depois você roda este script para dar permissão de vendedor')
  console.log('')
  process.exit(1)
}

const [uid, email] = args
setupSeller(uid, email).then(() => process.exit(0))
