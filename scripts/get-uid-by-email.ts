/**
 * Script para buscar o UID de um usuário pelo email
 *
 * Uso: npm run get:uid <EMAIL>
 * Exemplo: npm run get:uid leoschlanger@gmail.com
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

async function getUidByEmail(email: string) {
  console.log('')
  console.log('🔍 Buscando usuário por email')
  console.log('=============================')
  console.log('')

  try {
    const userRecord = await admin.auth().getUserByEmail(email)

    console.log('   ✅ Usuário encontrado!')
    console.log('')
    console.log(`   Email: ${userRecord.email}`)
    console.log(`   UID:   ${userRecord.uid}`)
    console.log('')
    console.log('   Para configurar como admin, execute:')
    console.log(`   npm run setup:admin ${userRecord.uid} ${userRecord.email}`)
    console.log('')

    return userRecord.uid
  } catch (error) {
    console.error('❌ Usuário não encontrado no Firebase Auth')
    console.error('   Certifique-se que o email está correto.')
    process.exit(1)
  }
}

const args = process.argv.slice(2)

if (args.length < 1) {
  console.log('')
  console.log('⚠️ Uso: npm run get:uid <EMAIL>')
  console.log('')
  console.log('   Exemplo: npm run get:uid leoschlanger@gmail.com')
  console.log('')
  process.exit(1)
}

getUidByEmail(args[0]).then(() => process.exit(0))
