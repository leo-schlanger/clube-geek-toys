/**
 * Script para criar/atualizar usuário admin
 * Usa Firebase Admin SDK para bypass das regras de segurança
 *
 * Uso: npm run setup:admin <UID> <EMAIL>
 *
 * Exemplo: npm run setup:admin abc123xyz admin@geektoys.com
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

async function setupAdmin(uid: string, email: string) {
  console.log('')
  console.log('🔐 Configurando Admin')
  console.log('=====================')
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
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { merge: true })

    console.log('')
    console.log(`   ✅ Usuário ${email} configurado como ADMIN!`)
    console.log('')
    console.log('   O usuário agora pode:')
    console.log('   - Acessar o painel administrativo')
    console.log('   - Gerenciar membros, pagamentos e usuários')
    console.log('   - Ver logs de auditoria')
    console.log('')

  } catch (error) {
    console.error('')
    console.error('❌ Erro ao configurar admin:', error)
    process.exit(1)
  }
}

// Parse arguments
const args = process.argv.slice(2)

if (args.length < 2) {
  console.log('')
  console.log('⚠️ Uso: npm run setup:admin <UID> <EMAIL>')
  console.log('')
  console.log('   Exemplo: npm run setup:admin abc123xyz admin@geektoys.com')
  console.log('')
  console.log('   Para obter o UID:')
  console.log('   1. Acesse o Firebase Console')
  console.log('   2. Vá em Authentication > Users')
  console.log('   3. Copie o "User UID" do usuário desejado')
  console.log('')
  process.exit(1)
}

const [uid, email] = args
setupAdmin(uid, email).then(() => process.exit(0))
