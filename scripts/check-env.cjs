const fs = require('fs');
const https = require('https');
const http = require('http');

console.log('');
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║        ANÁLISE DE VARIÁVEIS DE AMBIENTE - CLUBE GEEK         ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

// Parse .env file
const envContent = fs.readFileSync('.env', 'utf-8');
const vars = {};
envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = line.indexOf('=');
    if (idx > 0) {
      vars[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
    }
  }
});

// Validation results
const results = {
  firebase: { status: 'ok', issues: [] },
  mercadopago: { status: 'ok', issues: [] },
  pix: { status: 'ok', issues: [] },
};

// ═══════════════════════════════════════════════════════════════
// FIREBASE VALIDATION
// ═══════════════════════════════════════════════════════════════
console.log('📦 FIREBASE');
console.log('───────────────────────────────────────');

const firebaseVars = {
  'VITE_FIREBASE_API_KEY': vars['VITE_FIREBASE_API_KEY'],
  'VITE_FIREBASE_AUTH_DOMAIN': vars['VITE_FIREBASE_AUTH_DOMAIN'],
  'VITE_FIREBASE_PROJECT_ID': vars['VITE_FIREBASE_PROJECT_ID'],
  'VITE_FIREBASE_STORAGE_BUCKET': vars['VITE_FIREBASE_STORAGE_BUCKET'],
  'VITE_FIREBASE_MESSAGING_SENDER_ID': vars['VITE_FIREBASE_MESSAGING_SENDER_ID'],
  'VITE_FIREBASE_APP_ID': vars['VITE_FIREBASE_APP_ID'],
};

Object.entries(firebaseVars).forEach(([key, value]) => {
  const shortKey = key.replace('VITE_FIREBASE_', '');
  if (!value) {
    console.log(`   ❌ ${shortKey}: FALTANDO`);
    results.firebase.status = 'error';
    results.firebase.issues.push(key);
  } else if (value.includes('sua-') || value.includes('seu-')) {
    console.log(`   ⚠️  ${shortKey}: PLACEHOLDER (não configurado)`);
    results.firebase.status = 'error';
    results.firebase.issues.push(key);
  } else {
    // Mask sensitive values
    let display = value;
    if (key === 'VITE_FIREBASE_API_KEY') display = value.substring(0, 10) + '...';
    if (key === 'VITE_FIREBASE_APP_ID') display = value.substring(0, 15) + '...';
    console.log(`   ✅ ${shortKey}: ${display}`);
  }
});

// Validate Firebase project consistency
const projectId = vars['VITE_FIREBASE_PROJECT_ID'];
const authDomain = vars['VITE_FIREBASE_AUTH_DOMAIN'];
const storageBucket = vars['VITE_FIREBASE_STORAGE_BUCKET'];

if (projectId && authDomain && !authDomain.startsWith(projectId)) {
  console.log(`   ⚠️  AUTH_DOMAIN não corresponde ao PROJECT_ID`);
}

console.log('');

// ═══════════════════════════════════════════════════════════════
// MERCADO PAGO VALIDATION
// ═══════════════════════════════════════════════════════════════
console.log('💳 MERCADO PAGO');
console.log('───────────────────────────────────────');

const mpPublicKey = vars['VITE_MERCADOPAGO_PUBLIC_KEY'];
const mpApiUrl = vars['VITE_PAYMENT_API_URL'];

if (!mpPublicKey) {
  console.log('   ❌ PUBLIC_KEY: FALTANDO');
  results.mercadopago.status = 'error';
} else if (mpPublicKey.includes('xxxx')) {
  console.log('   ⚠️  PUBLIC_KEY: PLACEHOLDER');
  results.mercadopago.status = 'warning';
} else if (mpPublicKey.startsWith('APP_USR-')) {
  console.log(`   ✅ PUBLIC_KEY: ${mpPublicKey.substring(0, 20)}...`);
} else if (mpPublicKey.startsWith('TEST-')) {
  console.log(`   ⚠️  PUBLIC_KEY: MODO TESTE (${mpPublicKey.substring(0, 15)}...)`);
  results.mercadopago.status = 'warning';
} else {
  console.log(`   ⚠️  PUBLIC_KEY: Formato não reconhecido`);
}

if (!mpApiUrl) {
  console.log('   ❌ PAYMENT_API_URL: FALTANDO');
  results.mercadopago.status = 'error';
} else {
  console.log(`   ✅ PAYMENT_API_URL: ${mpApiUrl}`);
}

console.log('');

// ═══════════════════════════════════════════════════════════════
// PIX VALIDATION
// ═══════════════════════════════════════════════════════════════
console.log('🏦 PIX');
console.log('───────────────────────────────────────');

const pixKey = vars['VITE_PIX_KEY'];
if (!pixKey) {
  console.log('   ⚠️  PIX_KEY: Não configurada (usará simulação)');
  results.pix.status = 'warning';
} else if (pixKey.includes('sua-')) {
  console.log('   ⚠️  PIX_KEY: PLACEHOLDER');
  results.pix.status = 'warning';
} else {
  console.log(`   ✅ PIX_KEY: ${pixKey}`);
}

console.log('');

// ═══════════════════════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════════════════════
console.log('🌍 AMBIENTE');
console.log('───────────────────────────────────────');
console.log(`   ${vars['VITE_ENVIRONMENT'] === 'production' ? '🚀' : '🔧'} ENVIRONMENT: ${vars['VITE_ENVIRONMENT'] || 'development'}`);

console.log('');

// ═══════════════════════════════════════════════════════════════
// API CONNECTIVITY TEST
// ═══════════════════════════════════════════════════════════════
console.log('🔌 TESTE DE CONECTIVIDADE');
console.log('───────────────────────────────────────');

async function testUrl(url, name) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { timeout: 5000 }, (res) => {
      console.log(`   ✅ ${name}: HTTP ${res.statusCode}`);
      resolve(true);
    });
    req.on('error', (e) => {
      console.log(`   ❌ ${name}: ${e.message}`);
      resolve(false);
    });
    req.on('timeout', () => {
      console.log(`   ⚠️  ${name}: Timeout`);
      req.destroy();
      resolve(false);
    });
  });
}

async function runTests() {
  // Test Payment API
  if (mpApiUrl) {
    await testUrl(mpApiUrl + '/health', 'Payment API');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');

  // Summary
  const hasErrors = Object.values(results).some(r => r.status === 'error');
  const hasWarnings = Object.values(results).some(r => r.status === 'warning');

  if (hasErrors) {
    console.log('❌ RESULTADO: Existem erros que precisam ser corrigidos');
  } else if (hasWarnings) {
    console.log('⚠️  RESULTADO: Configuração OK com avisos');
  } else {
    console.log('✅ RESULTADO: Todas as variáveis configuradas corretamente');
  }
  console.log('');
}

runTests();
