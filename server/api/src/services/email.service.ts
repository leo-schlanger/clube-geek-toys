import { env } from '../config/env.js';
import { query } from '../config/database.js';

/** Escape HTML special characters for safe use in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const RESEND_API_URL = 'https://api.resend.com/emails';

const AVAILABLE_TEMPLATES = [
  'welcome', 'payment-confirmed', 'payment-failed', 'renewal-reminder',
  'subscription-created', 'subscription-payment',
  'subscription-paused', 'subscription-resumed', 'subscription-cancelled',
  'subscription-payment-failed', 'member-expired',
  'verify-email', 'password-reset', 'contract-signed', 'admin-pix-pending',
  'admin-new-member', 'order-confirmed',
];

export function getAvailableTemplates() {
  return AVAILABLE_TEMPLATES;
}

export async function sendTemplateEmail(data: {
  template: string;
  to: string;
  variables?: Record<string, string>;
  member_id?: string;
}) {
  const { template, to, variables = {} } = data;

  // Sanitize variables
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(variables)) {
    sanitized[key] = escapeHtml(String(value));
  }

  const { subject, html } = renderTemplate(template, sanitized);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    const result = await response.json() as Record<string, unknown>;

    // Log email
    await query(
      `INSERT INTO email_logs (member_id, template, recipient, status, resend_id, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        data.member_id || null,
        template,
        to,
        response.ok ? 'sent' : 'failed',
        result.id || null,
        response.ok ? null : JSON.stringify(result),
      ]
    ).catch((err) => console.error('[EMAIL] Log error:', err));

    if (!response.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(result)}`);
    }

    return { id: result.id, status: 'sent' };
  } catch (err) {
    console.error(`[EMAIL] Failed to send ${template} to ${to}:`, err);
    throw err;
  }
}

export async function sendContractEmail(data: {
  to: string;
  member_name: string;
  plan: string;
  signed_at: string;
  hash: string;
  pdf_base64: string;
  admin_email?: string;
}) {
  const { subject, html } = renderTemplate('contract-signed', {
    name: escapeHtml(data.member_name),
    plan: escapeHtml(data.plan),
    signed_at: escapeHtml(data.signed_at),
    hash: escapeHtml(data.hash),
  });

  const attachments = [
    {
      filename: `contrato_${data.member_name.replace(/\s+/g, '_')}.pdf`,
      content: data.pdf_base64,
    },
  ];

  // Send to member
  await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to: [data.to],
      subject,
      html,
      attachments,
    }),
  });

  // Send copy to admin (use explicit admin_email or fallback to env.ADMIN_EMAIL)
  const adminRecipient = data.admin_email || env.ADMIN_EMAIL;
  if (adminRecipient && adminRecipient !== data.to) {
    await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [adminRecipient],
        subject: `[Cópia] ${subject}`,
        html,
        attachments,
      }),
    }).catch((err) => console.error('[EMAIL] Admin copy error:', err));
  }

  return { status: 'sent' };
}

// ============================================
// Template System
// ============================================

interface TemplateDefinition {
  subject: string;
  preheader: string;
  body: string;
  cta?: { text: string; url: string };
}

function renderTemplate(template: string, vars: Record<string, string>): { subject: string; html: string } {
  const v = vars;
  const name = v.name || 'Membro';
  const frontendUrl = env.FRONTEND_URL;

  const templates: Record<string, TemplateDefinition> = {

    // ─── AUTH ────────────────────────────────────────────
    'verify-email': {
      subject: 'Verifique seu e-mail — Clube GeekPop & Toys',
      preheader: 'Clique para confirmar seu e-mail e ativar sua conta.',
      body: `
        <h2 style="color:#d4a520;margin:0 0 12px">Confirme seu e-mail</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Você criou uma conta no <strong>Clube GeekPop & Toys</strong>. Para prosseguir, confirme seu endereço de e-mail clicando no botão abaixo.</p>
        ${infoBox('⏳ Este link expira em <strong>24 horas</strong>.<br>Se você não criou esta conta, ignore este e-mail.')}`,
      cta: { text: 'Confirmar E-mail', url: v.verify_url || '#' },
    },

    'password-reset': {
      subject: 'Redefinição de senha — Clube GeekPop & Toys',
      preheader: 'Você solicitou a redefinição da sua senha.',
      body: `
        <h2 style="color:#d4a520;margin:0 0 12px">Redefinir sua senha</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
        <p>Clique no botão abaixo para escolher uma nova senha:</p>
        ${infoBox('⏳ Este link expira em <strong>1 hora</strong>.<br>Se você não solicitou isso, pode ignorar este e-mail com segurança — sua conta permanece protegida.')}`,
      cta: { text: 'Redefinir Senha', url: v.reset_url || '#' },
    },

    // ─── ONBOARDING ─────────────────────────────────────
    'welcome': {
      subject: 'Bem-vindo ao Clube GeekPop & Toys! 🎮',
      preheader: `${name}, você agora é membro ${v.plan || ''} do clube!`,
      body: `
        <h2 style="color:#d4a520;margin:0 0 12px">Bem-vindo, ${name}! 🎮</h2>
        <p>Sua conta no <strong>Clube GeekPop & Toys</strong> foi ativada com sucesso${v.plan ? ` no plano <strong>${v.plan}</strong>` : ''}. Você agora faz parte da nossa comunidade geek!</p>
        <p style="margin:16px 0 8px;font-weight:600;color:#fff">O que você ganha como membro:</p>
        ${featureList([
          '🏷️ 15% de desconto em qualquer produto',
          '🎁 Brinde especial + eventos',
          '📋 Carteirinha digital com QR Code',
        ])}`,
      cta: { text: 'Ver Minha Carteirinha', url: `${frontendUrl}/membro` },
    },

    // ─── PAGAMENTOS ─────────────────────────────────────
    'payment-confirmed': {
      subject: 'Pagamento confirmado — Clube GeekPop & Toys',
      preheader: `Seu pagamento de R$ ${v.amount || '0,00'} foi aprovado.`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Pagamento confirmado! ✅</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu pagamento foi processado com sucesso. Confira os detalhes:</p>
        ${dataTable([
          ['Valor', `<strong style="color:#4ade80">R$ ${v.amount || '0,00'}</strong>`],
          ['Plano', v.plan || '—'],
          ...(v.expiry_date ? [['Válido até', v.expiry_date]] : []),
        ])}
        <p style="margin-top:16px">Sua carteirinha digital já está disponível!</p>`,
      cta: { text: 'Ver Minha Carteirinha', url: `${frontendUrl}/membro` },
    },

    'order-confirmed': {
      subject: 'Pedido confirmado — Loja GeekPop & Toys',
      preheader: `Recebemos o pagamento do seu pedido #${v.order_number || ''}.`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Pedido confirmado! 🛍️</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Recebemos o pagamento do seu pedido. Já estamos preparando tudo com carinho.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Total', `<strong style="color:#4ade80">R$ ${v.total || '0,00'}</strong>`],
        ])}
        <p style="margin-top:16px">Você receberá novidades sobre o envio em breve.</p>`,
      cta: { text: 'Continuar comprando', url: 'https://shop.geeketoys.com.br' },
    },

    'payment-failed': {
      subject: 'Pagamento não aprovado — Clube GeekPop & Toys',
      preheader: 'Houve um problema com seu pagamento. Veja como resolver.',
      body: `
        <h2 style="color:#f87171;margin:0 0 12px">Pagamento não aprovado</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Infelizmente seu pagamento não foi aprovado. Isso pode acontecer por diversos motivos, como limite insuficiente ou dados incorretos.</p>
        ${infoBox('💡 <strong>O que fazer:</strong><br>• Verifique o limite do seu cartão<br>• Confira se os dados estão corretos<br>• Tente outro método de pagamento (PIX)')}`,
      cta: { text: 'Tentar Novamente', url: `${frontendUrl}/membro` },
    },

    // ─── ASSINATURA ─────────────────────────────────────
    'subscription-created': {
      subject: 'Assinatura ativada — Clube GeekPop & Toys',
      preheader: `${name}, sua assinatura do plano ${v.plan || ''} está ativa!`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Assinatura ativada! 🎉</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua assinatura recorrente foi ativada com sucesso:</p>
        ${dataTable([
          ['Plano', `<strong>${v.plan || '—'}</strong>`],
          ['Valor mensal', `R$ ${v.amount || '0,00'}`],
          ['Cartão', `•••• ${v.card_last_four || '****'}`],
        ])}
        ${infoBox('💳 A cobrança será feita automaticamente no cartão cadastrado.<br>📅 Você pode pausar ou cancelar a qualquer momento.')}`,
      cta: { text: 'Gerenciar Assinatura', url: `${frontendUrl}/membro` },
    },

    'subscription-payment': {
      subject: 'Cobrança recorrente processada — Clube GeekPop & Toys',
      preheader: `Cobrança de R$ ${v.amount || '0,00'} processada com sucesso.`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Cobrança processada ✅</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua cobrança recorrente foi processada com sucesso:</p>
        ${dataTable([
          ['Valor', `<strong style="color:#4ade80">R$ ${v.amount || '0,00'}</strong>`],
          ['Plano', v.plan || '—'],
          ['Próxima cobrança', v.next_payment || '—'],
        ])}
        <p style="margin-top:12px">Sua assinatura continua ativa. Obrigado pela confiança!</p>`,
      cta: { text: 'Ver Minha Conta', url: `${frontendUrl}/membro` },
    },

    'subscription-paused': {
      subject: 'Assinatura pausada — Clube GeekPop & Toys',
      preheader: 'Sua assinatura foi pausada. Reative quando quiser.',
      body: `
        <h2 style="color:#fbbf24;margin:0 0 12px">Assinatura pausada ⏸️</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Sua assinatura foi pausada conforme solicitado. Enquanto pausada:</p>
        ${featureList([
          '❌ Não haverá cobranças no seu cartão',
          '✅ Seus benefícios continuam válidos até o vencimento',
          '✅ Você pode reativar a qualquer momento',
        ])}`,
      cta: { text: 'Reativar Assinatura', url: `${frontendUrl}/membro` },
    },

    'subscription-resumed': {
      subject: 'Assinatura reativada — Clube GeekPop & Toys',
      preheader: `${name}, sua assinatura foi reativada com sucesso!`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Assinatura reativada! ▶️</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua assinatura foi reativada com sucesso. As cobranças automáticas foram retomadas e todos os benefícios do seu plano estão ativos.</p>
        ${infoBox('✅ Seus benefícios voltam a valer normalmente.<br>💳 A próxima cobrança será feita automaticamente.')}`,
      cta: { text: 'Ver Minha Conta', url: `${frontendUrl}/membro` },
    },

    'subscription-cancelled': {
      subject: 'Assinatura cancelada — Clube GeekPop & Toys',
      preheader: 'Sua assinatura foi cancelada. Sentiremos sua falta!',
      body: `
        <h2 style="color:#f87171;margin:0 0 12px">Assinatura cancelada</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Sua assinatura foi cancelada. Sentiremos sua falta!</p>
        <p>Lembre-se: você pode voltar a qualquer momento e reassinar para aproveitar todos os benefícios do clube.</p>`,
      cta: { text: 'Voltar ao Clube', url: frontendUrl },
    },

    'subscription-payment-failed': {
      subject: 'Falha na cobrança recorrente — Clube GeekPop & Toys',
      preheader: 'Não conseguimos processar sua cobrança. Atualize seu cartão.',
      body: `
        <h2 style="color:#f87171;margin:0 0 12px">Falha na cobrança recorrente</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Não foi possível processar sua cobrança recorrente de <strong>R$ ${v.amount || '0,00'}</strong>.</p>
        ${infoBox(`⚠️ <strong>Tentativa ${v.failed_count || '?'} de 3.</strong><br>Após 3 falhas consecutivas, a assinatura será cancelada automaticamente.<br><br>💡 Verifique se seu cartão está válido e com limite disponível.`)}`,
      cta: { text: 'Atualizar Cartão', url: `${frontendUrl}/membro` },
    },

    // ─── RENOVAÇÃO ──────────────────────────────────────
    'renewal-reminder': {
      subject: 'Sua assinatura expira em breve — Clube GeekPop & Toys',
      preheader: `${name}, renove para continuar aproveitando os benefícios!`,
      body: `
        <h2 style="color:#fbbf24;margin:0 0 12px">Sua assinatura expira em breve ⚠️</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua assinatura do plano <strong>${v.plan || ''}</strong> expira em <strong>${v.expiry_date || 'alguns dias'}</strong>.</p>
        <p>Renove agora para não perder seus benefícios:</p>
        ${featureList([
          '🏷️ 15% de desconto em qualquer produto',
          '🎁 Brinde especial',
          '🎮 Acesso a eventos especiais',
        ])}`,
      cta: { text: 'Renovar Agora', url: `${frontendUrl}/membro` },
    },

    'member-expired': {
      subject: 'Sua assinatura expirou — Clube GeekPop & Toys',
      preheader: `${name}, sua assinatura expirou. Renove para continuar aproveitando os benefícios!`,
      body: `
        <h2 style="color:#f87171;margin:0 0 12px">Assinatura expirada</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Sua assinatura do plano <strong>${v.plan || ''}</strong> expirou. Enquanto inativa, você não poderá aproveitar os benefícios do clube:</p>
        ${featureList([
          '❌ Desconto do clube suspenso enquanto a assinatura estiver inativa',
        ])}
        <p>Renove agora e volte a aproveitar tudo!</p>`,
      cta: { text: 'Renovar Agora', url: `${frontendUrl}/membro` },
    },

    // ─── CONTRATO ───────────────────────────────────────
    'contract-signed': {
      subject: 'Contrato assinado — Clube GeekPop & Toys',
      preheader: `${name}, seu contrato do plano ${v.plan || ''} foi assinado digitalmente.`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Contrato assinado com sucesso! 📋</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu contrato digital foi assinado eletronicamente conforme a <strong>Lei 14.063/2020</strong>.</p>
        ${dataTable([
          ['Plano', v.plan || '—'],
          ['Data da assinatura', v.signed_at || '—'],
          ['Hash do documento', `<span style="font-family:monospace;font-size:11px;word-break:break-all">${v.hash || '—'}</span>`],
        ])}
        <p style="margin-top:12px;font-size:13px;color:#94a3b8">O PDF do contrato está anexado a este e-mail. Guarde-o para seus registros.</p>`,
      cta: { text: 'Acessar Minha Conta', url: `${frontendUrl}/membro` },
    },

    // ─── ADMIN: PIX PENDENTE ────────────────────────────
    'admin-pix-pending': {
      subject: '🔔 PIX pendente de confirmação — Clube GeekPop & Toys',
      preheader: `Novo pagamento PIX de R$ ${v.amount || '0,00'} aguardando confirmação.`,
      body: `
        <h2 style="color:#f59e0b;margin:0 0 12px">Pagamento PIX pendente 🔔</h2>
        <p>Um novo pagamento via PIX foi gerado e aguarda confirmação manual.</p>
        ${dataTable([
          ['Membro', escapeHtml(v.member_name || '—')],
          ['Email', v.member_email || '—'],
          ['Plano', v.plan || '—'],
          ['Valor', `<strong style="color:#4ade80">R$ ${v.amount || '0,00'}</strong>`],
          ['TX ID', `<span style="font-family:monospace;font-size:11px">${v.tx_id || '—'}</span>`],
          ['Payment ID', `<span style="font-family:monospace;font-size:11px">${v.payment_id || '—'}</span>`],
        ])}
        ${infoBox('📋 <strong>O que fazer:</strong><br>1. Verifique no extrato bancário se o PIX com o TX ID acima foi recebido<br>2. Acesse o painel admin e confirme o pagamento<br>3. O membro será ativado automaticamente após a confirmação')}`,
      cta: { text: 'Abrir Painel Admin', url: v.admin_url || `${frontendUrl}/admin` },
    },

    // ─── ADMIN: NOVO MEMBRO CADASTRADO ─────────────────
    'admin-new-member': {
      subject: '👤 Novo membro cadastrado — Clube GeekPop & Toys',
      preheader: `${v.member_name || 'Novo membro'} se cadastrou no plano ${v.plan || ''}.`,
      body: `
        <h2 style="color:#3b82f6;margin:0 0 12px">Novo membro cadastrado 👤</h2>
        <p>Um novo membro completou o cadastro no clube.</p>
        ${dataTable([
          ['Nome', escapeHtml(v.member_name || '—')],
          ['Email', v.member_email || '—'],
          ['CPF', v.member_cpf || '—'],
          ['Telefone', v.member_phone || '—'],
          ['Plano', v.plan || '—'],
          ['Pagamento', v.payment_type || '—'],
        ])}
        <p style="margin-top:12px;font-size:13px;color:#94a3b8">O membro está aguardando pagamento para ativação.</p>`,
      cta: { text: 'Ver no Painel Admin', url: v.admin_url || `${frontendUrl}/admin` },
    },
  };

  const tmpl = templates[template] || {
    subject: `Clube GeekPop & Toys — ${template}`,
    preheader: '',
    body: `<p>Template: ${template}</p>`,
  };

  const ctaHtml = tmpl.cta
    ? `<div style="text-align:center;margin:28px 0 8px">
        <a href="${tmpl.cta.url}" style="display:inline-block;background:linear-gradient(135deg,#d4a520,#b8860b);color:#000000;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(212,165,32,0.35)">${tmpl.cta.text}</a>
       </div>`
    : '';

  const siteUrl = 'https://geeketoys.com.br';
  const clubUrl = frontendUrl;
  const logoUrl = `${siteUrl}/logo.jpg`;
  const whatsappUrl = 'https://wa.me/5521985464666';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${tmpl.subject}</title>
  <!--[if mso]><style>table,td{font-family:Arial,sans-serif!important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <!-- Preheader (hidden text shown in inbox preview) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${tmpl.preheader}${'&nbsp;&zwnj;'.repeat(20)}</div>

  <div style="max-width:600px;margin:0 auto;padding:16px">
    <!-- Header with Logo -->
    <div style="text-align:center;padding:24px 0 16px">
      <a href="${siteUrl}" style="text-decoration:none">
        <img src="${logoUrl}" alt="Geek &amp; Toys" width="80" height="80" style="display:inline-block;width:80px;height:80px;border-radius:16px;border:2px solid rgba(212,165,32,0.3)" />
      </a>
      <div style="margin-top:12px">
        <a href="${siteUrl}" style="text-decoration:none;font-size:22px;letter-spacing:2px;font-weight:800">
          <span style="color:#d4a520">GEEK</span><span style="color:#ffffff;opacity:0.5">&amp;</span><span style="color:#ffffff">TOYS</span>
        </a>
        <p style="margin:2px 0 0;font-size:10px;color:#d4a520;letter-spacing:3px;text-transform:uppercase;font-weight:600">Clube de Vantagens</p>
      </div>
    </div>

    <!-- Gold Accent Line -->
    <div style="height:2px;background:linear-gradient(90deg,transparent,#d4a520,transparent);margin:0 40px 16px"></div>

    <!-- Content Card -->
    <div style="background:linear-gradient(180deg,#16213e,#141e33);border-radius:16px;padding:28px 24px;border:1px solid rgba(212,165,32,0.12);color:#e2e8f0;line-height:1.7;font-size:15px">
      ${tmpl.body}
      ${ctaHtml}
    </div>

    <!-- Footer -->
    <div style="padding:24px 16px 8px">
      <!-- Divider -->
      <div style="height:1px;background:rgba(212,165,32,0.15);margin-bottom:20px"></div>

      <!-- Social Links -->
      <div style="text-align:center;margin-bottom:16px">
        <a href="https://www.instagram.com/geeketoys/" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#d4a520;text-decoration:none;font-size:16px;margin:0 4px" title="Instagram">&#9737;</a>
        <a href="https://www.facebook.com/geeketoyscolection/" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#d4a520;text-decoration:none;font-size:16px;margin:0 4px" title="Facebook">f</a>
        <a href="https://www.tiktok.com/@geeketoys" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#d4a520;text-decoration:none;font-size:16px;margin:0 4px" title="TikTok">&#9835;</a>
        <a href="${whatsappUrl}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#25d366;text-decoration:none;font-size:16px;margin:0 4px" title="WhatsApp">&#9742;</a>
      </div>

      <!-- Site Links -->
      <div style="text-align:center;margin-bottom:14px">
        <a href="${siteUrl}" style="color:#d4a520;text-decoration:none;font-size:12px;font-weight:600">Loja Online</a>
        <span style="color:#334155;margin:0 8px">&bull;</span>
        <a href="${clubUrl}/membro" style="color:#d4a520;text-decoration:none;font-size:12px;font-weight:600">Minha Conta</a>
        <span style="color:#334155;margin:0 8px">&bull;</span>
        <a href="${whatsappUrl}" style="color:#d4a520;text-decoration:none;font-size:12px;font-weight:600">WhatsApp</a>
      </div>

      <!-- Company Info -->
      <div style="text-align:center;color:#475569;font-size:10px;line-height:1.6">
        <p style="margin:0;font-weight:600;color:#64748b">Geek &amp; Toys &mdash; Pioneiros do Funko Pop no Brasil</p>
        <p style="margin:3px 0">CNPJ: 52.846.344/0001-10</p>
        <p style="margin:3px 0">R. Barata Ribeiro, 181 - loja J, Copacabana, Rio de Janeiro - RJ</p>
        <p style="margin:3px 0">(21) 98546-4666 &bull; geeketoys.com.br</p>
        <p style="margin:8px 0 0;color:#334155">Este e-mail foi enviado automaticamente. N&atilde;o responda.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject: tmpl.subject, html };
}

// ============================================
// Template Helpers
// ============================================

function infoBox(content: string): string {
  return `<div style="background:#0f2847;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;padding:14px 16px;margin:16px 0;font-size:13px;line-height:1.6;color:#cbd5e1">${content}</div>`;
}

function featureList(items: string[]): string {
  const rows = items.map(item =>
    `<tr><td style="padding:6px 0;font-size:14px;color:#e2e8f0">${item}</td></tr>`
  ).join('');
  return `<table style="width:100%;margin:12px 0" role="presentation">${rows}</table>`;
}

function dataTable(rows: string[][]): string {
  const trs = rows.map(([label, value]) =>
    `<tr>
      <td style="padding:8px 0;color:#94a3b8;font-size:13px;border-bottom:1px solid rgba(255,255,255,0.06)">${label}</td>
      <td style="padding:8px 0;text-align:right;font-size:14px;color:#e2e8f0;border-bottom:1px solid rgba(255,255,255,0.06)">${value}</td>
    </tr>`
  ).join('');
  return `<div style="background:#0f2847;border-radius:10px;padding:4px 16px;margin:16px 0"><table style="width:100%;border-collapse:collapse" role="presentation">${trs}</table></div>`;
}
