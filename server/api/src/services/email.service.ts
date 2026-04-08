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
  const templates: Record<string, { subject: string; body: string; cta?: { text: string; url: string } }> = {
    'welcome': {
      subject: 'Bem-vindo ao Clube Geek & Toys!',
      body: `
        <h2 style="color:#e94560;margin:0 0 16px">Bem-vindo, ${vars.name || 'Membro'}! 🎮</h2>
        <p>Sua conta no <strong>Clube Geek & Toys</strong> foi criada com sucesso.</p>
        <p>Agora voce faz parte da maior comunidade geek do Brasil. Aproveite descontos exclusivos, acumule pontos e muito mais!</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:14px">✅ Conta criada</p>
          <p style="margin:8px 0 0;font-size:14px">📋 Proximo passo: complete seu cadastro e assine um plano</p>
        </div>`,
      cta: { text: 'Acessar Minha Conta', url: `${env.FRONTEND_URL}/login` },
    },
    'verify-email': {
      subject: 'Verifique seu email - Clube Geek & Toys',
      body: `
        <h2 style="color:#e94560;margin:0 0 16px">Verifique seu Email ✉️</h2>
        <p>Ola, ${vars.name || ''}!</p>
        <p>Para ativar sua conta, clique no botao abaixo:</p>`,
      cta: { text: 'Verificar Email', url: vars.verify_url || '#' },
    },
    'password-reset': {
      subject: 'Redefinicao de Senha - Clube Geek & Toys',
      body: `
        <h2 style="color:#e94560;margin:0 0 16px">Redefinicao de Senha 🔐</h2>
        <p>Voce solicitou a redefinicao da sua senha. Clique no botao abaixo:</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:13px">⏰ Este link expira em <strong>1 hora</strong></p>
          <p style="margin:8px 0 0;font-size:13px">Se voce nao solicitou isso, ignore este email.</p>
        </div>`,
      cta: { text: 'Redefinir Senha', url: vars.reset_url || '#' },
    },
    'payment-confirmed': {
      subject: 'Pagamento Confirmado - Clube Geek & Toys',
      body: `
        <h2 style="color:#4ade80;margin:0 0 16px">Pagamento Confirmado! ✅</h2>
        <p>Ola, ${vars.name || 'Membro'}!</p>
        <p>Seu pagamento foi processado com sucesso:</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#888">Valor</td><td style="padding:6px 0;text-align:right;font-weight:bold;color:#4ade80">R$ ${vars.amount || '0,00'}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Plano</td><td style="padding:6px 0;text-align:right">${vars.plan || '-'}</td></tr>
          </table>
        </div>`,
      cta: { text: 'Ver Minha Carteirinha', url: `${env.FRONTEND_URL}/minha-conta` },
    },
    'payment-failed': {
      subject: 'Pagamento nao aprovado - Clube Geek & Toys',
      body: `
        <h2 style="color:#f87171;margin:0 0 16px">Pagamento Nao Aprovado ❌</h2>
        <p>Ola, ${vars.name || 'Membro'}.</p>
        <p>Infelizmente seu pagamento nao foi aprovado. Isso pode acontecer por diversos motivos.</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:13px">💡 <strong>Dica:</strong> Verifique o limite do seu cartao ou tente outro metodo de pagamento.</p>
        </div>`,
      cta: { text: 'Tentar Novamente', url: `${env.FRONTEND_URL}/minha-conta` },
    },
    'renewal-reminder': {
      subject: 'Sua assinatura expira em breve - Clube Geek & Toys',
      body: `
        <h2 style="color:#fbbf24;margin:0 0 16px">Sua Assinatura Expira em Breve ⚠️</h2>
        <p>Ola, ${vars.name || 'Membro'}!</p>
        <p>Sua assinatura expira em <strong>${vars.expiry_date || '7 dias'}</strong>.</p>
        <p>Renove agora para continuar aproveitando todos os beneficios do clube!</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:13px">🎁 Descontos exclusivos</p>
          <p style="margin:8px 0 0;font-size:13px">⭐ Acumulo de pontos</p>
          <p style="margin:8px 0 0;font-size:13px">🎮 Acesso a eventos especiais</p>
        </div>`,
      cta: { text: 'Renovar Agora', url: `${env.FRONTEND_URL}/minha-conta` },
    },
    'points-expiring': {
      subject: 'Seus pontos estao expirando - Clube Geek & Toys',
      body: `
        <h2 style="color:#fbbf24;margin:0 0 16px">Pontos Expirando! ⭐</h2>
        <p>Ola, ${vars.name || 'Membro'}!</p>
        <p>Voce tem <strong style="color:#e94560;font-size:18px">${vars.points || '0'} pontos</strong> que expiram em breve.</p>
        <p>Visite a loja e use seus pontos antes que expirem!</p>`,
      cta: { text: 'Ver Meus Pontos', url: `${env.FRONTEND_URL}/minha-conta` },
    },
    'contract-signed': {
      subject: 'Contrato Assinado - Clube Geek & Toys',
      body: `
        <h2 style="color:#4ade80;margin:0 0 16px">Contrato Assinado com Sucesso! 📋</h2>
        <p>Ola, ${vars.name || 'Membro'}!</p>
        <p>Seu contrato digital foi assinado eletronicamente conforme a Lei 14.063/2020.</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <table style="width:100%;font-size:14px;border-collapse:collapse">
            <tr><td style="padding:6px 0;color:#888">Plano</td><td style="padding:6px 0;text-align:right">${vars.plan || '-'}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Data</td><td style="padding:6px 0;text-align:right">${vars.signed_at || '-'}</td></tr>
            <tr><td style="padding:6px 0;color:#888">Hash</td><td style="padding:6px 0;text-align:right;font-family:monospace;font-size:11px">${vars.hash || '-'}</td></tr>
          </table>
        </div>
        <p style="font-size:13px;color:#888">O PDF do contrato esta anexado a este email.</p>`,
    },
    'subscription-created': {
      subject: 'Assinatura Ativada - Clube Geek & Toys',
      body: `
        <h2 style="color:#4ade80;margin:0 0 16px">Assinatura Ativada! 🎉</h2>
        <p>Ola, ${vars.name || 'Membro'}!</p>
        <p>Sua assinatura recorrente do plano <strong>${vars.plan || ''}</strong> foi ativada com sucesso.</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:13px">💳 Cobranca automatica no cartao cadastrado</p>
          <p style="margin:8px 0 0;font-size:13px">📅 Voce pode cancelar a qualquer momento</p>
        </div>`,
      cta: { text: 'Gerenciar Assinatura', url: `${env.FRONTEND_URL}/minha-conta` },
    },
    'subscription-payment': {
      subject: 'Cobranca Processada - Clube Geek & Toys',
      body: `
        <h2 style="color:#4ade80;margin:0 0 16px">Cobranca Recorrente Processada ✅</h2>
        <p>Sua cobranca mensal de <strong style="color:#4ade80">R$ ${vars.amount || '0,00'}</strong> foi processada com sucesso.</p>
        <p>Sua assinatura continua ativa. Obrigado!</p>`,
    },
    'subscription-paused': {
      subject: 'Assinatura Pausada - Clube Geek & Toys',
      body: `
        <h2 style="color:#fbbf24;margin:0 0 16px">Assinatura Pausada ⏸️</h2>
        <p>Sua assinatura foi pausada conforme solicitado.</p>
        <p>Voce pode reativa-la a qualquer momento pelo painel do membro.</p>`,
      cta: { text: 'Reativar Assinatura', url: `${env.FRONTEND_URL}/minha-conta` },
    },
    'subscription-cancelled': {
      subject: 'Assinatura Cancelada - Clube Geek & Toys',
      body: `
        <h2 style="color:#f87171;margin:0 0 16px">Assinatura Cancelada 😢</h2>
        <p>Sua assinatura foi cancelada. Sentiremos sua falta!</p>
        <p>Voce pode se inscrever novamente a qualquer momento para voltar a aproveitar os beneficios.</p>`,
      cta: { text: 'Voltar ao Clube', url: `${env.FRONTEND_URL}` },
    },
    'subscription-payment-failed': {
      subject: 'Falha na Cobranca - Clube Geek & Toys',
      body: `
        <h2 style="color:#f87171;margin:0 0 16px">Falha na Cobranca Recorrente ⚠️</h2>
        <p>Nao foi possivel processar sua cobranca recorrente.</p>
        <div style="background:#0f3460;border-radius:8px;padding:16px;margin:16px 0">
          <p style="margin:0;font-size:13px">💡 Verifique se seu cartao esta valido e com limite disponivel.</p>
          <p style="margin:8px 0 0;font-size:13px">⚠️ Apos 3 falhas consecutivas, a assinatura sera cancelada automaticamente.</p>
        </div>`,
      cta: { text: 'Atualizar Cartao', url: `${env.FRONTEND_URL}/minha-conta` },
    },
  };

  const tmpl = templates[template] || {
    subject: `Clube Geek & Toys - ${template}`,
    body: `<p>Template: ${template}</p>`,
  };

  const ctaHtml = tmpl.cta
    ? `<div style="text-align:center;margin:24px 0">
        <a href="${tmpl.cta.url}" style="display:inline-block;background:#e94560;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:15px">${tmpl.cta.text}</a>
       </div>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${tmpl.subject}</title>
</head>
<body style="margin:0;padding:0;background:#0a0a1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:20px">
    <!-- Header -->
    <div style="text-align:center;padding:24px 0">
      <h1 style="margin:0;font-size:22px;color:#e94560;letter-spacing:1px">GEEK<span style="color:#fff">&amp;</span>TOYS</h1>
      <p style="margin:4px 0 0;font-size:11px;color:#666;letter-spacing:2px">CLUBE DE VANTAGENS</p>
    </div>
    <!-- Content -->
    <div style="background:#16213e;border-radius:12px;padding:32px;border:1px solid #1a3a5c;color:#e0e0e0;line-height:1.6;font-size:15px">
      ${tmpl.body}
      ${ctaHtml}
    </div>
    <!-- Footer -->
    <div style="text-align:center;padding:24px 0;color:#666;font-size:12px">
      <p style="margin:0">Clube Geek &amp; Toys - geeketoys.com.br</p>
      <p style="margin:8px 0 0">Voce recebeu este email porque e membro do clube.</p>
    </div>
  </div>
</body>
</html>`;

  return { subject: tmpl.subject, html };
}
