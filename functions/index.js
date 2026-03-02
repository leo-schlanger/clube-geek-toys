/**
 * Firebase Cloud Functions - Clube Geek & Toys
 * Payment API with Mercado Pago
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// ============================================
// CONFIGURATION
// ============================================

// Allowed origins for CORS (add your production domain)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://clube-geek-toys.web.app',
  'https://clube-geek-toys.firebaseapp.com',
  'https://club.geeketoys.com.br',
  'https://clube-geek-toys.vercel.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    if (ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

// Mercado Pago configuration
const mercadopagoConfig = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || functions.config().mercadopago?.access_token,
});

const payment = new Payment(mercadopagoConfig);
const preference = new Preference(mercadopagoConfig);

// Get webhook secret for signature verification
const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || functions.config().mercadopago?.webhook_secret;

// ============================================
// SECURITY HELPERS
// ============================================

/**
 * Verify Mercado Pago webhook signature
 */
function verifyWebhookSignature(req) {
  if (!WEBHOOK_SECRET) {
    console.warn('Webhook secret not configured - skipping signature verification');
    return true;
  }

  const xSignature = req.headers['x-signature'];
  const xRequestId = req.headers['x-request-id'];

  if (!xSignature || !xRequestId) {
    console.warn('Missing signature headers');
    return false;
  }

  try {
    // Parse x-signature header
    const signatureParts = {};
    xSignature.split(',').forEach(part => {
      const [key, value] = part.split('=');
      signatureParts[key.trim()] = value.trim();
    });

    const ts = signatureParts['ts'];
    const v1 = signatureParts['v1'];

    if (!ts || !v1) {
      console.warn('Invalid signature format');
      return false;
    }

    // Build the manifest string
    const dataId = req.query['data.id'] || req.body?.data?.id;
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Calculate HMAC
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
    hmac.update(manifest);
    const calculatedSignature = hmac.digest('hex');

    // Compare signatures
    return crypto.timingSafeEqual(
      Buffer.from(calculatedSignature),
      Buffer.from(v1)
    );
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Sanitize string input
 */
function sanitizeString(str, maxLength = 255) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Rate limiting map (simple in-memory, consider Redis for production)
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX = 30; // 30 requests per minute

function checkRateLimit(ip) {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return true;
  }

  if (now - record.firstRequest > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX) {
    return false;
  }

  record.count++;
  return true;
}

// ============================================
// EXPRESS APP
// ============================================

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' })); // Limit payload size

// Rate limiting middleware
app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
});

// ============================================
// PIX ENDPOINTS
// ============================================

/**
 * Create PIX payment
 * POST /pix/create
 */
app.post('/pix/create', async (req, res) => {
  try {
    const { amount, description, payer_email, external_reference } = req.body;

    // Validation
    if (!amount || typeof amount !== 'number' || amount <= 0 || amount > 10000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    if (!payer_email || !isValidEmail(payer_email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const sanitizedDescription = sanitizeString(description, 100) || 'Assinatura Clube Geek & Toys';
    const sanitizedReference = sanitizeString(external_reference, 50);

    const paymentData = {
      transaction_amount: amount,
      description: sanitizedDescription,
      payment_method_id: 'pix',
      payer: {
        email: payer_email,
      },
      external_reference: sanitizedReference,
    };

    const result = await payment.create({ body: paymentData });

    // Save payment to Firestore
    await db.collection('payments').doc(result.id.toString()).set({
      member_id: sanitizedReference,
      amount: amount,
      method: 'pix',
      status: 'pending',
      mercadopago_id: result.id,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Return only necessary data
    res.json({
      id: result.id,
      status: result.status,
      point_of_interaction: result.point_of_interaction,
      date_of_expiration: result.date_of_expiration,
      transaction_amount: result.transaction_amount,
    });
  } catch (error) {
    console.error('Error creating PIX payment:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

/**
 * Check PIX payment status
 * GET /pix/status/:id
 */
app.get('/pix/status/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    const paymentId = parseInt(id);
    if (isNaN(paymentId) || paymentId <= 0) {
      return res.status(400).json({ error: 'Invalid payment ID' });
    }

    const result = await payment.get({ id: paymentId });

    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      transaction_amount: result.transaction_amount,
      date_approved: result.date_approved,
    });
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// ============================================
// CHECKOUT PRO ENDPOINTS
// ============================================

/**
 * Create checkout preference
 * POST /checkout/create
 */
app.post('/checkout/create', async (req, res) => {
  try {
    const { items, payer, external_reference, back_urls, notification_url } = req.body;

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid items' });
    }

    // Validate and sanitize items
    const sanitizedItems = items.map((item) => ({
      title: sanitizeString(item.title, 100),
      description: sanitizeString(item.description, 200),
      quantity: Math.min(Math.max(parseInt(item.quantity) || 1, 1), 10),
      currency_id: 'BRL',
      unit_price: Math.min(Math.max(parseFloat(item.unit_price) || 0, 0.01), 10000),
    }));

    // Validate payer email if provided
    if (payer?.email && !isValidEmail(payer.email)) {
      return res.status(400).json({ error: 'Invalid payer email' });
    }

    const preferenceData = {
      items: sanitizedItems,
      payer: payer ? { email: payer.email } : undefined,
      external_reference: sanitizeString(external_reference, 50),
      back_urls: back_urls || {
        success: 'https://clube-geek-toys.web.app/pagamento/sucesso',
        failure: 'https://clube-geek-toys.web.app/pagamento/erro',
        pending: 'https://clube-geek-toys.web.app/pagamento/pendente',
      },
      auto_return: 'approved',
      notification_url: notification_url,
    };

    const result = await preference.create({ body: preferenceData });

    res.json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (error) {
    console.error('Error creating checkout preference:', error);
    res.status(500).json({ error: 'Failed to create checkout' });
  }
});

// ============================================
// WEBHOOK
// ============================================

/**
 * Mercado Pago webhook
 * POST /webhook/mercadopago
 */
app.post('/webhook/mercadopago', async (req, res) => {
  try {
    // Verify webhook signature
    if (!verifyWebhookSignature(req)) {
      console.warn('Invalid webhook signature');
      return res.status(401).send('Unauthorized');
    }

    const { type, data } = req.body;

    console.log('Webhook received:', { type, dataId: data?.id });

    if (type === 'payment' && data?.id) {
      const paymentId = data.id;
      const paymentInfo = await payment.get({ id: paymentId });

      const memberId = paymentInfo.external_reference;
      const status = paymentInfo.status;

      // Update payment in Firestore
      await db.collection('payments').doc(paymentId.toString()).set({
        member_id: memberId,
        amount: paymentInfo.transaction_amount,
        method: paymentInfo.payment_method_id,
        status: status === 'approved' ? 'paid' : status === 'pending' ? 'pending' : 'failed',
        mercadopago_id: paymentId,
        paid_at: status === 'approved' ? admin.firestore.FieldValue.serverTimestamp() : null,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // If approved, activate member
      if (status === 'approved' && memberId) {
        const memberRef = db.collection('members').doc(memberId);
        const memberDoc = await memberRef.get();

        if (memberDoc.exists) {
          const memberData = memberDoc.data();

          // Calculate new expiry date
          const expiryDate = new Date();
          if (memberData.payment_type === 'annual') {
            expiryDate.setFullYear(expiryDate.getFullYear() + 1);
          } else {
            expiryDate.setMonth(expiryDate.getMonth() + 1);
          }

          await memberRef.update({
            status: 'active',
            expiry_date: expiryDate.toISOString().split('T')[0],
            updated_at: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Log activation
          await db.collection('audit_logs').add({
            action: 'member_activated',
            member_id: memberId,
            payment_id: paymentId.toString(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`Member ${memberId} activated successfully`);
        }
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Clube Geek & Toys - Payment API',
  });
});

// ============================================
// 404 HANDLER
// ============================================

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// EXPORT FUNCTION
// ============================================

exports.api = functions
  .region('southamerica-east1')
  .runWith({
    timeoutSeconds: 60,
    memory: '256MB',
    minInstances: 0,
    maxInstances: 10,
  })
  .https.onRequest(app);

// Standalone webhook endpoint (alternative)
exports.mercadoPagoWebhook = functions
  .region('southamerica-east1')
  .runWith({
    timeoutSeconds: 30,
    memory: '256MB',
  })
  .https.onRequest(async (req, res) => {
    // Use CORS
    cors(corsOptions)(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
      }

      // Verify signature
      if (!verifyWebhookSignature(req)) {
        return res.status(401).send('Unauthorized');
      }

      try {
        const { type, data } = req.body;

        if (type === 'payment' && data?.id) {
          const paymentInfo = await payment.get({ id: data.id });
          const memberId = paymentInfo.external_reference;

          if (paymentInfo.status === 'approved' && memberId) {
            const memberRef = db.collection('members').doc(memberId);
            const memberDoc = await memberRef.get();

            if (memberDoc.exists) {
              const memberData = memberDoc.data();
              const expiryDate = new Date();

              if (memberData.payment_type === 'annual') {
                expiryDate.setFullYear(expiryDate.getFullYear() + 1);
              } else {
                expiryDate.setMonth(expiryDate.getMonth() + 1);
              }

              await memberRef.update({
                status: 'active',
                expiry_date: expiryDate.toISOString().split('T')[0],
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
              });
            }
          }
        }

        res.status(200).send('OK');
      } catch (error) {
        console.error('Webhook error:', error);
        res.status(500).send('Error');
      }
    });
  });
