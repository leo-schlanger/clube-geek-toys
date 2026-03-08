/**
 * Script para verificar usuário no Auth e Firestore
 */

import admin from 'firebase-admin'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const serviceAccountPath = resolve(__dirname, '../serviceAccountKey.json')

if (!existsSync(serviceAccountPath)) {
  console.error('❌ Erro: serviceAccountKey.json não encontrado!')
  process.exit(1)
}

const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf-8'))

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

async function checkUser(email: string) {
  console.log('')
  console.log('🔍 Verificando usuário')
  console.log('======================')
  console.log('')

  try {
    // 1. Buscar no Auth
    console.log('1. Firebase Auth:')
    const userRecord = await admin.auth().getUserByEmail(email)
    console.log(`   ✅ Email: ${userRecord.email}`)
    console.log(`   ✅ UID: ${userRecord.uid}`)
    console.log('')

    // 2. Buscar no Firestore
    console.log('2. Firestore (users collection):')
    const userDoc = await db.collection('users').doc(userRecord.uid).get()

    if (userDoc.exists) {
      const data = userDoc.data()
      console.log(`   ✅ Documento encontrado!`)
      console.log(`   - ID: ${userDoc.id}`)
      console.log(`   - email: ${data?.email}`)
      console.log(`   - role: ${data?.role}`)
      console.log(`   - createdAt: ${data?.createdAt}`)
    } else {
      console.log(`   ❌ Documento NÃO encontrado para UID: ${userRecord.uid}`)
    }

    // 3. Listar todos os documentos na collection users
    console.log('')
    console.log('3. Todos os documentos em users:')
    const allUsers = await db.collection('users').get()
    allUsers.forEach(doc => {
      const data = doc.data()
      console.log(`   - ID: ${doc.id}`)
      console.log(`     email: ${data.email}, role: ${data.role}`)
    })

  } catch (error) {
    console.error('❌ Erro:', error)
    process.exit(1)
  }
}

const email = process.argv[2] || 'leoschlanger@gmail.com'
checkUser(email).then(() => process.exit(0))
