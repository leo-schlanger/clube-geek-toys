// ============================================
// TYPES
// ============================================

interface Env {
	MERCADOPAGO_ACCESS_TOKEN: string;
	MERCADOPAGO_WEBHOOK_SECRET?: string;
	FIREBASE_PROJECT_ID: string;
	FIREBASE_API_KEY?: string;
	FRONTEND_URL: string;
	WORKER_URL: string;
	RESEND_API_KEY?: string;
	FROM_EMAIL?: string;
}

// Resend API Response
interface ResendResponse {
	id?: string;
	message?: string;
}

// Mercado Pago Types
interface MpPaymentResponse {
	id: number;
	status: string;
	status_detail?: string;
	external_reference?: string;
	transaction_amount?: number;
	date_approved?: string;
	date_of_expiration?: string;
	point_of_interaction?: {
		transaction_data?: {
			qr_code?: string;
			qr_code_base64?: string;
			ticket_url?: string;
		};
	};
	message?: string;
}

interface MpPreferenceResponse {
	id: string;
	init_point: string;
	sandbox_init_point: string;
	message?: string;
}

// Firestore Types
interface FirestoreValue {
	stringValue?: string;
	integerValue?: string;
	doubleValue?: number;
	booleanValue?: boolean;
	timestampValue?: string;
}

interface FirestoreFields {
	[key: string]: FirestoreValue;
}

interface FirestoreDocument {
	name: string;
	fields?: FirestoreFields;
}

interface FirestoreQueryResult {
	document?: FirestoreDocument;
}

// Request Body Types
interface PixCreateBody {
	amount: number;
	description?: string;
	payer_email: string;
	external_reference?: string;
}

interface CheckoutCreateBody {
	items: Array<{
		title: string;
		quantity: number;
		unit_price: number;
	}>;
	payer?: {
		email?: string;
		name?: string;
	};
	external_reference?: string;
}

interface WebhookBody {
	type?: string;
	action?: string;
	data?: {
		id?: string;
	};
}

// Subscription Types
interface SubscriptionCreateBody {
	member_id: string;
	plan: 'silver' | 'gold' | 'black';
	frequency_type: 'months' | 'years';
	payer_email: string;
	card_token: string;
	transaction_amount: number;
	reason: string;
}

interface MpPreapprovalResponse {
	id: string;
	status: string;
	payer_id?: number;
	payer_email?: string;
	back_url?: string;
	init_point?: string;
	auto_recurring?: {
		frequency: number;
		frequency_type: string;
		transaction_amount: number;
		currency_id: string;
	};
	next_payment_date?: string;
	payment_method_id?: string;
	card?: {
		last_four_digits?: string;
		expiration_month?: number;
		expiration_year?: number;
	};
	message?: string;
}

interface MpAuthorizedPaymentResponse {
	id: number;
	status: string;
	status_detail?: string;
	preapproval_id: string;
	payment?: {
		id: number;
		status: string;
		status_detail?: string;
	};
	transaction_amount?: number;
	currency_id?: string;
	date_created?: string;
}

interface EmailSendBody {
	template: string;
	to: string;
	variables?: Record<string, string>;
	member_id?: string;
}

interface VerificationEmailBody {
	email: string;
	uid: string;
	name?: string;
}

interface PasswordResetBody {
	email: string;
}

interface ContractEmailBody {
	to: string;
	member_name: string;
	plan: string;
	signed_at: string;
	hash: string;
	pdf_base64: string;
	admin_email?: string;
}

interface FirebaseOobCodeResponse {
	oobLink?: string;
	email?: string;
	error?: {
		code: number;
		message: string;
	};
}

// Report Types
interface MonthlyReport {
	period: string;
	month: string;
	revenue: number;
	newMembers: number;
	pointsEarned: number;
	pointsRedeemed: number;
}

// ============================================
// EMAIL TEMPLATES
// ============================================

type EmailTemplate = 'welcome' | 'payment-confirmed' | 'payment-failed' | 'renewal-reminder' | 'points-expiring' | 'subscription-created' | 'subscription-payment' | 'subscription-paused' | 'subscription-cancelled' | 'subscription-payment-failed' | 'verify-email' | 'password-reset' | 'contract-signed';

interface EmailTemplateConfig {
	subject: string;
	html: (variables: Record<string, string>) => string;
}

// ============================================
// EMAIL TEMPLATES - Modern Design 2026
// Following best practices: dark mode support, minimalist design, brand consistency
// Reference: https://www.enchantagency.com/blog/dark-mode-email-design-best-practices-css-guide-2026
// ============================================

const BRAND = {
	logoUrl: 'https://clube-geek-toys.web.app/logo.jpg',
	primaryGold: '#E9B84A',
	primaryGoldDark: '#D4A73A',
	successGreen: '#22C55E',
	warningAmber: '#F59E0B',
	errorRed: '#EF4444',
	darkBg: '#0a0a0a',
	darkCard: '#141414',
	darkBorder: '#262626',
	textPrimary: '#FAFAFA',
	textSecondary: '#A1A1AA',
	textMuted: '#71717A',
	siteUrl: 'https://geeketoys.com.br',
	clubUrl: 'https://clube-geek-toys.web.app',
	siteName: 'Clube Geek & Toys',
	social: {
		facebook: 'https://www.facebook.com/geeketoyscolection/',
		instagram: 'https://www.instagram.com/geeketoys/',
		tiktok: 'https://www.tiktok.com/@geeketoys',
	},
	// Social icons from CDN (email-safe)
	icons: {
		facebook: 'https://cdn.simpleicons.org/facebook/E9B84A',
		instagram: 'https://cdn.simpleicons.org/instagram/E9B84A',
		tiktok: 'https://cdn.simpleicons.org/tiktok/E9B84A',
	},
};

// Reusable email base with dark mode support
const createEmailBase = (title: string, content: string) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="color-scheme" content="dark">
	<meta name="supported-color-schemes" content="dark">
	<title>${title}</title>
	<!--[if mso]>
	<noscript>
		<xml>
			<o:OfficeDocumentSettings>
				<o:PixelsPerInch>96</o:PixelsPerInch>
			</o:OfficeDocumentSettings>
		</xml>
	</noscript>
	<![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: ${BRAND.darkBg}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
	<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.darkBg};">
		<tr>
			<td align="center" style="padding: 40px 16px;">
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: ${BRAND.darkCard}; border-radius: 16px; overflow: hidden; border: 1px solid ${BRAND.darkBorder};">
					${content}
				</table>
				<!-- Footer -->
				<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 560px; margin-top: 24px;">
					<tr>
						<td align="center" style="padding: 0 16px;">
							<!-- Social Icons -->
							<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto 16px auto;">
								<tr>
									<td style="padding: 0 8px;">
										<a href="${BRAND.social.facebook}" style="text-decoration: none;">
											<img src="${BRAND.icons.facebook}" alt="Facebook" width="24" height="24" style="display: block;">
										</a>
									</td>
									<td style="padding: 0 8px;">
										<a href="${BRAND.social.instagram}" style="text-decoration: none;">
											<img src="${BRAND.icons.instagram}" alt="Instagram" width="24" height="24" style="display: block;">
										</a>
									</td>
									<td style="padding: 0 8px;">
										<a href="${BRAND.social.tiktok}" style="text-decoration: none;">
											<img src="${BRAND.icons.tiktok}" alt="TikTok" width="24" height="24" style="display: block;">
										</a>
									</td>
								</tr>
							</table>
							<p style="color: ${BRAND.textMuted}; font-size: 12px; line-height: 1.5; margin: 0;">
								© ${new Date().getFullYear()} ${BRAND.siteName}. Todos os direitos reservados.
							</p>
							<p style="margin: 8px 0 0 0;">
								<a href="${BRAND.siteUrl}" style="color: ${BRAND.primaryGold}; font-size: 12px; text-decoration: none;">geeketoys.com.br</a>
							</p>
						</td>
					</tr>
				</table>
			</td>
		</tr>
	</table>
</body>
</html>`;

// Header component with logo
const emailHeaderWithLogo = `
<tr>
	<td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid ${BRAND.darkBorder};">
		<img src="${BRAND.logoUrl}" alt="${BRAND.siteName}" width="140" style="display: block; margin: 0 auto 12px auto; max-width: 140px; height: auto;">
		<p style="color: ${BRAND.primaryGold}; font-size: 11px; text-transform: uppercase; letter-spacing: 3px; margin: 0; font-weight: 600;">Clube de Vantagens</p>
	</td>
</tr>`;

// Status header component (for payment confirmations, etc.)
const createStatusHeader = (icon: string, title: string, bgColor: string) => `
<tr>
	<td style="padding: 32px 32px 24px 32px; text-align: center; border-bottom: 1px solid ${BRAND.darkBorder};">
		<img src="${BRAND.logoUrl}" alt="${BRAND.siteName}" width="100" style="display: block; margin: 0 auto 20px auto; max-width: 100px; height: auto; opacity: 0.9;">
		<div style="display: inline-block; background-color: ${bgColor}; border-radius: 50%; width: 56px; height: 56px; line-height: 56px; text-align: center; margin-bottom: 16px;">
			<span style="font-size: 28px;">${icon}</span>
		</div>
		<h1 style="color: ${BRAND.textPrimary}; font-size: 22px; font-weight: 600; margin: 0;">${title}</h1>
	</td>
</tr>`;

// CTA Button component
const createButton = (text: string, url: string, color: string = BRAND.primaryGold) => `
<table role="presentation" cellspacing="0" cellpadding="0" style="margin: 0 auto;">
	<tr>
		<td style="background-color: ${color}; border-radius: 8px;">
			<a href="${url}" style="display: inline-block; padding: 14px 32px; color: ${BRAND.darkBg}; font-size: 14px; font-weight: 700; text-decoration: none; text-transform: uppercase; letter-spacing: 0.5px;">${text}</a>
		</td>
	</tr>
</table>`;

// Info card component
const createInfoCard = (items: string[], accentColor: string = BRAND.primaryGold) => `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.darkBg}; border-radius: 12px; border-left: 4px solid ${accentColor}; margin: 24px 0;">
	<tr>
		<td style="padding: 20px 24px;">
			${items.join('')}
		</td>
	</tr>
</table>`;

const createInfoItem = (label: string, value: string, isLast: boolean = false) => `
<p style="color: ${BRAND.textSecondary}; font-size: 13px; margin: 0 0 ${isLast ? '0' : '12px'} 0;">
	<span style="color: ${BRAND.textMuted}; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; display: block; margin-bottom: 4px;">${label}</span>
	<strong style="color: ${BRAND.textPrimary}; font-size: 16px; font-weight: 600;">${value}</strong>
</p>`;

const EMAIL_TEMPLATES: Record<EmailTemplate, EmailTemplateConfig> = {
	'welcome': {
		subject: 'Bem-vindo ao Clube Geek & Toys!',
		html: (vars) => createEmailBase('Bem-vindo ao Clube Geek & Toys', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.primaryGold}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Olá, ${vars.nome}!</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Seja bem-vindo ao <strong style="color: ${BRAND.textPrimary};">${BRAND.siteName}</strong>! Estamos muito felizes em ter você como membro do nosso clube exclusivo.
					</p>

					${createInfoCard([createInfoItem('Seu Plano', vars.plano || 'Membro', true)], BRAND.primaryGold)}

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Agora você tem acesso a descontos exclusivos, programa de pontos e muito mais! Apresente sua carteirinha digital sempre que visitar nossa loja.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Acessar Minha Conta', vars.dashboard_url || BRAND.clubUrl + '/minha-conta')}
					</div>
				</td>
			</tr>
		`),
	},
	'payment-confirmed': {
		subject: 'Pagamento Confirmado!',
		html: (vars) => createEmailBase('Pagamento Confirmado', `
			${createStatusHeader('✓', 'Pagamento Confirmado', '#166534')}
			<tr>
				<td style="padding: 32px;">
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Seu pagamento foi confirmado com sucesso. Sua assinatura está ativa!
					</p>

					${createInfoCard([
						createInfoItem('Valor Pago', 'R$ ' + vars.valor),
						createInfoItem('Plano', vars.plano || 'Clube'),
						createInfoItem('Válido até', vars.validade, true),
					], BRAND.successGreen)}

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Aproveite todos os benefícios do seu plano! Acesse sua conta para ver sua carteirinha digital.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Ver Minha Carteirinha', vars.dashboard_url || BRAND.clubUrl + '/minha-conta', BRAND.successGreen)}
					</div>
				</td>
			</tr>
		`),
	},
	'payment-failed': {
		subject: 'Problema com seu pagamento',
		html: (vars) => createEmailBase('Problema com Pagamento', `
			${createStatusHeader('!', 'Problema com Pagamento', '#B45309')}
			<tr>
				<td style="padding: 32px;">
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Infelizmente houve um problema com seu pagamento. Por favor, tente novamente.
					</p>

					${createInfoCard([
						createInfoItem('Valor', 'R$ ' + vars.valor),
						createInfoItem('Motivo', vars.motivo || 'Pagamento não aprovado', true),
					], BRAND.warningAmber)}

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Verifique os dados do seu cartão ou tente outro método de pagamento. Se o problema persistir, entre em contato conosco.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Tentar Novamente', vars.retry_url || BRAND.clubUrl + '/assinar', BRAND.warningAmber)}
					</div>
				</td>
			</tr>
		`),
	},
	'renewal-reminder': {
		subject: 'Sua assinatura está expirando',
		html: (vars) => createEmailBase('Lembrete de Renovação', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.primaryGold}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Hora de Renovar!</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Sua assinatura do ${BRAND.siteName} está prestes a expirar. Não perca seus benefícios!
					</p>

					<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #451A03; border-radius: 12px; margin: 24px 0;">
						<tr>
							<td style="padding: 24px; text-align: center;">
								<p style="color: ${BRAND.warningAmber}; font-size: 12px; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 8px 0;">Expira em</p>
								<p style="color: ${BRAND.textPrimary}; font-size: 28px; font-weight: 700; margin: 0;">${vars.validade}</p>
							</td>
						</tr>
					</table>

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 16px 0;">
						Renove agora e continue aproveitando:
					</p>
					<ul style="color: ${BRAND.textSecondary}; font-size: 14px; line-height: 2; margin: 0 0 24px 0; padding-left: 20px;">
						<li>Descontos exclusivos em produtos</li>
						<li>Programa de pontos com multiplicador</li>
						<li>Promoções exclusivas para membros</li>
					</ul>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Renovar Agora', vars.renew_url || BRAND.clubUrl + '/minha-conta')}
					</div>
				</td>
			</tr>
		`),
	},
	'points-expiring': {
		subject: 'Seus pontos estão expirando',
		html: (vars) => createEmailBase('Pontos Expirando', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.primaryGold}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Use seus pontos!</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Você tem pontos que estão prestes a expirar. Não deixe eles irem embora!
					</p>

					<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${BRAND.darkBg}; border-radius: 12px; border: 1px solid ${BRAND.warningAmber}; margin: 24px 0;">
						<tr>
							<td style="padding: 32px; text-align: center;">
								<p style="color: ${BRAND.primaryGold}; font-size: 48px; font-weight: 700; margin: 0; line-height: 1;">${vars.pontos}</p>
								<p style="color: ${BRAND.textSecondary}; font-size: 14px; text-transform: uppercase; letter-spacing: 2px; margin: 8px 0 0 0;">pontos</p>
								<div style="width: 40px; height: 1px; background-color: ${BRAND.darkBorder}; margin: 16px auto;"></div>
								<p style="color: ${BRAND.warningAmber}; font-size: 13px; margin: 0;">Expiram em ${vars.data_expiracao}</p>
							</td>
						</tr>
					</table>

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Visite nossa loja e use seus pontos para ganhar descontos nas suas compras!
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Ver Meus Pontos', vars.dashboard_url || BRAND.clubUrl + '/minha-conta')}
					</div>
				</td>
			</tr>
		`),
	},
	'subscription-created': {
		subject: 'Assinatura criada com sucesso!',
		html: (vars) => createEmailBase('Assinatura Criada', `
			${createStatusHeader('✓', 'Assinatura Ativada', '#166534')}
			<tr>
				<td style="padding: 32px;">
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Sua assinatura recorrente foi criada com sucesso! Agora você é membro do Clube Geek & Toys.
					</p>

					${createInfoCard([
						createInfoItem('Plano', vars.plano),
						createInfoItem('Valor', 'R$ ' + vars.valor + '/' + (vars.frequencia === 'months' ? 'mês' : 'ano')),
						createInfoItem('Cartão', vars.cartao),
						createInfoItem('Próxima cobrança', vars.proxima_cobranca, true),
					], BRAND.successGreen)}

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Sua assinatura será renovada automaticamente. Você pode gerenciá-la a qualquer momento em sua conta.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Gerenciar Assinatura', vars.dashboard_url || BRAND.clubUrl + '/minha-conta', BRAND.primaryGold)}
					</div>
				</td>
			</tr>
		`),
	},
	'subscription-payment': {
		subject: 'Cobrança processada - Clube Geek & Toys',
		html: (vars) => createEmailBase('Cobrança Processada', `
			${createStatusHeader('✓', 'Cobrança Realizada', '#166534')}
			<tr>
				<td style="padding: 32px;">
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						A cobrança da sua assinatura foi processada com sucesso.
					</p>

					${createInfoCard([
						createInfoItem('Valor cobrado', 'R$ ' + vars.valor),
						createInfoItem('Plano', vars.plano),
						createInfoItem('Cartão', vars.cartao),
						createInfoItem('Próxima cobrança', vars.proxima_cobranca, true),
					], BRAND.successGreen)}

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Ver Histórico', vars.dashboard_url || BRAND.clubUrl + '/minha-conta', BRAND.primaryGold)}
					</div>
				</td>
			</tr>
		`),
	},
	'subscription-paused': {
		subject: 'Assinatura pausada - Clube Geek & Toys',
		html: (vars) => createEmailBase('Assinatura Pausada', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.warningAmber}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Assinatura Pausada</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Sua assinatura do plano ${vars.plano} foi pausada. Enquanto pausada, você não receberá cobranças e seus benefícios ficam suspensos.
					</p>

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Você pode reativar sua assinatura a qualquer momento para voltar a aproveitar os benefícios do clube.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Reativar Assinatura', vars.dashboard_url || BRAND.clubUrl + '/minha-conta', BRAND.warningAmber)}
					</div>
				</td>
			</tr>
		`),
	},
	'subscription-cancelled': {
		subject: 'Assinatura cancelada - Clube Geek & Toys',
		html: (vars) => createEmailBase('Assinatura Cancelada', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.errorRed}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Assinatura Cancelada</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Sua assinatura do plano ${vars.plano} foi cancelada. Sentiremos sua falta!
					</p>

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Você pode criar uma nova assinatura a qualquer momento e voltar a fazer parte do Clube Geek & Toys.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Assinar Novamente', BRAND.clubUrl + '/assinar', BRAND.primaryGold)}
					</div>
				</td>
			</tr>
		`),
	},
	'subscription-payment-failed': {
		subject: 'Problema com cobrança - Clube Geek & Toys',
		html: (vars) => createEmailBase('Falha na Cobrança', `
			${createStatusHeader('!', 'Problema na Cobrança', '#B45309')}
			<tr>
				<td style="padding: 32px;">
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Houve um problema ao processar a cobrança da sua assinatura. Por favor, verifique seu cartão.
					</p>

					${createInfoCard([
						createInfoItem('Valor', 'R$ ' + vars.valor),
						createInfoItem('Motivo', vars.motivo || 'Pagamento não aprovado'),
						createInfoItem('Tentativas restantes', vars.tentativas_restantes, true),
					], BRAND.warningAmber)}

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Atualize seu cartão para evitar a suspensão da sua assinatura. Após 3 tentativas sem sucesso, sua assinatura será cancelada automaticamente.
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Atualizar Cartão', vars.dashboard_url || BRAND.clubUrl + '/minha-conta', BRAND.warningAmber)}
					</div>
				</td>
			</tr>
		`),
	},
	'verify-email': {
		subject: 'Confirme seu Email - Clube Geek & Toys',
		html: (vars) => createEmailBase('Confirme seu Email', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.primaryGold}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Confirme seu Email</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Para completar seu cadastro no ${BRAND.siteName}, confirme seu email clicando no botão abaixo:
					</p>

					<div style="text-align: center; margin: 32px 0;">
						${createButton('Confirmar Email', vars.verification_link)}
					</div>

					<p style="color: ${BRAND.textMuted}; font-size: 13px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
						Este link expira em 24 horas.<br>
						Se você não solicitou este email, ignore-o.
					</p>

					<div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid ${BRAND.darkBorder};">
						<p style="color: ${BRAND.textMuted}; font-size: 12px; line-height: 1.5; margin: 0;">
							Se o botão não funcionar, copie e cole este link no seu navegador:
						</p>
						<p style="color: ${BRAND.primaryGold}; font-size: 12px; word-break: break-all; margin: 8px 0 0 0;">
							${vars.verification_link}
						</p>
					</div>
				</td>
			</tr>
		`),
	},
	'contract-signed': {
		subject: 'Contrato Assinado - Clube Geek & Toys',
		html: (vars) => createEmailBase('Contrato Assinado', `
			${createStatusHeader('✓', 'Contrato Assinado', '#166534')}
			<tr>
				<td style="padding: 32px;">
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Seu contrato de adesão ao Clube Geek & Toys foi assinado digitalmente com sucesso.
					</p>

					${createInfoCard([
						createInfoItem('Plano', vars.plano),
						createInfoItem('Data da Assinatura', vars.data_assinatura),
						createInfoItem('Hash do Documento', vars.hash ? vars.hash.substring(0, 16) + '...' : 'N/A', true),
					], BRAND.successGreen)}

					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 24px 0;">
						Uma cópia do contrato assinado está anexada a este email. Guarde este documento para seus registros.
					</p>

					<p style="color: ${BRAND.textMuted}; font-size: 13px; line-height: 1.6; margin: 24px 0 0 0;">
						Este contrato tem validade jurídica conforme Lei 14.063/2020 (assinatura eletrônica simples).
					</p>

					<div style="text-align: center; margin: 32px 0 8px 0;">
						${createButton('Acessar Minha Conta', vars.dashboard_url || BRAND.clubUrl + '/minha-conta', BRAND.primaryGold)}
					</div>
				</td>
			</tr>
		`),
	},
	'password-reset': {
		subject: 'Redefinir sua Senha - Clube Geek & Toys',
		html: (vars) => createEmailBase('Redefinir Senha', `
			${emailHeaderWithLogo}
			<tr>
				<td style="padding: 32px;">
					<h2 style="color: ${BRAND.primaryGold}; font-size: 24px; font-weight: 600; margin: 0 0 8px 0;">Redefinir Senha</h2>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 8px 0;">
						Olá, <strong style="color: ${BRAND.textPrimary};">${vars.nome}</strong>!
					</p>
					<p style="color: ${BRAND.textSecondary}; font-size: 15px; line-height: 1.7; margin: 0 0 24px 0;">
						Recebemos uma solicitação para redefinir a senha da sua conta no ${BRAND.siteName}. Clique no botão abaixo para criar uma nova senha:
					</p>

					<div style="text-align: center; margin: 32px 0;">
						${createButton('Redefinir Senha', vars.reset_link)}
					</div>

					<p style="color: ${BRAND.textMuted}; font-size: 13px; line-height: 1.6; margin: 24px 0 0 0; text-align: center;">
						Este link expira em 1 hora.<br>
						Se você não solicitou a redefinição, ignore este email.
					</p>

					<div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid ${BRAND.darkBorder};">
						<p style="color: ${BRAND.textMuted}; font-size: 12px; line-height: 1.5; margin: 0;">
							Se o botão não funcionar, copie e cole este link no seu navegador:
						</p>
						<p style="color: ${BRAND.primaryGold}; font-size: 12px; word-break: break-all; margin: 8px 0 0 0;">
							${vars.reset_link}
						</p>
					</div>
				</td>
			</tr>
		`),
	},
};

// ============================================
// EMAIL HELPER
// ============================================

const DEFAULT_FROM_EMAIL = 'Clube Geek & Toys <onboarding@resend.dev>';

async function sendEmail(
	apiKey: string,
	to: string,
	template: EmailTemplate,
	variables: Record<string, string>,
	fromEmail?: string
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
				from: fromEmail || DEFAULT_FROM_EMAIL,
				to: [to],
				subject: templateConfig.subject,
				html: templateConfig.html(variables),
			}),
		});

		const data = await response.json() as ResendResponse;

		if (!response.ok) {
			return { success: false, error: data.message || 'Failed to send email' };
		}

		return { success: true, id: data.id };
	} catch (error: unknown) {
		const err = error as { message?: string };
		return { success: false, error: err.message || 'Email sending error' };
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
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Signature, X-Request-Id',
		'Access-Control-Allow-Credentials': 'true',
	};

	if (origin && ALLOWED_ORIGINS.includes(origin)) {
		headers['Access-Control-Allow-Origin'] = origin;
	}

	return headers;
}

function jsonResponse(data: unknown, status = 200, origin: string | null = null): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			'Content-Type': 'application/json',
			...corsHeaders(origin),
		},
	});
}

async function mpRequest<T = MpPaymentResponse>(
	accessToken: string,
	endpoint: string,
	method = 'GET',
	body?: Record<string, unknown>,
	idempotencyKey?: string
): Promise<T> {
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

	const data = await response.json() as T & { message?: string };

	if (!response.ok) {
		console.error(`Mercado Pago error (${endpoint}):`, JSON.stringify(data));
		throw new Error(data.message || `MP request failed: ${response.status}`);
	}

	return data;
}

async function firestoreRequest<T = FirestoreDocument>(
	projectId: string,
	path: string,
	method = 'GET',
	body?: Record<string, unknown>
): Promise<T> {
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

	return response.json() as Promise<T>;
}

async function verifyWebhookSignature(
	xSignature: string | null,
	xRequestId: string | null,
	dataId: string | null,
	secret: string,
	isProduction: boolean
): Promise<boolean> {
	// CRITICAL: In production, webhook secret is REQUIRED
	if (!secret) {
		if (isProduction) {
			console.error('SECURITY ERROR: Webhook secret not configured in production - rejecting request');
			return false;
		}
		console.warn('⚠️ DEV MODE: Webhook secret not configured - skipping verification (NOT SAFE FOR PRODUCTION)');
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
				const body = await request.json() as PixCreateBody;
				const { amount, description, payer_email, external_reference } = body;

				if (!amount || !payer_email) {
					return jsonResponse({ error: 'Missing required fields: amount, payer_email' }, 400, origin);
				}

				// CRITICAL: Validate external_reference (memberId) is provided
				// Without this, webhook cannot activate the member after payment
				if (!external_reference || external_reference.trim() === '') {
					return jsonResponse({ error: 'Missing required field: external_reference (memberId)' }, 400, origin);
				}

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				// Generate idempotency key
				const idempotencyKey = `pix-${external_reference || Date.now()}-${crypto.randomUUID()}`;

				const result = await mpRequest<MpPaymentResponse>(env.MERCADOPAGO_ACCESS_TOKEN, '/v1/payments', 'POST', {
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
				const body = await request.json() as CheckoutCreateBody;
				const { items, payer, external_reference } = body;

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				// CRITICAL: Validate external_reference (memberId) is provided
				// Without this, webhook cannot activate the member after payment
				if (!external_reference || external_reference.trim() === '') {
					return jsonResponse({ error: 'Missing required field: external_reference (memberId)' }, 400, origin);
				}

				// Generate idempotency key
				const idempotencyKey = `checkout-${external_reference || Date.now()}-${crypto.randomUUID()}`;

				const result = await mpRequest<MpPreferenceResponse>(env.MERCADOPAGO_ACCESS_TOKEN, '/checkout/preferences', 'POST', {
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
					const paymentInfo = await mpRequest<MpPaymentResponse>(
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
				} catch (err) {
					console.error('Payment status check error:', err);
					return jsonResponse({ error: 'Failed to check payment status' }, 500, origin);
				}
			}

			// ============================================
			// SUBSCRIPTION ROUTES
			// ============================================

			// Create Subscription
			if (path === '/subscription/create' && method === 'POST') {
				const body = await request.json() as SubscriptionCreateBody;
				const { member_id, plan, frequency_type, payer_email, card_token, transaction_amount, reason } = body;

				if (!member_id || !plan || !frequency_type || !payer_email || !card_token) {
					return jsonResponse({ error: 'Missing required fields' }, 400, origin);
				}

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				try {
					// Generate idempotency key
					const idempotencyKey = `subscription-${member_id}-${crypto.randomUUID()}`;

					// Create preapproval (subscription) in Mercado Pago
					const result = await mpRequest<MpPreapprovalResponse>(
						env.MERCADOPAGO_ACCESS_TOKEN,
						'/preapproval',
						'POST',
						{
							reason: reason || `Clube Geek & Toys - Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
							auto_recurring: {
								frequency: 1,
								frequency_type: frequency_type,
								transaction_amount: transaction_amount,
								currency_id: 'BRL',
							},
							back_url: `${env.FRONTEND_URL}/assinatura/callback`,
							payer_email: payer_email,
							card_token_id: card_token,
							external_reference: member_id,
							status: 'authorized',
						},
						idempotencyKey
					);

					// Save subscription to Firestore
					const subscriptionData = {
						member_id: member_id,
						mercado_pago_id: result.id,
						status: result.status || 'pending',
						plan: plan,
						frequency_type: frequency_type,
						transaction_amount: transaction_amount,
						payer_email: payer_email,
						next_payment_date: result.next_payment_date || null,
						card_last_four: result.card?.last_four_digits || null,
						failed_payments: 0,
						created_at: new Date().toISOString(),
					};

					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${result.id}`,
						'PATCH',
						{ fields: Object.fromEntries(
							Object.entries(subscriptionData).map(([k, v]) => [
								k,
								v === null ? { nullValue: null } :
								typeof v === 'number' ? { doubleValue: v } :
								{ stringValue: String(v) }
							])
						)}
					);

					// Update member with subscription reference
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`members/${member_id}?updateMask.fieldPaths=subscription_id&updateMask.fieldPaths=subscription_status&updateMask.fieldPaths=auto_renewal`,
						'PATCH',
						{
							fields: {
								subscription_id: { stringValue: result.id },
								subscription_status: { stringValue: result.status || 'pending' },
								auto_renewal: { booleanValue: true },
							},
						}
					);

					console.log(`[SUBSCRIPTION] Created subscription ${result.id} for member ${member_id}`);

					return jsonResponse({
						id: result.id,
						status: result.status,
						init_point: result.init_point,
						next_payment_date: result.next_payment_date,
					}, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[SUBSCRIPTION] Create error:', err);
					return jsonResponse({ error: err.message || 'Failed to create subscription' }, 500, origin);
				}
			}

			// Get Subscription
			if (path.match(/^\/subscription\/[^/]+$/) && method === 'GET') {
				const subscriptionId = path.split('/').pop();

				if (!subscriptionId) {
					return jsonResponse({ error: 'Subscription ID required' }, 400, origin);
				}

				try {
					// Get from Firestore
					const subscriptionDoc = await firestoreRequest<FirestoreDocument>(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}`
					);

					if (!subscriptionDoc.fields) {
						return jsonResponse({ error: 'Subscription not found' }, 404, origin);
					}

					const fields = subscriptionDoc.fields;
					return jsonResponse({
						id: subscriptionId,
						member_id: fields.member_id?.stringValue,
						mercado_pago_id: fields.mercado_pago_id?.stringValue,
						status: fields.status?.stringValue,
						plan: fields.plan?.stringValue,
						frequency_type: fields.frequency_type?.stringValue,
						transaction_amount: fields.transaction_amount?.doubleValue,
						next_payment_date: fields.next_payment_date?.stringValue,
						last_payment_date: fields.last_payment_date?.stringValue,
						failed_payments: parseInt(fields.failed_payments?.integerValue || '0', 10),
						card_last_four: fields.card_last_four?.stringValue,
						card_brand: fields.card_brand?.stringValue,
						payer_email: fields.payer_email?.stringValue,
						created_at: fields.created_at?.stringValue,
						cancelled_at: fields.cancelled_at?.stringValue,
						paused_at: fields.paused_at?.stringValue,
					}, 200, origin);
				} catch (error) {
					console.error('[SUBSCRIPTION] Get error:', error);
					return jsonResponse({ error: 'Subscription not found' }, 404, origin);
				}
			}

			// Pause Subscription
			if (path.match(/^\/subscription\/[^/]+\/pause$/) && method === 'PUT') {
				const subscriptionId = path.split('/')[2];

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				try {
					// Update in Mercado Pago
					await mpRequest<MpPreapprovalResponse>(
						env.MERCADOPAGO_ACCESS_TOKEN,
						`/preapproval/${subscriptionId}`,
						'PUT',
						{ status: 'paused' }
					);

					const now = new Date().toISOString();

					// Update in Firestore
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}?updateMask.fieldPaths=status&updateMask.fieldPaths=paused_at`,
						'PATCH',
						{
							fields: {
								status: { stringValue: 'paused' },
								paused_at: { timestampValue: now },
							},
						}
					);

					// Get member ID and update member status
					const subscriptionDoc = await firestoreRequest<FirestoreDocument>(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}`
					);
					const memberId = subscriptionDoc.fields?.member_id?.stringValue;

					if (memberId) {
						await firestoreRequest(
							env.FIREBASE_PROJECT_ID,
							`members/${memberId}?updateMask.fieldPaths=subscription_status`,
							'PATCH',
							{ fields: { subscription_status: { stringValue: 'paused' } } }
						);
					}

					console.log(`[SUBSCRIPTION] Paused subscription ${subscriptionId}`);
					return jsonResponse({ success: true, status: 'paused' }, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[SUBSCRIPTION] Pause error:', err);
					return jsonResponse({ error: err.message || 'Failed to pause subscription' }, 500, origin);
				}
			}

			// Resume Subscription
			if (path.match(/^\/subscription\/[^/]+\/resume$/) && method === 'PUT') {
				const subscriptionId = path.split('/')[2];

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				try {
					// Update in Mercado Pago
					await mpRequest<MpPreapprovalResponse>(
						env.MERCADOPAGO_ACCESS_TOKEN,
						`/preapproval/${subscriptionId}`,
						'PUT',
						{ status: 'authorized' }
					);

					// Update in Firestore
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}?updateMask.fieldPaths=status&updateMask.fieldPaths=paused_at`,
						'PATCH',
						{
							fields: {
								status: { stringValue: 'authorized' },
								paused_at: { nullValue: null },
							},
						}
					);

					// Get member ID and update member status
					const subscriptionDoc = await firestoreRequest<FirestoreDocument>(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}`
					);
					const memberId = subscriptionDoc.fields?.member_id?.stringValue;

					if (memberId) {
						await firestoreRequest(
							env.FIREBASE_PROJECT_ID,
							`members/${memberId}?updateMask.fieldPaths=subscription_status`,
							'PATCH',
							{ fields: { subscription_status: { stringValue: 'authorized' } } }
						);
					}

					console.log(`[SUBSCRIPTION] Resumed subscription ${subscriptionId}`);
					return jsonResponse({ success: true, status: 'authorized' }, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[SUBSCRIPTION] Resume error:', err);
					return jsonResponse({ error: err.message || 'Failed to resume subscription' }, 500, origin);
				}
			}

			// Cancel Subscription
			if (path.match(/^\/subscription\/[^/]+\/cancel$/) && method === 'PUT') {
				const subscriptionId = path.split('/')[2];

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				try {
					// Update in Mercado Pago
					await mpRequest<MpPreapprovalResponse>(
						env.MERCADOPAGO_ACCESS_TOKEN,
						`/preapproval/${subscriptionId}`,
						'PUT',
						{ status: 'cancelled' }
					);

					const now = new Date().toISOString();

					// Update in Firestore
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}?updateMask.fieldPaths=status&updateMask.fieldPaths=cancelled_at`,
						'PATCH',
						{
							fields: {
								status: { stringValue: 'cancelled' },
								cancelled_at: { timestampValue: now },
							},
						}
					);

					// Get member ID and update member
					const subscriptionDoc = await firestoreRequest<FirestoreDocument>(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}`
					);
					const memberId = subscriptionDoc.fields?.member_id?.stringValue;

					if (memberId) {
						await firestoreRequest(
							env.FIREBASE_PROJECT_ID,
							`members/${memberId}?updateMask.fieldPaths=subscription_status&updateMask.fieldPaths=auto_renewal`,
							'PATCH',
							{
								fields: {
									subscription_status: { stringValue: 'cancelled' },
									auto_renewal: { booleanValue: false },
								},
							}
						);
					}

					console.log(`[SUBSCRIPTION] Cancelled subscription ${subscriptionId}`);
					return jsonResponse({ success: true, status: 'cancelled' }, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[SUBSCRIPTION] Cancel error:', err);
					return jsonResponse({ error: err.message || 'Failed to cancel subscription' }, 500, origin);
				}
			}

			// Update Subscription Card
			if (path.match(/^\/subscription\/[^/]+\/update-card$/) && method === 'PUT') {
				const subscriptionId = path.split('/')[2];
				const body = await request.json() as { card_token: string };

				if (!body.card_token) {
					return jsonResponse({ error: 'Card token required' }, 400, origin);
				}

				if (!env.MERCADOPAGO_ACCESS_TOKEN) {
					return jsonResponse({ error: 'Payment service not configured' }, 500, origin);
				}

				try {
					// Update card in Mercado Pago
					const result = await mpRequest<MpPreapprovalResponse>(
						env.MERCADOPAGO_ACCESS_TOKEN,
						`/preapproval/${subscriptionId}`,
						'PUT',
						{ card_token_id: body.card_token }
					);

					// Update card info in Firestore
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`subscriptions/${subscriptionId}?updateMask.fieldPaths=card_last_four&updateMask.fieldPaths=failed_payments`,
						'PATCH',
						{
							fields: {
								card_last_four: { stringValue: result.card?.last_four_digits || '' },
								failed_payments: { integerValue: '0' },
							},
						}
					);

					console.log(`[SUBSCRIPTION] Updated card for subscription ${subscriptionId}`);
					return jsonResponse({
						success: true,
						card_last_four: result.card?.last_four_digits,
					}, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[SUBSCRIPTION] Update card error:', err);
					return jsonResponse({ error: err.message || 'Failed to update card' }, 500, origin);
				}
			}

			// ============================================
			// WEBHOOK ROUTES
			// ============================================

			// Webhook
			if (path === '/webhook/mercadopago' && method === 'POST') {
				const xSignature = request.headers.get('x-signature');
				const xRequestId = request.headers.get('x-request-id');
				const body = await request.json() as WebhookBody;

				const dataId = url.searchParams.get('data.id') || body?.data?.id;

				// Detect production environment (check if WORKER_URL contains localhost or dev domains)
				const isProduction = env.WORKER_URL ?
					!env.WORKER_URL.includes('localhost') && !env.WORKER_URL.includes('127.0.0.1') :
					true;

				const signatureValid = await verifyWebhookSignature(
					xSignature,
					xRequestId,
					dataId ?? null,
					env.MERCADOPAGO_WEBHOOK_SECRET || '',
					isProduction
				);

				if (!signatureValid) {
					console.error(`Webhook signature verification failed for payment ${dataId}`);
					return new Response('Unauthorized', { status: 401 });
				}

				const { type, action, data } = body;

				// Handle subscription preapproval events
				if (type === 'subscription_preapproval' && data?.id) {
					const preapprovalId = data.id;
					console.log(`[WEBHOOK] Processing subscription_preapproval ${preapprovalId}, action: ${action}`);

					try {
						// Fetch preapproval details from Mercado Pago
						const preapprovalInfo = await mpRequest<MpPreapprovalResponse>(
							env.MERCADOPAGO_ACCESS_TOKEN,
							`/preapproval/${preapprovalId}`
						);

						const status = preapprovalInfo.status;

						// Update subscription in Firestore
						await firestoreRequest(
							env.FIREBASE_PROJECT_ID,
							`subscriptions/${preapprovalId}?updateMask.fieldPaths=status&updateMask.fieldPaths=next_payment_date`,
							'PATCH',
							{
								fields: {
									status: { stringValue: status },
									next_payment_date: { stringValue: preapprovalInfo.next_payment_date || '' },
								},
							}
						);

						// Get member ID from subscription
						const subscriptionDoc = await firestoreRequest<FirestoreDocument>(
							env.FIREBASE_PROJECT_ID,
							`subscriptions/${preapprovalId}`
						);
						const memberId = subscriptionDoc.fields?.member_id?.stringValue;
						const plan = subscriptionDoc.fields?.plan?.stringValue;

						if (memberId) {
							// Update member subscription status
							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`members/${memberId}?updateMask.fieldPaths=subscription_status`,
								'PATCH',
								{ fields: { subscription_status: { stringValue: status } } }
							);

							// Handle status-specific actions
							if (status === 'authorized') {
								// Activate member
								const expiryDate = new Date();
								const frequencyType = subscriptionDoc.fields?.frequency_type?.stringValue;
								if (frequencyType === 'years') {
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
							} else if (status === 'cancelled') {
								await firestoreRequest(
									env.FIREBASE_PROJECT_ID,
									`members/${memberId}?updateMask.fieldPaths=auto_renewal`,
									'PATCH',
									{ fields: { auto_renewal: { booleanValue: false } } }
								);

								// Send cancellation email
								if (env.RESEND_API_KEY) {
									const memberDoc = await firestoreRequest<FirestoreDocument>(
										env.FIREBASE_PROJECT_ID,
										`members/${memberId}`
									);
									const email = memberDoc.fields?.email?.stringValue;
									const name = memberDoc.fields?.full_name?.stringValue;

									if (email && name) {
										sendEmail(
											env.RESEND_API_KEY,
											email,
											'subscription-cancelled',
											{ nome: name, plano: plan || 'Clube' },
											env.FROM_EMAIL
										).catch(err => console.error('[WEBHOOK] Email error:', err));
									}
								}
							}
						}

						console.log(`[WEBHOOK] Updated subscription ${preapprovalId} to status: ${status}`);
					} catch (error) {
						console.error(`[WEBHOOK] Subscription preapproval error:`, error);
						return jsonResponse({ error: 'Subscription update failed' }, 500, origin);
					}

					return new Response('OK', { status: 200 });
				}

				// Handle subscription authorized payment events
				if (type === 'subscription_authorized_payment' && data?.id) {
					const authorizedPaymentId = data.id;
					console.log(`[WEBHOOK] Processing subscription_authorized_payment ${authorizedPaymentId}`);

					try {
						// Fetch authorized payment details
						const paymentInfo = await mpRequest<MpAuthorizedPaymentResponse>(
							env.MERCADOPAGO_ACCESS_TOKEN,
							`/authorized_payments/${authorizedPaymentId}`
						);

						const preapprovalId = paymentInfo.preapproval_id;
						const paymentStatus = paymentInfo.payment?.status || paymentInfo.status;
						const amount = paymentInfo.transaction_amount;
						const now = new Date().toISOString();

						// Get subscription info
						const subscriptionDoc = await firestoreRequest<FirestoreDocument>(
							env.FIREBASE_PROJECT_ID,
							`subscriptions/${preapprovalId}`
						);

						if (!subscriptionDoc.fields) {
							console.error(`[WEBHOOK] Subscription ${preapprovalId} not found`);
							return new Response('OK', { status: 200 });
						}

						const memberId = subscriptionDoc.fields.member_id?.stringValue;
						const plan = subscriptionDoc.fields.plan?.stringValue;
						const cardLastFour = subscriptionDoc.fields.card_last_four?.stringValue;
						const frequencyType = subscriptionDoc.fields.frequency_type?.stringValue;
						const currentFailedPayments = parseInt(subscriptionDoc.fields.failed_payments?.integerValue || '0', 10);

						// Save payment record
						const paymentRecordId = `sp_${authorizedPaymentId}`;
						await firestoreRequest(
							env.FIREBASE_PROJECT_ID,
							`subscription_payments/${paymentRecordId}`,
							'PATCH',
							{
								fields: {
									subscription_id: { stringValue: preapprovalId },
									member_id: { stringValue: memberId || '' },
									amount: { doubleValue: amount || 0 },
									status: { stringValue: paymentStatus },
									payment_date: { timestampValue: now },
									mercado_pago_payment_id: { stringValue: String(paymentInfo.payment?.id || authorizedPaymentId) },
								},
							}
						);

						if (paymentStatus === 'approved') {
							// Calculate next expiry date
							const expiryDate = new Date();
							if (frequencyType === 'years') {
								expiryDate.setFullYear(expiryDate.getFullYear() + 1);
							} else {
								expiryDate.setMonth(expiryDate.getMonth() + 1);
							}

							// Update subscription
							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`subscriptions/${preapprovalId}?updateMask.fieldPaths=last_payment_date&updateMask.fieldPaths=failed_payments`,
								'PATCH',
								{
									fields: {
										last_payment_date: { timestampValue: now },
										failed_payments: { integerValue: '0' },
									},
								}
							);

							// Update member
							if (memberId) {
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

								// Send payment confirmation email
								if (env.RESEND_API_KEY) {
									const memberDoc = await firestoreRequest<FirestoreDocument>(
										env.FIREBASE_PROJECT_ID,
										`members/${memberId}`
									);
									const email = memberDoc.fields?.email?.stringValue;
									const name = memberDoc.fields?.full_name?.stringValue;

									// Get next payment date
									const preapprovalInfo = await mpRequest<MpPreapprovalResponse>(
										env.MERCADOPAGO_ACCESS_TOKEN,
										`/preapproval/${preapprovalId}`
									);

									if (email && name) {
										sendEmail(
											env.RESEND_API_KEY,
											email,
											'subscription-payment',
											{
												nome: name,
												valor: amount?.toFixed(2).replace('.', ',') || '0,00',
												plano: plan || 'Clube',
												cartao: cardLastFour ? `**** ${cardLastFour}` : 'N/A',
												proxima_cobranca: preapprovalInfo.next_payment_date
													? new Date(preapprovalInfo.next_payment_date).toLocaleDateString('pt-BR')
													: 'N/A',
											},
											env.FROM_EMAIL
										).catch(err => console.error('[WEBHOOK] Email error:', err));
									}
								}
							}

							console.log(`[WEBHOOK] Subscription payment approved for ${preapprovalId}`);
						} else if (paymentStatus === 'rejected') {
							const newFailedPayments = currentFailedPayments + 1;

							// Update failed payments counter
							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`subscriptions/${preapprovalId}?updateMask.fieldPaths=failed_payments`,
								'PATCH',
								{ fields: { failed_payments: { integerValue: String(newFailedPayments) } } }
							);

							// After 3 failed attempts, cancel subscription
							if (newFailedPayments >= 3) {
								// Cancel in Mercado Pago
								await mpRequest<MpPreapprovalResponse>(
									env.MERCADOPAGO_ACCESS_TOKEN,
									`/preapproval/${preapprovalId}`,
									'PUT',
									{ status: 'cancelled' }
								);

								await firestoreRequest(
									env.FIREBASE_PROJECT_ID,
									`subscriptions/${preapprovalId}?updateMask.fieldPaths=status&updateMask.fieldPaths=cancelled_at`,
									'PATCH',
									{
										fields: {
											status: { stringValue: 'cancelled' },
											cancelled_at: { timestampValue: now },
										},
									}
								);

								if (memberId) {
									await firestoreRequest(
										env.FIREBASE_PROJECT_ID,
										`members/${memberId}?updateMask.fieldPaths=status&updateMask.fieldPaths=subscription_status&updateMask.fieldPaths=auto_renewal`,
										'PATCH',
										{
											fields: {
												status: { stringValue: 'expired' },
												subscription_status: { stringValue: 'cancelled' },
												auto_renewal: { booleanValue: false },
											},
										}
									);
								}

								console.log(`[WEBHOOK] Subscription ${preapprovalId} cancelled after 3 failed payments`);
							} else {
								// Send payment failed email
								if (env.RESEND_API_KEY && memberId) {
									const memberDoc = await firestoreRequest<FirestoreDocument>(
										env.FIREBASE_PROJECT_ID,
										`members/${memberId}`
									);
									const email = memberDoc.fields?.email?.stringValue;
									const name = memberDoc.fields?.full_name?.stringValue;

									if (email && name) {
										sendEmail(
											env.RESEND_API_KEY,
											email,
											'subscription-payment-failed',
											{
												nome: name,
												valor: amount?.toFixed(2).replace('.', ',') || '0,00',
												motivo: paymentInfo.status_detail || 'Pagamento recusado',
												tentativas_restantes: String(3 - newFailedPayments),
											},
											env.FROM_EMAIL
										).catch(err => console.error('[WEBHOOK] Email error:', err));
									}
								}

								console.log(`[WEBHOOK] Subscription payment failed for ${preapprovalId} (${newFailedPayments}/3)`);
							}
						}
					} catch (error) {
						console.error(`[WEBHOOK] Subscription payment error:`, error);
						return jsonResponse({ error: 'Payment processing failed' }, 500, origin);
					}

					return new Response('OK', { status: 200 });
				}

				// Handle regular payment events (PIX, one-time payments)
				if (type === 'payment' && data?.id) {
					const paymentId = data.id;
					console.log(`[WEBHOOK] Processing payment ${paymentId}`);

					// IDEMPOTENCY CHECK: Check if this webhook was already processed
					try {
						const existingPayment = await firestoreRequest<FirestoreDocument>(
							env.FIREBASE_PROJECT_ID,
							`payments/${paymentId}`
						);

						const existingStatus = existingPayment.fields?.status?.stringValue;
						const webhookProcessedAt = existingPayment.fields?.webhook_processed_at?.timestampValue;

						// If already processed as 'paid', skip to avoid duplicate processing
						if (existingStatus === 'paid' && webhookProcessedAt) {
							console.log(`[WEBHOOK] Payment ${paymentId} already processed at ${webhookProcessedAt} - skipping`);
							return new Response('OK - Already processed', { status: 200 });
						}
					} catch {
						// Payment doesn't exist in Firestore yet, continue processing
						console.log(`[WEBHOOK] Payment ${paymentId} not found in Firestore, will create`);
					}

					// Fetch payment details from Mercado Pago
					const paymentInfo = await mpRequest<MpPaymentResponse>(env.MERCADOPAGO_ACCESS_TOKEN, `/v1/payments/${paymentId}`);

					const memberId = paymentInfo.external_reference;
					const status = paymentInfo.status;
					const amount = paymentInfo.transaction_amount;

					console.log(`[WEBHOOK] Payment ${paymentId}: status=${status}, memberId=${memberId}, amount=${amount}`);

					// Map Mercado Pago status to our status
					const paymentStatus = status === 'approved' ? 'paid' :
						status === 'pending' || status === 'in_process' ? 'pending' :
						status === 'refunded' ? 'refunded' : 'failed';

					// Update payment in Firestore with webhook_processed_at for idempotency
					const now = new Date().toISOString();
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`payments/${paymentId}?updateMask.fieldPaths=status&updateMask.fieldPaths=paid_at&updateMask.fieldPaths=webhook_processed_at&updateMask.fieldPaths=mercadopago_status`,
						'PATCH',
						{
							fields: {
								status: { stringValue: paymentStatus },
								mercadopago_status: { stringValue: status },
								webhook_processed_at: { timestampValue: now },
								...(status === 'approved' && { paid_at: { timestampValue: now } }),
							},
						}
					);

					console.log(`[WEBHOOK] Payment ${paymentId} updated to status: ${paymentStatus}`);

					// If approved, activate member
					if (status === 'approved' && memberId) {
						try {
							// Fetch member data
							const memberData = await firestoreRequest<FirestoreDocument>(env.FIREBASE_PROJECT_ID, `members/${memberId}`);

							// Check if member is already active (idempotency)
							const currentMemberStatus = memberData.fields?.status?.stringValue;
							if (currentMemberStatus === 'active') {
								console.log(`[WEBHOOK] Member ${memberId} already active - skipping activation`);
							} else {
								// Calculate expiry date based on payment type
								const expiryDate = new Date();
								const paymentType = memberData.fields?.payment_type?.stringValue || 'monthly';

								if (paymentType === 'annual') {
									expiryDate.setFullYear(expiryDate.getFullYear() + 1);
								} else {
									expiryDate.setMonth(expiryDate.getMonth() + 1);
								}

								const expiryDateStr = expiryDate.toISOString().split('T')[0];
								const startDateStr = new Date().toISOString().split('T')[0];

								// Activate member
								await firestoreRequest(
									env.FIREBASE_PROJECT_ID,
									`members/${memberId}?updateMask.fieldPaths=status&updateMask.fieldPaths=expiry_date&updateMask.fieldPaths=start_date&updateMask.fieldPaths=activated_at&updateMask.fieldPaths=activated_by_payment`,
									'PATCH',
									{
										fields: {
											status: { stringValue: 'active' },
											expiry_date: { stringValue: expiryDateStr },
											start_date: { stringValue: startDateStr },
											activated_at: { timestampValue: now },
											activated_by_payment: { stringValue: paymentId },
										},
									}
								);

								console.log(`[WEBHOOK] Member ${memberId} activated successfully. Expiry: ${expiryDateStr}`);

								// Clear pending_payment from member
								try {
									await firestoreRequest(
										env.FIREBASE_PROJECT_ID,
										`members/${memberId}?updateMask.fieldPaths=pending_payment`,
										'PATCH',
										{
											fields: {
												pending_payment: { nullValue: null },
											},
										}
									);
								} catch {
									// Ignore error if pending_payment field doesn't exist
								}

								// Send confirmation email (non-blocking)
								if (env.RESEND_API_KEY) {
									const memberEmail = memberData.fields?.email?.stringValue;
									const memberName = memberData.fields?.full_name?.stringValue;
									const plan = memberData.fields?.plan?.stringValue;

									if (memberEmail && memberName) {
										sendEmail(
											env.RESEND_API_KEY,
											memberEmail,
											'payment-confirmed',
											{
												nome: memberName,
												valor: amount?.toFixed(2).replace('.', ',') || '0,00',
												plano: plan || 'Clube',
												validade: expiryDateStr,
											},
											env.FROM_EMAIL
										).catch(err => console.error('[WEBHOOK] Email send error:', err));
									}
								}
							}
						} catch (e) {
							console.error(`[WEBHOOK] Member activation error for ${memberId}:`, e);
							// Return 500 to trigger webhook retry from Mercado Pago
							return jsonResponse({ error: 'Member activation failed' }, 500, origin);
						}
					} else if (status === 'approved' && !memberId) {
						console.error(`[WEBHOOK] CRITICAL: Payment ${paymentId} approved but no memberId (external_reference) found!`);
					}
				}

				return new Response('OK', { status: 200 });
			}

			// ============================================
			// AUTH ROUTES
			// ============================================

			// Send Verification Email
			if (path === '/auth/send-verification-email' && method === 'POST') {
				try {
					const body = await request.json() as VerificationEmailBody;

					if (!body.email || !body.uid) {
						return jsonResponse({ error: 'Missing email or uid' }, 400, origin);
					}

					if (!env.FIREBASE_API_KEY) {
						return jsonResponse({ error: 'Firebase API key not configured' }, 500, origin);
					}

					if (!env.RESEND_API_KEY) {
						return jsonResponse({ error: 'Email service not configured' }, 500, origin);
					}

					// Generate verification link using Firebase Auth REST API
					const continueUrl = `${env.FRONTEND_URL}/verificar-email`;

					const firebaseResponse = await fetch(
						`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${env.FIREBASE_API_KEY}`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								requestType: 'VERIFY_EMAIL',
								email: body.email,
								continueUrl: continueUrl,
								canHandleCodeInApp: false,
							}),
						}
					);

					const firebaseData = await firebaseResponse.json() as FirebaseOobCodeResponse;

					if (!firebaseResponse.ok || firebaseData.error) {
						console.error('[AUTH] Firebase error:', firebaseData.error);
						return jsonResponse({
							error: firebaseData.error?.message || 'Failed to generate verification link',
						}, 500, origin);
					}

					// The sendOobCode endpoint with VERIFY_EMAIL already sends an email via Firebase
					// But we want to use our custom template, so we need to use a different approach
					// We'll generate the link using the admin endpoint instead

					// Use Firebase Auth REST API to generate email verification link
					// This requires the Identity Toolkit API with admin credentials
					// Since we can't use Firebase Admin SDK in Workers, we'll use a workaround:
					// Generate the link using the getOobConfirmationCode endpoint

					// Actually, the sendOobCode already sends the email via Firebase
					// To use custom email, we need to disable "Email Action Handlers" in Firebase Console
					// and use the action URL with custom handling

					// For now, let's use a different approach:
					// 1. Use Firebase's email link generation (which sends via Firebase)
					// 2. OR implement our own verification system

					// The cleanest solution without Firebase Admin SDK:
					// Generate a custom verification token and handle it ourselves
					// But this requires changes to the verification flow

					// Alternative: Use the email that Firebase sends but customize the template
					// in Firebase Console, or use the Action URL approach

					// For this implementation, since sendOobCode already sent the Firebase email,
					// we'll also send our custom email with the same link concept
					// This requires getting the verification link differently

					// Let's try a different approach - generate link manually
					// Firebase verification links have a specific format we can construct

					// The best approach for Workers is to use Firebase's email action URL
					// and customize the landing page, but for truly custom emails we need
					// to implement our own token system

					// For now, let's send a welcome-style email and rely on Firebase's email
					// OR implement custom verification token

					// IMPLEMENTATION: Custom verification using Firestore
					// Generate a token, store in Firestore, send custom email, verify on callback

					const verificationToken = crypto.randomUUID();
					const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

					// Store verification token in Firestore
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`email_verifications/${verificationToken}`,
						'PATCH',
						{
							fields: {
								uid: { stringValue: body.uid },
								email: { stringValue: body.email },
								expires_at: { timestampValue: expiresAt },
								verified: { booleanValue: false },
								created_at: { timestampValue: new Date().toISOString() },
							},
						}
					);

					// Build verification link
					const verificationLink = `${env.FRONTEND_URL}/verificar-email?token=${verificationToken}`;

					// Send custom email via Resend
					const emailResult = await sendEmail(
						env.RESEND_API_KEY,
						body.email,
						'verify-email',
						{
							nome: body.name || 'Membro',
							verification_link: verificationLink,
						},
						env.FROM_EMAIL
					);

					if (!emailResult.success) {
						console.error('[AUTH] Email send error:', emailResult.error);
						return jsonResponse({ error: emailResult.error || 'Failed to send email' }, 500, origin);
					}

					console.log(`[AUTH] Verification email sent to ${body.email}`);
					return jsonResponse({ success: true }, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[AUTH] Verification email error:', err);
					return jsonResponse({ error: err.message || 'Failed to send verification email' }, 500, origin);
				}
			}

			// Verify Email Token
			if (path === '/auth/verify-email' && method === 'POST') {
				try {
					const body = await request.json() as { token: string };

					if (!body.token) {
						return jsonResponse({ error: 'Missing token' }, 400, origin);
					}

					// Get verification record from Firestore
					let verificationDoc: FirestoreDocument;
					try {
						verificationDoc = await firestoreRequest<FirestoreDocument>(
							env.FIREBASE_PROJECT_ID,
							`email_verifications/${body.token}`
						);
					} catch {
						return jsonResponse({ error: 'Invalid or expired token' }, 400, origin);
					}

					if (!verificationDoc.fields) {
						return jsonResponse({ error: 'Invalid or expired token' }, 400, origin);
					}

					const expiresAt = verificationDoc.fields.expires_at?.timestampValue;
					const verified = verificationDoc.fields.verified?.booleanValue;
					const uid = verificationDoc.fields.uid?.stringValue;

					if (verified) {
						return jsonResponse({ error: 'Email already verified' }, 400, origin);
					}

					if (expiresAt && new Date(expiresAt) < new Date()) {
						return jsonResponse({ error: 'Token expired' }, 400, origin);
					}

					// Mark as verified in Firestore
					await firestoreRequest(
						env.FIREBASE_PROJECT_ID,
						`email_verifications/${body.token}?updateMask.fieldPaths=verified&updateMask.fieldPaths=verified_at`,
						'PATCH',
						{
							fields: {
								verified: { booleanValue: true },
								verified_at: { timestampValue: new Date().toISOString() },
							},
						}
					);

					// Update user's emailVerified status in Firestore users collection
					if (uid) {
						try {
							await firestoreRequest(
								env.FIREBASE_PROJECT_ID,
								`users/${uid}?updateMask.fieldPaths=emailVerified&updateMask.fieldPaths=emailVerifiedAt`,
								'PATCH',
								{
									fields: {
										emailVerified: { booleanValue: true },
										emailVerifiedAt: { timestampValue: new Date().toISOString() },
									},
								}
							);
						} catch (e) {
							console.error('[AUTH] Error updating user emailVerified:', e);
						}
					}

					console.log(`[AUTH] Email verified for uid ${uid}`);
					return jsonResponse({ success: true, uid }, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[AUTH] Verify email error:', err);
					return jsonResponse({ error: err.message || 'Verification failed' }, 500, origin);
				}
			}

			// Send Password Reset Email
			if (path === '/auth/send-password-reset' && method === 'POST') {
				try {
					const body = await request.json() as PasswordResetBody;

					if (!body.email) {
						return jsonResponse({ error: 'Missing email' }, 400, origin);
					}

					if (!env.FIREBASE_API_KEY) {
						return jsonResponse({ error: 'Firebase API key not configured' }, 500, origin);
					}

					if (!env.RESEND_API_KEY) {
						return jsonResponse({ error: 'Email service not configured' }, 500, origin);
					}

					// Use Firebase Auth REST API to generate password reset link
					const firebaseResponse = await fetch(
						`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${env.FIREBASE_API_KEY}`,
						{
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								requestType: 'PASSWORD_RESET',
								email: body.email,
								returnOobLink: true,
							}),
						}
					);

					const firebaseData = await firebaseResponse.json() as FirebaseOobCodeResponse;

					if (!firebaseResponse.ok || firebaseData.error) {
						const errorMessage = firebaseData.error?.message || 'Failed to generate reset link';
						// Don't expose "EMAIL_NOT_FOUND" to client for security
						if (errorMessage === 'EMAIL_NOT_FOUND') {
							// Return success even if email not found (security best practice)
							console.log('[AUTH] Password reset requested for non-existent email:', body.email);
							return jsonResponse({ success: true }, 200, origin);
						}
						console.error('[AUTH] Firebase password reset error:', errorMessage);
						return jsonResponse({ error: 'Failed to process request' }, 500, origin);
					}

					const resetLink = firebaseData.oobLink;
					if (!resetLink) {
						console.error('[AUTH] No reset link returned from Firebase');
						return jsonResponse({ error: 'Failed to generate reset link' }, 500, origin);
					}

					// Try to get user's name from Firestore for personalization
					let userName = 'Membro';
					try {
						// Query users collection by email
						const queryResult = await firestoreRequest<{ documents?: FirestoreDocument[] }>(
							env.FIREBASE_PROJECT_ID,
							`:runQuery`,
							'POST',
							{
								structuredQuery: {
									from: [{ collectionId: 'members' }],
									where: {
										fieldFilter: {
											field: { fieldPath: 'email' },
											op: 'EQUAL',
											value: { stringValue: body.email },
										},
									},
									limit: 1,
								},
							}
						) as FirestoreQueryResult[];

						if (queryResult[0]?.document?.fields?.fullName?.stringValue) {
							userName = queryResult[0].document.fields.fullName.stringValue;
						}
					} catch {
						console.log('[AUTH] Could not fetch user name, using default');
					}

					// Send custom email via Resend
					const emailResult = await sendEmail(
						env.RESEND_API_KEY,
						body.email,
						'password-reset',
						{
							nome: userName,
							reset_link: resetLink,
						},
						env.FROM_EMAIL
					);

					if (!emailResult.success) {
						console.error('[AUTH] Password reset email send error:', emailResult.error);
						return jsonResponse({ error: emailResult.error || 'Failed to send email' }, 500, origin);
					}

					console.log(`[AUTH] Password reset email sent to ${body.email}`);
					return jsonResponse({ success: true }, 200, origin);
				} catch (error: unknown) {
					const err = error as { message?: string };
					console.error('[AUTH] Password reset error:', err);
					return jsonResponse({ error: err.message || 'Failed to send password reset email' }, 500, origin);
				}
			}

			// ============================================
			// EMAIL ROUTES
			// ============================================

			// Send Email
			if (path === '/email/send' && method === 'POST') {
				if (!env.RESEND_API_KEY) {
					return jsonResponse({ error: 'Email service not configured' }, 500, origin);
				}

				const body = await request.json() as EmailSendBody;
				const { template, to, variables, member_id } = body;

				if (!template || !to) {
					return jsonResponse({ error: 'Missing required fields: template, to' }, 400, origin);
				}

				if (!Object.keys(EMAIL_TEMPLATES).includes(template)) {
					return jsonResponse({
						error: `Invalid template. Valid templates: ${Object.keys(EMAIL_TEMPLATES).join(', ')}`,
					}, 400, origin);
				}

				const result = await sendEmail(env.RESEND_API_KEY, to, template as EmailTemplate, variables || {}, env.FROM_EMAIL);

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

					const paymentsData = await paymentsQuery.json() as FirestoreQueryResult[];

					// Parse payments and filter by date
					let todayRevenue = 0;
					let todayPayments = 0;

					if (Array.isArray(paymentsData)) {
						paymentsData.forEach((doc: FirestoreQueryResult) => {
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

					const membersData = await membersQuery.json() as FirestoreQueryResult[];

					let totalMembers = 0;
					let activeMembers = 0;
					let pendingMembers = 0;
					const byPlan: Record<string, number> = { silver: 0, gold: 0, black: 0 };

					if (Array.isArray(membersData)) {
						membersData.forEach((doc: FirestoreQueryResult) => {
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
				} catch (error: unknown) {
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
					const reports: MonthlyReport[] = [];

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

					const paymentsData = await paymentsQuery.json() as FirestoreQueryResult[];

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

					const pointsData = await pointsQuery.json() as FirestoreQueryResult[];

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
							paymentsData.forEach((doc: FirestoreQueryResult) => {
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
							pointsData.forEach((doc: FirestoreQueryResult) => {
								if (doc.document) {
									const createdAt = doc.document.fields?.created_at?.timestampValue;
									if (createdAt && createdAt >= monthStart && createdAt < monthEnd) {
										const type = doc.document.fields?.type?.stringValue;
										const points = doc.document.fields?.points?.integerValue || '0';

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
				} catch (error: unknown) {
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

					const data = await query.json() as FirestoreQueryResult[];
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
							const memberDoc = await firestoreRequest<FirestoreDocument>(
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
				} catch (error: unknown) {
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

					const data = await query.json() as FirestoreQueryResult[];
					let remindersSent = 0;
					const errors: string[] = [];

					if (Array.isArray(data)) {
						for (const doc of data) {
							if (doc.document) {
								const email = doc.document.fields?.email?.stringValue;
								const fullName = doc.document.fields?.full_name?.stringValue;
								const expiryDate = doc.document.fields?.expiry_date?.stringValue;
								const memberId = doc.document.name.split('/').pop();

								if (email && fullName && expiryDate) {
									const result = await sendEmail(
										env.RESEND_API_KEY,
										email,
										'renewal-reminder',
										{
											nome: fullName,
											validade: new Date(expiryDate).toLocaleDateString('pt-BR'),
										},
										env.FROM_EMAIL
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
				} catch (error: unknown) {
					console.error('Renewal reminders error:', error);
					return jsonResponse({ error: 'Failed to send renewal reminders' }, 500, origin);
				}
			}

			// ============================================
			// CONTRACT EMAIL ROUTE
			// ============================================

			// Send Contract Email with PDF attachment
			if (path === '/email/send-contract' && method === 'POST') {
				if (!env.RESEND_API_KEY) {
					return jsonResponse({ error: 'Email service not configured' }, 500, origin);
				}

				const body = await request.json() as ContractEmailBody;
				const { to, member_name, plan, signed_at, hash, pdf_base64, admin_email } = body;

				if (!to || !member_name || !plan || !signed_at || !pdf_base64) {
					return jsonResponse({ error: 'Missing required fields: to, member_name, plan, signed_at, pdf_base64' }, 400, origin);
				}

				// Format date for display
				const signedDate = new Date(signed_at);
				const formattedDate = signedDate.toLocaleString('pt-BR', {
					day: '2-digit',
					month: '2-digit',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit',
				});

				// Get template HTML
				const templateConfig = EMAIL_TEMPLATES['contract-signed'];
				const htmlContent = templateConfig.html({
					nome: member_name,
					plano: plan,
					data_assinatura: formattedDate,
					hash: hash || '',
				});

				// Prepare filename
				const fileName = `contrato_${member_name.replace(/\s+/g, '_')}_${signedDate.toISOString().split('T')[0]}.pdf`;

				try {
					// Send email to member with PDF attachment using Resend API
					const memberEmailResult = await fetch('https://api.resend.com/emails', {
						method: 'POST',
						headers: {
							'Authorization': `Bearer ${env.RESEND_API_KEY}`,
							'Content-Type': 'application/json',
						},
						body: JSON.stringify({
							from: env.FROM_EMAIL || DEFAULT_FROM_EMAIL,
							to: [to],
							subject: templateConfig.subject,
							html: htmlContent,
							attachments: [
								{
									filename: fileName,
									content: pdf_base64,
								},
							],
						}),
					});

					const memberResult = await memberEmailResult.json() as ResendResponse;

					if (!memberEmailResult.ok) {
						console.error('Failed to send contract email to member:', memberResult);
						return jsonResponse({ error: memberResult.message || 'Failed to send email' }, 500, origin);
					}

					// Send copy to admin (if configured)
					const adminTo = admin_email || 'admin@geeketoys.com.br';
					try {
						await fetch('https://api.resend.com/emails', {
							method: 'POST',
							headers: {
								'Authorization': `Bearer ${env.RESEND_API_KEY}`,
								'Content-Type': 'application/json',
							},
							body: JSON.stringify({
								from: env.FROM_EMAIL || DEFAULT_FROM_EMAIL,
								to: [adminTo],
								subject: `[Admin] Contrato Assinado - ${member_name}`,
								html: `
									<p>Um novo contrato foi assinado:</p>
									<ul>
										<li><strong>Nome:</strong> ${member_name}</li>
										<li><strong>Email:</strong> ${to}</li>
										<li><strong>Plano:</strong> ${plan}</li>
										<li><strong>Data:</strong> ${formattedDate}</li>
										<li><strong>Hash:</strong> ${hash || 'N/A'}</li>
									</ul>
									<p>O contrato está anexado a este email.</p>
								`,
								attachments: [
									{
										filename: fileName,
										content: pdf_base64,
									},
								],
							}),
						});
					} catch (adminError) {
						console.error('Failed to send admin copy:', adminError);
						// Don't fail the request if admin email fails
					}

					// Log email in Firestore
					try {
						const logId = `contract_email_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
						await firestoreRequest(env.FIREBASE_PROJECT_ID, `email_logs/${logId}`, 'PATCH', {
							fields: {
								type: { stringValue: 'contract' },
								recipient: { stringValue: to },
								member_name: { stringValue: member_name },
								plan: { stringValue: plan },
								hash: { stringValue: hash || '' },
								status: { stringValue: 'sent' },
								sent_at: { timestampValue: new Date().toISOString() },
								resend_id: { stringValue: memberResult.id || '' },
							},
						});
					} catch (e) {
						console.error('Contract email log save error:', e);
					}

					return jsonResponse({
						success: true,
						message: 'Contract email sent successfully',
						id: memberResult.id,
					}, 200, origin);

				} catch (error: unknown) {
					console.error('Contract email error:', error);
					const err = error as { message?: string };
					return jsonResponse({ error: err.message || 'Failed to send contract email' }, 500, origin);
				}
			}

			// 404
			return jsonResponse({ error: 'Not found' }, 404, origin);

		} catch (error: unknown) {
			console.error('Handler error:', error);
			const err = error as { message?: string };
			return jsonResponse({ error: err.message || 'Internal server error' }, 500, origin);
		}
	},

	// ============================================
	// SCHEDULED HANDLER (Cron Triggers)
	// ============================================

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
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
