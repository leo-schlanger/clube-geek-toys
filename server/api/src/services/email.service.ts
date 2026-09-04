import { env, adminUrl } from '../config/env.js';
import { query } from '../config/database.js';

/** User-facing plan name. Emails used to print the slug "club". */
function planLabel(plan?: string): string {
  if (!plan) return '—';
  if (plan === 'club') return 'Clube GeekPop & Toys';
  return plan;
}

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
  'verify-email', 'password-reset', 'contract-signed',
  'admin-new-member', 'order-confirmed', 'order-shipped', 'order-ready-for-pickup',
  'question-answered',
  'order-pending-pix', 'order-refunded', 'order-cancelled-customer',
  'payment-refunded',
  'admin-pix-order-pending', 'admin-order-cancelled', 'admin-order-disputed',
  'admin-daily-digest', 'admin-payment-event',
  'event-reservation-received', 'event-tickets-ready', 'admin-event-reservation',
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
        <h2 style="color:#F04080;margin:0 0 12px">Confirme seu e-mail</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Você criou uma conta no <strong>Clube GeekPop & Toys</strong>. Para prosseguir, confirme seu endereço de e-mail clicando no botão abaixo.</p>
        ${infoBox('⏳ Este link expira em <strong>24 horas</strong>.<br>Se você não criou esta conta, ignore este e-mail.')}`,
      cta: { text: 'Confirmar E-mail', url: v.verify_url || '#' },
    },

    'password-reset': {
      subject: 'Redefinição de senha — Clube GeekPop & Toys',
      preheader: 'Você solicitou a redefinição da sua senha.',
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">Redefinir sua senha</h2>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
        <p>Clique no botão abaixo para escolher uma nova senha:</p>
        ${infoBox('⏳ Este link expira em <strong>1 hora</strong>.<br>Se você não solicitou isso, pode ignorar este e-mail com segurança — sua conta permanece protegida.')}`,
      cta: { text: 'Redefinir Senha', url: v.reset_url || '#' },
    },

    // ─── ONBOARDING ─────────────────────────────────────
    'welcome': {
      subject: 'Bem-vindo ao Clube GeekPop & Toys! 🎮',
      preheader: `${name}, você agora é membro do ${planLabel(v.plan)}!`,
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">Bem-vindo, ${name}! 🎮</h2>
        <p>Sua conta no <strong>Clube GeekPop & Toys</strong> foi ativada com sucesso. Você agora faz parte da nossa comunidade geek!</p>
        <p style="margin:16px 0 8px;font-weight:600;color:#fff">O que você ganha como membro:</p>
        ${featureList([
          '🏷️ 10% de desconto em qualquer produto',
          '🎟️ 50% de desconto nos ingressos dos eventos',
          '🎁 Brinde na primeira compra da loja',
          '📋 Carteirinha digital com QR Code',
        ])}`,
      cta: { text: 'Ver Minha Carteirinha', url: `${frontendUrl}/membro` },
    },

    // ─── Payments ─────────────────────────────────────
    'payment-confirmed': {
      subject: 'Pagamento confirmado — Clube GeekPop & Toys',
      preheader: `Seu pagamento de R$ ${v.amount || '0,00'} foi aprovado.`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Pagamento confirmado! ✅</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu pagamento foi processado com sucesso. Confira os detalhes:</p>
        ${dataTable([
          ['Valor', `<strong style="color:#4ade80">R$ ${v.amount || '0,00'}</strong>`],
          ['Plano', planLabel(v.plan)],
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
        <p style="margin-top:16px">${
          v.delivery_method === 'pickup'
            ? 'Avisaremos por e-mail assim que o pedido estiver separado para retirada na loja.'
            : 'Você receberá o código de rastreio dos Correios assim que o pedido for postado.'
        }</p>`,
      // The order page is public and keyed by the order's UUID, so it opens for a
      // guest checkout too. `/minhas-compras` requires a login the guest does
      // not have — it used to bounce the customer to a signup form and then to
      // an empty list, which read as "my order disappeared".
      cta: {
        text: 'Acompanhar pedido',
        url: v.order_id
          ? `https://shop.geeketoys.com.br/pedido/${v.order_id}`
          : 'https://shop.geeketoys.com.br/minhas-compras',
      },
    },

    /**
     * PIX do pedido, para o cliente.
     *
     * Só existia o aviso para o admin: quem fechava a aba do checkout perdia o
     * código para sempre — não há webhook, e nenhuma rota pública devolvia o
     * EMV. Convidado então não tinha caminho de volta nenhum. Este e-mail é a
     * cópia durável do código, como já acontecia na reserva de ingresso.
     */
    'order-pending-pix': {
      subject: `Pague seu pedido #${v.order_number || ''} por PIX — GeekPop & Toys`,
      preheader: `Pedido #${v.order_number || ''} reservado. Falta o pagamento por PIX.`,
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">Falta pagar por PIX 💳</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu pedido está separado e reservado. Ele é confirmado assim que o PIX cair.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Total', `<strong style="color:#FCBE04">R$ ${v.total || '0,00'}</strong>`],
        ])}
        ${v.pix_code ? pixBox(v.pix_code, v.pix_key || '', v.total || '0,00') : ''}
        ${infoBox('⏳ A confirmação do PIX é <strong>conferida pela equipe</strong>, não é automática — pode levar algumas horas em horário comercial. Guarde este e-mail: o código acima continua válido até lá.')}`,
      cta: {
        text: 'Ver meu pedido',
        url: v.order_id
          ? `https://shop.geeketoys.com.br/pedido/${v.order_id}`
          : 'https://shop.geeketoys.com.br/minhas-compras',
      },
    },

    /** Chargeback: the money already left the account, and the window to
        contest it is short. */
    'admin-order-disputed': {
      subject: `🚨 Chargeback aberto — pedido #${v.order_number || '?'}`,
      preheader: `Contestação de R$ ${v.amount || '0,00'}. Prazo para responder: ${v.due_by || '—'}.`,
      body: `
        <h2 style="color:#ef4444;margin:0 0 12px">Chargeback aberto</h2>
        <p>O cliente contestou a cobrança no banco. O valor <strong>já saiu</strong> da conta e só volta se a disputa for ganha.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Cliente', v.customer_name || '—'],
          ['E-mail', v.customer_email || '—'],
          ['Valor', `<strong style="color:#ef4444">R$ ${v.amount || '0,00'}</strong>`],
          ['Motivo', v.reason || '—'],
          ['Responder até', `<strong>${v.due_by || '—'}</strong>`],
        ])}
        ${infoBox('O pedido <strong>não</strong> foi alterado automaticamente — chargeback precisa de decisão humana. Envie a evidência pelo painel da Pagar.me antes do prazo.')}`,
      cta: { text: 'Abrir na Pagar.me', url: 'https://dash.pagar.me/' },
    },

    /**
     * Money going back to the customer, said out loud.
     *
     * Refunds reached the acquirer, the stock and the store credit, and told
     * nobody. The person saw a charge disappear days later with no explanation,
     * which is exactly the sequence that produces a WhatsApp message — or a
     * chargeback, which costs far more than this e-mail.
     */
    'order-refunded': {
      subject: `Reembolso do pedido #${v.order_number || ''} — GeekPop & Toys`,
      preheader: `Estornamos R$ ${v.total || '0,00'} do pedido #${v.order_number || ''}.`,
      body: `
        <h2 style="color:#FCBE04;margin:0 0 12px">Pedido reembolsado</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>O pagamento do seu pedido foi <strong>estornado</strong>.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Valor estornado', `<strong>R$ ${v.total || '0,00'}</strong>`],
          ...(v.payment_method ? [['Forma', v.payment_method]] : []),
        ])}
        ${infoBox(
          v.payment_method === 'PIX'
            ? '⏳ O valor volta para a mesma conta que fez o PIX. Costuma cair em minutos, mas o banco pode levar até 1 dia útil.'
            : '⏳ O estorno aparece na fatura do cartão em até <strong>2 faturas</strong>, dependendo do banco — é o prazo da operadora, não da loja.'
        )}
        <p style="margin-top:16px">Qualquer dúvida, é só responder este e-mail.</p>`,
      cta: {
        text: 'Ver meu pedido',
        url: v.order_id
          ? `https://shop.geeketoys.com.br/pedido/${v.order_id}`
          : 'https://shop.geeketoys.com.br/minhas-compras',
      },
    },

    /** Cancelled by the shop — the customer did not do this, so it needs a reason. */
    'order-cancelled-customer': {
      subject: `Pedido #${v.order_number || ''} cancelado — GeekPop & Toys`,
      preheader: `Seu pedido #${v.order_number || ''} foi cancelado.`,
      body: `
        <h2 style="color:#ef4444;margin:0 0 12px">Pedido cancelado</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu pedido foi cancelado${v.reason ? ` — ${escapeHtml(v.reason)}` : ''}.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Valor', `R$ ${v.total || '0,00'}`],
        ])}
        ${infoBox('Se você já tinha pago, o valor é devolvido — e você recebe um e-mail separado confirmando o estorno. Nenhuma cobrança fica em aberto.')}`,
      cta: { text: 'Ver a loja', url: 'https://shop.geeketoys.com.br' },
    },

    'order-shipped': {
      subject: `Pedido #${v.order_number || ''} enviado — Correios`,
      preheader: `Seu pedido saiu para entrega. Código: ${v.tracking_code || ''}`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Pedido a caminho! 📦</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu pedido foi postado pelos Correios. Use o código abaixo para rastrear:</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Rastreio', `<strong style="font-family:monospace">${v.tracking_code || '—'}</strong>`],
          ...(v.shipping_service ? [['Serviço', v.shipping_service]] : []),
        ])}
        <p style="margin-top:16px">Prazo estimado depende da região e do serviço (PAC/SEDEX).</p>`,
      cta: {
        text: 'Rastrear nos Correios',
        url: v.tracking_url || 'https://rastreamento.correios.com.br/app/index.php',
      },
    },

    // Pickup has no tracking: this email is the only notice that the
    // order is packed and can be collected at the counter.
    'order-ready-for-pickup': {
      subject: `Pedido #${v.order_number || ''} pronto para retirada`,
      preheader: 'Seu pedido já está separado e esperando por você na loja.',
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Pronto para retirada! 🏪</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu pedido já está separado e esperando por você na nossa loja.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Endereço', v.store_address || ''],
          ...(v.store_hours ? [['Horário', v.store_hours]] : []),
        ])}
        ${infoBox(
          'Leve um documento com foto e o número do pedido. Se outra pessoa for retirar, ' +
            'avise a gente antes pelo WhatsApp.'
        )}`,
      cta: {
        text: 'Ver pedido',
        url: v.order_id
          ? `https://shop.geeketoys.com.br/pedido/${v.order_id}`
          : 'https://shop.geeketoys.com.br/minhas-compras',
      },
    },

    'question-answered': {
      subject: `Respondemos sua pergunta — ${v.product_name || 'Loja GeekPop & Toys'}`,
      preheader: 'Sua pergunta sobre o produto foi respondida.',
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">Respondemos sua pergunta 💬</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Você perguntou sobre <strong>${v.product_name || 'um produto'}</strong>:</p>
        ${infoBox(`<em>${v.question || ''}</em>`)}
        <p style="margin-top:16px">Nossa resposta:</p>
        ${infoBox(`<strong>${v.answer || ''}</strong>`)}`,
      cta: {
        text: 'Ver na loja',
        url: v.product_url || 'https://shop.geeketoys.com.br',
      },
    },

    /**
     * The club's mirror of `order-refunded`.
     *
     * The shop told the buyer when money came back; the club did not, and a
     * member seeing a charge vanish with no explanation is the same support
     * message — or the same chargeback.
     */
    'payment-refunded': {
      subject: 'Reembolso do Clube GeekPop & Toys',
      preheader: `Estornamos R$ ${v.amount || '0,00'} da sua assinatura.`,
      body: `
        <h2 style="color:#FCBE04;margin:0 0 12px">Pagamento reembolsado</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>O pagamento da sua assinatura do clube foi <strong>estornado</strong>.</p>
        ${dataTable([
          ['Valor estornado', `<strong>R$ ${v.amount || '0,00'}</strong>`],
          ...(v.method ? [['Forma', v.method]] : []),
          ...(v.reason ? [['Motivo', escapeHtml(v.reason)]] : []),
        ])}
        ${infoBox(
          v.method === 'PIX'
            ? '⏳ O valor volta para a conta que fez o PIX, normalmente em minutos.'
            : '⏳ O estorno aparece na fatura do cartão em até <strong>2 faturas</strong> — é o prazo da operadora.'
        )}
        <p style="margin-top:16px">Qualquer dúvida, é só responder este e-mail.</p>`,
      cta: { text: 'Ver minha conta', url: `${frontendUrl}/minha-conta` },
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

    // ─── Subscription ─────────────────────────────────────
    'subscription-created': {
      subject: 'Assinatura ativada — Clube GeekPop & Toys',
      preheader: `${name}, sua assinatura do ${planLabel(v.plan)} está ativa!`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Assinatura ativada! 🎉</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua assinatura recorrente foi ativada com sucesso:</p>
        ${dataTable([
          ['Plano', `<strong>${planLabel(v.plan)}</strong>`],
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
          ['Plano', planLabel(v.plan)],
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

    // ─── RENEWAL ────────────────────────────────────────
    'renewal-reminder': {
      subject: 'Sua assinatura expira em breve — Clube GeekPop & Toys',
      preheader: `${name}, renove para continuar aproveitando os benefícios!`,
      body: `
        <h2 style="color:#fbbf24;margin:0 0 12px">Sua assinatura expira em breve ⚠️</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua assinatura do <strong>${planLabel(v.plan)}</strong> expira em <strong>${v.expiry_date || 'alguns dias'}</strong>.</p>
        <p>Renove agora para não perder seus benefícios:</p>
        ${featureList([
          '🏷️ 10% de desconto em qualquer produto',
          '🎟️ 50% de desconto nos ingressos dos eventos',
          '🎁 Brinde na primeira compra da loja',
        ])}`,
      cta: { text: 'Renovar Agora', url: `${frontendUrl}/membro` },
    },

    'member-expired': {
      subject: 'Sua assinatura expirou — Clube GeekPop & Toys',
      preheader: `${name}, sua assinatura expirou. Renove para continuar aproveitando os benefícios!`,
      body: `
        <h2 style="color:#f87171;margin:0 0 12px">Assinatura expirada</h2>
        <p>Olá, <strong>${name}</strong>.</p>
        <p>Sua assinatura do <strong>${planLabel(v.plan)}</strong> expirou. Enquanto inativa, você não poderá aproveitar os benefícios do clube:</p>
        ${featureList([
          '❌ Desconto do clube suspenso enquanto a assinatura estiver inativa',
        ])}
        <p>Renove agora e volte a aproveitar tudo!</p>`,
      cta: { text: 'Renovar Agora', url: `${frontendUrl}/membro` },
    },

    // ─── Contract ───────────────────────────────────────
    'contract-signed': {
      subject: 'Contrato assinado — Clube GeekPop & Toys',
      preheader: `${name}, seu contrato do ${planLabel(v.plan)} foi assinado digitalmente.`,
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Contrato assinado com sucesso! 📋</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Seu contrato digital foi assinado eletronicamente conforme a <strong>Lei 14.063/2020</strong>.</p>
        ${dataTable([
          ['Plano', planLabel(v.plan)],
          ['Data da assinatura', v.signed_at || '—'],
          ['Hash do documento', `<span style="font-family:monospace;font-size:11px;word-break:break-all">${v.hash || '—'}</span>`],
        ])}
        <p style="margin-top:12px;font-size:13px;color:#94a3b8">O PDF do contrato está anexado a este e-mail. Guarde-o para seus registros.</p>`,
      cta: { text: 'Acessar Minha Conta', url: `${frontendUrl}/membro` },
    },

    // ─── ADMIN: PENDING PIX ─────────────────────────────

    // ─── ADMIN: SHOP PIX PENDING ───────────────────────
    // Shop sibling of the club PIX notice: the QR is generated
    // locally and nothing confirms it, so without this a paid order sits
    // 'pending' until someone opens the panel by chance.
    // Depois da migração para a Pagar.me isto virou um aviso, não uma tarefa:
    // a operadora concilia o PIX e confirma o pedido sozinha. O texto mudou
    // junto — mandar conferir o extrato criaria trabalho que não existe mais.
    'admin-pix-order-pending': {
      subject: '🔔 Pedido PIX aguardando pagamento — Loja GeekPop & Toys',
      preheader: `Pedido #${v.order_number || ''} de R$ ${v.total || '0,00'} gerou um PIX.`,
      body: `
        <h2 style="color:#f59e0b;margin:0 0 12px">Pedido PIX aguardando 🔔</h2>
        <p>Um pedido da loja gerou um código PIX. A confirmação é automática — a Pagar.me avisa assim que o dinheiro cair.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Cliente', escapeHtml(v.customer_name || '—')],
          ['Email', v.customer_email || '—'],
          ['Valor', `<strong style="color:#4ade80">R$ ${v.total || '0,00'}</strong>`],
          ['Cobrança', `<span style="font-family:monospace;font-size:11px">${v.tx_id || '—'}</span>`],
          // The note changes what goes in the box, so it belongs in the
          // notice the shop reads first — not only in the panel.
          ...(v.customer_note ? [['Mensagem do cliente', escapeHtml(v.customer_note)]] : []),
        ])}
        ${infoBox('📋 <strong>Nada a fazer agora.</strong><br>O pedido vira <strong>pago</strong> sozinho quando o PIX cair, e só então o estoque baixa. Se algo travar, o painel ainda permite confirmar à mão — use a cobrança acima para achar o pagamento no painel da Pagar.me.')}`,
      cta: { text: 'Abrir Pedido no Painel', url: v.admin_url || adminUrl() },
    },

    // ─── ADMIN: ORDER CANCELLED BY CUSTOMER ────────────
    'admin-order-cancelled': {
      subject: '❌ Pedido cancelado pelo cliente — Loja GeekPop & Toys',
      preheader: `Pedido #${v.order_number || ''} de R$ ${v.total || '0,00'} foi cancelado.`,
      body: `
        <h2 style="color:#f87171;margin:0 0 12px">Pedido cancelado ❌</h2>
        <p>O cliente cancelou um pedido que ainda não havia sido pago.</p>
        ${dataTable([
          ['Pedido', `<strong>#${v.order_number || '—'}</strong>`],
          ['Cliente', escapeHtml(v.customer_name || '—')],
          ['Email', v.customer_email || '—'],
          ['Valor', `R$ ${v.total || '0,00'}`],
        ])}
        ${infoBox('Nenhum valor foi cobrado e o estoque não havia sido baixado — não há nada a estornar. Se houver PIX pago por engano, confira o extrato antes de fechar.')}`,
      cta: { text: 'Abrir Pedidos no Painel', url: v.admin_url || adminUrl() },
    },

    // ─── ADMIN: NEW MEMBER ─────────────────────────────
    'admin-new-member': {
      subject: '👤 Novo membro cadastrado — Clube GeekPop & Toys',
      preheader: `${v.member_name || 'Novo membro'} se cadastrou no ${planLabel(v.plan)}.`,
      body: `
        <h2 style="color:#3b82f6;margin:0 0 12px">Novo membro cadastrado 👤</h2>
        <p>Um novo membro completou o cadastro no clube.</p>
        ${dataTable([
          ['Nome', escapeHtml(v.member_name || '—')],
          ['Email', v.member_email || '—'],
          ['CPF', v.member_cpf || '—'],
          ['Telefone', v.member_phone || '—'],
          ['Plano', planLabel(v.plan)],
          ['Pagamento', v.payment_type || '—'],
        ])}
        <p style="margin-top:12px;font-size:13px;color:#94a3b8">O membro está aguardando pagamento para ativação.</p>`,
      cta: { text: 'Ver no Painel Admin', url: v.admin_url || adminUrl() },
    },

    // ─── ADMIN: DAILY OPERATIONS DIGEST ────────────────
    // Counts come in one variable per queue (every variable is HTML-escaped
    // before it gets here, so the rows have to be assembled template-side).
    // Queues at zero are dropped: a digest that always lists everything stops
    // being read.
    /**
     * One template for every payment event the staff hears about.
     *
     * A template per event would have been five near-identical blocks that
     * drift apart; the event name and the accent colour are variables instead.
     */
    'admin-payment-event': {
      subject: `${v.tone === 'bad' ? '\u26a0\ufe0f ' : ''}${v.event_label || 'Pagamento'} — ${v.subject || ''} (R$ ${v.amount || '0,00'})`,
      preheader: `${v.event_label || 'Pagamento'} de R$ ${v.amount || '0,00'} via ${v.method || '—'}.`,
      body: `
        <h2 style="color:${v.tone === 'good' ? '#4ade80' : v.tone === 'warn' ? '#FCBE04' : '#ef4444'};margin:0 0 12px">${v.event_label || 'Pagamento'}</h2>
        ${dataTable([
          ['Referência', `<strong>${v.subject || '—'}</strong>`],
          ['Valor', `<strong>R$ ${v.amount || '0,00'}</strong>`],
          ['Forma', v.method || '—'],
          ['Cliente', v.customer_name || '—'],
          ['E-mail', v.customer_email || '—'],
          ...(v.detail ? [['Detalhe', v.detail]] : []),
          ['Cobrança', `<span style="font-family:monospace;font-size:12px">${v.charge_id || '—'}</span>`],
        ])}
        ${
          v.tone === 'good'
            ? infoBox('O estoque já foi baixado e o cliente recebeu a confirmação. Nada a fazer além de separar o pedido.')
            : v.tone === 'warn'
              ? infoBox('Nada foi baixado ainda. A Pagar.me avisa sozinha quando o pagamento cair — não é preciso confirmar à mão.')
              : infoBox('Confira no painel da Pagar.me antes de agir. Estorno e chargeback já mexeram no dinheiro.')
        }`,
      cta: { text: 'Abrir no painel', url: v.admin_url || adminUrl('/admin?tab=orders') },
    },

    'admin-daily-digest': {
      subject: `📋 Painel do dia — ${v.total_pending || '0'} pendência(s) na GeekPop & Toys`,
      preheader: `${v.total_pending || '0'} item(ns) aguardando você no painel.`,
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">O que está esperando por você 📋</h2>
        <p>Resumo das filas do painel admin nesta manhã.</p>
        ${dataTable(
          [
            ['💰 PIX aguardando confirmação', v.pix_pending, '#f59e0b'],
            ['📦 Pedidos pagos a separar', v.to_separate, '#4ade80'],
            ['🚚 Pedidos a postar', v.to_ship, '#4ade80'],
            [`🕐 Enviados há +10 dias sem entrega`, v.shipped_stale, '#f87171'],
            ['🎫 Ingressos a confirmar', v.event_tickets_pending, '#f59e0b'],
            ['❓ Perguntas sem resposta', v.questions_unanswered, '#3b82f6'],
            ['⭐ Avaliações a moderar', v.reviews_pending, '#3b82f6'],
            ['🏢 Contas atacado a aprovar', v.wholesale_pending, '#f59e0b'],
            ['🔴 SKUs esgotados', v.stock_out, '#f87171'],
            ['🟡 SKUs no estoque mínimo', v.stock_low, '#f59e0b'],
            ['📅 Assinaturas vencendo em 7 dias', v.members_expiring, '#f59e0b'],
            ['⏳ Membros aguardando pagamento', v.members_pending, '#94a3b8'],
          ]
            .filter(([, count]) => Number(count) > 0)
            .map(([label, count, color]) => [
              label as string,
              `<strong style="color:${color}">${count}</strong>`,
            ])
        )}
        ${infoBox('💰 <strong>O PIX é o item urgente:</strong> não existe webhook, então cada pedido PIX fica <em>pending</em> até alguém conferir o extrato e confirmar no painel. Enquanto isso o estoque não é baixado.')}`,
      cta: { text: 'Abrir Painel do Dia', url: v.admin_url || adminUrl() },
    },

    // ─── Events: tickets ────────────────────────────────
    // The link is the ticket. It stands on its own (unguessable code), so
    // the email is what keeps the customer from losing the purchase after
    // closing the tab.
    'event-reservation-received': {
      subject: `Reserva recebida — ${v.event_title || 'Evento GeekPop & Toys'}`,
      preheader: `Reserva ${v.reservation_code || ''} registrada. Falta a confirmação do pagamento.`,
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">Reserva recebida! 🎫</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Sua reserva para o <strong>${v.event_title || 'evento'}</strong> foi registrada.</p>
        ${dataTable([
          ['Código da reserva', `<strong>${v.reservation_code || '—'}</strong>`],
          ['Ingressos', v.quantity || '1'],
          ['Total', `<strong style="color:#FCBE04">R$ ${v.total || '0,00'}</strong>`],
        ])}
        ${v.pix_code ? pixBox(v.pix_code, v.pix_key || '', v.total || '0,00') : ''}
        ${infoBox('⏳ Os ingressos ficam <strong>aguardando confirmação</strong> até a equipe conferir o pagamento. Assim que confirmarmos, cada pessoa recebe o QR Code de entrada neste mesmo link.')}`,
      cta: { text: 'Ver meus ingressos', url: v.tickets_url || '#' },
    },

    'event-tickets-ready': {
      subject: `Ingressos liberados — ${v.event_title || 'Evento GeekPop & Toys'} 🎉`,
      preheader: 'Pagamento confirmado. Seus ingressos já têm QR Code de entrada.',
      body: `
        <h2 style="color:#4ade80;margin:0 0 12px">Ingressos liberados! ✅</h2>
        <p>Olá, <strong>${name}</strong>!</p>
        <p>Confirmamos o pagamento da reserva <strong>${v.reservation_code || ''}</strong>. Seus <strong>${v.quantity || '1'}</strong> ingresso(s) para o <strong>${v.event_title || 'evento'}</strong> já estão válidos.</p>
        ${infoBox('🎫 Cada ingresso é <strong>nominal</strong> e tem um QR Code próprio. Na entrada, o código é lido uma única vez — depois disso ele aparece como utilizado. Abra o link no celular ou imprima.')}`,
      cta: { text: 'Abrir meus ingressos', url: v.tickets_url || '#' },
    },

    'admin-event-reservation': {
      subject: `🎫 Nova reserva de ingresso — ${v.buyer_name || ''}`,
      preheader: `${v.quantity || '1'} ingresso(s) aguardando confirmação de pagamento.`,
      body: `
        <h2 style="color:#F04080;margin:0 0 12px">Nova reserva de ingresso</h2>
        ${dataTable([
          ['Evento', v.event_title || '—'],
          ['Cliente', v.buyer_name || '—'],
          ['Telefone', v.buyer_phone || '—'],
          ['E-mail', v.buyer_email || '—'],
          ['Reserva', `<strong>${v.reservation_code || '—'}</strong>`],
          ['Ingressos', v.quantity || '1'],
          ['Total', `<strong style="color:#FCBE04">R$ ${v.total || '0,00'}</strong>`],
        ])}
        ${infoBox('💰 Os ingressos só ficam válidos depois que alguém confirmar o pagamento no painel — antes disso a portaria recusa a entrada.')}`,
      cta: { text: 'Abrir no painel', url: v.admin_url || adminUrl() },
    },
  };

  const tmpl = templates[template] || {
    subject: `Clube GeekPop & Toys — ${template}`,
    preheader: '',
    body: `<p>Template: ${template}</p>`,
  };

  const ctaHtml = tmpl.cta
    ? `<div style="text-align:center;margin:28px 0 8px">
        <a href="${tmpl.cta.url}" style="display:inline-block;background:linear-gradient(135deg,#F04080,#E11D6A);color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 14px rgba(240,64,128,0.35)">${tmpl.cta.text}</a>
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
        <img src="${logoUrl}" alt="GeekPop &amp; Toys" width="80" height="80" style="display:inline-block;width:80px;height:80px;border-radius:16px;border:2px solid rgba(240,64,128,0.3)" />
      </a>
      <div style="margin-top:12px">
        <a href="${siteUrl}" style="text-decoration:none;font-size:22px;letter-spacing:2px;font-weight:800">
          <span style="color:#F04080">Geek</span><span style="color:#FCBE04">Pop</span><span style="color:#ffffff;opacity:0.5"> &amp; </span><span style="color:#FCBE04">Toys</span>
        </a>
        <p style="margin:2px 0 0;font-size:10px;color:#F04080;letter-spacing:3px;text-transform:uppercase;font-weight:600">Clube de Vantagens</p>
      </div>
    </div>

    <!-- Gold Accent Line -->
    <div style="height:2px;background:linear-gradient(90deg,transparent,#F04080,transparent);margin:0 40px 16px"></div>

    <!-- Content Card -->
    <div style="background:linear-gradient(180deg,#16213e,#141e33);border-radius:16px;padding:28px 24px;border:1px solid rgba(240,64,128,0.12);color:#e2e8f0;line-height:1.7;font-size:15px">
      ${tmpl.body}
      ${ctaHtml}
    </div>

    <!-- Footer -->
    <div style="padding:24px 16px 8px">
      <!-- Divider -->
      <div style="height:1px;background:rgba(240,64,128,0.15);margin-bottom:20px"></div>

      <!-- Social Links -->
      <div style="text-align:center;margin-bottom:16px">
        <a href="https://www.instagram.com/geeketoys/" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#F04080;text-decoration:none;font-size:16px;margin:0 4px" title="Instagram">&#9737;</a>
        <a href="https://www.facebook.com/geeketoyscolection/" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#F04080;text-decoration:none;font-size:16px;margin:0 4px" title="Facebook">f</a>
        <a href="https://www.tiktok.com/@geeketoys" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#F04080;text-decoration:none;font-size:16px;margin:0 4px" title="TikTok">&#9835;</a>
        <a href="${whatsappUrl}" style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;border-radius:50%;background:#1e293b;color:#25d366;text-decoration:none;font-size:16px;margin:0 4px" title="WhatsApp">&#9742;</a>
      </div>

      <!-- Site Links -->
      <div style="text-align:center;margin-bottom:14px">
        <a href="https://shop.geeketoys.com.br" style="color:#F04080;text-decoration:none;font-size:12px;font-weight:600">Loja Online</a>
        <span style="color:#334155;margin:0 8px">&bull;</span>
        <a href="${clubUrl}/membro" style="color:#F04080;text-decoration:none;font-size:12px;font-weight:600">Minha Conta</a>
        <span style="color:#334155;margin:0 8px">&bull;</span>
        <a href="${whatsappUrl}" style="color:#F04080;text-decoration:none;font-size:12px;font-weight:600">WhatsApp</a>
      </div>

      <!-- Company Info -->
      <div style="text-align:center;color:#475569;font-size:10px;line-height:1.6">
        <p style="margin:0;font-weight:600;color:#64748b">GeekPop &amp; Toys &mdash; Loja de K-pop no Rio de Janeiro</p>
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

/** Copy-and-paste, not a QR: email clients block external images. */
function pixBox(emvCode: string, pixKey: string, total: string): string {
  return `
    <div style="margin:16px 0;padding:16px;border:1px solid #F04080;border-radius:10px;background:#fff5f8">
      <p style="margin:0 0 8px;font-weight:600;color:#F04080">Pague por PIX — R$ ${total}</p>
      <p style="margin:0 0 8px;font-size:13px;color:#444">Copie o código abaixo e cole em "PIX Copia e Cola" no app do seu banco:</p>
      <p style="margin:0;padding:10px;background:#fff;border:1px solid #eadfe4;border-radius:6px;font-family:monospace;font-size:11px;line-height:1.5;word-break:break-all;color:#222">${emvCode}</p>
      ${pixKey ? `<p style="margin:8px 0 0;font-size:12px;color:#666">Ou use a chave PIX <strong>${pixKey}</strong> e informe o código da reserva.</p>` : ''}
    </div>`;
}

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
