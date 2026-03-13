// ============================================
// TYPES
// ============================================

interface Env {
	MERCADOPAGO_ACCESS_TOKEN: string;
	MERCADOPAGO_WEBHOOK_SECRET?: string;
	FIREBASE_PROJECT_ID: string;
	FRONTEND_URL: string;
	WORKER_URL: string;
	RESEND_API_KEY?: string;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

type EmailTemplate = 'welcome' | 'payment-confirmed' | 'payment-failed' | 'renewal-reminder' | 'points-expiring';

interface EmailTemplateConfig {
	subject: string;
	html: (variables: Record<string, string>) => string;
}

const EMAIL_TEMPLATES: Record<EmailTemplate, EmailTemplateConfig> = {
	'welcome': {
		subject: 'Bem-vindo ao Clube Geek & Toys! 🎮',
		html: (vars) => `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Bem-vindo ao Clube Geek & Toys</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
	<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
		<div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px 20px; text-align: center;">
			<h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎮 Clube Geek & Toys</h1>
		</div>
		<div style="padding: 40px 30px;">
			<h2 style="color: #1f2937; margin-top: 0;">Olá, ${vars.nome}! 👋</h2>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Bem-vindo ao <strong>Clube Geek & Toys</strong>! Estamos muito felizes em ter você como membro do nosso clube.
			</p>
			<div style="background-color: #f3f4f6; border-radius: 12px; padding: 20px; margin: 24px 0;">
				<p style="color: #374151; margin: 0; font-size: 14px;"><strong>Seu Plano:</strong> ${vars.plano}</p>
			</div>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Agora você tem acesso a descontos exclusivos, programa de pontos e muito mais! Não esqueça de apresentar sua carteirinha digital sempre que visitar nossa loja.
			</p>
			<div style="text-align: center; margin: 32px 0;">
				<a href="${vars.dashboard_url || 'https://club.geeketoys.com.br/minha-conta'}"
				   style="background-color: #8b5cf6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
					Acessar Minha Conta
				</a>
			</div>
		</div>
		<div style="background-color: #1f2937; padding: 24px; text-align: center;">
			<p style="color: #9ca3af; margin: 0; font-size: 12px;">
				© ${new Date().getFullYear()} Geek & Toys. Todos os direitos reservados.
			</p>
		</div>
	</div>
</body>
</html>`,
	},
	'payment-confirmed': {
		subject: 'Pagamento Confirmado! ✅',
		html: (vars) => `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Pagamento Confirmado</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
	<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
		<div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 20px; text-align: center;">
			<h1 style="color: #ffffff; margin: 0; font-size: 28px;">✅ Pagamento Confirmado</h1>
		</div>
		<div style="padding: 40px 30px;">
			<h2 style="color: #1f2937; margin-top: 0;">Olá, ${vars.nome}!</h2>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Seu pagamento foi confirmado com sucesso! Sua assinatura está ativa.
			</p>
			<div style="background-color: #ecfdf5; border: 1px solid #10b981; border-radius: 12px; padding: 20px; margin: 24px 0;">
				<p style="color: #065f46; margin: 0 0 8px 0; font-size: 14px;"><strong>Valor:</strong> R$ ${vars.valor}</p>
				<p style="color: #065f46; margin: 0 0 8px 0; font-size: 14px;"><strong>Plano:</strong> ${vars.plano}</p>
				<p style="color: #065f46; margin: 0; font-size: 14px;"><strong>Válido até:</strong> ${vars.validade}</p>
			</div>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Aproveite todos os benefícios do seu plano! Acesse sua conta para ver sua carteirinha digital e acompanhar seus pontos.
			</p>
			<div style="text-align: center; margin: 32px 0;">
				<a href="${vars.dashboard_url || 'https://club.geeketoys.com.br/minha-conta'}"
				   style="background-color: #10b981; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
					Ver Minha Carteirinha
				</a>
			</div>
		</div>
		<div style="background-color: #1f2937; padding: 24px; text-align: center;">
			<p style="color: #9ca3af; margin: 0; font-size: 12px;">
				© ${new Date().getFullYear()} Geek & Toys. Todos os direitos reservados.
			</p>
		</div>
	</div>
</body>
</html>`,
	},
	'payment-failed': {
		subject: 'Problema com seu pagamento ⚠️',
		html: (vars) => `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Problema com Pagamento</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
	<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
		<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center;">
			<h1 style="color: #ffffff; margin: 0; font-size: 28px;">⚠️ Problema com Pagamento</h1>
		</div>
		<div style="padding: 40px 30px;">
			<h2 style="color: #1f2937; margin-top: 0;">Olá, ${vars.nome}!</h2>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Infelizmente houve um problema com seu pagamento. Por favor, tente novamente.
			</p>
			<div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 24px 0;">
				<p style="color: #92400e; margin: 0 0 8px 0; font-size: 14px;"><strong>Valor:</strong> R$ ${vars.valor}</p>
				<p style="color: #92400e; margin: 0; font-size: 14px;"><strong>Motivo:</strong> ${vars.motivo || 'Pagamento não aprovado'}</p>
			</div>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Verifique os dados do seu cartão ou tente outro método de pagamento. Se o problema persistir, entre em contato conosco.
			</p>
			<div style="text-align: center; margin: 32px 0;">
				<a href="${vars.retry_url || 'https://club.geeketoys.com.br/assinar'}"
				   style="background-color: #f59e0b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
					Tentar Novamente
				</a>
			</div>
		</div>
		<div style="background-color: #1f2937; padding: 24px; text-align: center;">
			<p style="color: #9ca3af; margin: 0; font-size: 12px;">
				© ${new Date().getFullYear()} Geek & Toys. Todos os direitos reservados.
			</p>
		</div>
	</div>
</body>
</html>`,
	},
	'renewal-reminder': {
		subject: 'Sua assinatura está expirando! ⏰',
		html: (vars) => `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Lembrete de Renovação</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
	<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
		<div style="background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); padding: 40px 20px; text-align: center;">
			<h1 style="color: #ffffff; margin: 0; font-size: 28px;">⏰ Hora de Renovar!</h1>
		</div>
		<div style="padding: 40px 30px;">
			<h2 style="color: #1f2937; margin-top: 0;">Olá, ${vars.nome}!</h2>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Sua assinatura do Clube Geek & Toys está prestes a expirar. Não perca seus benefícios!
			</p>
			<div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
				<p style="color: #92400e; margin: 0; font-size: 18px; font-weight: bold;">
					Expira em: ${vars.validade}
				</p>
			</div>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Renove agora e continue aproveitando:
			</p>
			<ul style="color: #4b5563; font-size: 14px; line-height: 1.8;">
				<li>Descontos exclusivos em produtos e serviços</li>
				<li>Programa de pontos com multiplicador especial</li>
				<li>Acesso a promoções exclusivas para membros</li>
			</ul>
			<div style="text-align: center; margin: 32px 0;">
				<a href="${vars.renew_url || 'https://club.geeketoys.com.br/minha-conta'}"
				   style="background-color: #8b5cf6; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
					Renovar Agora
				</a>
			</div>
		</div>
		<div style="background-color: #1f2937; padding: 24px; text-align: center;">
			<p style="color: #9ca3af; margin: 0; font-size: 12px;">
				© ${new Date().getFullYear()} Geek & Toys. Todos os direitos reservados.
			</p>
		</div>
	</div>
</body>
</html>`,
	},
	'points-expiring': {
		subject: 'Seus pontos estão expirando! 🎁',
		html: (vars) => `
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Pontos Expirando</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
	<div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
		<div style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 20px; text-align: center;">
			<h1 style="color: #ffffff; margin: 0; font-size: 28px;">🎁 Seus Pontos Vão Expirar!</h1>
		</div>
		<div style="padding: 40px 30px;">
			<h2 style="color: #1f2937; margin-top: 0;">Olá, ${vars.nome}!</h2>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Você tem pontos que estão prestes a expirar. Não deixe eles irem embora!
			</p>
			<div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: center;">
				<p style="color: #92400e; margin: 0 0 8px 0; font-size: 32px; font-weight: bold;">
					${vars.pontos} pontos
				</p>
				<p style="color: #92400e; margin: 0; font-size: 14px;">
					Expiram em: ${vars.data_expiracao}
				</p>
			</div>
			<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
				Visite nossa loja e use seus pontos para ganhar descontos nas suas compras!
			</p>
			<div style="text-align: center; margin: 32px 0;">
				<a href="${vars.dashboard_url || 'https://club.geeketoys.com.br/minha-conta'}"
				   style="background-color: #f59e0b; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
					Ver Meus Pontos
				</a>
			</div>
		</div>
		<div style="background-color: #1f2937; padding: 24px; text-align: center;">
			<p style="color: #9ca3af; margin: 0; font-size: 12px;">
				© ${new Date().getFullYear()} Geek & Toys. Todos os direitos reservados.
			</p>
		</div>
	</div>
</body>
</html>`,
	},
};

// ============================================
// EMAIL HELPER
// ============================================

async function sendEmail(
	apiKey: string,
	to: string,
	template: EmailTemplate,
	variables: Record<string, string>
): Promise<{ success: boolean; id?: string; error?: string }> {
	const templateConfig = EMAIL_TEMPLATES[template];
	if (!templateConfig) {
		return { success: false, error: `Template '${template}' not found` };
	}

	try {
		const response = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				from: 'Clube Geek & Toys <noreply@geeketoys.com.br>',
				to: [to],
				subject: templateConfig.subject,
				html: templateConfig.html(variables),
			}),
		});

		const data = await response.json() as any;

		if (!response.ok) {
			return { success: false, error: data.message || 'Failed to send email' };
		}

		return { success: true, id: data.id };
	} catch (error: any) {
		return { success: false, error: error.message || 'Email sending error' };
	}
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

	const data = await response.json() as any;

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

async function verifyWebhookSignature(
	xSignature: string | null,
	xRequestId: string | null,
	dataId: string | null,
	secret: string
): Promise<boolean> {
	// If no secret configured, skip verification (development mode)
	if (!secret) {
		console.warn('Webhook secret not configured - skipping verification');
		return true;
	}

	if (!xSignature || !xRequestId) {
		console.error('Missing x-signature or x-request-id headers');
		return false;
	}

	try {
		// Parse signature header: ts=xxx,v1=xxx
		const signatureParts: Record<string, string> = {};
		xSignature.split(',').forEach((part: string) => {
			const [key, value] = part.split('=');
			if (key && value) signatureParts[key.trim()] = value.trim();
		});

		const ts = signatureParts['ts'];
		const v1 = signatureParts['v1'];

		if (!ts || !v1) {
			console.error('Invalid signature format');
			return false;
		}

		// Check timestamp is not too old (5 minutes)
		const timestampAge = Date.now() - parseInt(ts, 10) * 1000;
		if (timestampAge > 5 * 60 * 1000) {
			console.error('Webhook timestamp too old');
			return false;
		}

		// Build manifest string for HMAC
		const manifest = `id:${dataId || ''};request-id:${xRequestId};ts:${ts};`;

		// Calculate HMAC-SHA256 using Web Crypto API
		const encoder = new TextEncoder();
		const keyData = encoder.encode(secret);
		const messageData = encoder.encode(manifest);

		const cryptoKey = await crypto.subtle.importKey(
			'raw',
			keyData,
			{ name: 'HMAC', hash: 'SHA-256' },
			false,
			['sign']
		);

		const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
		const calculatedHash = Array.from(new Uint8Array(signature))
			.map(b => b.toString(16).padStart(2, '0'))
			.join('');

		const isValid = calculatedHash === v1;
		if (!isValid) {
			console.error('Webhook signature mismatch');
		}

		return isValid;
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

				const result: any = await mpRequest(env.MERCADOPAGO_ACCESS_TOKEN, '/v1/payments', 'POST', {
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

				const result: any = await mpRequest(env.MERCADOPAGO_ACCESS_TOKEN, '/checkout/preferences', 'POST', {
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

			// Payment Status Check (for validating redirects)
			if (path.startsWith('/payment/status/') && method === 'GET') {
				const paymentId = path.split('/').pop();

				if (!paymentId) {
					return jsonResponse({ error: 'Payment ID required' }, 400, origin);
				}

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				try {
					const paymentInfo: any = await mpRequest(
						env.MERCADOPAGO_ACCESS_TOKEN,
						`/v1/payments/${paymentId}`
					);

					return jsonResponse({
						id: paymentInfo.id,
						status: paymentInfo.status,
						status_detail: paymentInfo.status_detail,
						external_reference: paymentInfo.external_reference,
						transaction_amount: paymentInfo.transaction_amount,
						date_approved: paymentInfo.date_approved,
					}, 200, origin);
				} catch (e) {
					console.error('Payment status check error:', e);
					return jsonResponse({ error: 'Failed to check payment status' }, 500, origin);
				}
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
					const paymentInfo: any = await mpRequest(env.MERCADOPAGO_ACCESS_TOKEN, `/v1/payments/${data.id}`);

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

			// ============================================
			// EMAIL ROUTES
			// ============================================

			// Send Email
			if (path === '/email/send' && method === 'POST') {
				if (!env.RESEND_API_KEY) {
					return jsonResponse({ error: 'Email service not configured' }, 500, origin);
				}

				const body = await request.json() as any;
				const { template, to, variables, member_id } = body;

				if (!template || !to) {
					return jsonResponse({ error: 'Missing required fields: template, to' }, 400, origin);
				}

				if (!Object.keys(EMAIL_TEMPLATES).includes(template)) {
					return jsonResponse({
						error: `Invalid template. Valid templates: ${Object.keys(EMAIL_TEMPLATES).join(', ')}`,
					}, 400, origin);
				}

				const result = await sendEmail(env.RESEND_API_KEY, to, template as EmailTemplate, variables || {});

				// Log email in Firestore
				try {
					const logId = `email_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
					await firestoreRequest(env.FIREBASE_PROJECT_ID, `email_logs/${logId}`, 'PATCH', {
						fields: {
							member_id: { stringValue: member_id || '' },
							template: { stringValue: template },
							recipient: { stringValue: to },
							status: { stringValue: result.success ? 'sent' : 'failed' },
							sent_at: { timestampValue: new Date().toISOString() },
							...(result.error && { error: { stringValue: result.error } }),
							...(result.id && { resend_id: { stringValue: result.id } }),
						},
					});
				} catch (e) {
					console.error('Email log save error:', e);
				}

				if (!result.success) {
					return jsonResponse({ error: result.error }, 500, origin);
				}

				return jsonResponse({
					success: true,
					message: 'Email sent successfully',
					id: result.id,
				}, 200, origin);
			}

			// List Email Templates
			if (path === '/email/templates' && method === 'GET') {
				const templates = Object.entries(EMAIL_TEMPLATES).map(([name, config]) => ({
					name,
					subject: config.subject,
				}));

				return jsonResponse({ templates }, 200, origin);
			}

			// ============================================
			// REPORT ROUTES
			// ============================================

			// Daily Report
			if (path === '/reports/daily' && method === 'GET') {
				try {
					// Get today's date range
					const today = new Date();
					const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
					const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

					// Fetch payments for today using Firestore REST API with query
					const paymentsQuery = await fetch(
						`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								structuredQuery: {
									from: [{ collectionId: 'payments' }],
									where: {
										compositeFilter: {
											op: 'AND',
											filters: [
												{
													fieldFilter: {
														field: { fieldPath: 'status' },
														op: 'EQUAL',
														value: { stringValue: 'paid' },
													},
												},
											],
										},
									},
								},
							}),
						}
					);

					const paymentsData = await paymentsQuery.json() as any[];

					// Parse payments and filter by date
					let todayRevenue = 0;
					let todayPayments = 0;

					if (Array.isArray(paymentsData)) {
						paymentsData.forEach((doc: any) => {
							if (doc.document) {
								const paidAt = doc.document.fields?.paid_at?.timestampValue;
								if (paidAt && paidAt >= startOfDay && paidAt < endOfDay) {
									const amount = doc.document.fields?.amount?.doubleValue || 0;
									todayRevenue += amount;
									todayPayments++;
								}
							}
						});
					}

					// Fetch members stats
					const membersQuery = await fetch(
						`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								structuredQuery: {
									from: [{ collectionId: 'members' }],
									select: { fields: [{ fieldPath: 'status' }, { fieldPath: 'plan' }] },
								},
							}),
						}
					);

					const membersData = await membersQuery.json() as any[];

					let totalMembers = 0;
					let activeMembers = 0;
					let pendingMembers = 0;
					const byPlan: Record<string, number> = { silver: 0, gold: 0, black: 0 };

					if (Array.isArray(membersData)) {
						membersData.forEach((doc: any) => {
							if (doc.document) {
								totalMembers++;
								const status = doc.document.fields?.status?.stringValue;
								const plan = doc.document.fields?.plan?.stringValue;

								if (status === 'active') activeMembers++;
								if (status === 'pending') pendingMembers++;
								if (plan && byPlan[plan] !== undefined) byPlan[plan]++;
							}
						});
					}

					return jsonResponse({
						date: today.toISOString().split('T')[0],
						revenue: todayRevenue,
						payments: todayPayments,
						members: {
							total: totalMembers,
							active: activeMembers,
							pending: pendingMembers,
							byPlan,
						},
					}, 200, origin);
				} catch (error: any) {
					console.error('Daily report error:', error);
					return jsonResponse({ error: 'Failed to generate daily report' }, 500, origin);
				}
			}

			// Monthly Report
			if (path === '/reports/monthly' && method === 'GET') {
				try {
					const monthsParam = url.searchParams.get('months') || '6';
					const months = Math.min(12, Math.max(1, parseInt(monthsParam, 10)));

					const now = new Date();
					const reports: any[] = [];

					// Fetch all payments
					const paymentsQuery = await fetch(
						`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								structuredQuery: {
									from: [{ collectionId: 'payments' }],
									where: {
										fieldFilter: {
											field: { fieldPath: 'status' },
											op: 'EQUAL',
											value: { stringValue: 'paid' },
										},
									},
								},
							}),
						}
					);

					const paymentsData = await paymentsQuery.json() as any[];

					// Fetch all point transactions
					const pointsQuery = await fetch(
						`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								structuredQuery: {
									from: [{ collectionId: 'point_transactions' }],
								},
							}),
						}
					);

					const pointsData = await pointsQuery.json() as any[];

					// Group data by month
					for (let i = 0; i < months; i++) {
						const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
						const monthStart = monthDate.toISOString();
						const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString();
						const monthLabel = monthDate.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

						let revenue = 0;
						let newMembers = 0;
						let pointsEarned = 0;
						let pointsRedeemed = 0;

						// Calculate revenue
						if (Array.isArray(paymentsData)) {
							paymentsData.forEach((doc: any) => {
								if (doc.document) {
									const paidAt = doc.document.fields?.paid_at?.timestampValue;
									if (paidAt && paidAt >= monthStart && paidAt < monthEnd) {
										revenue += doc.document.fields?.amount?.doubleValue || 0;
										newMembers++;
									}
								}
							});
						}

						// Calculate points
						if (Array.isArray(pointsData)) {
							pointsData.forEach((doc: any) => {
								if (doc.document) {
									const createdAt = doc.document.fields?.created_at?.timestampValue;
									if (createdAt && createdAt >= monthStart && createdAt < monthEnd) {
										const type = doc.document.fields?.type?.stringValue;
										const points = doc.document.fields?.points?.integerValue || 0;

										if (type === 'earn') pointsEarned += parseInt(points, 10);
										if (type === 'redeem') pointsRedeemed += Math.abs(parseInt(points, 10));
									}
								}
							});
						}

						reports.unshift({
							period: monthLabel,
							month: monthDate.toISOString().slice(0, 7),
							revenue,
							newMembers,
							pointsEarned,
							pointsRedeemed,
						});
					}

					return jsonResponse({ months: reports }, 200, origin);
				} catch (error: any) {
					console.error('Monthly report error:', error);
					return jsonResponse({ error: 'Failed to generate monthly report' }, 500, origin);
				}
			}

			// ============================================
			// CRON ROUTES
			// ============================================

			// Expire Points
			if (path === '/cron/expire-points' && method === 'POST') {
				try {
					const now = new Date().toISOString();

					// Fetch point transactions that should expire
					const query = await fetch(
						`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								structuredQuery: {
									from: [{ collectionId: 'point_transactions' }],
									where: {
										compositeFilter: {
											op: 'AND',
											filters: [
												{
													fieldFilter: {
														field: { fieldPath: 'type' },
														op: 'EQUAL',
														value: { stringValue: 'earn' },
													},
												},
												{
													fieldFilter: {
														field: { fieldPath: 'expired' },
														op: 'EQUAL',
														value: { booleanValue: false },
													},
												},
											],
										},
									},
								},
							}),
						}
					);

					const data = await query.json() as any[];
					let expiredCount = 0;
					let totalPointsExpired = 0;
					const memberPointsToDeduct: Record<string, number> = {};

					if (Array.isArray(data)) {
						for (const doc of data) {
							if (doc.document) {
								const expiresAt = doc.document.fields?.expires_at?.timestampValue;
								if (expiresAt && expiresAt < now) {
									const docPath = doc.document.name.split('/documents/')[1];
									const points = parseInt(doc.document.fields?.points?.integerValue || '0', 10);
									const memberId = doc.document.fields?.member_id?.stringValue;

									// Mark transaction as expired
									await firestoreRequest(
										env.FIREBASE_PROJECT_ID,
										`${docPath}?updateMask.fieldPaths=expired`,
										'PATCH',
										{
											fields: {
												expired: { booleanValue: true },
											},
										}
									);

									expiredCount++;
									totalPointsExpired += points;

									if (memberId) {
										memberPointsToDeduct[memberId] = (memberPointsToDeduct[memberId] || 0) + points;
									}
								}
							}
						}
					}

					// Deduct points from members
					for (const [memberId, pointsToDeduct] of Object.entries(memberPointsToDeduct)) {
						try {
							const memberDoc: any = await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`members/${memberId}`
							);
							const currentPoints = parseInt(memberDoc.fields?.points?.integerValue || '0', 10);
							const newPoints = Math.max(0, currentPoints - pointsToDeduct);

							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`members/${memberId}?updateMask.fieldPaths=points`,
								'PATCH',
								{
									fields: {
										points: { integerValue: newPoints.toString() },
									},
								}
							);

							// Create expiration transaction record
							const txId = `expire_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`point_transactions/${txId}`,
								'PATCH',
								{
									fields: {
										member_id: { stringValue: memberId },
										points: { integerValue: (-pointsToDeduct).toString() },
										type: { stringValue: 'expire' },
										description: { stringValue: 'Pontos expirados' },
										created_at: { timestampValue: now },
										expired: { booleanValue: true },
									},
								}
							);
						} catch (e) {
							console.error(`Failed to deduct points from member ${memberId}:`, e);
						}
					}

					return jsonResponse({
						success: true,
						expired_transactions: expiredCount,
						total_points_expired: totalPointsExpired,
						members_affected: Object.keys(memberPointsToDeduct).length,
					}, 200, origin);
				} catch (error: any) {
					console.error('Expire points error:', error);
					return jsonResponse({ error: 'Failed to expire points' }, 500, origin);
				}
			}

			// Renewal Reminders
			if (path === '/cron/renewal-reminders' && method === 'POST') {
				if (!env.RESEND_API_KEY) {
					return jsonResponse({ error: 'Email service not configured' }, 500, origin);
				}

				try {
					const now = new Date();
					const reminderDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now
					const reminderDateStr = reminderDate.toISOString().split('T')[0];

					// Fetch members expiring in 7 days
					const query = await fetch(
						`https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								structuredQuery: {
									from: [{ collectionId: 'members' }],
									where: {
										compositeFilter: {
											op: 'AND',
											filters: [
												{
													fieldFilter: {
														field: { fieldPath: 'status' },
														op: 'EQUAL',
														value: { stringValue: 'active' },
													},
												},
												{
													fieldFilter: {
														field: { fieldPath: 'expiry_date' },
														op: 'EQUAL',
														value: { stringValue: reminderDateStr },
													},
												},
											],
										},
									},
								},
							}),
						}
					);

					const data = await query.json() as any[];
					let remindersSent = 0;
					const errors: string[] = [];

					if (Array.isArray(data)) {
						for (const doc of data) {
							if (doc.document) {
								const email = doc.document.fields?.email?.stringValue;
								const fullName = doc.document.fields?.full_name?.stringValue;
								const expiryDate = doc.document.fields?.expiry_date?.stringValue;
								const memberId = doc.document.name.split('/').pop();

								if (email && fullName) {
									const result = await sendEmail(
										env.RESEND_API_KEY,
										email,
										'renewal-reminder',
										{
											nome: fullName,
											validade: new Date(expiryDate).toLocaleDateString('pt-BR'),
										}
									);

									if (result.success) {
										remindersSent++;
									} else {
										errors.push(`${email}: ${result.error}`);
									}

									// Log email
									try {
										const logId = `email_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
										await firestoreRequest(
											env.FIREBASE_PROJECT_ID,
											`email_logs/${logId}`,
											'PATCH',
											{
												fields: {
													member_id: { stringValue: memberId || '' },
													template: { stringValue: 'renewal-reminder' },
													recipient: { stringValue: email },
													status: { stringValue: result.success ? 'sent' : 'failed' },
													sent_at: { timestampValue: now.toISOString() },
													...(result.error && { error: { stringValue: result.error } }),
												},
											}
										);
									} catch (e) {
										console.error('Email log error:', e);
									}
								}
							}
						}
					}

					return jsonResponse({
						success: true,
						reminders_sent: remindersSent,
						errors: errors.length > 0 ? errors : undefined,
					}, 200, origin);
				} catch (error: any) {
					console.error('Renewal reminders error:', error);
					return jsonResponse({ error: 'Failed to send renewal reminders' }, 500, origin);
				}
			}

			// 404
			return jsonResponse({ error: 'Not found' }, 404, origin);

		} catch (error: any) {
			console.error('Handler error:', error);
			return jsonResponse({ error: error.message || 'Internal server error' }, 500, origin);
		}
	},

	// ============================================
	// SCHEDULED HANDLER (Cron Triggers)
	// ============================================

	async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
		const triggerTime = new Date(event.scheduledTime);
		console.log(`Cron trigger at ${triggerTime.toISOString()}`);

		// Run expire-points daily
		try {
			const expireResponse = await fetch(`${env.WORKER_URL}/cron/expire-points`, {
				method: 'POST',
			});
			const expireResult = await expireResponse.json();
			console.log('Expire points result:', expireResult);
		} catch (error) {
			console.error('Expire points cron error:', error);
		}

		// Run renewal reminders daily
		try {
			const reminderResponse = await fetch(`${env.WORKER_URL}/cron/renewal-reminders`, {
				method: 'POST',
			});
			const reminderResult = await reminderResponse.json();
			console.log('Renewal reminders result:', reminderResult);
		} catch (error) {
			console.error('Renewal reminders cron error:', error);
		}
	},
};
