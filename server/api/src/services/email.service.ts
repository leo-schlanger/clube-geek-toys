import { env } from '../config/env.js';
import { query } from '../config/database.js';
import { escapeHtml } from '../utils/pagbank.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

const AVAILABLE_TEMPLATES = [
  'welcome', 'payment-confirmed', 'payment-failed', 'renewal-reminder',
  'points-expiring', 'subscription-created', 'subscription-payment',
  'subscription-paused', 'subscription-cancelled', 'subscription-payment-failed',
  'verify-email', 'password-reset', 'contract-signed',
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

  // Send copy to admin if configured
  if (data.admin_email) {
    await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: [data.admin_email],
        subject: `[Cópia] ${subject}`,
        html,
        attachments,
      }),
    }).catch((err) => console.error('[EMAIL] Admin copy error:', err));
  }

  return { status: 'sent' };
}

function renderTemplate(template: string, vars: Record<string, string>): { subject: string; html: string } {
  // TODO: Phase 3 will extract full HTML templates from the worker
  // For now, use simple templates
  const templates: Record<string, { subject: string; body: string }> = {
    'welcome': {
      subject: 'Bem-vindo ao Clube Geek & Toys!',
      body: `<h2>Olá, ${vars.name || 'Membro'}!</h2><p>Seja bem-vindo ao Clube Geek & Toys. Sua conta foi criada com sucesso.</p>`,
    },
    'verify-email': {
      subject: 'Verifique seu email - Clube Geek & Toys',
      body: `<h2>Verificação de Email</h2><p>Olá, ${vars.name || ''}!</p><p>Clique no link abaixo para verificar seu email:</p><p><a href="${vars.verify_url}">Verificar Email</a></p><p>Este link expira em 24 horas.</p>`,
    },
    'password-reset': {
      subject: 'Redefinição de Senha - Clube Geek & Toys',
      body: `<h2>Redefinição de Senha</h2><p>Clique no link abaixo para redefinir sua senha:</p><p><a href="${vars.reset_url}">Redefinir Senha</a></p><p>Este link expira em 1 hora.</p>`,
    },
    'payment-confirmed': {
      subject: 'Pagamento Confirmado - Clube Geek & Toys',
      body: `<h2>Pagamento Confirmado!</h2><p>Olá, ${vars.name || 'Membro'}!</p><p>Seu pagamento de R$ ${vars.amount || '0'} foi confirmado. Plano: ${vars.plan || ''}</p>`,
    },
    'payment-failed': {
      subject: 'Pagamento não aprovado - Clube Geek & Toys',
      body: `<h2>Pagamento não aprovado</h2><p>Olá, ${vars.name || 'Membro'}. Infelizmente seu pagamento não foi aprovado. Tente novamente.</p>`,
    },
    'renewal-reminder': {
      subject: 'Sua assinatura expira em breve - Clube Geek & Toys',
      body: `<h2>Lembrete de Renovação</h2><p>Olá, ${vars.name || 'Membro'}! Sua assinatura expira em ${vars.expiry_date || '7 dias'}. Renove para continuar aproveitando os benefícios.</p>`,
    },
    'points-expiring': {
      subject: 'Seus pontos estão expirando - Clube Geek & Toys',
      body: `<h2>Pontos Expirando</h2><p>Olá, ${vars.name || 'Membro'}! Você tem ${vars.points || '0'} pontos que expiram em breve. Use-os!</p>`,
    },
    'contract-signed': {
      subject: 'Contrato Assinado - Clube Geek & Toys',
      body: `<h2>Contrato Assinado</h2><p>Olá, ${vars.name || 'Membro'}! Seu contrato do plano ${vars.plan || ''} foi assinado em ${vars.signed_at || ''}.</p><p>Hash: ${vars.hash || ''}</p>`,
    },
    'subscription-created': {
      subject: 'Assinatura Criada - Clube Geek & Toys',
      body: `<h2>Assinatura Ativada</h2><p>Olá, ${vars.name || 'Membro'}! Sua assinatura do plano ${vars.plan || ''} foi ativada com sucesso.</p>`,
    },
    'subscription-payment': {
      subject: 'Cobrança Processada - Clube Geek & Toys',
      body: `<h2>Cobrança Processada</h2><p>Sua cobrança recorrente de R$ ${vars.amount || '0'} foi processada com sucesso.</p>`,
    },
    'subscription-paused': {
      subject: 'Assinatura Pausada - Clube Geek & Toys',
      body: `<h2>Assinatura Pausada</h2><p>Sua assinatura foi pausada. Você pode reativá-la a qualquer momento.</p>`,
    },
    'subscription-cancelled': {
      subject: 'Assinatura Cancelada - Clube Geek & Toys',
      body: `<h2>Assinatura Cancelada</h2><p>Sua assinatura foi cancelada. Sentiremos sua falta!</p>`,
    },
    'subscription-payment-failed': {
      subject: 'Falha na Cobrança - Clube Geek & Toys',
      body: `<h2>Falha na Cobrança</h2><p>Não foi possível processar sua cobrança recorrente. Verifique seu cartão.</p>`,
    },
  };

  const tmpl = templates[template] || {
    subject: `Clube Geek & Toys - ${template}`,
    body: `<p>Template: ${template}</p>`,
  };

  const baseHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"></head><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #1a1a2e; color: #e0e0e0;"><div style="background: #16213e; border-radius: 8px; padding: 30px; border: 1px solid #0f3460;">${tmpl.body}<hr style="border-color: #0f3460; margin: 20px 0;"><p style="font-size: 12px; color: #888;">Clube Geek & Toys - geeketoys.com.br</p></div></body></html>`;

  return { subject: tmpl.subject, html: baseHtml };
}
