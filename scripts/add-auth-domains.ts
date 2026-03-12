/**
 * Script para adicionar domínios autorizados no Firebase Auth
 * Usa a API Identity Platform do Google Cloud
 *
 * Uso: npx tsx scripts/add-auth-domains.ts
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
const projectId = serviceAccount.project_id

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

// Domínios a serem adicionados
const DOMAINS_TO_ADD = [
  'geektoys.com.br',
  'admin.geektoys.com.br',
  'adm.geektoys.com.br',
  'club.geektoys.com.br',
  'www.geektoys.com.br',
]

async function getAccessToken(): Promise<string> {
  const credential = admin.credential.cert(serviceAccount)
  const token = await credential.getAccessToken()
  return token.access_token
}

async function getAuthConfig(accessToken: string) {
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to get config: ${response.status} - ${error}`)
  }

  return response.json()
}

async function updateAuthConfig(accessToken: string, authorizedDomains: string[]) {
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config?updateMask=authorizedDomains`

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      authorizedDomains,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to update config: ${response.status} - ${error}`)
  }

  return response.json()
}

async function main() {
  console.log('')
  console.log('🔐 Adicionando domínios autorizados no Firebase Auth')
  console.log('=====================================================')
  console.log('')

  try {
    // Get access token
    console.log('   Obtendo token de acesso...')
    const accessToken = await getAccessToken()

    // Get current config
    console.log('   Buscando configuração atual...')
    const config = await getAuthConfig(accessToken)

    const currentDomains: string[] = config.authorizedDomains || []
    console.log('')
    console.log('   Domínios atuais:')
    currentDomains.forEach(d => console.log(`   - ${d}`))

    // Merge domains (avoid duplicates)
    const allDomains = [...new Set([...currentDomains, ...DOMAINS_TO_ADD])]

    // Check if there are new domains to add
    const newDomains = DOMAINS_TO_ADD.filter(d => !currentDomains.includes(d))

    if (newDomains.length === 0) {
      console.log('')
      console.log('   ✅ Todos os domínios já estão autorizados!')
      return
    }

    console.log('')
    console.log('   Novos domínios a adicionar:')
    newDomains.forEach(d => console.log(`   + ${d}`))

    // Update config
    console.log('')
    console.log('   Atualizando configuração...')
    await updateAuthConfig(accessToken, allDomains)

    console.log('')
    console.log('   ✅ Domínios adicionados com sucesso!')
    console.log('')
    console.log('   Domínios autorizados agora:')
    allDomains.forEach(d => console.log(`   - ${d}`))
    console.log('')

  } catch (error) {
    console.error('')
    console.error('❌ Erro:', error)
    console.error('')
    console.error('   Se o erro for de permissão, você precisa habilitar a')
    console.error('   Identity Toolkit API no Google Cloud Console:')
    console.error(`   https://console.cloud.google.com/apis/library/identitytoolkit.googleapis.com?project=${projectId}`)
    console.error('')
    process.exit(1)
  }
}

main().then(() => process.exit(0))
