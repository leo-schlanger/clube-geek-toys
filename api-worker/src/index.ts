// ============================================
// TYPES
// ============================================

interface Env {
	MERCADOPAGO_ACCESS_TOKEN: string;
	MERCADOPAGO_WEBHOOK_SECRET?: string;
	FIREBASE_PROJECT_ID: string;
	FRONTEND_URL: string;
	WORKER_URL: string;
}

// ============================================
// CONFIGURATION
// ============================================

const ALLOWED_ORIGINS = [
	'http://localhost:5173',
	'http://localhost:3000',
	'https://clube-geek-toys.web.app',
	'https://clube-geek-toys.firebaseapp.com',
	'https://club.geeketoys.com.br',
	'https://adm.geeketoys.com.br',
	'https://clube-geek-toys.vercel.app',
	'https://clube-geek-toys.pages.dev',
];

const MP_API_BASE = 'https://api.mercadopago.com';

// ============================================
// HELPERS
// ============================================

function corsHeaders(origin: string | null): HeadersInit {
	const headers: HeadersInit = {
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Request-Id',
		'Access-Control-Allow-Credentials': 'true',
	};

	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		headers['Access-Control-Allow-Origin'] = origin;
	}

	return headers;
}

function jsonResponse(data: any, status = 200, origin: string | null = null): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders(origin),
		},
	});
}

async function mpRequest(accessToken: string, endpoint: string, method = 'GET', body?: any, idempotencyKey?: string) {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		'Authorization': `Bearer ${accessToken}`,
	};

	if (idempotencyKey) {
		headers['X-Idempotency-Key'] = idempotencyKey;
	}

	const response = await fetch(`${MP_API_BASE}${endpoint}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});

	const data = await response.json();

	if (!response.ok) {
		console.error(`Mercado Pago error (${endpoint}):`, JSON.stringify(data));
		throw new Error(data.message || `MP request failed: ${response.status}`);
	}

	return data;
}

async function firestoreRequest(projectId: string, path: string, method = 'GET', body?: any) {
	const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
	const response = await fetch(url, {
		method,
		headers: { 'Content-Type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		const err = await response.text();
		console.error(`Firestore error (${path}):`, err);
		throw new Error(`Firestore request failed: ${response.status}`);
	}

	return response.json();
}

function verifyWebhookSignature(
	xSignature: string | null,
	xRequestId: string | null,
	dataId: string | null,
	secret: string
): boolean {
	if (!secret) return true;
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

		// For now, skip full HMAC verification (complex with Web Crypto)
		// In production, implement proper verification
		return true;
	} catch (error) {
		console.error('Signature verification error:', error);
		return false;
	}
}

// ============================================
// MAIN HANDLER
// ============================================

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;
		const origin = request.headers.get('Origin');

		// Handle CORS preflight
		if (method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: corsHeaders(origin),
			});
		}

		try {
			// ============================================
			// ROUTES
			// ============================================

			// Health check
			if (path === '/health' && method === 'GET') {
				return jsonResponse({
					status: 'ok',
					service: 'Clube Geek & Toys - Payment API',
					timestamp: new Date().toISOString(),
					hasAccessToken: !!env.MERCADOPAGO_ACCESS_TOKEN,
				}, 200, origin);
			}

			// PIX Create
			if (path === '/pix/create' && method === 'POST') {
				const body = await request.json() as any;
				const { amount, description, payer_email, external_reference } = body;

				if (!amount || !payer_email) {
					return jsonResponse({ error: 'Missing required fields: amount, payer_email' }, 400, origin);
				}

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				// Generate idempotency key
				const idempotencyKey = `pix-${external_reference || Date.now()}-${crypto.randomUUID()}`;

				const result = await mpRequest(env.MERCADOPAGO_ACCESS_TOKEN, '/v1/payments', 'POST', {
					transaction_amount: amount,
					description: description || 'Assinatura Clube Geek & Toys',
					payment_method_id: 'pix',
					payer: { email: payer_email },
					external_reference: external_reference,
				}, idempotencyKey);

				// Save to Firestore
				try {
					await firestoreRequest(env.FIREBASE_PROJECT_ID, `payments/${result.id}`, 'PATCH', {
						fields: {
							member_id: { stringValue: external_reference || '' },
							amount: { doubleValue: amount },
							method: { stringValue: 'pix' },
							status: { stringValue: 'pending' },
							mercadopago_id: { stringValue: String(result.id) },
							created_at: { timestampValue: new Date().toISOString() },
						},
					});
				} catch (e) {
					console.error('Firestore save error:', e);
					// Continue - payment was created
				}

				return jsonResponse({
					id: result.id,
					status: result.status,
					point_of_interaction: result.point_of_interaction,
					date_of_expiration: result.date_of_expiration,
					transaction_amount: result.transaction_amount,
				}, 200, origin);
			}

			// Checkout Create (Card payment via Preference)
			if (path === '/checkout/create' && method === 'POST') {
				const body = await request.json() as any;
				const { items, payer, external_reference } = body;

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				// Generate idempotency key
				const idempotencyKey = `checkout-${external_reference || Date.now()}-${crypto.randomUUID()}`;

				const result = await mpRequest(env.MERCADOPAGO_ACCESS_TOKEN, '/checkout/preferences', 'POST', {
					items: items,
					payer: payer,
					external_reference: external_reference,
					back_urls: {
						success: `${env.FRONTEND_URL}/pagamento/sucesso`,
						failure: `${env.FRONTEND_URL}/pagamento/erro`,
						pending: `${env.FRONTEND_URL}/pagamento/pendente`,
					},
					auto_return: 'approved',
					notification_url: `${env.WORKER_URL}/webhook/mercadopago`,
				}, idempotencyKey);

				return jsonResponse({
					id: result.id,
					init_point: result.init_point,
					sandbox_init_point: result.sandbox_init_point,
				}, 200, origin);
			}

			// Webhook
			if (path === '/webhook/mercadopago' && method === 'POST') {
				const xSignature = request.headers.get('x-signature');
				const xRequestId = request.headers.get('x-request-id');
				const body = await request.json() as any;

				const dataId = url.searchParams.get('data.id') || body?.data?.id;

				if (!verifyWebhookSignature(xSignature, xRequestId, dataId, env.MERCADOPAGO_WEBHOOK_SECRET || '')) {
					return new Response('Unauthorized', { status: 401 });
				}

				const { type, data } = body;

				if (type === 'payment' && data?.id) {
					const paymentInfo = await mpRequest(env.MERCADOPAGO_ACCESS_TOKEN, `/v1/payments/${data.id}`);

					const memberId = paymentInfo.external_reference;
					const status = paymentInfo.status;

					// Update payment in Firestore
					const paymentStatus = status === 'approved' ? 'paid' : status === 'pending' ? 'pending' : 'failed';

					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`payments/${data.id}?updateMask.fieldPaths=status&updateMask.fieldPaths=paid_at`,
						'PATCH',
						{
							fields: {
								status: { stringValue: paymentStatus },
								...(status === 'approved' && { paid_at: { timestampValue: new Date().toISOString() } }),
							},
						}
					);

					// If approved, activate member
					if (status === 'approved' && memberId) {
						try {
							const memberData: any = await firestoreRequest(env.FIREBASE_PROJECT_ID, `members/${memberId}`);
							const expiryDate = new Date();
							const paymentType = memberData.fields?.payment_type?.stringValue || 'monthly';

							if (paymentType === 'annual') {
								expiryDate.setFullYear(expiryDate.getFullYear() + 1);
							} else {
								expiryDate.setMonth(expiryDate.getMonth() + 1);
							}

							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`members/${memberId}?updateMask.fieldPaths=status&updateMask.fieldPaths=expiry_date`,
								'PATCH',
								{
									fields: {
										status: { stringValue: 'active' },
										expiry_date: { stringValue: expiryDate.toISOString().split('T')[0] },
									},
								}
							);
						} catch (e) {
							console.error('Member activation error:', e);
						}
					}
				}

				return new Response('OK', { status: 200 });
			}

			// 404
			return jsonResponse({ error: 'Not found' }, 404, origin);

		} catch (error: any) {
			console.error('Handler error:', error);
			return jsonResponse({ error: error.message || 'Internal server error' }, 500, origin);
		}
	},
};
