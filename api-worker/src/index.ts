import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import { MercadoPagoConfig, Payment, Preference } from 'mercadopago';
import { httpServerHandler } from 'cloudflare:node';
import http from 'node:http';

const app = express();

// ============================================
// CONFIGURATION & HELPERS
// ============================================

const ALLOWED_ORIGINS = [
	'http://localhost:5173',
	'http://localhost:3000',
	'https://clube-geek-toys.web.app',
	'https://clube-geek-toys.firebaseapp.com',
	'https://club.geeketoys.com.br',
	'https://clube-geek-toys.vercel.app',
	'https://clube-geek-toys.pages.dev',
];

const corsOptions = {
	origin: function (origin: any, callback: any) {
		if (!origin || ALLOWED_ORIGINS.includes(origin)) {
			callback(null, true);
		} else {
			callback(new Error('Not allowed by CORS'));
		}
	},
	methods: ['GET', 'POST', 'OPTIONS'],
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Signature', 'X-Request-Id'],
	credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

// Helper for Firestore REST API
async function firestoreRequest(projectId: string, path: string, method = 'GET', body?: any) {
	const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
	const response = await fetch(url, {
		method,
		headers: {
			'Content-Type': 'application/json',
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		const err = await response.text();
		console.error(`Firestore error (${path}):`, err);
		throw new Error(`Firestore request failed: ${response.status}`);
	}

	return response.json();
}

/**
 * Webhook signature verification
 */
function verifyWebhookSignature(req: express.Request, secret: string): boolean {
	if (!secret) return true;

	const xSignature = req.headers['x-signature'] as string;
	const xRequestId = req.headers['x-request-id'] as string;

	if (!xSignature || !xRequestId) return false;

	try {
		const signatureParts: Record<string, string> = {};
		xSignature.split(',').forEach((part: string) => {
			const [key, value] = part.split('=');
			if (key && value) signatureParts[key.trim()] = value.trim();
		});

		const ts = signatureParts['ts'];
		const v1 = signatureParts['v1'];

		if (!ts || !v1) return false;

		const dataId = (req.query['data.id'] as string) || (req.body?.data?.id as string);
		const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

		const hmac = crypto.createHmac('sha256', secret);
		hmac.update(manifest);
		const calculatedSignature = hmac.digest('hex');

		return crypto.timingSafeEqual(
			Buffer.from(calculatedSignature),
			Buffer.from(v1)
		);
	} catch (error) {
		console.error('Signature verification error:', error);
		return false;
	}
}

// ============================================
// ROUTES
// ============================================

app.get('/health', (_req, res) => {
	res.json({
		status: 'ok',
		service: 'Clube Geek & Toys - Cloudflare Payment API',
		timestamp: new Date().toISOString()
	});
});

/**
 * PIX create
 */
app.post('/pix/create', async (req: any, res: express.Response) => {
	try {
		const { amount, description, payer_email, external_reference } = req.body;
		const env = req.env;

		if (!amount || !payer_email) return res.status(400).json({ error: 'Missing data' });

		const mp = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
		const payment = new Payment(mp);

		const result = await payment.create({
			body: {
				transaction_amount: amount,
				description: description || 'Assinatura Clube Geek & Toys',
				payment_method_id: 'pix',
				payer: { email: payer_email },
				external_reference: external_reference
			}
		});

		// Save to Firestore via REST
		await firestoreRequest(env.FIREBASE_PROJECT_ID, `payments/${result.id}`, 'PATCH', {
			fields: {
				member_id: { stringValue: external_reference },
				amount: { doubleValue: amount },
				method: { stringValue: 'pix' },
				status: { stringValue: 'pending' },
				mercadopago_id: { stringValue: String(result.id) },
				created_at: { timestampValue: new Date().toISOString() }
			}
		});

		res.json({
			id: result.id,
			status: result.status,
			point_of_interaction: result.point_of_interaction,
			date_of_expiration: result.date_of_expiration,
			transaction_amount: result.transaction_amount,
		});
	} catch (error: any) {
		console.error('PIX Error:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * Checkout create
 */
app.post('/checkout/create', async (req: any, res: express.Response) => {
	try {
		const { items, payer, external_reference } = req.body;
		const env = req.env;

		const mp = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
		const preference = new Preference(mp);

		const result = await preference.create({
			body: {
				items: items,
				payer: payer,
				external_reference: external_reference,
				back_urls: {
					success: `${env.FRONTEND_URL}/pagamento/sucesso`,
					failure: `${env.FRONTEND_URL}/pagamento/erro`,
					pending: `${env.FRONTEND_URL}/pagamento/pendente`,
				},
				auto_return: 'approved',
				notification_url: `${env.WORKER_URL}/webhook/mercadopago`
			}
		});

		res.json({
			id: result.id,
			init_point: result.init_point,
			sandbox_init_point: result.sandbox_init_point,
		});
	} catch (error: any) {
		console.error('Checkout Error:', error);
		res.status(500).json({ error: error.message });
	}
});

/**
 * Webhook
 */
app.post('/webhook/mercadopago', async (req: any, res: express.Response) => {
	try {
		const env = req.env;

		if (!verifyWebhookSignature(req, env.MERCADOPAGO_WEBHOOK_SECRET)) {
			return res.status(401).send('Unauthorized');
		}

		const { type, data } = req.body;
		if (type === 'payment' && data?.id) {
			const mp = new MercadoPagoConfig({ accessToken: env.MERCADOPAGO_ACCESS_TOKEN });
			const payment = new Payment(mp);
			const paymentInfo = await payment.get({ id: data.id });

			const memberId = paymentInfo.external_reference;
			const status = paymentInfo.status;

			// Update payment in Firestore
			await firestoreRequest(env.FIREBASE_PROJECT_ID, `payments/${data.id}?updateMask.fieldPaths=status&updateMask.fieldPaths=paid_at`, 'PATCH', {
				fields: {
					status: { stringValue: status === 'approved' ? 'paid' : status === 'pending' ? 'pending' : 'failed' },
					paid_at: status === 'approved' ? { timestampValue: new Date().toISOString() } : undefined
				}
			});

			// If approved, activate member
			if (status === 'approved' && memberId) {
				const memberData: any = await firestoreRequest(env.FIREBASE_PROJECT_ID, `members/${memberId}`);
				const expiryDate = new Date();

				const paymentType = memberData.fields?.payment_type?.stringValue || 'monthly';

				if (paymentType === 'annual') {
					expiryDate.setFullYear(expiryDate.getFullYear() + 1);
				} else {
					expiryDate.setMonth(expiryDate.getMonth() + 1);
				}

				await firestoreRequest(env.FIREBASE_PROJECT_ID, `members/${memberId}?updateMask.fieldPaths=status&updateMask.fieldPaths=expiry_date`, 'PATCH', {
					fields: {
						status: { stringValue: 'active' },
						expiry_date: { stringValue: expiryDate.toISOString().split('T')[0] }
					}
				});
			}
		}

		res.status(200).send('OK');
	} catch (error) {
		console.error('Webhook error:', error);
		res.status(500).send('Error');
	}
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	console.error('Unhandled error:', err);
	res.status(500).json({ error: 'Internal server error' });
});

export default httpServerHandler(http.createServer(app));
